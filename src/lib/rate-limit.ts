import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { env } from "./env";
import { AppError } from "./errors";

/**
 * Per-user caps on AI calls, so a provider's free-tier limit surfaces as a
 * friendly message from us rather than a raw 429 from Groq mid-demo.
 *
 * Counting rows in `ai_usage` means no extra table and no extra infrastructure:
 * we already write one row per LLM call for cost tracking, and it's durable
 * across serverless invocations in a way an in-process counter would not be.
 * Phase 5 swaps the counter for Redis; the call sites don't change.
 */
export interface RateLimitStatus {
  allowed: boolean;
  usedThisMinute: number;
  usedToday: number;
  remainingToday: number;
  retryAfterSeconds: number;
}

export async function getRateLimitStatus(userId: string): Promise<RateLimitStatus> {
  const { perMinute, perDay } = env.rateLimit;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({
      lastMinute: sql<number>`count(*) filter (where ${aiUsage.createdAt} > now() - interval '1 minute')`.mapWith(
        Number,
      ),
      lastDay: sql<number>`count(*)`.mapWith(Number),
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, dayAgo)));

  const usedThisMinute = row?.lastMinute ?? 0;
  const usedToday = row?.lastDay ?? 0;

  const minuteExceeded = usedThisMinute >= perMinute;
  const dayExceeded = usedToday >= perDay;

  return {
    allowed: !minuteExceeded && !dayExceeded,
    usedThisMinute,
    usedToday,
    remainingToday: Math.max(0, perDay - usedToday),
    retryAfterSeconds: dayExceeded ? 3600 : minuteExceeded ? 60 : 0,
  };
}

/** Throws a friendly AppError when the user is over their cap. */
export async function enforceRateLimit(userId: string): Promise<void> {
  let status: RateLimitStatus;
  try {
    status = await getRateLimitStatus(userId);
  } catch (error) {
    // If the limiter itself is broken, fail open rather than blocking practice.
    console.error("[rate-limit] check failed, allowing request", error);
    return;
  }

  if (status.allowed) return;

  const message =
    status.retryAfterSeconds >= 3600
      ? `You've used all ${env.rateLimit.perDay} AI scorings for today. This cap keeps PrepPulse inside its free-tier budget — your sessions are saved and the counter resets tomorrow.`
      : "That's a few requests in quick succession. Give it about a minute and try again — this keeps us inside the free-tier limits.";

  throw new AppError("rate_limited", message, {
    retryAfterSeconds: status.retryAfterSeconds,
  });
}
