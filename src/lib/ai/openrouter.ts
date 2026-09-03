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
 * OpenRouter, over its OpenAI-compatible chat-completions endpoint. Plain
 * fetch rather than a client library — same call as gemini.ts's REST client,
 * and OpenRouter's request/response shape is already the one groq.ts speaks.
 *
 * Free-tier models only, in priority order, with the same "walk the list and
 * drop a retired id" resilience as the other two providers: OpenRouter's free
 * catalog turns over as providers rotate hosted capacity, faster than either
 * Gemini's or Groq's.
 *
 * minimax/minimax-m3 leads deliberately, not alphabetically or by size: a
 * live check against this project's actual key (`verify:openrouter`) found
 * glm-5.2 and gemma-4-31b-it both consistently rate-limited on their free
 * hosted endpoints, while minimax-m3 answered cleanly every time. They stay
 * as fallbacks rather than being dropped — free-tier availability rotates,
 * and today's busy endpoint is next week's spare capacity.
 */
const MODELS = [
  process.env.OPENROUTER_MODEL,
  "minimax/minimax-m3:free",
  "z-ai/glm-5.2:free",
  "google/gemma-4-31b-it:free",
].filter((m): m is string => Boolean(m));

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface OpenRouterCallOptions {
  prompt: string;
  system?: string;
  operation: string;
  userId: string;
  sessionId?: string | null;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

const JSON_SYSTEM =
  "You reply with a single valid JSON object and nothing else. No prose, no markdown fences.";

/**
 * Some free/open-weight models wrap JSON in a ```json fence despite being
 * told not to — Groq's Llama models don't, but OpenRouter's rotating free
 * catalog is more heterogeneous. Stripped before parsing rather than trusted
 * away in the prompt, per this codebase's own rule: anything checkable is
 * checked in code.
 */
function stripJsonFence(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced ? fenced[1] : content).trim();
}

/** Structured output, validated. */
export async function callOpenRouter<T>(
  options: OpenRouterCallOptions & { schema: z.ZodType<T> },
): Promise<T> {
  return run(options, true, (content) => {
    const parsed = options.schema.safeParse(JSON.parse(stripJsonFence(content)));
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      console.error("[openrouter] schema mismatch", detail, content.slice(0, 400));
      throw new Error(`OpenRouter returned unexpected JSON — ${detail}`);
    }
    return parsed.data;
  });
}

/** Plain prose, for the one caller that wants a sentence rather than a record. */
export async function callOpenRouterText(options: OpenRouterCallOptions): Promise<string> {
  return run(options, false, (content) => content.trim());
}

async function run<T>(
  options: OpenRouterCallOptions,
  json: boolean,
  parse: (content: string) => T,
): Promise<T> {
  const apiKey = env.openrouterApiKey;
  let lastError: unknown;

  models: for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const startedAt = Date.now();

      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            // Optional attribution headers OpenRouter uses for its public
            // rankings page. Harmless to omit, cheap to include.
            "HTTP-Referer": env.appUrl,
            "X-Title": "PrepPulse",
          },
          body: JSON.stringify({
            model,
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxOutputTokens ?? 1400,
            ...(json ? { response_format: { type: "json_object" as const } } : {}),
            messages: [
              { role: "system", content: options.system ?? (json ? JSON_SYSTEM : "") },
              { role: "user", content: options.prompt },
            ],
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const error = Object.assign(
            new Error(`OpenRouter ${response.status}: ${detail.slice(0, 300)}`),
            { status: response.status },
          );
          throw error;
        }

        const payload = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const content = payload.choices?.[0]?.message?.content;
        if (!content) throw new Error("OpenRouter returned an empty completion");

        const value = parse(content);

        await recordUsage({
          userId: options.userId,
          sessionId: options.sessionId ?? null,
          provider: "openrouter",
          model,
          operation: options.operation,
          inputTokens: payload.usage?.prompt_tokens ?? 0,
          outputTokens: payload.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - startedAt,
        });

        return value;
      } catch (error) {
        lastError = error;

        await recordUsage({
          userId: options.userId,
          sessionId: options.sessionId ?? null,
          provider: "openrouter",
          model,
          operation: options.operation,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Date.now() - startedAt,
          ok: false,
          errorCode: error instanceof Error ? error.message.slice(0, 120) : "unknown",
        });

        if (isModelUnavailable(error)) {
          console.warn(`[openrouter] model "${model}" unavailable, trying the next one`);
          continue models;
        }

        if (!isTransient(error)) break models;

        if (attempt < MAX_ATTEMPTS_PER_MODEL) {
          const wait = backoffFor(attempt);
          console.warn(
            `[openrouter] "${model}" busy (attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL}), retrying in ${wait}ms`,
          );
          await sleep(wait);
          continue;
        }

        console.warn(`[openrouter] "${model}" still busy after ${attempt} attempts, trying the next one`);
      }
    }
  }

  throw toAppError(lastError, `openrouter.${options.operation}`);
}
