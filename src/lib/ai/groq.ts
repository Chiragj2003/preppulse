import Groq from "groq-sdk";
import { z } from "zod";

import { env } from "@/lib/env";
import { toAppError } from "@/lib/errors";
import {
  MAX_ATTEMPTS_PER_MODEL,
  backoffFor,
  isModelUnavailable,
  isTransient,
  sleep,
} from "./retry";
import { recordUsage } from "./usage";

/**
 * The single Groq entry point.
 *
 * This loop used to be written out three times — in score.ts, discussion.ts and
 * topic-brief.ts — each with its own copy of the model list, its own
 * isModelUnavailable, and no backoff. That duplication is also the reason
 * Gemini had nothing to fall back to when it was busy: there was no shared
 * function to call, only three private ones.
 */
/**
 * llama-3.3-70b-versatile and llama-3.1-8b-instant, the two ids this list
 * used to carry, are gone from Groq's own /models listing entirely as of
 * 2026-09 — not renamed, retired. Discovered testing the AI_PROVIDER switch,
 * not by this list catching it: `isModelUnavailable` walked both, found
 * nothing left to walk to, and the whole Groq path failed. Verified against
 * a real key, the same standard the rest of this file holds itself to.
 */
const MODELS = [
  process.env.GROQ_MODEL,
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
].filter((m): m is string => Boolean(m));

export interface GroqCallOptions {
  prompt: string;
  system?: string;
  operation: string;
  userId: string;
  sessionId?: string | null;
  temperature?: number;
  maxOutputTokens?: number;
  /** Shorter where the caller degrades gracefully rather than waiting. */
  timeoutMs?: number;
}

const JSON_SYSTEM =
  "You reply with a single valid JSON object and nothing else. No prose, no markdown fences.";

/** Structured output, validated. */
export async function callGroq<T>(
  options: GroqCallOptions & { schema: z.ZodType<T> },
): Promise<T> {
  return run(options, true, (content) => {
    const parsed = options.schema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      console.error("[groq] schema mismatch", detail, content.slice(0, 400));
      throw new Error(`Groq returned unexpected JSON — ${detail}`);
    }
    return parsed.data;
  });
}

/** Plain prose, for the one caller that wants a sentence rather than a record. */
export async function callGroqText(options: GroqCallOptions): Promise<string> {
  return run(options, false, (content) => content.trim());
}

async function run<T>(
  options: GroqCallOptions,
  json: boolean,
  parse: (content: string) => T,
): Promise<T> {
  const client = new Groq({
    apiKey: env.groqApiKey,
    timeout: options.timeoutMs ?? 45_000,
    // Our own backoff is the retry policy. The SDK's would be retries inside
    // retries, turning a 3-attempt budget into 6 without saying so.
    maxRetries: 0,
  });

  let lastError: unknown;

  models: for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const startedAt = Date.now();

      try {
        const completion = await client.chat.completions.create({
          model,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxOutputTokens ?? 1400,
          ...(json ? { response_format: { type: "json_object" as const } } : {}),
          messages: [
            { role: "system", content: options.system ?? (json ? JSON_SYSTEM : "") },
            { role: "user", content: options.prompt },
          ],
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error("Groq returned an empty completion");

        const value = parse(content);

        await recordUsage({
          userId: options.userId,
          sessionId: options.sessionId ?? null,
          provider: "groq",
          model,
          operation: options.operation,
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - startedAt,
        });

        return value;
      } catch (error) {
        lastError = error;

        await recordUsage({
          userId: options.userId,
          sessionId: options.sessionId ?? null,
          provider: "groq",
          model,
          operation: options.operation,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Date.now() - startedAt,
          ok: false,
          errorCode: error instanceof Error ? error.message.slice(0, 120) : "unknown",
        });

        if (isModelUnavailable(error)) {
          console.warn(`[groq] model "${model}" unavailable, trying the next one`);
          continue models;
        }

        if (!isTransient(error)) break models;

        if (attempt < MAX_ATTEMPTS_PER_MODEL) {
          const wait = backoffFor(attempt);
          console.warn(
            `[groq] "${model}" busy (attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL}), retrying in ${wait}ms`,
          );
          await sleep(wait);
          continue;
        }

        console.warn(`[groq] "${model}" still busy after ${attempt} attempts, trying the next one`);
      }
    }
  }

  throw toAppError(lastError, `groq.${options.operation}`);
}
