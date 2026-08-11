/**
 * Cost aggregation. Pure, so the arithmetic behind "are we about to outgrow
 * the free tier" is unit tested rather than eyeballed on a dashboard.
 *
 * Every LLM call already writes an `ai_usage` row (see decisions D7). This
 * turns those rows into the numbers a person actually needs: what today cost,
 * what the month is trending toward, and what a single session costs — which
 * is the only figure that tells you whether the product can scale.
 */

export interface UsageRow {
  provider: string;
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  ok: boolean;
  latencyMs: number | null;
}

export interface CostBreakdown {
  key: string;
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  /** Median rather than mean: one 45-second timeout should not define "typical". */
  medianLatencyMs: number | null;
}

export function summarise(rows: UsageRow[], by: keyof UsageRow): CostBreakdown[] {
  const groups = new Map<string, UsageRow[]>();

  for (const row of rows) {
    const key = String(row[by]);
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      calls: group.length,
      failures: group.filter((r) => !r.ok).length,
      inputTokens: group.reduce((sum, r) => sum + r.inputTokens, 0),
      outputTokens: group.reduce((sum, r) => sum + r.outputTokens, 0),
      cost: round6(group.reduce((sum, r) => sum + r.estimatedCost, 0)),
      medianLatencyMs: median(
        group.map((r) => r.latencyMs).filter((v): v is number => v !== null),
      ),
    }))
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls);
}

export function totalCost(rows: UsageRow[]): number {
  return round6(rows.reduce((sum, row) => sum + row.estimatedCost, 0));
}

/**
 * Cost per session, the number that decides whether this scales.
 *
 * Sessions with zero AI calls are excluded from the denominator — an abandoned
 * session that never reached scoring would otherwise flatter the average and
 * hide the real per-session cost.
 */
export function costPerSession(totalCostUsd: number, sessionsWithAiCalls: number): number {
  if (sessionsWithAiCalls <= 0) return 0;
  return round6(totalCostUsd / sessionsWithAiCalls);
}

/**
 * Straight-line month projection from the days elapsed so far.
 *
 * Deliberately naive and labelled as such in the UI: with a handful of users
 * there is not enough signal for anything cleverer, and a confident-looking
 * forecast built on three days of data would be worse than an obvious estimate.
 */
export function projectMonth(costSoFar: number, dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 0) return 0;
  return round6((costSoFar / dayOfMonth) * daysInMonth);
}

/** Free-tier headroom as a percentage, capped at 100. */
export function budgetUsedPct(spent: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function daysInMonth(date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
