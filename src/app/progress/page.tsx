import type { Metadata } from "next";

import { ProgressChart } from "@/components/progress-chart";
import { Surface } from "@/components/ui/surface";
import { EmptyState } from "@/components/ui/states";
import { streakLine } from "@/lib/gamification";
import { getLeaderboard, getUserRank } from "@/lib/leaderboard";
import { getStreak } from "@/lib/practice";
import { getProgress } from "@/lib/progress";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Progress" };

/**
 * Progress as a story, not a dashboard.
 *
 * The page opens with a sentence about where you are, then shows the shape of
 * the last fortnight, then what you've earned. A grid of gauges would answer
 * "what are my numbers"; this answers "am I getting better", which is the only
 * question anyone actually has.
 */
export default async function ProgressPage() {
  const user = await requireUser("/progress");
  const streak = await getStreak(user.id);

  const [progress, board, rank] = await Promise.all([
    getProgress(user.id, {
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
      totalSessions: streak?.totalSessions ?? 0,
    }),
    getLeaderboard(5),
    getUserRank(user.id),
  ]);

  const earned = progress.badges.filter((b) => b.earned);

  return (
    <div className="mx-auto max-w-4xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise">
        <p className="t-micro mb-6">Progress</p>
        <h1 className="t-display max-w-[16ch]">
          {progress.trend === null ? (
            <>
              Not enough sessions <span className="text-ink-3">to call it yet.</span>
            </>
          ) : progress.trend > 2 ? (
            <>
              You&apos;re getting <span className="text-accent">better.</span>
            </>
          ) : progress.trend < -2 ? (
            <>
              Slipping a little <span className="text-ink-3">this fortnight.</span>
            </>
          ) : (
            <>
              Holding <span className="text-ink-3">steady.</span>
            </>
          )}
        </h1>
        <p className="t-lead mt-6 max-w-lg">
          {streak && streakLine(streak)}
          {progress.trend !== null && progress.trend !== 0 && (
            <>
              {" "}
              Your average has moved {progress.trend > 0 ? "up" : "down"}{" "}
              {Math.abs(progress.trend)} points across the last fourteen days.
            </>
          )}
        </p>
      </header>

      {progress.totalSessions === 0 ? (
        <Surface material="liquid" radius="lg" className="mt-12">
          <EmptyState
            eyebrow="Nothing yet"
            title="Your progress starts with one session."
            body="Two minutes on today's topic is enough to put the first point on the chart."
          />
        </Surface>
      ) : (
        <>
          <section className="rise mt-14 [animation-delay:80ms]">
            <p className="t-micro mb-6">Last fourteen days</p>
            <ProgressChart series={progress.series} />
          </section>

          <section className="rise mt-14 flex flex-wrap items-baseline gap-x-14 gap-y-8 border-t border-line pt-8 [animation-delay:120ms]">
            <Figure value={progress.averageScore ?? "—"} label="average" />
            <Figure value={progress.bestScore ?? "—"} label="best" />
            <Figure value={progress.totalSessions} label="sessions" />
            <Figure value={streak?.tokens ?? 0} label="tokens" />
            {rank !== null && <Figure value={`#${rank}`} label="this week" accent />}
          </section>
        </>
      )}

      {/* Badges: quiet, and locked ones stay visible so there is something to aim at */}
      <section className="rise mt-16 [animation-delay:160ms]">
        <p className="t-micro mb-6">
          Earned
          <span className="mx-3 text-ink-4">/</span>
          <span className="text-ink-2">
            {earned.length} of {progress.badges.length}
          </span>
        </p>
        <ul className="divide-y divide-line/70 border-t border-line">
          {progress.badges.map((badge) => (
            <li
              key={badge.id}
              className={`flex items-baseline justify-between gap-6 py-4 ${badge.earned ? "" : "opacity-40"}`}
            >
              <div>
                <p className="t-body font-medium">{badge.name}</p>
                <p className="t-meta mt-0.5 text-ink-4">{badge.detail}</p>
              </div>
              <span className="t-micro shrink-0">{badge.earned ? "Earned" : "Locked"}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Leaderboard */}
      {board.length > 0 && (
        <section className="rise mt-16 [animation-delay:200ms]">
          <p className="t-micro mb-6">This week&apos;s top scores</p>
          <ol className="divide-y divide-line/70 border-t border-line">
            {board.map((row) => (
              <li
                key={row.userId}
                className="flex items-baseline gap-6 py-4"
                style={{
                  color: row.userId === user.id ? "var(--color-accent)" : undefined,
                }}
              >
                <span className="t-numeric w-8 shrink-0 text-[15px] text-ink-4">{row.rank}</span>
                <span className="t-body flex-1">{row.name}</span>
                <span className="t-numeric text-[18px]">{row.score}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Figure({
  value,
  label,
  accent = false,
}: {
  value: number | string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className="t-numeric text-[32px] leading-none"
        style={{ color: accent ? "var(--color-accent)" : undefined }}
      >
        {value}
      </p>
      <p className="t-micro mt-3">{label}</p>
    </div>
  );
}
