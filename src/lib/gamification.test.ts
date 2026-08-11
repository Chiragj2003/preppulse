/**
 * Self-check for gamification and progress maths.
 *
 *   npx tsx src/lib/gamification.test.ts
 */
import { strict as assert } from "node:assert";

import {
  buildDailySeries,
  computeBadges,
  streakLine,
  tokensForSession,
  trend,
} from "./gamification";
import { weekKey } from "./redis";

const base = {
  currentStreak: 0,
  longestStreak: 0,
  totalSessions: 0,
  bestScore: null,
  averageScore: null,
  distinctModes: 0,
};

/* ── badges ────────────────────────────────────────────────────────────── */
{
  const none = computeBadges(base);
  assert.equal(none.filter((b) => b.earned).length, 0, "a new user has earned nothing");
  assert.ok(none.length >= 6, "locked badges are still listed, so progress is visible");
}

{
  const earned = computeBadges({
    currentStreak: 8,
    longestStreak: 8,
    totalSessions: 30,
    bestScore: 92,
    averageScore: 74,
    distinctModes: 4,
  });
  const ids = earned.filter((b) => b.earned).map((b) => b.id);
  assert.ok(ids.includes("first"));
  assert.ok(ids.includes("week"), "8-day best run earns the 7-day badge");
  assert.ok(ids.includes("regular"));
  assert.ok(ids.includes("consistent"));
  assert.ok(ids.includes("range"));
  assert.ok(ids.includes("sharp"), "92 clears the 90 threshold");
  assert.ok(!ids.includes("month"), "8 days does not earn the 30-day badge");

  // Earned badges sort first, so the earned set reads as a block.
  const firstLocked = earned.findIndex((b) => !b.earned);
  const lastEarned = earned.map((b) => b.earned).lastIndexOf(true);
  assert.ok(lastEarned < firstLocked, "earned badges sort before locked ones");
}

// Boundaries are inclusive, and off-by-one here would be silently wrong.
assert.ok(computeBadges({ ...base, longestStreak: 7 }).find((b) => b.id === "week")?.earned);
assert.ok(!computeBadges({ ...base, longestStreak: 6 }).find((b) => b.id === "week")?.earned);
assert.ok(computeBadges({ ...base, bestScore: 90 }).find((b) => b.id === "sharp")?.earned);
assert.ok(!computeBadges({ ...base, bestScore: 89 }).find((b) => b.id === "sharp")?.earned);

/* ── tokens ────────────────────────────────────────────────────────────── */
assert.equal(tokensForSession(0, 0), 10, "turning up is worth the floor");
assert.equal(tokensForSession(100, 0), 30);
assert.equal(tokensForSession(100, 5), 35);

// The streak bonus caps, so a long streak never outweighs doing the work well.
assert.equal(tokensForSession(100, 50), 40, "streak bonus is capped at 10");
assert.equal(
  tokensForSession(100, 50) - tokensForSession(0, 50),
  20,
  "quality is always worth more than the streak bonus",
);

// Out-of-range scores must not produce negative or runaway tokens.
assert.equal(tokensForSession(-20, 0), 10);
assert.equal(tokensForSession(500, 0), 30);
assert.equal(tokensForSession(50, -5), 20, "a negative streak cannot subtract tokens");

/* ── daily series ──────────────────────────────────────────────────────── */
{
  const today = new Date("2026-03-15T12:00:00Z");
  const series = buildDailySeries(
    [
      { date: "2026-03-15", sessions: 2, averageScore: 80 },
      { date: "2026-03-13", sessions: 1, averageScore: 60 },
    ],
    5,
    today,
  );

  assert.equal(series.length, 5, "the window is always fully populated");
  assert.equal(series.at(-1)?.date, "2026-03-15", "today is last");
  assert.equal(series.at(-1)?.sessions, 2);

  // The gap day must be an explicit zero, not missing — a hole in a chart
  // reads as broken data, a zero reads as a day off.
  const gap = series.find((p) => p.date === "2026-03-14");
  assert.equal(gap?.sessions, 0);
  assert.equal(gap?.averageScore, null);
}

/* ── trend ─────────────────────────────────────────────────────────────── */
assert.equal(trend([]), null, "no data is null, not zero");
assert.equal(
  trend(buildDailySeries([], 14, new Date("2026-03-15T12:00:00Z"))),
  null,
  "a fortnight of rest days has no trend",
);

{
  const improving = [
    { date: "a", sessions: 1, averageScore: 50 },
    { date: "b", sessions: 1, averageScore: 52 },
    { date: "c", sessions: 1, averageScore: 70 },
    { date: "d", sessions: 1, averageScore: 72 },
  ];
  assert.equal(trend(improving), 20);

  const declining = [...improving].reverse();
  assert.equal(trend(declining), -20);
}

// Rest days must not count as zero-score days, or a weekend off would look
// like a collapse in ability.
{
  const withRest = [
    { date: "a", sessions: 1, averageScore: 70 },
    { date: "b", sessions: 0, averageScore: null },
    { date: "c", sessions: 0, averageScore: null },
    { date: "d", sessions: 1, averageScore: 70 },
    { date: "e", sessions: 1, averageScore: 70 },
    { date: "f", sessions: 1, averageScore: 70 },
  ];
  assert.equal(trend(withRest), 0, "taking days off is not a decline");
}

/* ── streak copy ───────────────────────────────────────────────────────── */
assert.match(streakLine({ currentStreak: 0, longestStreak: 0 }), /No streak yet/);
assert.match(streakLine({ currentStreak: 0, longestStreak: 12 }), /best run was 12/);
assert.match(streakLine({ currentStreak: 5, longestStreak: 9 }), /5 days running/);
assert.match(streakLine({ currentStreak: 9, longestStreak: 9 }), /longest run/);
assert.match(streakLine({ currentStreak: 1, longestStreak: 4 }), /1 day running/);

/* ── leaderboard bucket keys ───────────────────────────────────────────── */
{
  // Days inside the same ISO week share a bucket; the next week does not.
  const mon = weekKey(new Date("2026-03-09T00:00:00Z"));
  const sun = weekKey(new Date("2026-03-15T23:00:00Z"));
  const nextMon = weekKey(new Date("2026-03-16T00:00:00Z"));

  assert.equal(mon, sun, "a Monday and the following Sunday are one week");
  assert.notEqual(sun, nextMon, "the next Monday starts a new bucket");
  assert.match(mon, /^lb:\d{4}-w\d{2}$/);
}

console.log("gamification: all checks passed");
