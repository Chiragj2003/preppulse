import type { Metadata } from "next";
import Link from "next/link";

import { DailyRoll } from "@/components/daily-roll";
import { EmptyState } from "@/components/ui/states";
import { KnowledgeBaseModal } from "@/components/knowledge-base-modal";
import { getDailyTopic, getDecoyPrompts, getRandomTopic, getStreak } from "@/lib/practice";
import { requireOnboardedUser } from "@/lib/session";

export const metadata: Metadata = { title: "Practice" };

/**
 * Nothing on this page competes with the slab. The roll is the event; the
 * streak line above it and the exit below are set as small metadata so the
 * eye lands where the interaction is.
 */
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { user } = await requireOnboardedUser("/practice");
  const { mode } = await searchParams;
  const quick = mode === "quick";

  const topic = quick ? await getRandomTopic() : await getDailyTopic(undefined, user.id);

  if (!topic) {
    return (
      <div className="mx-auto max-w-lg px-5 pt-32">
        <EmptyState
          eyebrow="No topics"
          title="The topic pool is empty."
          body="Run npm run db:seed to load the starter set of fifty."
        />
      </div>
    );
  }

  const [decoys, streak] = await Promise.all([getDecoyPrompts(topic.id), getStreak(user.id)]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-5 py-28 sm:px-6">
      <p className="t-micro rise mb-10 text-center">
        {quick ? "Quick challenge" : "Daily roll"}
        {streak && streak.currentStreak > 0 && (
          <>
            <span className="mx-3 text-ink-4">/</span>
            <span className="text-accent">{streak.currentStreak} day streak</span>
          </>
        )}
      </p>

      <div className="rise [animation-delay:80ms]">
        <DailyRoll
          topicId={topic.id}
          topic={topic.promptText}
          decoys={decoys}
          category={topic.category}
          quick={quick}
        />
        <div className="flex justify-center mt-2">
          <KnowledgeBaseModal knowledgeBase={topic.knowledgeBase} />
        </div>
      </div>

      {/* The slab is the event, so these stay set as small metadata. They are
          here at all because this is where people land expecting to see every
          way to practise — and the mock interview was reachable only from the
          dashboard. */}
      <nav className="mt-16 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {[
          { href: "/interview", label: "Mock interview" },
          { href: "/discuss", label: "Group discussion" },
          { href: "/discuss?mode=debate", label: "Debate" },
          { href: "/rooms", label: "Role play" },
          { href: "/dashboard", label: "Back to dashboard" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="t-micro transition-colors hover:text-ink-2"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
