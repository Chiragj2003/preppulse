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

console.log("interview-scoring: all checks passed");
