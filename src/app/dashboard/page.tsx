import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Surface } from "@/components/ui/surface";
import { EmptyState } from "@/components/ui/states";
import { getDailyTopic, getProfile, getRecentSessions, getStreak } from "@/lib/practice";
import { requireOnboardedUser } from "@/lib/session";
import { displayName } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

function getSessionHref(session: { id: string; mode: string | null; overallScore: number | null }) {
  if (session.mode === "interview") {
    return session.overallScore !== null
      ? `/interview/${session.id}/report`
      : `/interview/${session.id}`;
  }
  if (
    session.mode === "group_discussion" ||
    session.mode === "debate" ||
    session.mode === "scenario" ||
    session.mode === "conversation"
  ) {
    return `/discuss/${session.id}`;
  }
  return session.overallScore !== null
    ? `/practice/${session.id}/report`
    : `/practice/${session.id}`;
}

/**
 * The dashboard answers one question before anything else:
 * "What should I practise right now?"
 *
 * So today's topic is the largest object on the page and the only accent-filled
 * action. Streak, average and history are supporting evidence set in small
 * type — the opposite of the welcome-plus-three-stat-cards default, where the
 * numbers shout and the actual task hides underneath them.
 */
export default async function DashboardPage() {
  const { user } = await requireOnboardedUser("/dashboard");

  const [streak, sessions, profile, topic] = await Promise.all([
    getStreak(user.id),
    getRecentSessions(user.id),
    getProfile(user.id),
    getDailyTopic().catch(() => null),
  ]);

  const scored = sessions.filter((s) => s.overallScore !== null);
  const average = scored.length
    ? Math.round(scored.reduce((sum, s) => sum + (s.overallScore ?? 0), 0) / scored.length)
    : null;

  const doneToday = streak?.lastPracticeDate === new Date().toLocaleDateString("en-CA");

  return (
    <div className="mx-auto max-w-5xl px-5 pt-28 pb-24 sm:px-6">
      <p className="t-micro rise">
        {greeting()}, {displayName(user).split(" ")[0]}
        <span className="mx-3 text-ink-4">/</span>
        <span className="text-ink-2">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </p>

      {/* ── Today. The dominant object. ──────────────────────────────────── */}
      <section className="rise mt-8 [animation-delay:60ms]">
        {/* Two different things, deliberately not merged:
            the DAILY topic is once a day and is what carries the streak;
            a PRACTICE ROLL is unlimited and carries nothing. Once today is
            done, the card stops offering to redo the daily one — repeating it
            cannot extend the streak, so "Practise again" here was telling the
            user something untrue about what the button does. */}
        {topic ? (
          <Surface material="dense" radius="lg" refract className="overflow-hidden">
            <div className="p-8 sm:p-12">
              <p className="t-micro mb-7">
                {doneToday ? (
                  <>
                    <span className="text-[var(--color-positive)]">Today is done</span>
                    <span className="mx-3 text-ink-4">/</span>
                    <span>streak secured</span>
                  </>
                ) : (
                  "Today's topic"
                )}
              </p>

              <h1 className={`t-display max-w-3xl ${doneToday ? "text-ink-3" : ""}`}>
                {topic.promptText}
              </h1>

              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
                {doneToday ? (
                  <>
                    <Link
                      href="/practice?mode=quick"
                      className="pressable group inline-flex h-[54px] items-center gap-3 rounded-full bg-accent pr-3 pl-7 text-[15.5px] font-medium text-void shadow-[var(--shadow-accent)] hover:brightness-110"
                    >
                      Roll a fresh topic
                      <span className="grid size-9 place-items-center rounded-full bg-void/15 transition-transform duration-[var(--dur-base)] group-hover:translate-x-0.5">
                        <ArrowUpRight className="size-4" />
                      </span>
                    </Link>

                    <p className="t-meta max-w-xs text-ink-4">
                      Extra rolls are unlimited and don&apos;t affect your streak — today&apos;s
                      already counted.
                    </p>
                  </>
                ) : (
                  <>
                    <Link
                      href="/practice"
                      className="pressable group inline-flex h-[54px] items-center gap-3 rounded-full bg-accent pr-3 pl-7 text-[15.5px] font-medium text-void shadow-[var(--shadow-accent)] hover:brightness-110"
                    >
                      Start
                      <span className="grid size-9 place-items-center rounded-full bg-void/15 transition-transform duration-[var(--dur-base)] group-hover:translate-x-0.5">
                        <ArrowUpRight className="size-4" />
                      </span>
                    </Link>

                    <div className="flex items-center gap-6">
                      <span className="t-micro">{topic.category}</span>
                      <span className="t-micro">2:00</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Surface>
        ) : (
          <Surface material="liquid" radius="lg">
            <EmptyState
              eyebrow="No topics"
              title="The topic pool is empty."
              body="Run npm run db:seed to load the starter set of fifty."
            />
          </Surface>
        )}
      </section>

      {/* ── Standing. Quiet figures, not stat cards. ─────────────────────── */}
      <section className="rise mt-14 [animation-delay:120ms]">
        <div className="flex flex-wrap items-baseline gap-x-14 gap-y-8 border-t border-line pt-8">
          <Figure
            value={streak?.currentStreak ?? 0}
            label={streak?.currentStreak === 1 ? "day streak" : "day streak"}
            accent={Boolean(streak?.currentStreak)}
          />
          <Figure value={average ?? "—"} label="average score" />
          <Figure value={streak?.totalSessions ?? 0} label="sessions" />
          <Figure value={streak?.longestStreak ?? 0} label="best streak" />
        </div>
      </section>

      {/* ── Mock Attempt History Graph ─────────────────────────────────────── */}
      {scored.length > 0 && (
        <section className="rise mt-14 [animation-delay:140ms]">
          <p className="t-micro mb-6">Score Progression</p>
          <Surface material="frost" radius="lg" className="h-48 p-6 flex items-end gap-2 overflow-x-auto">
            {scored.slice().reverse().map((session) => (
              <div key={session.id} className="group relative flex flex-1 h-full min-w-[24px] max-w-[48px] items-end">
                <div 
                  className="w-full rounded-t-sm bg-accent/40 transition-all duration-500 group-hover:bg-accent"
                  style={{ height: `${session.overallScore}%` }}
                />
                <div className="t-numeric pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-[var(--radius-xs)] border border-line bg-raised px-2 py-1 text-[12px] text-ink opacity-0 shadow-[var(--shadow-near)] transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100">
                  {session.overallScore}
                </div>
              </div>
            ))}
          </Surface>
        </section>
      )}

      {/* ── Other Rooms: Features the user was looking for ───────────────── */}
      <section className="rise mt-16 [animation-delay:150ms]">
        <p className="t-micro mb-6">Other practice modes</p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              href: "/practice?mode=quick",
              title: "Random Roll",
              body: "A completely random impromptu topic instead of the daily roll.",
            },
            {
              href: "/discuss",
              title: "Group Discussion",
              body: "Four AI panelists who argue with each other and you.",
            },
            {
              href: "/discuss?mode=debate",
              title: "Debate",
              body: "Pick a side. Your opponent takes the other and never folds.",
            },
            {
              href: "/rooms",
              title: "Role Play",
              body: "Workplace scenarios like salary negotiation or angry customers.",
            },
          ].map((room) => (
            <li key={room.title}>
              {/* The material system, not hand-rolled glass. `.m-dense` already
                  carries the blur, the masked specular hairline and the depth
                  shadow; `.liftable` handles the hover rise. */}
              <Link
                href={room.href}
                className="material m-dense liftable group flex h-full flex-col justify-between gap-6 rounded-[var(--radius-lg)] p-7 hover:border-accent/40"
              >
                <h3 className="t-heading transition-colors duration-[var(--dur-base)] group-hover:text-accent">
                  {room.title}
                </h3>
                <p className="t-body text-ink-3 transition-colors duration-[var(--dur-base)] group-hover:text-ink-2">
                  {room.body}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── History ──────────────────────────────────────────────────────── */}
      <section className="rise mt-16 [animation-delay:170ms]">
        <p className="t-micro mb-2">Recent</p>

        {sessions.length === 0 ? (
          <EmptyState
            title="Nothing behind you yet."
            body="Your first report takes about ten seconds after you stop speaking."
            className="border-t border-line"
          />
        ) : (
          <ul className="flex flex-col mt-4">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={getSessionHref(session)}
                  className="group grid grid-cols-[1fr_auto] items-baseline gap-x-8 gap-y-1 p-5 mb-3 rounded-[var(--radius-md)] border border-white/5 bg-white/[0.02] backdrop-blur-sm transition-all duration-300 hover:scale-[1.01] hover:border-accent/30 hover:bg-accent/5 hover:shadow-[var(--shadow-near)]"
                >
                  <p className="t-body truncate text-ink-2 transition-colors group-hover:text-ink font-medium">
                    {session.prompt ?? "Practice session"}
                  </p>
                  <span className="t-numeric row-span-2 self-center text-[22px] text-ink group-hover:text-accent transition-colors">
                    {session.overallScore ?? <span className="t-micro">not scored</span>}
                  </span>
                  <p className="t-micro text-ink-4 group-hover:text-ink-3 transition-colors">
                    {formatWhen(session.createdAt)}
                    {session.status !== "completed" && ` / ${statusLabel(session.status)}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Interview prep. Still secondary, even here. ──────────────────── */}
      <section className="rise mt-20 border-t border-line pt-10 [animation-delay:220ms]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-lg">
            <p className="t-micro mb-4">Also</p>
            <h2 className="t-heading">
              {!profile?.skillsDescription && !profile?.resumeExtractedData
                ? "Got an interview coming up?"
                : "Mock Interview"}
            </h2>
            <p className="t-body mt-2 text-ink-3">
              {!profile?.skillsDescription && !profile?.resumeExtractedData
                ? "Add what you do and PrepPulse can build mock rounds around your actual experience."
                : "Personalised questions written exactly for your background and resume."}
            </p>
          </div>
          <Link
            href={
              !profile?.skillsDescription && !profile?.resumeExtractedData
                ? "/interview-prep"
                : "/interview"
            }
            className="group inline-flex shrink-0 items-center gap-2.5 text-[14.5px] text-ink-2 transition-colors hover:text-accent"
          >
            <span className="border-b border-line-bright pb-1 transition-colors group-hover:border-accent">
              {!profile?.skillsDescription && !profile?.resumeExtractedData
                ? "Set it up"
                : "Start mock round"}
            </span>
            <ArrowUpRight className="size-3.5 transition-transform duration-[var(--dur-base)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </section>
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
        className="t-numeric text-[34px] leading-none"
        style={{ color: accent ? "var(--color-accent)" : undefined }}
      >
        {value}
      </p>
      <p className="t-micro mt-3">{label}</p>
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
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
