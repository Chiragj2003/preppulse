import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Surface } from "@/components/ui/surface";
import { getLeaderboard } from "@/lib/leaderboard";
import { getDailyTopic } from "@/lib/practice";
import { getSession } from "@/lib/session";

/**
 * Editorial introduction, composed rather than stacked.
 *
 * The hero is a single sentence set at display scale with the day's real topic
 * embedded in it — the product demonstrating itself instead of describing
 * itself. Daily practice is the whole first screen; interview preparation is a
 * separate, quieter movement further down.
 */
export default async function HomePage() {
  const [session, topic, board] = await Promise.all([
    getSession(),
    getDailyTopic().catch(() => null),
    getLeaderboard(5).catch(() => []),
  ]);
  const start = session?.user ? "/practice" : "/sign-in?next=/practice";

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="flex min-h-[92dvh] flex-col justify-center pt-28 pb-16">
        <p className="t-micro rise mb-10">
          Daily speaking practice
          <span className="mx-3 text-ink-4">/</span>
          <span className="text-ink-2">
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
          </span>
        </p>

        <h1 className="t-display rise max-w-[15ch] font-doodle text-5xl font-bold leading-[1.15] md:text-6xl lg:text-7xl [animation-delay:60ms]">
          Two minutes
          <br />
          <span className="inline-block -rotate-2 bg-gradient-to-r from-accent via-indigo-400 to-purple-400 bg-clip-text text-transparent opacity-90 px-1">of talking</span>
          <br />
          changes how
          <br />
          you sound.
        </h1>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <p className="t-lead rise max-w-md [animation-delay:140ms]">
            A topic you didn&apos;t see coming. A clock. Then an honest read on where you landed it,
            where you rambled, and where the filler crept in.
          </p>

          <div className="rise flex items-center gap-4 [animation-delay:200ms]">
            <Link
              href={start}
              className="pressable group inline-flex h-[58px] items-center gap-3 rounded-full bg-accent pr-3 pl-7 text-[16px] font-medium text-void shadow-[var(--shadow-accent)] hover:brightness-110"
            >
              Start today&apos;s roll
              <span className="grid size-10 place-items-center rounded-full bg-void/15 transition-transform duration-[var(--dur-base)] group-hover:translate-x-0.5">
                <ArrowUpRight className="size-4.5" />
              </span>
            </Link>
          </div>
        </div>

        {/* Today's actual topic, sitting in the hero as evidence. */}
        {topic && (
          <Surface
            material="dense"
            radius="lg"
            refract
            className="unblur mt-16 overflow-hidden [animation-delay:280ms]"
          >
            <div className="relative flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
              <div className="max-w-2xl">
                <p className="t-micro mb-4">Today, everyone gets</p>
                <p className="t-title text-ink">{topic.promptText}</p>
              </div>
              <div className="flex shrink-0 items-center gap-8 sm:flex-col sm:items-end sm:gap-2">
                <div className="text-right">
                  <p className="t-numeric text-[28px] leading-none">2:00</p>
                  <p className="t-micro mt-2">on the clock</p>
                </div>
              </div>
            </div>
          </Surface>
        )}
      </section>

      <div className="rule" />

      {/* ── The other rooms ──────────────────────────────────────────────── */}
      <section className="py-24 sm:py-32">
        <p className="t-micro mb-12">Other rooms</p>
        <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              href: session?.user ? "/discuss" : "/sign-in?next=/discuss",
              title: "Group discussion",
              body: "Four panelists who argue with each other as well as with you.",
            },
            {
              href: session?.user ? "/discuss?mode=debate" : "/sign-in?next=/discuss",
              title: "Debate",
              body: "Pick a side. Your opponent takes the other and never folds.",
            },
            {
              href: session?.user ? "/interview" : "/sign-in?next=/interview",
              title: "Mock interview",
              body: "Questions written from your own background, judged one at a time.",
            },
            {
              href: session?.user ? "/rooms" : "/sign-in?next=/rooms",
              title: "Role play",
              body: "Push back on a manager. Calm an angry customer. Ask for more money.",
            },
          ].map((room, i) => (
            <li key={room.title}>
              <Link
                href={room.href}
                className="group flex h-full flex-col justify-between gap-10 border-t border-line py-8 pr-6 transition-colors hover:border-accent/50"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <h3 className="t-heading transition-colors group-hover:text-accent">{room.title}</h3>
                <p className="t-body max-w-xs text-ink-3">{room.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="rule" />

      {/* ── How it works: numbered editorial rows, not a three-card grid ─── */}
      <section className="py-24 sm:py-32">
        <p className="t-micro mb-14">How a session goes</p>

        <ol className="space-y-px">
          {[
            {
              n: "01",
              t: "Roll",
              d: "The day's topic reveals itself. No browsing, no picking the easy one, no stalling.",
            },
            {
              n: "02",
              t: "Speak",
              d: "Thirty seconds to think, two minutes to talk. Your microphone transcribes as you go.",
            },
            {
              n: "03",
              t: "Read the tape",
              d: "Six measures, your filler words in context, and your own answer with the slack taken out.",
            },
          ].map((step, i) => (
            <li
              key={step.n}
              className="rise group grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3 border-t border-line py-8 sm:grid-cols-[5rem_14rem_1fr] sm:gap-x-10"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className="t-numeric text-[13px] text-ink-4">{step.n}</span>
              <h3 className="t-title text-ink">{step.t}</h3>
              <p className="t-body col-span-2 max-w-md text-ink-3 sm:col-span-1">{step.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="rule" />

      {/* ── Interview prep: the secondary movement, visibly separate ─────── */}
      <section id="interview" className="scroll-mt-28 py-24 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <div>
            <p className="t-micro mb-6">Also, when you need it</p>
            <h2 className="t-display max-w-[12ch]">
              Got an interview <span className="text-ink-3">this week?</span>
            </h2>
          </div>

          <div className="flex flex-col items-start justify-end gap-7">
            <p className="t-lead max-w-md">
              Tell PrepPulse what you actually do, or hand it your resume. It works out what
              you&apos;d really be asked and runs the round question by question — analysing each
              answer as you give it, not at the end.
            </p>
            <Link
              href={session?.user ? "/interview-prep" : "/sign-in?next=/interview-prep"}
              className="group inline-flex items-center gap-2.5 text-[15px] text-ink transition-colors hover:text-accent"
            >
              <span className="border-b border-ink-4 pb-1 transition-colors group-hover:border-accent">
                Set up interview prep
              </span>
              <ArrowUpRight className="size-4 transition-transform duration-[var(--dur-base)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Leaderboard: on the homepage on purpose, to give returning users a
          reason to come back and signed-out visitors a reason to start. */}
      {board.length > 0 && (
        <>
          <div className="rule" />
          <section className="py-24 sm:py-32">
            <div className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
              <p className="t-micro">This week&apos;s best scores</p>
              <p className="t-meta text-ink-4">Top score in the last seven days</p>
            </div>

            <ol className="divide-y divide-line/70 border-t border-line">
              {board.map((row) => (
                <li key={row.userId} className="flex items-baseline gap-6 py-5">
                  <span className="t-numeric w-8 shrink-0 text-[15px] text-ink-4">{row.rank}</span>
                  <span className="t-body flex-1 text-ink-2">{row.name}</span>
                  <span className="t-numeric text-[20px]">{row.score}</span>
                </li>
              ))}
            </ol>

            <p className="t-meta mt-8">
              <Link href={start} className="text-accent hover:underline">
                Put your name on it
              </Link>
            </p>
          </section>
        </>
      )}

      <footer className="flex flex-col gap-3 border-t border-line py-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="t-micro">PrepPulse</p>
        <div className="flex flex-wrap items-center gap-6">
          <Link href="/pricing" className="t-meta text-ink-4 transition-colors hover:text-ink-2">
            Pricing
          </Link>
          <p className="t-meta text-ink-4">
            Audio never leaves your browser. Only the transcript is stored.
          </p>
        </div>
      </footer>
    </div>
  );
}
