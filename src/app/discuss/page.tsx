import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { GD_PERSONAS } from "@/lib/gd-metrics";
import { getRandomTopic } from "@/lib/practice";
import { requireUser } from "@/lib/session";
import { startDiscussion } from "./actions";

export const metadata: Metadata = { title: "Group discussion" };

export default async function DiscussSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  await requireUser("/discuss");
  const { mode } = await searchParams;
  const debate = mode === "debate";
  const topic = await getRandomTopic();

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
          <p className="t-micro mb-5">Who&apos;s in the room</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {GD_PERSONAS.map((persona) => (
              <Surface key={persona.id} material="liquid" radius="md" className="p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-heading">{persona.name}</p>
                  <span className="t-micro">{persona.trait}</span>
                </div>
                <p className="t-meta mt-2">{persona.instruction}</p>
              </Surface>
            ))}
          </div>
        </section>
      )}

      <form action={startDiscussion} className="rise mt-14 [animation-delay:140ms]">
        <input type="hidden" name="mode" value={debate ? "debate" : "group_discussion"} />
        {topic && <input type="hidden" name="topicId" value={topic.id} />}

        <p className="t-micro mb-5">{debate ? "The motion" : "The topic"}</p>
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
                    className="p-5 text-center transition-colors peer-checked:bg-accent-wash/40 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
                  >
                    <p className="t-heading capitalize">{side}</p>
                  </Surface>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-10 border-t border-line pt-8">
          <Button type="submit" variant="primary" size="lg" disabled={!topic}>
            {debate ? "Start the debate" : "Join the discussion"}
          </Button>
        </div>
      </form>
    </div>
  );
}
