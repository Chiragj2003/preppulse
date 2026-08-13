import { z } from "zod";

import { env } from "@/lib/env";
import { AppError, toAppError } from "@/lib/errors";
import { recordUsage } from "./usage";

/**
 * Gemini over plain REST. No SDK: we need exactly two things — send parts,
 * get JSON back — and the official client is a large dependency for that.
 *
 * Model ids are verified against this project's own /models listing. Google
 * retires ids without notice (gemini-2.0-flash already 404s here), so we walk
 * a list and fall through on "model not found" rather than letting one
 * retirement take the whole interview flow down.
 */
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
].filter((m): m is string => Boolean(m));

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Transient failures get retried before the model list is walked.
 *
 * Gemini answers 503 "This model is currently experiencing high demand" fairly
 * often, and it means exactly what it says: wait and it works. Treating that as
 * fatal took down the whole start-interview flow for a condition that clears in
 * about a second.
 *
 * Three attempts at 0.8s / 1.6s / 3.2s, then the next model — a different id
 * has separate capacity, so falling through is a second real chance rather than
 * a formality.
 */
const MAX_ATTEMPTS_PER_MODEL = 3;
const BACKOFF_MS = 800;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

interface CallOptions<T> {
  parts: GeminiPart[];
  schema: z.ZodType<T>;
  operation: string;
  userId: string;
  sessionId?: string | null;
  /** Lower for extraction and scoring, higher when we want varied questions. */
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * One JSON call. Asks for `application/json` natively rather than begging in
 * the prompt, then still validates with zod — a declared response type is a
 * strong hint, not a guarantee.
 */
export async function callGemini<T>(options: CallOptions<T>): Promise<T> {
  const apiKey = env.geminiApiKey;
  let lastError: unknown;

  models: for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const startedAt = Date.now();

      try {
        const response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: options.parts }],
            generationConfig: {
              temperature: options.temperature ?? 0.3,
              maxOutputTokens: options.maxOutputTokens ?? 4096,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const error = Object.assign(
            new Error(`Gemini ${response.status}: ${detail.slice(0, 300)}`),
            { status: response.status },
          );
          throw error;
        }

        const payload = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };

        const candidate = payload.candidates?.[0];
        const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

        if (!text) {
          throw new Error(`Gemini returned no content (finishReason: ${candidate?.finishReason})`);
        }

        const parsed = options.schema.safeParse(JSON.parse(text));
        if (!parsed.success) {
          // Name the field. "Invalid input" on its own is undiagnosable, and
          // this is the one error that reaches a user mid-interview.
          const detail = parsed.error.issues
            .slice(0, 3)
            .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("; ");
          console.error("[gemini] schema mismatch", detail, text.slice(0, 400));
          throw new Error(`Gemini returned unexpected JSON — ${detail}`);
        }

        await recordUsage({
          userId: options.userId,
          sessionId: options.sessionId ?? null,
          provider: "gemini",
          model,
          operation: options.operation,
          inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
          latencyMs: Date.now() - startedAt,
        });

        return parsed.data;
      } catch (error) {
        lastError = error;

        await recordUsage({
          userId: options.userId,
          sessionId: options.sessionId ?? null,
          provider: "gemini",
          model,
          operation: options.operation,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Date.now() - startedAt,
          ok: false,
          errorCode: error instanceof Error ? error.message.slice(0, 120) : "unknown",
        });

        // A retired model id: no amount of waiting helps, move on immediately.
        if (isModelUnavailable(error)) {
          console.warn(`[gemini] model "${model}" unavailable, trying the next one`);
          continue models;
        }

        // Anything else — a bad key, malformed JSON, a schema mismatch — will
        // fail identically however many times we ask.
        if (!isTransient(error)) break models;

        if (attempt < MAX_ATTEMPTS_PER_MODEL) {
          const wait = BACKOFF_MS * 2 ** (attempt - 1);
          console.warn(
            `[gemini] "${model}" busy (attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL}), retrying in ${wait}ms`,
          );
          await sleep(wait);
          continue;
        }

        console.warn(`[gemini] "${model}" still busy after ${attempt} attempts, trying the next one`);
      }
    }
  }

  throw toAppError(lastError, "gemini");
}

/**
 * Overloaded, rate-limited or timed out — conditions that clear on their own.
 *
 * 429 is included deliberately: Gemini's free tier returns it for a per-minute
 * burst, not a permanent ban, and backing off is the documented response.
 */
function isTransient(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 429 || (status !== undefined && status >= 500)) return true;

  const name = (error as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError") return true;

  const message = error instanceof Error ? error.message : "";
  return /overloaded|UNAVAILABLE|high demand|try again|fetch failed|ECONNRESET/i.test(message);
}

function isModelUnavailable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : "";
  return status === 404 || /not found|NOT_FOUND|is not supported/i.test(message);
}

/** Guardrail for resume uploads, enforced before anything reaches the model. */
export const MAX_RESUME_BYTES = 4 * 1024 * 1024;

export function assertPdf(file: { type: string; size: number }) {
  if (file.type !== "application/pdf") {
    throw new AppError("invalid_input", "Resumes need to be a PDF. Export yours and try again.");
  }
  if (file.size > MAX_RESUME_BYTES) {
    throw new AppError("invalid_input", "That PDF is over 4MB. Try exporting it without images.");
  }
  if (file.size === 0) {
    throw new AppError("invalid_input", "That file is empty.");
  }
}
