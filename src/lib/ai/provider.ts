import { z } from "zod";

import { env } from "@/lib/env";
import { callGemini } from "./gemini";
import { callGroq, callGroqText, type GroqCallOptions } from "./groq";
import { callOpenRouter, callOpenRouterText } from "./openrouter";

/**
 * The single switch for which provider judges an answer, coaches a read, or
 * writes a persona's turn. `AI_PROVIDER` in `.env` picks one of the three for
 * everything at once; every judgement call site goes through
 * `callAI`/`callAIText` instead of reaching for a specific provider's client
 * directly, so switching providers is one env var rather than an edit per
 * call site. See `decisions.md`.
 *
 * `defaultProvider` is required, not defaulted here, on purpose. Each call
 * site already had its own provider before this dispatcher existed — Groq
 * for anything latency-sensitive (score, reading, discussion, topic briefs),
 * Gemini for the interview — and passes that same choice as its
 * `defaultProvider`. `env.aiProvider` overrides it only when the operator has
 * actually set `AI_PROVIDER`; leaving it unset must reproduce the exact
 * behaviour every call site had before this file existed. A single hardcoded
 * fallback here (e.g. always "gemini") was tried and was wrong: it would
 * silently move every Groq-primary call site onto Gemini for anyone who had
 * never touched the env var at all.
 *
 * What this deliberately does NOT do: chain providers as fallbacks for each
 * other. `callGemini` still falls back to Groq internally when Gemini itself
 * is the effective provider (that behaviour predates this file and stays),
 * but choosing "groq" or "openrouter" here means exactly that provider, with
 * no silent fallback to the other two.
 *
 * Resume PDF extraction is not routed through here at all: only Gemini reads
 * a document's bytes natively, so `extractResume` always calls `callGemini`
 * directly regardless of `AI_PROVIDER`.
 */
export type AICallOptions = GroqCallOptions & {
  /** This call site's provider before AI_PROVIDER existed — used whenever it's unset. */
  defaultProvider: "gemini" | "groq";
};

function effectiveProvider(defaultProvider: "gemini" | "groq"): "gemini" | "groq" | "openrouter" {
  return env.aiProvider ?? defaultProvider;
}

export async function callAI<T>(options: AICallOptions & { schema: z.ZodType<T> }): Promise<T> {
  switch (effectiveProvider(options.defaultProvider)) {
    case "groq":
      return callGroq(options);
    case "openrouter":
      return callOpenRouter(options);
    case "gemini":
      return callGemini({
        parts: [{ text: options.system ? `${options.system}\n\n${options.prompt}` : options.prompt }],
        schema: options.schema,
        operation: options.operation,
        userId: options.userId,
        sessionId: options.sessionId,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
      });
  }
}

/** Plain prose. Gemini has no such mode — it only ever returns JSON — so this asks for one field and unwraps it. */
export async function callAIText(options: AICallOptions): Promise<string> {
  switch (effectiveProvider(options.defaultProvider)) {
    case "groq":
      return callGroqText(options);
    case "openrouter":
      return callOpenRouterText(options);
    case "gemini": {
      const TextReply = z.object({ text: z.string() });
      const prefix = options.system ? `${options.system}\n\n` : "";
      const result = await callGemini({
        parts: [{ text: `${prefix}${options.prompt}\n\nReturn ONLY JSON: {"text": string}` }],
        schema: TextReply,
        operation: options.operation,
        userId: options.userId,
        sessionId: options.sessionId,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
      });
      return result.text;
    }
  }
}
