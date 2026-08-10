import { DEFAULT_WEIGHTS, SCORE_DIMENSIONS, SCORE_WEIGHTS } from "./types";
import type { FillerHit, ScoreDimension, Scores } from "./types";

/**
 * Pure scoring maths. No I/O, no model calls - which is the point.
 *
 * The design rule for the whole engine: anything that is *countable* is counted
 * here, in code, and anything that is a *judgement* is asked of the model. The
 * model never gets to decide the filler-word count, the speaking pace, or the
 * final composite score, because those are arithmetic and models are bad at
 * arithmetic. It only judges the things that genuinely need judgement.
 */

/** Multi-word entries are matched as phrases, so "you know" counts once. */
const FILLER_PATTERNS = [
  "um",
  "uh",
  "erm",
  "er",
  "ah",
  "hmm",
  "like",
  "basically",
  "actually",
  "literally",
  "obviously",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "you see",
  "i guess",
  "right",
  "okay so",
  "and stuff",
  "or whatever",
] as const;

/** Words that are only filler when they aren't doing real work in the sentence. */
const CONTEXT_SENSITIVE = new Set(["like", "actually", "right", "literally", "obviously"]);

export function countWords(transcript: string): number {
  const matches = transcript.trim().match(/\b[\p{L}\p{N}']+\b/gu);
  return matches ? matches.length : 0;
}

export function wordsPerMinute(wordCount: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.round((wordCount / durationSeconds) * 60);
}

/**
 * Counts filler occurrences. Case-insensitive, whole-word/phrase only, so
 * "unlike" never counts as "like".
 */
export function findFillers(transcript: string): FillerHit[] {
  const haystack = ` ${transcript.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, " ").replace(/\s+/g, " ")} `;

  const hits: FillerHit[] = [];
  for (const phrase of FILLER_PATTERNS) {
    const pattern = new RegExp(`(?<=\\s)${phrase.replace(/ /g, "\\s+")}(?=\\s)`, "g");
    const count = (haystack.match(pattern) ?? []).length;
    if (count > 0) hits.push({ word: phrase, count });
  }

  return hits.sort((a, b) => b.count - a.count);
}

export function totalFillers(hits: FillerHit[]): number {
  return hits.reduce((sum, hit) => sum + hit.count, 0);
}

/**
 * Filler control, 0-100, from filler density rather than raw count - a 60-second
 * answer with three "um"s is worse than a three-minute answer with four.
 * Under 1% is clean speech; 8%+ is hard to listen to.
 */
export function scoreFillerControl(fillerCount: number, wordCount: number): number {
  if (wordCount < 10) return 50;
  const density = fillerCount / wordCount;
  if (density <= 0.01) return 100;
  if (density >= 0.08) return 10;
  // Linear between the two anchors.
  return Math.round(100 - ((density - 0.01) / 0.07) * 90);
}

/**
 * Pace, 0-100. 130-160 wpm is the comfortable band for spoken explanation;
 * both rushing and crawling cost points, symmetrically.
 */
export function scorePace(wpm: number): number {
  if (wpm <= 0) return 0;
  const [low, high] = [130, 160];
  if (wpm >= low && wpm <= high) return 100;
  const distance = wpm < low ? low - wpm : wpm - high;
  return Math.max(10, Math.round(100 - distance * 1.4));
}

/**
 * Weighted composite. Never a blind average - see SCORE_WEIGHTS.
 *
 * `skip` drops dimensions that couldn't honestly be measured for this answer
 * and renormalises over what's left. The case that matters: a typed answer has
 * no speaking pace, and scoring it from the wall clock would punish someone for
 * using the accessibility fallback.
 */
export function weightedOverall(
  scores: Scores,
  mode: string,
  skip: readonly ScoreDimension[] = [],
): number {
  const weights = SCORE_WEIGHTS[mode] ?? DEFAULT_WEIGHTS;
  const counted = SCORE_DIMENSIONS.filter((key) => !skip.includes(key));
  if (counted.length === 0) return 0;

  const total = counted.reduce((sum, key) => sum + scores[key] * weights[key], 0);
  const weightSum = counted.reduce((sum, key) => sum + weights[key], 0);
  return clamp(Math.round(total / weightSum));
}

/** Dimensions that can't be measured from a given input mode. */
export function unmeasurableFor(inputMode: "speech" | "typed"): readonly ScoreDimension[] {
  return inputMode === "typed" ? ["pace"] : [];
}

export function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Tokens awarded for a completed session. Phase 5 builds the economy on this. */
export function tokensForScore(overall: number): number {
  return 10 + Math.round(overall / 5);
}

export { CONTEXT_SENSITIVE, FILLER_PATTERNS };
