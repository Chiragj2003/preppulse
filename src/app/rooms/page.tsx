import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { checkCanStart } from "@/lib/gate";
import { scenariosOfKind, type Scenario } from "@/lib/scenarios";
import { requireUser } from "@/lib/session";
import { startScenario } from "./actions";

export const metadata: Metadata = { title: "Rooms" };

/**
 * Conversation and scenario role-plays.
 *
 * Grouped by what they're for rather than by mechanism, because from the
 * user's side "keep a conversation alive" and "push back on your manager" are
 * different problems — even though underneath they are the same turn engine.
 */
export default async function RoomsPage() {
  const user = await requireUser("/rooms");

  const [conversationLocked, scenarioLocked] = await Promise.all([
    checkCanStart(user.id, "conversation"),
    checkCanStart(user.id, "scenario"),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise">
        <p className="t-micro mb-6">Rooms</p>
        <h1 className="t-display max-w-[15ch]">
          The conversations <span className="text-ink-3">you rehearse in your head.</span>
        </h1>
        <p className="t-lead mt-8 max-w-lg">
          Someone on the other side with their own stake in it, who won&apos;t just agree with you.
          Say the thing before you have to say it for real.
        </p>
      </header>

      <Section
        eyebrow="Real situations"
        blurb="Role-plays where the other person wants something different to you."
        scenarios={scenariosOfKind("scenario")}
        locked={scenarioLocked?.message ?? null}
        delay={80}
      />

      <Section
        eyebrow="Just talking"
        blurb="No agenda. The hard part is keeping it alive."
        scenarios={scenariosOfKind("conversation")}
        locked={conversationLocked?.message ?? null}
        delay={140}
      />
    </div>
  );
}

function Section({
  eyebrow,
  blurb,
  scenarios,
  locked,
  delay,
}: {
  eyebrow: string;
  blurb: string;
  scenarios: Scenario[];
  locked: string | null;
  delay: number;
}) {
  return (
    <section className="rise mt-16" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <p className="t-micro">{eyebrow}</p>
        <p className="t-meta text-ink-4">{blurb}</p>
      </div>

      {locked ? (
        <Surface material="liquid" radius="lg" className="p-7">
          <p className="t-body max-w-lg text-ink-2">{locked}</p>
          <Link href="/pricing" className="mt-5 inline-block">
            <Button variant="primary">See the plans</Button>
          </Link>
        </Surface>
      ) : (
        <ul className="divide-y divide-line/70 border-t border-line">
          {scenarios.map((scenario) => (
            <li key={scenario.id}>
              <form action={startScenario} className="group py-7">
                <input type="hidden" name="scenarioId" value={scenario.id} />

                <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div>
                    <h2 className="t-heading transition-colors group-hover:text-accent">
                      {scenario.title}
                    </h2>
                    <p className="t-body mt-2 max-w-xl text-ink-2">{scenario.objective}</p>
                    <p className="t-meta mt-3 text-ink-4">{scenario.setting}</p>

                    <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
                      {scenario.successLooksLike.map((point) => (
                        <li key={point} className="t-meta text-ink-4">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button type="submit" variant="glass" className="shrink-0">
                    Enter
                  </Button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
