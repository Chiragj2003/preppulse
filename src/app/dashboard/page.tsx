import { Dices, Flame, Target, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getProfile, getRecentSessions, getStreak } from "@/lib/practice";
import { requireUser } from "@/lib/session";
import { displayName } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");

  const [streak, sessions, profile] = await Promise.all([
    getStreak(user.id),
    getRecentSessions(user.id),
    getProfile(user.id),
  ]);

  const scored = sessions.filter((s) => s.overallScore !== null);
  const average = scored.length
    ? Math.round(scored.reduce((sum, s) => sum + (s.overallScore ?? 0), 0) / scored.length)
    : null;

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-title">
            {greeting()}, {displayName(user).split(" ")[0]}
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-soft">
            {streak && streak.currentStreak > 0
              ? "Today's topic is waiting."
              : "One topic a day is all it takes."}
          </p>
        </div>
        <Link
          href="/practice"
          className="pressable inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-accent-ink hover:brightness-110"
        >
          <Dices className="size-4" />
          Roll today&apos;s topic
        </Link>
      </header>

      {/* Stats */}
      <section className="rise mt-8 grid gap-3 sm:grid-cols-3 [animation-delay:70ms]">
        <StatCard
          icon={<Flame className="size-4" />}
          label="Current streak"
          value={streak?.currentStreak ?? 0}
          suffix={streak?.currentStreak === 1 ? "day" : "days"}
        />
        <StatCard
          icon={<Target className="size-4" />}
          label="Average score"
          value={average ?? "-"}
          suffix={average !== null ? "/100" : "no sessions yet"}
        />
        <StatCard
          icon={<Trophy className="size-4" />}
          label="Sessions"
          value={streak?.totalSessions ?? 0}
          suffix={streak?.totalSessions === 1 ? "completed" : "completed"}
        />
      </section>

      {/* Recent sessions */}
      <section className="rise mt-10 [animation-delay:120ms]">
        <h2 className="mb-3 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">
          Recent sessions
        </h2>

        {sessions.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-14 text-center">
            <div className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
              <Dices className="size-5" />
            </div>
            <h3 className="mt-4 text-[17px] font-semibold">Nothing here yet</h3>
            <p className="mt-1.5 max-w-xs text-[14.5px] leading-relaxed text-ink-soft">
              Roll your first topic and talk for two minutes. The report takes about ten seconds.
            </p>
            <Link
              href="/practice"
              className="pressable mt-5 rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-bg hover:opacity-90"
            >
              Start your first session
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={
                    session.overallScore !== null
                      ? `/practice/${session.id}/report`
                      : `/practice/${session.id}`
                  }
                  className="pressable card flex items-center gap-4 px-5 py-4 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">
                      {session.prompt ?? "Practice session"}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {formatWhen(session.createdAt)}
                      {session.status !== "completed" && ` - ${statusLabel(session.status)}`}
                    </p>
                  </div>
                  {session.overallScore !== null ? (
                    <span className="font-mono text-[17px] font-semibold tabular-nums">
                      {session.overallScore}
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-muted">not scored</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Interview prep nudge - still the secondary path, even here */}
      {!profile?.skillsDescription && !profile?.resumeExtractedData && (
        <section className="rise mt-10 [animation-delay:170ms]">
          <div className="rounded-[var(--radius-md)] border border-line bg-surface-2 p-6">
            <h2 className="text-[16px] font-semibold">Got an interview coming up?</h2>
            <p className="mt-1.5 max-w-lg text-[14.5px] leading-relaxed text-ink-soft">
              Add what you do, or drop in your resume, and PrepPulse can run mock rounds built around
              your actual experience.
            </p>
            <Link
              href="/interview-prep"
              className="pressable mt-4 inline-block rounded-full border border-line bg-surface px-4 py-2 text-[14px] font-medium hover:bg-bg"
            >
              Set up interview prep
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  suffix: string;
}) {
  return (
    <div className="card p-5">
      <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-[30px] leading-none font-semibold tabular-nums">{value}</span>
        <span className="text-[13px] text-muted">{suffix}</span>
      </p>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function statusLabel(status: string) {
  return status === "in_progress" ? "unfinished" : status === "abandoned" ? "abandoned" : status;
}

function formatWhen(date: Date) {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
