import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { checkCanStart } from "@/lib/gate";
import { GD_PERSONAS } from "@/lib/gd-metrics";
import { getRandomTopic } from "@/lib/practice";
import { requireOnboardedUser } from "@/lib/session";
import { PersonaSelector } from "@/components/persona-selector";
import { RouletteTopicSlot } from "@/components/roulette-topic-slot";
import { startDiscussion } from "./actions";

export const metadata: Metadata = { title: "Group discussion" };

export default async function DiscussSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { user } = await requireOnboardedUser("/discuss");
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

        <RouletteTopicSlot
          initialTopic={topic?.promptText ?? "No topics seeded yet."}
          category={debate ? "Debate Motion" : "Group Discussion Topic"}
        />

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
