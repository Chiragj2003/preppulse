import { z } from "zod";

import { callAI } from "./provider";
import type { Language } from "@/lib/types";
import type { ReadingMetrics } from "@/lib/reading-scoring";

const LANGUAGE_NOTE: Record<Language, string> = {
  en: "Reply in English.",
  hinglish: "Reply in Hinglish (Hindi-English mix).",
  hi: "Reply in Hindi.",
};

/**
 * The one judgement call in reading practice.
 *
 * Everything measurable — accuracy, pace, completion, which words were missed —
 * is already computed in lib/reading-scoring.ts before this runs. The model is
 * handed those numbers and asked only for the thing arithmetic cannot produce:
 * what the pattern of misses suggests the reader should work on.
 *
 * Routed through the configured AI_PROVIDER rather than pinned to one
 * provider — this call is short and structured, and wanted fast (the reader
 * is staring at a results screen), which is exactly the kind of call every
 * provider handles fine.
 */
const CoachingSchema = z.object({
  verdict: z.string().catch(""),
  /** What the misses have in common, if anything. */
  pattern: z.string().catch(""),
  drill: z.string().catch(""),
});

export async function coachReading(input: {
  userId: string;
  sessionId: string;
  title: string;
  focus: string | null;
  kind: "tongue_twister" | "passage";
  metrics: ReadingMetrics;
  language?: Language;
}) {
  const { metrics } = input;

  // Only the words they actually missed go to the model, not the whole
  // passage — the passage is already known and sending it would be paying for
  // tokens to re-read something we wrote.
  const missed = metrics.stumbles.slice(0, 12);

  const substitutions = metrics.alignment
    .filter((step) => step.op === "substitute" && step.expected && step.heard)
    .slice(0, 10)
    .map((step) => `"${step.expected}" came out as "${step.heard}"`)
    .join("; ");

  const result = await callAI({
    prompt: `A speaker read "${input.title}" aloud (a ${input.kind === "tongue_twister" ? "tongue twister" : "reading passage"}).
${input.focus ? `It drills: ${input.focus}` : ""}

MEASURED (already computed — do not recalculate or contradict these):
- Word accuracy: ${metrics.accuracy}% (${metrics.matched} of ${metrics.totalWords} words)
- Pace: ${metrics.wordsPerMinute} words per minute
- Completion: ${metrics.completion}%
- Misread: ${metrics.substituted}, skipped: ${metrics.skipped}, added: ${metrics.added}

WORDS THEY DIDN'T LAND: ${missed.length > 0 ? missed.join(", ") : "none"}
${substitutions ? `WHAT THE RECOGNISER HEARD INSTEAD: ${substitutions}` : ""}

Write:
- verdict: two sentences on how that read went. Speak to them directly. Do not repeat the numbers back — they can see them.
- pattern: what the missed words have in common as sounds, in one sentence. If there is no real pattern, say so plainly rather than inventing one.
- drill: one specific thing to practise next time, in one sentence.

Note: the transcript comes from a speech recogniser that repairs slurred words, so a high accuracy is not proof of clean articulation. Do not claim their pronunciation was perfect.

${LANGUAGE_NOTE[input.language ?? "en"]}

Return ONLY JSON:
{"verdict":string,"pattern":string,"drill":string}`,
    schema: CoachingSchema,
    operation: "coach_reading",
    userId: input.userId,
    sessionId: input.sessionId,
    temperature: 0.4,
    maxOutputTokens: 600,
  });

  return {
    verdict: result.verdict || "That read has been scored — the breakdown is below.",
    pattern: result.pattern,
    drill: result.drill || "Read it again a little slower and hold each consonant to the end.",
  };
}
