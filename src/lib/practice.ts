import { and, desc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { evaluations, practiceSessions, profiles, streaks, topics } from "@/db/schema";
import { AppError } from "./errors";
import type { Language, PracticeMode } from "./types";

/* ── Daily Roll ─────────────────────────────────────────────────────────────
 * One topic per calendar day, the same for everyone. Shared makes the Phase 5
 * leaderboard meaningful ("how did I do on today's topic vs everyone else"),
 * and it's what makes the reveal feel like an event rather than a shuffle.
 *
 * Deterministic without storing anything: order the pool by a hash of
 * (topic id + date) and take the first row. Same date always yields the same
 * topic; the next date reshuffles the whole pool.
 */
export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function getDailyTopic(dateKey = todayKey(), userId?: string) {
  const [topic] = await db
    .select()
    .from(topics)
    .where(eq(topics.isActive, true))
    .orderBy(sql`md5(${topics.id}::text || ${dateKey})`)
    .limit(1);

  if (!topic) return null;

  if (userId) {
    const [existingSession] = await db
      .select()
      .from(practiceSessions)
      .where(
        and(
          eq(practiceSessions.userId, userId),
          eq(practiceSessions.topicId, topic.id),
          sql`DATE(${practiceSessions.createdAt}) = DATE(NOW())`
        )
      )
      .limit(1);

    if (existingSession) {
      return getRandomTopic();
    }
  }

  return topic;
}

export async function getTopicById(id: string) {
  const [topic] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.id, id), eq(topics.isActive, true)))
    .limit(1);

  return topic ?? null;
}

/** Prompts to tumble past during the reveal, never including the real one. */
export async function getDecoyPrompts(excludeId: string, count = 7) {
  const rows = await db
    .select({ promptText: topics.promptText })
    .from(topics)
    .where(and(eq(topics.isActive, true), ne(topics.id, excludeId)))
    .orderBy(sql`random()`)
    .limit(count);

  return rows.map((row) => row.promptText);
}

/** A different topic each time - used by Quick Challenge. */
export async function getRandomTopic() {
  const [topic] = await db
    .select()
    .from(topics)
    .where(eq(topics.isActive, true))
    .orderBy(sql`random()`)
    .limit(1);

  return topic ?? null;
}

/* ── Sessions ──────────────────────────────────────────────────────────── */

export async function createPracticeSession(input: {
  userId: string;
  topicId: string;
  promptText: string;
  mode?: PracticeMode;
  language?: Language;
}) {
  const [session] = await db
    .insert(practiceSessions)
    .values({
      userId: input.userId,
      topicId: input.topicId,
      promptSnapshot: input.promptText,
      mode: input.mode ?? "random_topic",
      language: input.language ?? "en",
      status: "in_progress",
    })
    .returning();

  return session;
}

/** Always scoped by userId - a session id alone must never grant access. */
export async function getOwnedSession(sessionId: string, userId: string) {
  const [row] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
    .limit(1);

  if (!row) throw new AppError("not_found", "That practice session doesn't exist.");
  return row;
}

export async function getSessionWithEvaluation(sessionId: string, userId: string) {
  const session = await getOwnedSession(sessionId, userId);

  const [evaluation] = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.sessionId, sessionId))
    .limit(1);

  return { session, evaluation: evaluation ?? null };
}

export async function getRecentSessions(userId: string, limit = 8) {
  return db
    .select({
      id: practiceSessions.id,
      mode: practiceSessions.mode,
      status: practiceSessions.status,
      prompt: practiceSessions.promptSnapshot,
      createdAt: practiceSessions.createdAt,
      durationSeconds: practiceSessions.durationSeconds,
      overallScore: evaluations.overallScore,
    })
    .from(practiceSessions)
    .leftJoin(evaluations, eq(evaluations.sessionId, practiceSessions.id))
    .where(and(eq(practiceSessions.userId, userId), eq(practiceSessions.status, "completed")))
    .orderBy(desc(practiceSessions.createdAt))
    .limit(limit);
}

/* ── Streaks ───────────────────────────────────────────────────────────── */

export async function getStreak(userId: string) {
  const [existing] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(streaks)
    .values({ userId })
    .onConflictDoNothing({ target: streaks.userId })
    .returning();

  if (created) return created;

  // Lost the race with a concurrent request - read the winner's row.
  const [row] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
  return row;
}

/**
 * Called once a session is scored.
 *
 * `localDate` comes from the browser because "did I practise today" is a
 * question about the user's calendar, not the server's - a 1am session in IST
 * is still today to them. Clamped to +/-1 day of UTC so it can't be used to
 * fabricate a streak.
 */
export async function recordPractice(userId: string, localDate: string, pointsEarned: number) {
  const today = clampToNearUtc(localDate);
  const current = await getStreak(userId);

  const alreadyPractisedToday = current.lastPracticeDate === today;
  const continuedStreak = current.lastPracticeDate === previousDay(today);

  const nextStreak = alreadyPractisedToday
    ? current.currentStreak
    : continuedStreak
      ? current.currentStreak + 1
      : 1;

  const [updated] = await db
    .update(streaks)
    .set({
      currentStreak: nextStreak,
      longestStreak: Math.max(current.longestStreak, nextStreak),
      lastPracticeDate: today,
      tokens: current.tokens + pointsEarned,
      totalSessions: current.totalSessions + 1,
      updatedAt: new Date(),
    })
    .where(eq(streaks.userId, userId))
    .returning();

  return { streak: updated, extended: !alreadyPractisedToday };
}

function previousDay(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Accept the client's local date only if it's within a day of UTC today. */
function clampToNearUtc(localDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return todayKey();

  const utcToday = todayKey();
  const allowed = new Set([utcToday, previousDay(utcToday), nextDay(utcToday)]);
  return allowed.has(localDate) ? localDate : utcToday;
}

function nextDay(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/* ── Profile ───────────────────────────────────────────────────────────── */

export async function getProfile(userId: string) {
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(profiles)
    .values({ userId })
    .onConflictDoNothing({ target: profiles.userId })
    .returning();

  if (created) return created;

  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return row;
}
