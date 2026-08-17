import { clamp } from "./scoring";
import { ANSWER_WEIGHTS, type AnswerScores } from "./types";

/**
 * Pure interview maths. No I/O, no model calls — same split as Phase 2, so
 * the arithmetic that decides someone's score can be tested without a network.
 */

/**
 * Weighted in our code, never returned by the model.
 *
 * Relevance and content carry the most weight because a fluent answer to the
 * wrong question is the most common way a real interview goes badly.
 */
export function weightedAnswerScore(scores: AnswerScores): number {
  const total =
    scores.content * ANSWER_WEIGHTS.content +
    scores.clarity * ANSWER_WEIGHTS.clarity +
    scores.relevance * ANSWER_WEIGHTS.relevance +
    scores.structure * ANSWER_WEIGHTS.structure;

  const weightSum =
    ANSWER_WEIGHTS.content +
    ANSWER_WEIGHTS.clarity +
    ANSWER_WEIGHTS.relevance +
    ANSWER_WEIGHTS.structure;

  return clamp(Math.round(total / weightSum));
}

/** Keeps only the best attempt per question. */
function bestPerQuestion<T extends { questionId: string; overallScore: number }>(
  answers: T[],
): T[] {
  const best = new Map<string, T>();
  for (const answer of answers) {
    const current = best.get(answer.questionId);
    if (!current || answer.overallScore > current.overallScore) {
      best.set(answer.questionId, answer);
    }
  }
  return [...best.values()];
}

/**
 * Running average across the questions answered so far.
 *
 * Only the best attempt at each question counts, so retrying is a way to
 * improve rather than a way to drag your own average down. Averaging every
 * attempt would punish exactly the people who use the Retry button.
 */
export function runningAverage(
  answers: { questionId: string; overallScore: number }[],
): number | null {
  if (answers.length === 0) return null;
  const rows = bestPerQuestion(answers);
  return Math.round(rows.reduce((sum, r) => sum + r.overallScore, 0) / rows.length);
}

export function aggregateScores(
  answers: { questionId: string; overallScore: number; scores: AnswerScores }[],
): AnswerScores {
  const rows = bestPerQuestion(answers);
  if (rows.length === 0) return { content: 0, clarity: 0, relevance: 0, structure: 0 };

  const sum = rows.reduce(
    (acc, row) => ({
      content: acc.content + row.scores.content,
      clarity: acc.clarity + row.scores.clarity,
      relevance: acc.relevance + row.scores.relevance,
      structure: acc.structure + row.scores.structure,
    }),
    { content: 0, clarity: 0, relevance: 0, structure: 0 },
  );

  return {
    content: Math.round(sum.content / rows.length),
    clarity: Math.round(sum.clarity / rows.length),
    relevance: Math.round(sum.relevance / rows.length),
    structure: Math.round(sum.structure / rows.length),
  };
}

/** Improvement between a first attempt and a retry, for the score delta. */
export function scoreDelta(first: number, latest: number): number {
  return latest - first;
}

/**
 * How many easy/medium/hard questions a round of this size gets.
 *
 * Computed here rather than left to the model's judgement — "mix the
 * difficulty" is exactly the kind of instruction a model interprets loosely
 * and a candidate can't verify, and the difficulty of a round is a countable
 * property. Roughly 40/35/25 easy/medium/hard, using the largest-remainder
 * method so the three counts always sum to exactly `count` — no rounding
 * drift, no "3.2 hard questions."
 *
 * Ties in the remainder go to the lower difficulty first, so a small round
 * stays weighted toward approachable rather than defaulting to hard.
 */
export function difficultyBreakdown(count: number): { easy: number; medium: number; hard: number } {
  if (count <= 0) return { easy: 0, medium: 0, hard: 0 };

  const share = { easy: 0.4, medium: 0.35, hard: 0.25 };
  const raw = {
    easy: count * share.easy,
    medium: count * share.medium,
    hard: count * share.hard,
  };
  const floor = {
    easy: Math.floor(raw.easy),
    medium: Math.floor(raw.medium),
    hard: Math.floor(raw.hard),
  };

  const remainder = count - (floor.easy + floor.medium + floor.hard);
  const byLeftoverFraction = (["easy", "medium", "hard"] as const)
    .map((tier) => ({ tier, fraction: raw[tier] - floor[tier] }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = { ...floor };
  for (let i = 0; i < remainder; i++) result[byLeftoverFraction[i].tier]++;
  return result;
}
