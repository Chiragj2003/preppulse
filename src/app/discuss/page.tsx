import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { checkCanStart } from "@/lib/gate";
import { GD_PERSONAS } from "@/lib/gd-metrics";
import { getRandomTopic } from "@/lib/practice";
import { requireUser } from "@/lib/session";
import { PersonaSelector } from "@/components/persona-selector";
import { startDiscussion } from "./actions";

export const metadata: Metadata = { title: "Group discussion" };

export default async function DiscussSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await requireUser("/discuss");
  const { mode } = await searchParams;
  const debate = mode === "debate";

  // Checked here so the page never offers a button the user can't use. The
  // action re-checks server-side; this is about honesty, not security.
  const [topic, locked] = await Promise.all([
    getRandomTopic(),
    checkCanStart(user.id, debate ? "debate" : "group_discussion"),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise">
        <p className="t-micro mb-6">{debate ? "Debate" : "Group discussion"}</p>
        <h1 className="t-display max-w-[13ch]">
          {debate ? (
            <>
              Argue it out <span className="text-ink-3">with someone who won&apos;t fold.</span>
            </>
          ) : (
            <>
              Hold your ground <span className="text-ink-3">in a room of four.</span>
            </>
          )}
        </h1>
        <p className="t-lead mt-8 max-w-lg">
          {debate
            ? "Pick a side. Your opponent automatically takes the other and works through opening, argument, rebuttal and closing."
            : "Four AI panelists with genuinely different temperaments, plus a moderator. They argue with each other as well as with you."}
        </p>
      </header>

      {!debate && (
        <section className="rise mt-14 [animation-delay:80ms]">
          <PersonaSelector personas={GD_PERSONAS} />
        </section>
      )}

      <form action={startDiscussion} className="rise mt-14 [animation-delay:140ms]">
        <input type="hidden" name="mode" value={debate ? "debate" : "group_discussion"} />
        {topic && <input type="hidden" name="topicId" value={topic.id} />}

        <div className="mb-5 flex items-center justify-between">
          <p className="t-micro">{debate ? "The motion" : "The topic"}</p>
          <Link
            href={`/discuss?mode=${debate ? "debate" : "group_discussion"}&roll=${Date.now()}`}
            scroll={false}
            className="group relative flex items-center gap-2 overflow-hidden rounded-full border border-accent/20 bg-accent/5 px-4 py-2 text-[13px] font-medium text-accent transition-all duration-300 hover:border-accent/40 hover:bg-accent/15 hover:shadow-[var(--shadow-accent)] active:scale-95"
          >
            <span className="relative z-10">Spin the wheel</span>
            <span className="relative z-10 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-[360deg]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
            </span>
            {/* Glossy sheen overlay */}
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
          </Link>
        </div>
        <Surface material="dense" radius="lg" refract className="p-7 sm:p-9">
          <p className="t-title">{topic?.promptText ?? "No topics seeded yet."}</p>
        </Surface>

        {debate && (
          <fieldset className="mt-8">
            <legend className="t-micro mb-4">Your side</legend>
            <div className="flex gap-3">
              {(["for", "against"] as const).map((side, i) => (
                <label key={side} className="flex-1 cursor-pointer">
                  <input
                    type="radio"
                    name="stance"
                    value={side}
                    defaultChecked={i === 0}
                    className="peer sr-only"
                  />
                  <Surface
                    material="liquid"
                    radius="md"
                    className="p-5 text-center transition-all peer-checked:ring-2 peer-checked:ring-accent peer-checked:bg-accent/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
                  >
                    <p className="t-heading capitalize">{side}</p>
                  </Surface>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-10 border-t border-line pt-8">
          {locked ? (
            <div className="flex flex-col items-start gap-5">
              <p className="t-body max-w-lg text-ink-2">{locked.message}</p>
              <Link href="/pricing">
                <Button variant="primary" size="lg">
                  See the plans
                </Button>
              </Link>
            </div>
          ) : (
            <SubmitButton variant="primary" size="lg" disabled={!topic}>
              {debate ? "Start the debate" : "Join the discussion"}
            </SubmitButton>
          )}
        </div>
      </form>
    </div>
  );
}
