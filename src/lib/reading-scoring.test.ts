/**
 * Self-check for the reading maths.
 *
 *   npx tsx src/lib/reading-scoring.test.ts
 *
 * The alignment is the part worth guarding. A naive position-by-position
 * comparison reports a near-total failure the moment one word is skipped,
 * because every word after it lands against the wrong slot — so the first two
 * blocks below pin exactly that: one skip must cost one skip.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  alignWords,
  normaliseWord,
  overallReadingScore,
  paceScoreFor,
  scoreReading,
  toWords,
} from "./reading-scoring";

test("normalisation", () => {
  assert.equal(normaliseWord("Don't"), "dont", "case and apostrophes are not spoken");
  assert.equal(normaliseWord("shells,"), "shells", "punctuation is the writer's, not the reader's");
  assert.equal(normaliseWord("“quote”"), "quote");
  assert.equal(normaliseWord("5"), "five", "the recogniser writes digits, passages write words");
  assert.equal(normaliseWord("!!!"), "", "punctuation-only tokens vanish");

  assert.deepEqual(toWords("She sells   sea-shells!"), ["she", "sells", "seashells"]);
});

test("alignment: a perfect read", () => {
  const words = toWords("the quick brown fox");
  const alignment = alignWords(words, words);
  assert.equal(alignment.length, 4);
  assert.ok(
    alignment.every((step) => step.op === "match"),
    "identical input must be all matches",
  );
});

test("alignment: one skipped word costs exactly one skip", () => {
  // This is the case that breaks naive comparison: drop "quick" and a
  // position-wise diff marks brown/fox wrong too.
  const expected = toWords("the quick brown fox jumps");
  const heard = toWords("the brown fox jumps");
  const alignment = alignWords(expected, heard);

  const skipped = alignment.filter((s) => s.op === "delete");
  assert.equal(skipped.length, 1, "exactly one deletion");
  assert.equal(skipped[0].expected, "quick");
  assert.equal(alignment.filter((s) => s.op === "match").length, 4, "the rest still match");
  assert.equal(alignment.filter((s) => s.op === "substitute").length, 0);
});

test("alignment: an added word costs exactly one insert", () => {
  const alignment = alignWords(toWords("the brown fox"), toWords("the very brown fox"));
  assert.equal(alignment.filter((s) => s.op === "insert").length, 1);
  assert.equal(alignment.filter((s) => s.op === "match").length, 3);
});

test("alignment: a misread word is a substitution, not a skip plus an add", () => {
  const alignment = alignWords(toWords("she sells sea shells"), toWords("she sells see shells"));
  const subs = alignment.filter((s) => s.op === "substitute");
  assert.equal(subs.length, 1, "one substitution");
  assert.equal(subs[0].expected, "sea");
  assert.equal(subs[0].heard, "see");
  assert.equal(alignment.filter((s) => s.op === "delete").length, 0);
  assert.equal(alignment.filter((s) => s.op === "insert").length, 0);
});

test("scoring: a clean read at a good pace", () => {
  const passage = "Peter Piper picked a peck of pickled peppers";
  // 8 words in 3.4s is ~141 wpm, inside the default band.
  const metrics = scoreReading({ passage, transcript: passage, durationSeconds: 3.4 });

  assert.equal(metrics.accuracy, 100);
  assert.equal(metrics.completion, 100);
  assert.equal(metrics.skipped, 0);
  assert.equal(metrics.substituted, 0);
  assert.equal(metrics.totalWords, 8);
  assert.equal(metrics.paceScore, 100, `141 wpm should be in band, got ${metrics.wordsPerMinute}`);
  assert.deepEqual(metrics.stumbles, []);
  assert.equal(overallReadingScore(metrics), 100);
});

test("scoring: stopping halfway caps the score, and completion says so", () => {
  const passage = "one two three four five six seven eight nine ten";
  const metrics = scoreReading({
    passage,
    transcript: "one two three four five",
    durationSeconds: 2,
  });

  assert.equal(metrics.completion, 50, "stopped at word five of ten");
  assert.equal(metrics.matched, 5);
  assert.equal(metrics.skipped, 5);
  assert.equal(metrics.accuracy, 50);

  // Half-read must not score as well as the same accuracy spread over a full
  // attempt — walking out early is its own failure.
  //
  // Both attempts are held at ~150 wpm on purpose. The first version of this
  // test gave the full read the same 2 seconds as the half read, which is 300
  // wpm — the pace penalty then swamped the completion difference and the
  // assertion failed for a reason it wasn't testing.
  const scattered = scoreReading({
    passage,
    transcript: "one X three X five X seven X nine ten",
    durationSeconds: 4,
  });
  assert.equal(scattered.completion, 100, "misreads in the middle are not incompletion");
  assert.ok(
    overallReadingScore(scattered) > overallReadingScore(metrics),
    "finishing badly beats not finishing",
  );
});

test("scoring: stumbles list the passage words that were missed, in order, deduped", () => {
  const metrics = scoreReading({
    passage: "the sixth sick sheikh sixth sheep",
    transcript: "the six sick shake six sheep",
    durationSeconds: 3,
  });
  assert.deepEqual(metrics.stumbles, ["sixth", "sheikh"], "each missed word once, in order");
});

test("scoring: an empty attempt scores zero rather than dividing by zero", () => {
  const metrics = scoreReading({ passage: "hello world", transcript: "", durationSeconds: 5 });
  assert.equal(metrics.accuracy, 0);
  assert.equal(metrics.completion, 0);
  assert.equal(metrics.wordsPerMinute, 0);
  assert.equal(overallReadingScore(metrics), 0);
});

test("pace: falls off either side of the band and never goes negative", () => {
  assert.equal(paceScoreFor(150, { min: 140, max: 170 }), 100, "in band");
  assert.equal(paceScoreFor(140, { min: 140, max: 170 }), 100, "lower edge is in band");
  assert.equal(paceScoreFor(170, { min: 140, max: 170 }), 100, "upper edge is in band");
  assert.ok(paceScoreFor(120, { min: 140, max: 170 }) < 100, "too slow is penalised");
  assert.ok(paceScoreFor(220, { min: 140, max: 170 }) < 100, "too fast is penalised");
  assert.equal(paceScoreFor(0, { min: 140, max: 170 }), 0, "silence is not a pace");
  assert.ok(paceScoreFor(500, { min: 140, max: 170 }) >= 0, "clamped, never negative");

  // A tongue twister is scored against a slower band on purpose: rushing one
  // is how you fail it, so 150 wpm should not be full marks there.
  assert.ok(paceScoreFor(150, { min: 90, max: 120 }) < 100);
});

console.log("reading-scoring: all checks passed");
