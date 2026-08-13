import { z } from "zod";

import { env } from "@/lib/env";
import { AppError, toAppError } from "@/lib/errors";
import { callGroq } from "./groq";
import {
  MAX_ATTEMPTS_PER_MODEL,
  backoffFor,
  isContentError,
  isModelUnavailable,
  isTransient,
  sleep,
} from "./retry";
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

// Retry policy and failure classification are shared with the Groq client;
// see lib/ai/retry.ts.

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
          const wait = backoffFor(attempt);
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

  // Gemini is exhausted. Groq is configured, idle, and perfectly capable of
  // this — so use it rather than telling the candidate to come back later.
  const fallback = await tryGroqFallback(options, lastError);
  if (fallback.used) return fallback.value;

  throw toAppError(lastError, `gemini.${options.operation}`);
}

/**
 * The second provider, tried once Gemini has run out of models.
 *
 * Two conditions, both of which are refusals to paper over something:
 *
 * A PDF cannot go. `extractResume` sends raw bytes as `inline_data` because
 * Gemini reads documents natively; Groq's chat API takes text only. There is no
 * honest fallback for resume extraction, so it doesn't get a dishonest one.
 *
 * A content error doesn't go either. If Gemini answered but the JSON was wrong,
 * that is usually our prompt or our schema, and failing over would hide the bug
 * while doubling its cost. Transport failures — busy, rate-limited, timed out,
 * bad key, retired model — are exactly what a second provider is for.
 */
async function tryGroqFallback<T>(
  options: CallOptions<T>,
  geminiError: unknown,
): Promise<{ used: true; value: T } | { used: false; value: never }> {
  const texts = options.parts.map((part) => ("text" in part ? part.text : null));
  const textOnly = texts.every((text): text is string => text !== null);

  if (!textOnly || !env.has.groq || isContentError(geminiError)) {
    return { used: false } as { used: false; value: never };
  }

  console.warn(
    `[gemini] exhausted for "${options.operation}", falling back to Groq —`,
    geminiError instanceof Error ? geminiError.message.slice(0, 160) : geminiError,
  );

  try {
    const value = await callGroq({
      prompt: texts.join("\n\n"),
      schema: options.schema,
      // Recorded under the same operation name, so the admin cost page shows a
      // fallback as what it is rather than as unexplained Groq traffic.
      operation: options.operation,
      userId: options.userId,
      sessionId: options.sessionId,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
    });
    return { used: true, value };
  } catch (groqError) {
    // Both providers are down. The Gemini error is the root cause and the more
    // actionable of the two, so that is what the caller gets.
    console.error("[groq] fallback also failed", groqError);
    return { used: false } as { used: false; value: never };
  }
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
