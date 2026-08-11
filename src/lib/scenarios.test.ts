/**
 * Self-check for scenario data and the anti-deflection guards.
 *
 *   npx tsx src/lib/scenarios.test.ts
 *
 * The deflection detector is the interesting part: it is what stops the
 * conversation modes degenerating into "tell me more about that".
 */
import { strict as assert } from "node:assert";

import {
  isDeflection,
  isRepetitive,
  SCENARIOS,
  scenarioById,
  scenariosOfKind,
} from "./scenarios";

/* ── data integrity ────────────────────────────────────────────────────── */
assert.ok(SCENARIOS.length >= 5, "enough scenarios to be worth a picker");
assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length, "ids are unique");

assert.ok(scenariosOfKind("conversation").length >= 2);
assert.ok(scenariosOfKind("scenario").length >= 3, "workplace, support and negotiation");

for (const scenario of SCENARIOS) {
  assert.ok(scenario.objective.length > 20, `${scenario.id} states an objective`);
  assert.ok(scenario.counterpart.instruction.length > 60, `${scenario.id} has a real brief`);
  assert.ok(scenario.successLooksLike.length >= 3, `${scenario.id} defines success`);
  assert.ok(scenario.openingLine.length > 10, `${scenario.id} opens the scene`);
}

assert.equal(scenarioById("angry-customer")?.kind, "scenario");
assert.equal(scenarioById("nope"), undefined);

// The three role-play categories the plan named must all exist.
const scenarioIds = scenariosOfKind("scenario").map((s) => s.id);
assert.ok(scenarioIds.includes("workplace-pushback"), "workplace");
assert.ok(scenarioIds.includes("angry-customer"), "customer support");
assert.ok(scenarioIds.includes("salary-negotiation"), "negotiation");

/* ── deflection detection ──────────────────────────────────────────────── */

// The canonical failure this guard exists for.
assert.ok(isDeflection("Tell me more about that."));
assert.ok(isDeflection("That's interesting! Can you elaborate?"));
assert.ok(isDeflection("How did that make you feel?"));
assert.ok(isDeflection("Would you like to share more?"));
assert.ok(isDeflection(""), "an empty reply is the worst deflection");
assert.ok(isDeflection("   "));

// A bare short question contributes nothing, whatever the phrasing.
assert.ok(isDeflection("And then what?"));
assert.ok(isDeflection("Why is that?"));

// A real contribution must pass, even when it ends in a question.
assert.ok(
  !isDeflection(
    "Honestly the 14th was never realistic — I said so in planning. What I can do is ship the payments piece by then and push reporting a week. Does that work for the client?",
  ),
  "a substantive reply that also asks something is not a deflection",
);
assert.ok(
  !isDeflection("Second time this month for me too. I've started ordering from somewhere else."),
  "a statement about themselves is a contribution",
);
assert.ok(
  !isDeflection(
    "I hear you, and I'm not going to apologise again. Your replacement ships today and I'll text you the tracking myself.",
  ),
);

/* ── repetition detection ──────────────────────────────────────────────── */
assert.ok(isRepetitive("That's a fair point.", ["That's a fair point."]), "exact repeat");
assert.ok(
  isRepetitive("That is a fair point!", ["that's a fair point"]),
  "punctuation and case do not hide a repeat",
);
assert.ok(
  isRepetitive("I think the deadline is simply not achievable", [
    "I think the deadline is not achievable simply",
  ]),
  "a reshuffle of the same words is a repeat",
);

assert.ok(
  !isRepetitive("Your replacement ships today.", [
    "I understand the frustration and I want to fix it.",
  ]),
  "different content is not a repeat",
);
assert.ok(!isRepetitive("Anything at all.", []), "nothing to repeat against");
assert.ok(isRepetitive("", ["something"]), "an empty candidate is never acceptable");

// Guard against a false positive on short but genuinely different replies.
assert.ok(
  !isRepetitive("No, absolutely not.", ["Yes, definitely."]),
  "short opposite answers are not repeats",
);

console.log("scenarios: all checks passed");
