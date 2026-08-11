import { and, countDistinct, gte, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiUsage, practiceSessions } from "@/db/schema";
import {
  costPerSession,
  daysInMonth,
  projectMonth,
  summarise,
  totalCost,
  type UsageRow,
} from "./cost";

/**
 * Admin access is an environment allowlist, not a role column.
 *
 * There is exactly one admin — the person who built this — so a roles table,
 * a permissions model and an invite flow would all be machinery serving a
 * single row. `ADMIN_EMAILS` is a comma-separated list; when there is a second
 * admin, add the column then.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;

  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  // An empty allowlist locks everyone out rather than letting everyone in.
  // Failing closed is the only safe default for an access check.
  if (allowlist.length === 0) return false;

  return allowlist.includes(email.trim().toLowerCase());
}

export interface AdminSnapshot {
  today: PeriodStats;
  month: PeriodStats;
  byProvider: ReturnType<typeof summarise>;
  byModel: ReturnType<typeof summarise>;
  byOperation: ReturnType<typeof summarise>;
  projectedMonthCost: number;
  redisConfigured: boolean;
}

export interface PeriodStats {
  label: string;
  sessions: number;
  aiCalls: number;
  failures: number;
  cost: number;
  costPerSession: number;
  inputTokens: number;
  outputTokens: number;
}

async function statsFor(since: Date, label: string): Promise<PeriodStats> {
  const [usage, sessions] = await Promise.all([
    db
      .select({
        provider: aiUsage.provider,
        model: aiUsage.model,
        operation: aiUsage.operation,
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        estimatedCost: aiUsage.estimatedCost,
        ok: aiUsage.ok,
        latencyMs: aiUsage.latencyMs,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since)),

    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(practiceSessions)
      .where(gte(practiceSessions.createdAt, since)),
  ]);

  const rows = toUsageRows(usage);

  // Only sessions that actually made an AI call count toward cost-per-session.
  // An abandoned session that never reached scoring would otherwise flatter
  // the average and hide the real number.
  const [billable] = await db
    .select({ count: countDistinct(aiUsage.sessionId) })
    .from(aiUsage)
    .where(and(gte(aiUsage.createdAt, since), isNotNull(aiUsage.sessionId)));

  const cost = totalCost(rows);

  return {
    label,
    sessions: sessions[0]?.count ?? 0,
    aiCalls: rows.length,
    failures: rows.filter((r) => !r.ok).length,
    cost,
    costPerSession: costPerSession(cost, billable?.count ?? 0),
    inputTokens: rows.reduce((sum, r) => sum + r.inputTokens, 0),
    outputTokens: rows.reduce((sum, r) => sum + r.outputTokens, 0),
  };
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [today, month, monthUsage] = await Promise.all([
    statsFor(startOfToday, "Today"),
    statsFor(startOfMonth, "This month"),
    db
      .select({
        provider: aiUsage.provider,
        model: aiUsage.model,
        operation: aiUsage.operation,
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        estimatedCost: aiUsage.estimatedCost,
        ok: aiUsage.ok,
        latencyMs: aiUsage.latencyMs,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, startOfMonth)),
  ]);

  const rows = toUsageRows(monthUsage);

  return {
    today,
    month,
    byProvider: summarise(rows, "provider"),
    byModel: summarise(rows, "model"),
    byOperation: summarise(rows, "operation"),
    projectedMonthCost: projectMonth(month.cost, now.getDate(), daysInMonth(now)),
    redisConfigured: Boolean(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
    ),
  };
}

/** Sessions by mode this month, so the cost lines can be read against usage. */
export async function getModeBreakdown() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  return db
    .select({
      mode: practiceSessions.mode,
      total: sql<number>`count(*)`.mapWith(Number),
      completed: sql<number>`count(*) filter (where ${practiceSessions.status} = 'completed')`.mapWith(
        Number,
      ),
    })
    .from(practiceSessions)
    .where(gte(practiceSessions.createdAt, startOfMonth))
    .groupBy(practiceSessions.mode)
    .orderBy(sql`count(*) desc`);
}

/**
 * `estimated_cost` is numeric(12,6), which the driver returns as a string to
 * avoid float precision loss. Parse once, here, rather than in three places.
 */
function toUsageRows(
  rows: {
    provider: string;
    model: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: string;
    ok: boolean;
    latencyMs: number | null;
  }[],
): UsageRow[] {
  return rows.map((row) => ({
    ...row,
    estimatedCost: Number(row.estimatedCost),
  }));
}
