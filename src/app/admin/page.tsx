import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Surface } from "@/components/ui/surface";
import { getAdminSnapshot, getModeBreakdown, isAdmin, type PeriodStats } from "@/lib/admin";
import { formatTokens, formatUsd, type CostBreakdown } from "@/lib/cost";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

/**
 * Cost and usage, for one person.
 *
 * The question this page exists to answer is "are we about to outgrow the free
 * tiers", so cost per session is the headline rather than a vanity total —
 * it's the only figure that says whether the product scales.
 *
 * Not found rather than forbidden for non-admins: a 403 confirms the page
 * exists, and there is no reason to tell anyone that.
 */
export default async function AdminPage() {
  const user = await requireUser("/admin");
  if (!isAdmin(user.email)) notFound();

  const [snapshot, modes] = await Promise.all([getAdminSnapshot(), getModeBreakdown()]);

  return (
    <div className="mx-auto max-w-5xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise">
        <p className="t-micro mb-6">Admin</p>
        <h1 className="t-display max-w-[14ch]">
          What this <span className="text-ink-3">actually costs.</span>
        </h1>
        <p className="t-lead mt-6 max-w-lg">
          Every model call writes a usage row. These are those rows, and nothing
          else — estimated from a local price table, so treat the providers&apos; own
          billing as the truth.
        </p>
      </header>

      {/* Headline periods */}
      <section className="rise mt-14 grid gap-4 sm:grid-cols-2 [animation-delay:80ms]">
        <Period stats={snapshot.today} />
        <Period stats={snapshot.month} projected={snapshot.projectedMonthCost} />
      </section>

      {/* Where the money goes */}
      <Breakdown title="By provider" rows={snapshot.byProvider} delay={120} />
      <Breakdown title="By model" rows={snapshot.byModel} delay={150} />
      <Breakdown title="By operation" rows={snapshot.byOperation} delay={180} />

      {/* Usage by mode, to read cost against */}
      <section className="rise mt-14 [animation-delay:210ms]">
        <p className="t-micro mb-2">Sessions this month</p>
        {modes.length === 0 ? (
          <p className="t-meta border-t border-line py-6 text-ink-4">Nothing yet this month.</p>
        ) : (
          <ul className="divide-y divide-line/70 border-t border-line">
            {modes.map((mode) => (
              <li key={mode.mode} className="flex items-baseline gap-6 py-4">
                <span className="t-body flex-1 text-ink-2">{mode.mode.replace(/_/g, " ")}</span>
                <span className="t-meta text-ink-4">{mode.completed} completed</span>
                <span className="t-numeric w-12 text-right text-[17px]">{mode.total}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rise mt-14 border-t border-line pt-8 [animation-delay:240ms]">
        <p className="t-micro mb-4">Infrastructure</p>
        <p className="t-meta text-ink-3">
          Leaderboard cache:{" "}
          <span className="text-ink">
            {snapshot.redisConfigured ? "Redis (Upstash)" : "Postgres fallback"}
          </span>
          {!snapshot.redisConfigured &&
            " — set UPSTASH_REDIS_REST_URL and _TOKEN to switch, no code change needed."}
        </p>
      </section>
    </div>
  );
}

function Period({ stats, projected }: { stats: PeriodStats; projected?: number }) {
  return (
    <Surface material="dense" radius="lg" className="p-7">
      <p className="t-micro mb-6">{stats.label}</p>

      <div className="flex items-baseline gap-3">
        <span className="t-numeric text-[38px] leading-none">{formatUsd(stats.cost)}</span>
        {projected !== undefined && projected > 0 && (
          <span className="t-micro">~{formatUsd(projected)} projected</span>
        )}
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4">
        <Stat label="sessions" value={stats.sessions} />
        <Stat label="per session" value={formatUsd(stats.costPerSession)} accent />
        <Stat label="model calls" value={stats.aiCalls} />
        <Stat
          label="failed"
          value={stats.failures}
          warn={stats.aiCalls > 0 && stats.failures / stats.aiCalls > 0.1}
        />
        <Stat label="tokens in" value={formatTokens(stats.inputTokens)} />
        <Stat label="tokens out" value={formatTokens(stats.outputTokens)} />
      </dl>
    </Surface>
  );
}

function Stat({
  label,
  value,
  accent = false,
  warn = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <dd
        className="t-numeric text-[19px] leading-none"
        style={{
          color: warn
            ? "var(--color-caution)"
            : accent
              ? "var(--color-accent)"
              : undefined,
        }}
      >
        {value}
      </dd>
      <dt className="t-micro mt-2">{label}</dt>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  delay,
}: {
  title: string;
  rows: CostBreakdown[];
  delay: number;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="rise mt-14" style={{ animationDelay: `${delay}ms` }}>
      <p className="t-micro mb-2">{title}</p>
      <ul className="divide-y divide-line/70 border-t border-line">
        {rows.map((row) => (
          <li key={row.key} className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 py-4">
            <span className="t-body truncate text-ink-2">{row.key.replace(/_/g, " ")}</span>
            <span className="t-numeric row-span-2 self-center text-[17px]">
              {formatUsd(row.cost)}
            </span>
            <span className="t-micro">
              {row.calls} calls
              {row.failures > 0 && (
                <span style={{ color: "var(--color-caution)" }}> / {row.failures} failed</span>
              )}
              {row.medianLatencyMs !== null && ` / ${row.medianLatencyMs}ms median`}
              {` / ${formatTokens(row.inputTokens + row.outputTokens)} tokens`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
