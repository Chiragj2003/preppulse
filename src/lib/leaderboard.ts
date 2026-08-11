import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { evaluations, practiceSessions, users } from "@/db/schema";
import {
  expire,
  LEADERBOARD_TTL_SECONDS,
  redisConfigured,
  weekKey,
  zadd,
  zrevrange,
  zrevrank,
  zscore,
} from "./redis";

export interface LeaderboardRow {
  userId: string;
  name: string;
  score: number;
  rank: number;
}

/**
 * A 7-day rolling leaderboard, scored out of 100.
 *
 * This is the job Redis actually earns its place on. Reading the top ten from
 * a sorted set is one O(log N) command; the Postgres equivalent scans a week
 * of sessions, joins evaluations and users, groups and sorts — fine at this
 * size, wasteful on every homepage render at any real size.
 *
 * The Postgres path is kept as the fallback rather than as a "coming soon",
 * so the feature is complete with or without Upstash configured.
 */

/** Best single score this week is the ranking metric. */
export async function recordScore(userId: string, name: string, score: number) {
  if (!redisConfigured) return;

  const key = weekKey();
  const existing = await zscore(key, userId);

  // ZADD GT would do this server-side, but it isn't supported uniformly across
  // Upstash plans, and one extra read per completed session is cheap.
  if (existing === null || score > existing) {
    await zadd(key, score, `${userId}::${name}`);
    await expire(key, LEADERBOARD_TTL_SECONDS);
  }
}

export async function getLeaderboard(limit = 10): Promise<LeaderboardRow[]> {
  const fromRedis = await readFromRedis(limit);
  if (fromRedis) return fromRedis;
  return readFromPostgres(limit);
}

async function readFromRedis(limit: number): Promise<LeaderboardRow[] | null> {
  if (!redisConfigured) return null;

  const flat = await zrevrange(weekKey(), 0, limit - 1);
  if (!flat) return null;

  const rows: LeaderboardRow[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const [userId, name] = String(flat[i]).split("::");
    rows.push({
      userId,
      name: name || "Someone",
      score: Math.round(Number(flat[i + 1])),
      rank: rows.length + 1,
    });
  }
  return rows;
}

/**
 * The same ranking computed from the source of truth. Also what backfills
 * Redis when a week's bucket is cold.
 */
async function readFromPostgres(limit: number): Promise<LeaderboardRow[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      userId: practiceSessions.userId,
      name: users.name,
      email: users.email,
      score: sql<number>`max(${evaluations.overallScore})`.mapWith(Number),
    })
    .from(practiceSessions)
    .innerJoin(evaluations, eq(evaluations.sessionId, practiceSessions.id))
    .innerJoin(users, eq(users.id, practiceSessions.userId))
    .where(
      and(
        eq(practiceSessions.status, "completed"),
        gte(practiceSessions.createdAt, since),
      ),
    )
    .groupBy(practiceSessions.userId, users.name, users.email)
    .orderBy(desc(sql`max(${evaluations.overallScore})`))
    .limit(limit);

  return rows.map((row, index) => ({
    userId: row.userId,
    name: displayFor(row.name, row.email),
    score: row.score,
    rank: index + 1,
  }));
}

/** Where a specific user sits, so the board can say "you're 14th". */
export async function getUserRank(userId: string): Promise<number | null> {
  if (redisConfigured) {
    const rank = await zrevrank(weekKey(), userId);
    if (rank !== null) return rank + 1;
  }

  const board = await readFromPostgres(100);
  const index = board.findIndex((row) => row.userId === userId);
  return index === -1 ? null : index + 1;
}

/**
 * Only a first name reaches a public board. A leaderboard is the one screen
 * where other people's identities are on display, so it shows the least that
 * still makes it feel like a room of humans.
 */
function displayFor(name: string | null, email: string): string {
  const given = name?.trim().split(" ")[0];
  if (given) return given;
  const local = email.split("@")[0];
  const first = local.split(/[._-]/)[0].replace(/\d+$/, "");
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "Someone";
}
