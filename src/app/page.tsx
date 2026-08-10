import { ArrowRight, Dices, MessageSquareText, Timer, Users } from "lucide-react";
import Link from "next/link";

import { getSession } from "@/lib/session";

/**
 * Landing page. Deliberate ordering, per the product decisions:
 * fun/casual practice is the primary call to action, and interview prep is a
 * separate, clearly-labelled section further down - not the opening pitch.
 */
export default async function HomePage() {
  const session = await getSession();
  const startHref = session?.user ? "/practice" : "/sign-in?next=/practice";

  return (
    <div className="mx-auto max-w-5xl px-5 pb-24">
      {/* Hero */}
      <section className="rise pt-16 pb-12 text-center sm:pt-24">
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] font-medium text-ink-soft">
          <span className="size-1.5 rounded-full bg-positive" />
          A new topic every day
        </p>
        <h1 className="t-display mx-auto max-w-2xl">
          Speak better,
          <br />
          two minutes at a time.
        </h1>
        <p className="t-lead mx-auto mt-5 max-w-xl text-ink-soft">
          Roll a topic you didn&apos;t see coming. Talk it through. Get told exactly where you
          rambled, where you filled, and where you nailed it.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={startHref}
            className="pressable inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-accent-ink shadow-[var(--shadow-soft)] hover:brightness-110"
          >
            <Dices className="size-4.5" />
            Roll today&apos;s topic
          </Link>
          <Link
            href="#interview"
            className="pressable rounded-full px-5 py-3 text-[15px] text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            Got an interview coming up?
          </Link>
        </div>
      </section>

      {/* Primary: the fun modes */}
      <section className="rise [animation-delay:90ms]">
        <h2 className="t-label mb-4 px-1 text-muted">
          Pick your practice
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <ModeCard
            href={startHref}
            icon={<Dices className="size-5" />}
            title="Fun Topic Roll"
            blurb="A random topic from 50-plus. Two minutes to make it make sense."
            meta="2 min"
          />
          <ModeCard
            href={session?.user ? "/practice?mode=quick" : "/sign-in?next=/practice"}
            icon={<Timer className="size-5" />}
            title="Quick Challenge"
            blurb="Same idea, half the clock. Sixty seconds, no prep time."
            meta="1 min"
          />
          <ModeCard
            icon={<Users className="size-5" />}
            title="GD Practice"
            blurb="Hold your ground in a group discussion against AI participants."
            meta="Phase 4"
            disabled
          />
        </div>
      </section>

      {/* Secondary: interview prep, visually separated on purpose */}
      <section id="interview" className="rise mt-20 scroll-mt-20 [animation-delay:150ms]">
        <div className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-8 sm:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-lg">
              <p className="mb-2 text-[12.5px] font-semibold tracking-wide text-accent uppercase">
                Serious mode
              </p>
              <h2 className="text-[26px] leading-tight font-semibold">Preparing for an interview?</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                Tell us what you do, or drop in your resume. PrepPulse reads it, works out what
                you&apos;d actually be asked, and runs a mock round question by question.
              </p>
            </div>
            <Link
              href={session?.user ? "/interview-prep" : "/sign-in?next=/interview-prep"}
              className="pressable inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-5 py-3 text-[15px] font-medium text-bg hover:opacity-90"
            >
              Set up my profile
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="rise mt-20 [animation-delay:210ms]">
        <h2 className="mb-6 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">
          How a session goes
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            { n: "01", t: "Roll", d: "Today's topic reveals itself. No picking, no stalling." },
            { n: "02", t: "Speak", d: "Prep timer, then the clock. Your mic transcribes live." },
            { n: "03", t: "Read the tape", d: "Six scores, your filler words, and a tighter rewrite." },
          ].map((step) => (
            <li key={step.n} className="card p-5">
              <span className="font-mono text-[12px] text-muted">{step.n}</span>
              <h3 className="mt-2 text-[16px] font-semibold">{step.t}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{step.d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 flex items-center justify-center gap-2 text-[13px] text-muted">
          <MessageSquareText className="size-3.5" />
          Everything runs in your browser mic. Nothing is recorded to disk.
        </p>
      </section>
    </div>
  );
}

function ModeCard({
  href,
  icon,
  title,
  blurb,
  meta,
  disabled,
}: {
  href?: string;
  icon: React.ReactNode;
  title: string;
  blurb: string;
  meta: string;
  disabled?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <span className="grid size-10 place-items-center rounded-[var(--radius-xs)] bg-accent-soft text-accent">
          {icon}
        </span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
          {meta}
        </span>
      </div>
      <h3 className="mt-4 text-[17px] font-semibold">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{blurb}</p>
    </>
  );

  if (disabled || !href) {
    return (
      <div className="card p-5 opacity-55" aria-disabled>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="pressable card block p-5 hover:border-accent/40 hover:shadow-[var(--shadow-lift)]"
    >
      {body}
    </Link>
  );
}
