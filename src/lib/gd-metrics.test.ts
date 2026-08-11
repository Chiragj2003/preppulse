/**
 * Self-check for the group-discussion maths.
 *
 *   npx tsx src/lib/gd-metrics.test.ts
 */
import { strict as assert } from "node:assert";

import {
  computeGdMetrics,
  countWordsIn,
  DEBATE_STAGES,
  GD_PERSONAS,
  nextStage,
  personaById,
  presenceVerdict,
  type TurnLike,
} from "./gd-metrics";

const user = (content: string, extra: Partial<TurnLike> = {}): TurnLike => ({
  speaker: null,
  content,
  isRebuttal: false,
  ...extra,
});

const ai = (speaker: string, content: string): TurnLike => ({
  speaker,
  content,
  isRebuttal: false,
});

/* ── word counting ─────────────────────────────────────────────────────── */
assert.equal(countWordsIn("one two three"), 3);
assert.equal(countWordsIn("  padded   out  "), 2);
assert.equal(countWordsIn(""), 0);
assert.equal(countWordsIn("it's a well-known point"), 5, "hyphens split, apostrophes do not");

/* ── speaking share ────────────────────────────────────────────────────── */
{
  const metrics = computeGdMetrics([
    user("a b c d"), // 4 user words
    ai("maya", "e f g h"), // 4
    ai("rohan", "i j k l"), // 4
  ]);
  assert.equal(metrics.totalWords, 12);
  assert.equal(metrics.userWords, 4);
  assert.equal(metrics.speakingSharePct, 33, "share is of words, not turns");
  assert.equal(metrics.userTurns, 1);
  assert.equal(metrics.totalTurns, 3);
}

// An empty discussion must not divide by zero.
assert.equal(computeGdMetrics([]).speakingSharePct, 0);
assert.equal(computeGdMetrics([]).totalTurns, 0);

// A stored wordCount is trusted over recounting, so metrics stay stable even
// if the counting rule changes later.
assert.equal(
  computeGdMetrics([user("ignored text here", { wordCount: 99 })]).userWords,
  99,
);

/* ── tags are tallied, not inferred ────────────────────────────────────── */
{
  const metrics = computeGdMetrics([
    user("first point", { introducesArgument: true }),
    user("no, because...", { isRebuttal: true }),
    user("also this", { introducesArgument: true, isRebuttal: true }),
    // An AI rebuttal must not be credited to the user.
    { speaker: "rohan", content: "I disagree", isRebuttal: true, introducesArgument: true },
  ]);
  assert.equal(metrics.argumentsIntroduced, 2);
  assert.equal(metrics.directRebuttals, 2);
  assert.equal(metrics.userTurns, 3, "only null-speaker turns are the user's");
}

/* ── presence bands ────────────────────────────────────────────────────── */
{
  // Five participants, so an even split is 20%.
  assert.equal(presenceVerdict(5, 5).label, "Too quiet");
  assert.equal(presenceVerdict(20, 5).label, "Well judged");
  assert.equal(presenceVerdict(25, 5).label, "Well judged");
  assert.equal(presenceVerdict(70, 5).label, "Dominating");

  // Dominating is penalised as well as silence: both ends are non-ideal.
  assert.notEqual(presenceVerdict(90, 5).label, "Well judged");
  assert.notEqual(presenceVerdict(1, 5).label, "Well judged");

  // The band scales with participant count rather than being hardcoded.
  assert.equal(presenceVerdict(45, 2).label, "Well judged", "half the floor is fair with 2 people");
  assert.equal(presenceVerdict(45, 5).label, "Dominating", "the same share with 5 people is not");

  // Must not divide by zero on a malformed session.
  assert.ok(presenceVerdict(50, 0).label.length > 0);
}

/* ── personas ──────────────────────────────────────────────────────────── */
assert.equal(GD_PERSONAS.length, 4, "the panel is 4 plus a moderator, inside the 3-5 brief");
assert.equal(new Set(GD_PERSONAS.map((p) => p.id)).size, 4, "persona ids are unique");
assert.ok(GD_PERSONAS.every((p) => p.instruction.length > 40), "each persona has a real brief");
assert.equal(personaById("maya")?.name, "Maya");
assert.equal(personaById("moderator")?.trait, "moderator");
assert.equal(personaById("nobody"), undefined);

/* ── debate stages ─────────────────────────────────────────────────────── */
assert.deepEqual([...DEBATE_STAGES], ["opening", "argument", "rebuttal", "closing"]);
assert.equal(nextStage("opening"), "argument");
assert.equal(nextStage("argument"), "rebuttal");
assert.equal(nextStage("rebuttal"), "closing");
assert.equal(nextStage("closing"), null, "closing ends the debate");

console.log("gd-metrics: all checks passed");
