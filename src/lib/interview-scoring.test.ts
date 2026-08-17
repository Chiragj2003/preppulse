/**
 * Self-check for the interview maths.
 *
 *   npx tsx src/lib/interview-scoring.test.ts
 *
 * The retry rules are the part worth guarding: they decide whether pressing
 * "Try again" helps a candidate or quietly punishes them.
 */
import { strict as assert } from "node:assert";

import {
  aggregateScores,
  difficultyBreakdown,
  runningAverage,
  scoreDelta,
  weightedAnswerScore,
} from "./interview-scoring";
import type { AnswerScores } from "./types";

const flat = (n: number): AnswerScores => ({
  content: n,
  clarity: n,
  relevance: n,
  structure: n,
});

/* ── weighted composite ────────────────────────────────────────────────── */
assert.equal(weightedAnswerScore(flat(80)), 80, "uniform scores pass through");
assert.equal(weightedAnswerScore(flat(0)), 0);
assert.equal(weightedAnswerScore(flat(100)), 100);

// Relevance (0.30) must move the total more than structure (0.18).
{
  const strongRelevance = { ...flat(60), relevance: 100 };
  const strongStructure = { ...flat(60), structure: 100 };
  assert.ok(
    weightedAnswerScore(strongRelevance) > weightedAnswerScore(strongStructure),
    "relevance is weighted above structure, not averaged with it",
  );
}

// Out-of-range values from the model are clamped, never trusted raw.
assert.equal(weightedAnswerScore({ ...flat(80), content: 900 }), 100);
assert.equal(weightedAnswerScore({ ...flat(0), content: -50 }), 0);

/* ── running average ───────────────────────────────────────────────────── */
assert.equal(runningAverage([]), null, "no answers yet is null, not zero");

assert.equal(
  runningAverage([
    { questionId: "a", overallScore: 60 },
    { questionId: "b", overallScore: 80 },
  ]),
  70,
);

// The rule that matters: a retry replaces, it does not drag the average down.
{
  const withRetry = [
    { questionId: "a", overallScore: 40 }, // first attempt
    { questionId: "a", overallScore: 90 }, // retry, much better
    { questionId: "b", overallScore: 80 },
  ];
  assert.equal(runningAverage(withRetry), 85, "best attempt per question counts");
  assert.notEqual(runningAverage(withRetry), 70, "must not average every attempt");
}

// A worse retry must not overwrite a better first attempt either.
assert.equal(
  runningAverage([
    { questionId: "a", overallScore: 90 },
    { questionId: "a", overallScore: 30 },
  ]),
  90,
  "a bad retry cannot lower an already-good answer",
);

/* ── aggregate ─────────────────────────────────────────────────────────── */
assert.deepEqual(aggregateScores([]), flat(0), "empty aggregate is zeroes, not NaN");

assert.deepEqual(
  aggregateScores([
    { questionId: "a", overallScore: 60, scores: flat(60) },
    { questionId: "b", overallScore: 80, scores: flat(80) },
  ]),
  flat(70),
);

// Aggregate follows the same best-attempt rule as the running average.
assert.deepEqual(
  aggregateScores([
    { questionId: "a", overallScore: 40, scores: flat(40) },
    { questionId: "a", overallScore: 90, scores: flat(90) },
  ]),
  flat(90),
  "aggregate and running average must agree on which attempt counts",
);

/* ── delta ─────────────────────────────────────────────────────────────── */
assert.equal(scoreDelta(40, 90), 50);
assert.equal(scoreDelta(90, 40), -50);
assert.equal(scoreDelta(70, 70), 0);

/* ── difficulty breakdown ──────────────────────────────────────────────── */
function sumsTo(n: number) {
  const b = difficultyBreakdown(n);
  assert.equal(b.easy + b.medium + b.hard, n, `breakdown for ${n} must sum to ${n}`);
  return b;
}

assert.deepEqual(difficultyBreakdown(0), { easy: 0, medium: 0, hard: 0 });
assert.deepEqual(sumsTo(1), { easy: 1, medium: 0, hard: 0 }, "one question is easy, not hard");
assert.deepEqual(sumsTo(3), { easy: 1, medium: 1, hard: 1 });
assert.deepEqual(sumsTo(5), { easy: 2, medium: 2, hard: 1 });
assert.deepEqual(sumsTo(8), { easy: 3, medium: 3, hard: 2 });
assert.deepEqual(sumsTo(10), { easy: 4, medium: 4, hard: 2 });
assert.deepEqual(sumsTo(15), { easy: 6, medium: 5, hard: 4 });

// Every size from 1 to 20 must sum correctly — the largest-remainder method
// is the part that can silently drift by one if the tie-break is wrong.
for (let n = 1; n <= 20; n++) sumsTo(n);

console.log("interview-scoring: all checks passed");
