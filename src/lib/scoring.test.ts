/**
 * Self-check for the scoring maths. No test framework - run it directly:
 *
 *   npx tsx src/lib/scoring.test.ts
 *
 * Covers the parts that would silently produce a wrong score: filler matching,
 * the density and pace curves, and the weighted composite.
 */
import { strict as assert } from "node:assert";

import {
  countWords,
  findFillers,
  scoreFillerControl,
  scorePace,
  totalFillers,
  unmeasurableFor,
  weightedOverall,
  wordsPerMinute,
} from "./scoring";
import { SCORE_DIMENSIONS } from "./types";
import type { Scores } from "./types";

/* ── word counting ─────────────────────────────────────────────────────── */
assert.equal(countWords("hello world"), 2);
assert.equal(countWords("  spaced   out  "), 2);
assert.equal(countWords("it's a well-known fact"), 5, "hyphens split, apostrophes don't");
assert.equal(countWords(""), 0);

/* ── filler detection ──────────────────────────────────────────────────── */
{
  const hits = findFillers("So um I basically think that, um, it works");
  const byWord = Object.fromEntries(hits.map((h) => [h.word, h.count]));
  assert.equal(byWord.um, 2, "counts repeats");
  assert.equal(byWord.basically, 1);
  assert.equal(totalFillers(hits), 3);
}

// The one that matters: substrings must not count.
assert.equal(findFillers("I dislike unlike likelihood").length, 0, "no substring matches");
assert.equal(findFillers("I like it").find((h) => h.word === "like")?.count, 1);

// Multi-word phrases match as a unit.
assert.equal(findFillers("it is, you know, fine").find((h) => h.word === "you know")?.count, 1);

// Punctuation between words must not break phrase matching.
assert.equal(findFillers("well, you  know, sure").find((h) => h.word === "you know")?.count, 1);

// Case-insensitive.
assert.equal(findFillers("Um, Basically yes").length, 2);

/* ── pace ──────────────────────────────────────────────────────────────── */
assert.equal(wordsPerMinute(150, 60), 150);
assert.equal(wordsPerMinute(75, 30), 150);
assert.equal(wordsPerMinute(10, 0), 0, "no divide-by-zero");

assert.equal(scorePace(145), 100, "mid-band is perfect");
assert.equal(scorePace(130), 100, "lower edge inclusive");
assert.equal(scorePace(160), 100, "upper edge inclusive");
assert.ok(scorePace(90) < 100 && scorePace(90) > 10, "too slow costs points");
assert.ok(scorePace(220) < scorePace(180), "further out scores worse");
assert.equal(scorePace(0), 0);
assert.ok(scorePace(500) >= 10, "never below the floor");

/* ── filler control ────────────────────────────────────────────────────── */
assert.equal(scoreFillerControl(0, 200), 100, "clean speech");
assert.equal(scoreFillerControl(2, 200), 100, "1% still counts as clean");
assert.equal(scoreFillerControl(40, 200), 10, "20% density bottoms out");
assert.ok(
  scoreFillerControl(5, 100) < scoreFillerControl(5, 400),
  "density, not raw count: same fillers over more words scores better",
);
assert.equal(scoreFillerControl(1, 5), 50, "too short to judge returns neutral");

/* ── weighted composite ────────────────────────────────────────────────── */
{
  const flat: Scores = {
    fluency: 80,
    vocabulary: 80,
    structure: 80,
    clarity: 80,
    pace: 80,
    fillerControl: 80,
  };
  assert.equal(weightedOverall(flat, "random_topic"), 80, "uniform scores pass through");

  // Structure is weighted highest (0.25) and pace lowest (0.10), so moving
  // structure must swing the total more than moving pace by the same amount.
  const strongStructure = { ...flat, structure: 100 };
  const strongPace = { ...flat, pace: 100 };
  assert.ok(
    weightedOverall(strongStructure, "random_topic") > weightedOverall(strongPace, "random_topic"),
    "weights are not a blind average",
  );

  // Unknown mode must fall back rather than divide by zero.
  assert.equal(weightedOverall(flat, "mode_that_does_not_exist"), 80);

  const zero: Scores = {
    fluency: 0,
    vocabulary: 0,
    structure: 0,
    clarity: 0,
    pace: 0,
    fillerControl: 0,
  };
  assert.equal(weightedOverall(zero, "random_topic"), 0);
}

/* ── unmeasurable dimensions are excluded, not zeroed ──────────────────── */
{
  // A typed answer has no speaking pace. Scoring it as 0 would drag the
  // composite down for using the accessibility fallback - the exact bug this
  // guards against.
  const typed: Scores = {
    fluency: 80,
    vocabulary: 80,
    structure: 80,
    clarity: 80,
    pace: 0, // unmeasurable
    fillerControl: 80,
  };

  assert.equal(
    weightedOverall(typed, "random_topic", ["pace"]),
    80,
    "excluding pace renormalises over the rest",
  );
  assert.ok(
    weightedOverall(typed, "random_topic") < 80,
    "including an unmeasurable zero would have penalised the answer",
  );

  assert.deepEqual(unmeasurableFor("typed"), ["pace"]);
  assert.deepEqual(unmeasurableFor("speech"), []);

  // Skipping everything must not divide by zero.
  assert.equal(weightedOverall(typed, "random_topic", SCORE_DIMENSIONS), 0);
}

console.log("scoring: all checks passed");
