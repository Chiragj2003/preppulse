import { and, countDistinct, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { evaluations, interviewAnswers, practiceSessions, subscriptions, plans } from "@/db/schema";
import { entitlementsFor, isSubscriptionActive, type Entitlements } from "./billing";
import { buildDailySeries, computeBadges, trend, type Badge, type DayPoint } from "./gamification";

export interface ProgressSummary {
  series: DayPoint[];
  trend: number | null;
  badges: Badge[];
  totalSessions: number;
  bestScore: number | null;
  averageScore: number | null;
  distinctModes: number;
}

/**
 * Everything the progress screen needs, in three queries rather than one per
 * card. The daily rollup is grouped in Postgres because pulling every session
 * into Node to bucket it by date would move a lot of rows for a chart with
 * fourteen points.
 */
export async function getProgress(
  userId: string,
  streak: { currentStreak: number; longestStreak: number; totalSessions: number },
  days = 14,
): Promise<ProgressSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [daily, totals, modes] = await Promise.all([
    db
      .select({
        date: sql<string>`to_char(${practiceSessions.createdAt}, 'YYYY-MM-DD')`,
        sessions: sql<number>`count(*)`.mapWith(Number),
        averageScore: sql<number | null>`round(avg(${evaluations.overallScore}))`.mapWith(Number),
      })
      .from(practiceSessions)
      .leftJoin(evaluations, eq(evaluations.sessionId, practiceSessions.id))
      .where(
        and(eq(practiceSessions.userId, userId), gte(practiceSessions.createdAt, since)),
      )
      .groupBy(sql`to_char(${practiceSessions.createdAt}, 'YYYY-MM-DD')`),

    db
      .select({
        best: sql<number | null>`max(${evaluations.overallScore})`.mapWith(Number),
        average: sql<number | null>`round(avg(${evaluations.overallScore}))`.mapWith(Number),
      })
      .from(evaluations)
      .innerJoin(practiceSessions, eq(practiceSessions.id, evaluations.sessionId))
      .where(eq(practiceSessions.userId, userId)),

    db
      .select({ count: countDistinct(practiceSessions.mode) })
      .from(practiceSessions)
      .where(
        and(eq(practiceSessions.userId, userId), eq(practiceSessions.status, "completed")),
      ),
  ]);

  const bestScore = totals[0]?.best ?? null;
  const averageScore = totals[0]?.average ?? null;
  const distinctModes = modes[0]?.count ?? 0;

  const series = buildDailySeries(
    daily.map((row) => ({
      date: row.date,
      sessions: row.sessions,
      averageScore: row.averageScore ?? null,
    })),
    days,
  );

  return {
    series,
    trend: trend(series),
    badges: computeBadges({
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      totalSessions: streak.totalSessions,
      bestScore,
      averageScore,
      distinctModes,
    }),
    totalSessions: streak.totalSessions,
    bestScore,
    averageScore,
    distinctModes,
  };
}

/* ── Entitlements ───────────────────────────────────────────────────────── */

/**
 * The user's current plan, resolved from their subscription.
 *
 * Everything downstream asks this rather than checking a slug, so when a real
 * gateway replaces the dummy checkout nothing outside billing needs to change.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const [row] = await db
    .select({
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      slug: plans.slug,
      name: plans.name,
      dailySessionLimit: plans.dailySessionLimit,
      unlockedModes: plans.unlockedModes,
      priceMonthly: plans.priceMonthly,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.startedAt))
    .limit(1);

  if (!row || !isSubscriptionActive(row)) return entitlementsFor(null);

  return entitlementsFor({
    slug: row.slug,
    name: row.name,
    dailySessionLimit: row.dailySessionLimit,
    unlockedModes: row.unlockedModes,
    priceMonthly: row.priceMonthly,
  });
}

/** Sessions started today, for the free-tier daily cap. */
export async function sessionsUsedToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.userId, userId),
        gte(practiceSessions.createdAt, startOfToday()),
      ),
    );

  return row?.count ?? 0;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Best score across both scoring systems, for the leaderboard. */
export async function bestScoreForSession(sessionId: string): Promise<number | null> {
  const [extempore] = await db
    .select({ score: evaluations.overallScore })
    .from(evaluations)
    .where(eq(evaluations.sessionId, sessionId))
    .limit(1);

  if (extempore) return extempore.score;

  const [interview] = await db
    .select({ score: sql<number>`max(${interviewAnswers.overallScore})`.mapWith(Number) })
    .from(interviewAnswers)
    .where(eq(interviewAnswers.sessionId, sessionId));

  return interview?.score ?? null;
}
