import type { Streak } from "@/db/app-schema";

/**
 * Pure gamification maths. No I/O, so it is unit tested like the rest.
 *
 * The brief was "premium and understated": no confetti, no arcade points
 * ticking up, no cartoon badges. Recognition here is a quiet line of text that
 * happens to be true, which is why every badge is derived from data the user
 * actually produced rather than awarded for showing up.
 */

export interface Badge {
  id: string;
  name: string;
  detail: string;
  /** Earned badges sort before locked ones, then by rank. */
  rank: number;
  earned: boolean;
}

export interface BadgeInput {
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
  bestScore: number | null;
  averageScore: number | null;
  distinctModes: number;
}

/**
 * Thresholds are deliberately not round-number vanity. Seven days is a real
 * habit; ninety is a genuinely rare score; four modes means they have actually
 * explored the product rather than repeating one exercise.
 */
export function computeBadges(input: BadgeInput): Badge[] {
  const badges: Badge[] = [
    {
      id: "first",
      name: "First words",
      detail: "Completed a session",
      rank: 1,
      earned: input.totalSessions >= 1,
    },
    {
      id: "week",
      name: "Seven straight",
      detail: "A full week without missing a day",
      rank: 2,
      earned: input.longestStreak >= 7,
    },
    {
      id: "regular",
      name: "Twenty-five in",
      detail: "Twenty-five sessions completed",
      rank: 3,
      earned: input.totalSessions >= 25,
    },
    {
      id: "consistent",
      name: "Reliably good",
      detail: "Averaging 70 or better",
      rank: 4,
      earned: (input.averageScore ?? 0) >= 70,
    },
    {
      id: "range",
      name: "All rounder",
      detail: "Practised in four different modes",
      rank: 5,
      earned: input.distinctModes >= 4,
    },
    {
      id: "sharp",
      name: "Ninety",
      detail: "Scored 90 or above in a single session",
      rank: 6,
      earned: (input.bestScore ?? 0) >= 90,
    },
    {
      id: "month",
      name: "Thirty straight",
      detail: "A month without missing a day",
      rank: 7,
      earned: input.longestStreak >= 30,
    },
  ];

  return badges.sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    return a.rank - b.rank;
  });
}

/**
 * Tokens for a completed session.
 *
 * Deliberately shallow: a floor for turning up, a slope for quality, and a
 * small streak bonus that caps. An uncapped streak multiplier would make week
 * three worth more than doing the work well, which is the wrong incentive for
 * a practice tool.
 */
export function tokensForSession(score: number, currentStreak: number): number {
  const base = 10;
  const quality = Math.round(Math.max(0, Math.min(100, score)) / 5);
  const streakBonus = Math.min(10, Math.max(0, currentStreak));
  return base + quality + streakBonus;
}

/* ── Weekly progress ────────────────────────────────────────────────────── */

export interface DayPoint {
  date: string;
  sessions: number;
  averageScore: number | null;
}

/**
 * Builds a continuous run of days ending today, so a chart never silently
 * skips a date the user didn't practise. A gap in a progress chart reads as
 * missing data; an explicit zero reads as a day off.
 */
export function buildDailySeries(
  rows: { date: string; sessions: number; averageScore: number | null }[],
  days = 14,
  today = new Date(),
): DayPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series: DayPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - offset);
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    series.push({
      date: key,
      sessions: row?.sessions ?? 0,
      averageScore: row?.averageScore ?? null,
    });
  }

  return series;
}

/**
 * Trend between the two halves of the window, in points.
 *
 * Only days that were actually practised count. Including rest days as zeroes
 * would make taking a weekend off look like your speaking got worse.
 */
export function trend(series: DayPoint[]): number | null {
  const scored = series.filter((p) => p.averageScore !== null);
  if (scored.length < 4) return null;

  const middle = Math.floor(scored.length / 2);
  const mean = (points: DayPoint[]) =>
    points.reduce((sum, p) => sum + (p.averageScore ?? 0), 0) / points.length;

  return Math.round(mean(scored.slice(middle)) - mean(scored.slice(0, middle)));
}

/** A quiet, factual read on the streak. No exclamation marks. */
export function streakLine(streak: Pick<Streak, "currentStreak" | "longestStreak">): string {
  if (streak.currentStreak === 0) {
    return streak.longestStreak > 0
      ? `Your best run was ${streak.longestStreak} days. Today restarts it.`
      : "No streak yet. One session starts one.";
  }
  if (streak.currentStreak === streak.longestStreak && streak.currentStreak > 1) {
    return `${streak.currentStreak} days — your longest run so far.`;
  }
  return `${streak.currentStreak} ${streak.currentStreak === 1 ? "day" : "days"} running. Best is ${streak.longestStreak}.`;
}
