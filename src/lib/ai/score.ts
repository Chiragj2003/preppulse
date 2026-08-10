import Groq from "groq-sdk";
import { z } from "zod";

import { env } from "@/lib/env";
import { AppError, toAppError } from "@/lib/errors";
import {
  clamp,
  countWords,
  findFillers,
  scoreFillerControl,
  scorePace,
  totalFillers,
  unmeasurableFor,
  weightedOverall,
  wordsPerMinute,
} from "@/lib/scoring";
import type { EvaluationPayload, Language } from "@/lib/types";
import { recordUsage } from "./usage";

/**
 * Groq decommissions models on a rolling basis. Trying the next id on a
 * model-not-found error means one retirement doesn't take the app down with it.
 */
const MODELS = [
  process.env.GROQ_MODEL,
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
].filter((m): m is string => Boolean(m));

/** Only the judgement calls are asked of the model. Numbers we can count, we count. */
const ModelVerdict = z.object({
  fluency: z.number(),
  vocabulary: z.number(),
  structure: z.number(),
  clarity: z.number(),
  strengths: z.array(z.string()).min(1).max(4),
  improvements: z.array(z.string()).min(1).max(4),
  summary: z.string(),
  improvedAnswer: z.string(),
});

const LANGUAGE_NOTE: Record<Language, string> = {
  en: "The answer is in English. Reply in English.",
  hinglish: "The answer may mix Hindi and English (Hinglish). Judge it on communication, not on language purity. Reply in Hinglish.",
  hi: "The answer is in Hindi. Reply in Hindi.",
};

function buildPrompt(topic: string, transcript: string, language: Language) {
  return `You are a communication coach reviewing a spoken extempore answer.

TOPIC: ${topic}

TRANSCRIPT (speech-to-text, so expect missing punctuation and the odd mis-heard word):
"""
${transcript}
"""

${LANGUAGE_NOTE[language]}

Score these four dimensions 0-100. Be a fair but honest judge: 50 is an average
attempt, 75 is genuinely good, above 90 is rare.
- fluency: did it flow, or was it stop-start with restarts and dead air?
- vocabulary: range and precision of word choice for this topic
- structure: was there a discernible opening, body and close, or did it wander?
- clarity: would a listener get the point the first time?

Then write:
- strengths: 2-3 specific things they actually did well. Quote their own words where you can. No generic praise.
- improvements: 2-3 concrete, actionable fixes. Say what to do differently, not just what was wrong.
- summary: one sentence, second person, on how the answer landed overall.
- improvedAnswer: a tighter version of THEIR answer, roughly the same length.
  Critical: keep their argument, their examples and their point of view intact.
  You are editing their answer, not replacing it with a better one of your own.
  If they argued X, the improved version still argues X.

Do not comment on filler words or speaking pace - those are measured separately.

Return ONLY a JSON object with exactly these keys:
{"fluency":number,"vocabulary":number,"structure":number,"clarity":number,"strengths":string[],"improvements":string[],"summary":string,"improvedAnswer":string}`;
}

export async function scoreAnswer(input: {
  userId: string;
  sessionId: string;
  topic: string;
  transcript: string;
  durationSeconds: number;
  mode: string;
  language?: Language;
  inputMode?: "speech" | "typed";
}): Promise<
  EvaluationPayload & {
    wordCount: number;
    wordsPerMinute: number | null;
    inputMode: "speech" | "typed";
  }
> {
  const transcript = input.transcript.trim();
  const wordCount = countWords(transcript);

  if (wordCount < 15) {
    throw new AppError(
      "invalid_input",
      "That answer is too short to score fairly - we need about 15 words. Give the topic another go.",
    );
  }

  // ── Measured locally, not asked of the model ──────────────────────────────
  const inputMode = input.inputMode ?? "speech";
  const spoken = inputMode === "speech";

  const fillerWords = findFillers(transcript);
  // A typed answer's "duration" is just how long they sat on the page, which
  // says nothing about speaking pace. Don't pretend otherwise.
  const wpm = spoken ? wordsPerMinute(wordCount, input.durationSeconds) : null;
  const paceScore = wpm === null ? 0 : scorePace(wpm);
  const fillerScore = scoreFillerControl(totalFillers(fillerWords), wordCount);

  // ── Judged by the model ───────────────────────────────────────────────────
  const verdict = await askGroq({
    prompt: buildPrompt(input.topic, transcript, input.language ?? "en"),
    userId: input.userId,
    sessionId: input.sessionId,
  });

  const scores = {
    fluency: clamp(verdict.fluency),
    vocabulary: clamp(verdict.vocabulary),
    structure: clamp(verdict.structure),
    clarity: clamp(verdict.clarity),
    pace: paceScore,
    fillerControl: fillerScore,
  };

  return {
    scores,
    // Computed here from the weights table - the model never returns an overall.
    // Unmeasurable dimensions are dropped and the rest renormalised.
    overallScore: weightedOverall(scores, input.mode, unmeasurableFor(inputMode)),
    strengths: verdict.strengths,
    improvements: verdict.improvements,
    fillerWords,
    improvedAnswer: verdict.improvedAnswer,
    summary: verdict.summary,
    wordCount,
    wordsPerMinute: wpm,
    inputMode,
  };
}

async function askGroq(args: { prompt: string; userId: string; sessionId: string }) {
  const client = new Groq({ apiKey: env.groqApiKey, timeout: 45_000, maxRetries: 1 });

  let lastError: unknown;

  for (const model of MODELS) {
    const startedAt = Date.now();
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.3,
        max_tokens: 1400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a precise, encouraging communication coach. You always reply with a single valid JSON object and nothing else.",
          },
          { role: "user", content: args.prompt },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("Groq returned an empty completion");

      const parsed = ModelVerdict.safeParse(JSON.parse(content));
      if (!parsed.success) {
        throw new Error(`Groq returned unexpected JSON: ${parsed.error.issues[0]?.message}`);
      }

      await recordUsage({
        userId: args.userId,
        sessionId: args.sessionId,
        provider: "groq",
        model,
        operation: "score_answer",
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
      });

      return parsed.data;
    } catch (error) {
      lastError = error;

      await recordUsage({
        userId: args.userId,
        sessionId: args.sessionId,
        provider: "groq",
        model,
        operation: "score_answer",
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
        ok: false,
        errorCode: error instanceof Error ? error.message.slice(0, 120) : "unknown",
      });

      // Only a retired/unknown model is worth retrying on a different id.
      if (!isModelUnavailable(error)) break;
      console.warn(`[groq] model "${model}" unavailable, trying the next one`);
    }
  }

  throw toAppError(lastError, "groq.scoreAnswer");
}

function isModelUnavailable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : "";
  return status === 404 || /decommission|does not exist|model_not_found/i.test(message);
}
