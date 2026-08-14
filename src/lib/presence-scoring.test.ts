/**
 * Self-check for the camera-presence maths.
 *
 *   npx tsx src/lib/presence-scoring.test.ts
 *
 * The absence detection is the part worth guarding. It decides whether a blink
 * gets reported to someone as "you looked away", which is the difference
 * between useful feedback and an accusation.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  findAbsences,
  interpretPresence,
  standardDeviation,
  summarisePresence,
  type PresenceSample,
} from "./presence-scoring";

/** Frames at a fixed cadence, `present` driven by the pattern string. */
function frames(pattern: string, intervalMs = 250): PresenceSample[] {
  return [...pattern].map((char, index) => ({
    at: index * intervalMs,
    present: char === "1",
    expressions: char === "1" ? { neutral: 0.9, happy: 0.1 } : undefined,
    centre: char === "1" ? { x: 0.5, y: 0.5 } : undefined,
  }));
}

test("standard deviation", () => {
  assert.equal(standardDeviation([]), 0, "no values");
  assert.equal(standardDeviation([5]), 0, "one value has no spread");
  assert.equal(standardDeviation([2, 2, 2, 2]), 0, "identical values");
  assert.ok(standardDeviation([0, 1]) > 0);
});

test("absences: a one-frame drop is a blink, not a look away", () => {
  // 250ms gap, under the 500ms threshold.
  const gaps = findAbsences(frames("111011111"));
  assert.equal(gaps.length, 0, "a single dropped frame must not be reported");
});

test("absences: a sustained gap is reported with its real duration", () => {
  // Frames 3..6 absent → first absent at 750ms, last at 1500ms = 750ms gap.
  const gaps = findAbsences(frames("111000011"));
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].startedAt, 750);
  assert.equal(gaps[0].seconds, 0.75);
});

test("absences: several gaps are counted separately", () => {
  const gaps = findAbsences(frames("1000100010001"));
  assert.equal(gaps.length, 3, "three distinct look-aways");
});

test("absences: a recording that ends mid-absence still counts it", () => {
  const gaps = findAbsences(frames("11110000"));
  assert.equal(gaps.length, 1, "walking off at the end is still a look away");
});

test("absences: measured from timestamps, not frame count", () => {
  // The detection loop drops frames under load. Two absent samples 3 seconds
  // apart is a 3-second absence, even though it is only two frames.
  const laggy: PresenceSample[] = [
    { at: 0, present: true, centre: { x: 0.5, y: 0.5 } },
    { at: 1000, present: false },
    { at: 4000, present: false },
    { at: 4500, present: true, centre: { x: 0.5, y: 0.5 } },
  ];
  const gaps = findAbsences(laggy);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].seconds, 3, "3s of wall clock, not 2 frames");
});

test("summary: a clean, still recording", () => {
  const summary = summarisePresence(frames("1".repeat(40)));
  assert.equal(summary.inFrame, 100);
  assert.equal(summary.lookAways, 0);
  assert.equal(summary.longestAbsenceSeconds, 0);
  assert.equal(summary.headDrift, 0, "a fixed centre means no drift");
  assert.equal(summary.dominant, "neutral");
  assert.equal(summary.secondary, "happy");
  assert.ok(summary.steadiness >= 95, `still and in frame should score high, got ${summary.steadiness}`);
});

test("summary: an empty recording is zeroes, not a divide by zero", () => {
  const summary = summarisePresence([]);
  assert.equal(summary.samples, 0);
  assert.equal(summary.inFrame, 0);
  assert.equal(summary.dominant, null);
  assert.equal(summary.steadiness, 0);
  assert.deepEqual(interpretPresence(summary), [], "nothing to say about nothing");
});

test("summary: expressions average over present frames only", () => {
  // Half the frames have no face. Averaging across all of them would halve
  // every label and make leaving the shot look like calmness.
  const half: PresenceSample[] = [
    { at: 0, present: true, expressions: { happy: 1 }, centre: { x: 0.5, y: 0.5 } },
    { at: 250, present: false },
    { at: 500, present: true, expressions: { happy: 1 }, centre: { x: 0.5, y: 0.5 } },
    { at: 750, present: false },
  ];
  const summary = summarisePresence(half);
  assert.equal(summary.inFrame, 50);
  assert.equal(summary.positivity, 100, "happy in every frame that had a face");
  assert.equal(summary.expressiveness, 100);
});

test("summary: head drift rises with a roaming face box", () => {
  const still = summarisePresence(
    Array.from({ length: 20 }, (_, i) => ({
      at: i * 250,
      present: true,
      expressions: { neutral: 1 },
      centre: { x: 0.5, y: 0.5 },
    })),
  );
  const roaming = summarisePresence(
    Array.from({ length: 20 }, (_, i) => ({
      at: i * 250,
      present: true,
      expressions: { neutral: 1 },
      centre: { x: i % 2 === 0 ? 0.3 : 0.7, y: 0.5 },
    })),
  );

  assert.equal(still.headDrift, 0);
  assert.ok(roaming.headDrift > 50, `roaming should register, got ${roaming.headDrift}`);
  assert.ok(roaming.steadiness < still.steadiness, "movement costs steadiness");
});

test("summary: flip rate counts changes of dominant label", () => {
  const steady = summarisePresence(
    Array.from({ length: 10 }, (_, i) => ({
      at: i * 250,
      present: true,
      expressions: { neutral: 0.9, happy: 0.1 },
      centre: { x: 0.5, y: 0.5 },
    })),
  );
  const flipping = summarisePresence(
    Array.from({ length: 10 }, (_, i) => ({
      at: i * 250,
      present: true,
      expressions: i % 2 === 0 ? { neutral: 0.9, happy: 0.1 } : { happy: 0.9, neutral: 0.1 },
      centre: { x: 0.5, y: 0.5 },
    })),
  );

  assert.equal(steady.flipRate, 0, "one steady label never flips");
  assert.ok(flipping.flipRate > 90, `alternating every frame is near-total, got ${flipping.flipRate}`);
});

test("readings: wording follows the numbers", () => {
  const clean = interpretPresence(summarisePresence(frames("1".repeat(40))));
  assert.ok(clean.some((n) => n.includes("held the frame")), "a clean take is acknowledged");

  const patchy = interpretPresence(summarisePresence(frames("1000".repeat(10))));
  assert.ok(
    patchy.some((n) => n.includes("out of shot")),
    "a mostly-absent take says so",
  );
  assert.ok(patchy.some((n) => n.includes("looks away")), "and counts the look-aways");
});

console.log("presence-scoring: all checks passed");
