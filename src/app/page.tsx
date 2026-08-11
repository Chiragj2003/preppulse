import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { getLeaderboard } from "@/lib/leaderboard";
import { getDailyTopic } from "@/lib/practice";
import { getSession } from "@/lib/session";
import { TopicRoller } from "@/components/topic-roller";

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
      <section className="flex min-h-[85dvh] flex-col justify-center pt-24 pb-12">
        <p className="t-micro rise mb-8">
          Daily speaking practice
          <span className="mx-3 text-ink-4">/</span>
          <span className="text-ink-2">
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
          </span>
        </p>

        <h1 className="t-display rise max-w-[15ch] [animation-delay:60ms] leading-[1.05] tracking-tight">
          Two minutes
          <br />
          <span className="text-ink-3">of talking</span>
          <br />
          changes how
          <br />
          you sound.
        </h1>

        <p className="t-lead rise mt-8 max-w-lg text-[16px] [animation-delay:120ms]">
          A topic you didn&apos;t see coming. A clock. Then an honest read on where you landed it, where you rambled, and where the filler crept in.
        </p>

        <div className="rise [animation-delay:180ms] w-full">
          {topic && <TopicRoller topic={topic} />}
        </div>
      </section>

      <div className="rule" />

      {/* ── The other rooms ──────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20">
        <p className="t-micro mb-8">Other rooms</p>
        <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:pb-0 hide-scrollbar">
          {[
            {
              href: session?.user ? "/discuss" : "/sign-in?next=/discuss",
              title: "Group discussion",
              body: "Four panelists who argue with each other.",
              icon: "👥",
            },
            {
              href: session?.user ? "/discuss?mode=debate" : "/sign-in?next=/discuss",
              title: "Debate",
              body: "Pick a side. Your opponent never folds.",
              icon: "⚖️",
            },
            {
              href: session?.user ? "/interview" : "/sign-in?next=/interview",
              title: "Mock interview",
              body: "Questions from your own background.",
              icon: "🎙️",
            },
            {
              href: session?.user ? "/rooms" : "/sign-in?next=/rooms",
              title: "Role play",
              body: "Push back, negotiate, or resolve.",
              icon: "🎭",
            },
          ].map((room, i) => (
            <li key={room.title} className="min-w-[260px] snap-start sm:min-w-0">
              <Link
                href={room.href}
                className="liquid-glass group flex h-full flex-col gap-4 p-5 transition-transform hover:-translate-y-1 hover:border-accent/30"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{room.icon}</span>
                  <h3 className="font-display text-[15px] font-medium transition-colors group-hover:text-accent">{room.title}</h3>
                </div>
                <p className="t-body text-[14px] leading-snug text-ink-3">{room.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="rule" />

      {/* ── How it works: horizontal timeline ─── */}
      <section className="py-16 sm:py-20">
        <p className="t-micro mb-10">How a session goes</p>

        <ol className="flex flex-col sm:flex-row items-start gap-8 sm:gap-4 lg:gap-12 relative">
          {/* Timeline connector (desktop only) */}
          <div className="hidden sm:block absolute top-[14px] left-8 right-8 h-px bg-gradient-to-r from-line via-line-bright to-transparent z-[-1]" />
          
          {[
            {
              n: "01",
              t: "Roll",
              d: "The day's topic reveals itself. No stalling.",
            },
            {
              n: "02",
              t: "Speak",
              d: "Two minutes to talk. Transcribed live.",
            },
            {
              n: "03",
              t: "Read the tape",
              d: "See your filler words and honest metrics.",
            },
          ].map((step, i) => (
            <li
              key={step.n}
              className="rise group flex flex-col gap-3 flex-1"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="size-8 rounded-full bg-base border border-line flex items-center justify-center shadow-sm">
                <span className="t-numeric text-[12px] text-ink-3">{step.n}</span>
              </div>
              <div>
                <h3 className="t-title text-[18px] text-ink mb-1">{step.t}</h3>
                <p className="t-body text-[14px] leading-relaxed text-ink-3 max-w-[250px]">{step.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="rule" />

      {/* ── Interview prep: compact liquid glass panel ─────── */}
      <section id="interview" className="scroll-mt-24 py-16 sm:py-20">
        <div className="liquid-glass flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 p-8 sm:p-10 border-accent/10">
          <div className="flex-1">
            <p className="t-micro text-accent mb-4">Also, when you need it</p>
            <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-tight max-w-[12ch] mb-4">
              Got an interview <span className="text-ink-3">this week?</span>
            </h2>
            <p className="t-body max-w-md text-[15px] text-ink-3">
              Upload your resume. PrepPulse creates real questions and analyzes each answer live.
            </p>
          </div>

          <div className="shrink-0">
            <Link
              href={session?.user ? "/interview-prep" : "/sign-in?next=/interview-prep"}
              className="group inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 font-medium text-ink transition-all hover:bg-white/10 hover:border-white/20 active:scale-95"
            >
              <span>Set up interview prep</span>
              <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Leaderboard: compressed rows */}
      {board.length > 0 && (
        <>
          <div className="rule" />
          <section className="py-16 sm:py-20">
            <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
              <p className="t-micro">This week&apos;s best scores</p>
            </div>

            <ol className="flex flex-col gap-1">
              {board.map((row) => (
                <li key={row.userId} className="liquid-glass flex items-center justify-between px-5 py-3.5 rounded-xl border-white/5 bg-white/[0.02] hover:bg-white/[0.04]">
                  <div className="flex items-center gap-5">
                    <span className="t-numeric w-5 text-center text-[13px] text-ink-4">{row.rank}</span>
                    <span className="font-display font-medium text-[15px] text-ink-2">{row.name}</span>
                  </div>
                  <span className="t-numeric text-[18px] text-ink">{row.score}</span>
                </li>
              ))}
            </ol>

            <p className="t-meta mt-6">
              <Link href={start} className="text-accent hover:underline">
                Put your name on it
              </Link>
            </p>
          </section>
        </>
      )}

      <footer className="flex flex-col gap-2 py-8 sm:flex-row sm:items-center sm:justify-between opacity-60">
        <div className="flex items-center gap-6">
          <p className="t-micro">PrepPulse</p>
          <Link href="/pricing" className="t-meta text-[13px] text-ink-3 transition-colors hover:text-ink">
            Pricing
          </Link>
        </div>
        <p className="t-meta text-[12px] text-ink-4">
          Audio never leaves your browser. Only the transcript is stored.
        </p>
      </footer>
    </div>
  );
}
