/**
 * Self-check for cost aggregation.
 *
 *   npx tsx src/lib/cost.test.ts
 *
 * These numbers decide whether the product looks affordable. Getting them
 * quietly wrong is worse than not showing them.
 */
import { strict as assert } from "node:assert";

import {
  budgetUsedPct,
  costPerSession,
  daysInMonth,
  formatTokens,
  formatUsd,
  projectMonth,
  summarise,
  totalCost,
  type UsageRow,
} from "./cost";

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  operation: "score_answer",
  inputTokens: 1000,
  outputTokens: 500,
  estimatedCost: 0.001,
  ok: true,
  latencyMs: 800,
  ...over,
});

/* ── totals ────────────────────────────────────────────────────────────── */
assert.equal(totalCost([]), 0);
assert.equal(totalCost([row(), row(), row()]), 0.003);

// Floating point must not leak into a displayed figure.
assert.equal(totalCost([row({ estimatedCost: 0.1 }), row({ estimatedCost: 0.2 })]), 0.3);

/* ── grouping ──────────────────────────────────────────────────────────── */
{
  const rows = [
    row({ provider: "groq", estimatedCost: 0.001 }),
    row({ provider: "groq", estimatedCost: 0.002 }),
    row({ provider: "gemini", model: "gemini-3.6-flash", estimatedCost: 0.01 }),
  ];

  const byProvider = summarise(rows, "provider");
  assert.equal(byProvider.length, 2);

  // Sorted by cost, so the expensive thing is always the first row you read.
  assert.equal(byProvider[0].key, "gemini");
  assert.equal(byProvider[0].cost, 0.01);
  assert.equal(byProvider[1].key, "groq");
  assert.equal(byProvider[1].cost, 0.003);
  assert.equal(byProvider[1].calls, 2);
  assert.equal(byProvider[1].inputTokens, 2000);
}

// Failures are counted but still contribute their (usually zero) cost.
{
  const summary = summarise(
    [row(), row({ ok: false, estimatedCost: 0 }), row({ ok: false, estimatedCost: 0 })],
    "operation",
  );
  assert.equal(summary[0].calls, 3);
  assert.equal(summary[0].failures, 2);
}

assert.deepEqual(summarise([], "provider"), []);

/* ── median latency, not mean ──────────────────────────────────────────── */
{
  // One 45-second timeout must not define "typical".
  const summary = summarise(
    [
      row({ latencyMs: 700 }),
      row({ latencyMs: 800 }),
      row({ latencyMs: 900 }),
      row({ latencyMs: 45_000 }),
    ],
    "provider",
  );
  assert.equal(summary[0].medianLatencyMs, 850, "median resists the outlier");
  assert.ok(summary[0].medianLatencyMs! < 5000, "a mean would have been ~11,850ms");
}

// Rows with no recorded latency must not become zeroes.
assert.equal(summarise([row({ latencyMs: null })], "provider")[0].medianLatencyMs, null);
assert.equal(
  summarise([row({ latencyMs: null }), row({ latencyMs: 500 })], "provider")[0].medianLatencyMs,
  500,
  "a missing latency is skipped, not counted as 0",
);

/* ── cost per session ──────────────────────────────────────────────────── */
assert.equal(costPerSession(0.5, 10), 0.05);
assert.equal(costPerSession(0.5, 0), 0, "no divide-by-zero on a fresh install");
assert.equal(costPerSession(0, 10), 0);
assert.equal(costPerSession(1, -5), 0, "a nonsense denominator returns 0, not a negative cost");

/* ── month projection ──────────────────────────────────────────────────── */
assert.equal(projectMonth(3, 3, 30), 30, "$1/day on day 3 projects to $30");
assert.equal(projectMonth(10, 10, 31), 31);
assert.equal(projectMonth(5, 0, 30), 0, "day zero cannot be extrapolated");
assert.equal(projectMonth(0, 15, 30), 0);

/* ── budget headroom ───────────────────────────────────────────────────── */
assert.equal(budgetUsedPct(5, 10), 50);
assert.equal(budgetUsedPct(0, 10), 0);
assert.equal(budgetUsedPct(15, 10), 100, "over budget caps at 100, never 150");
assert.equal(budgetUsedPct(5, 0), 0, "no budget set means no percentage");

/* ── formatting ────────────────────────────────────────────────────────── */
// Sub-cent amounts are the normal case on a free tier, so they must not all
// collapse to "$0.00" and look like nothing is happening.
assert.equal(formatUsd(0), "$0");
assert.equal(formatUsd(0.0004), "$0.0004");
assert.equal(formatUsd(0.045), "$0.045");
assert.equal(formatUsd(12.5), "$12.50");

assert.equal(formatTokens(999), "999");
assert.equal(formatTokens(1500), "1.5k");
assert.equal(formatTokens(2_400_000), "2.40M");

/* ── calendar ──────────────────────────────────────────────────────────── */
assert.equal(daysInMonth(new Date("2026-02-10")), 28);
assert.equal(daysInMonth(new Date("2028-02-10")), 29, "leap year");
assert.equal(daysInMonth(new Date("2026-01-10")), 31);
assert.equal(daysInMonth(new Date("2026-04-10")), 30);

console.log("cost: all checks passed");
