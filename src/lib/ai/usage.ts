import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { estimateCostUsd } from "./pricing";

export interface UsageRecord {
  userId: string | null;
  sessionId?: string | null;
  provider: "groq" | "gemini";
  model: string;
  /** What this call was for, e.g. "score_answer" — groups cost by feature. */
  operation: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
  ok?: boolean;
  errorCode?: string | null;
}

/**
 * Records one LLM call. Deliberately never throws: a failure to write the
 * usage log must not fail the user's request that just succeeded.
 *
 * This table doubles as the rate limiter's counter (see lib/rate-limit.ts),
 * which is why failed calls get logged too — a burst of provider 429s still
 * counts as usage worth backing off from.
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      userId: record.userId,
      sessionId: record.sessionId ?? null,
      provider: record.provider,
      model: record.model,
      operation: record.operation,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      estimatedCost: estimateCostUsd(record.model, record.inputTokens, record.outputTokens).toFixed(6),
      latencyMs: record.latencyMs ?? null,
      ok: record.ok ?? true,
      errorCode: record.errorCode ?? null,
    });
  } catch (error) {
    console.error("[ai-usage] failed to record usage", error);
  }
}
