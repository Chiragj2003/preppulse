import type { Metadata } from "next";
import Link from "next/link";

import { DailyRoll } from "@/components/daily-roll";
import { getDailyTopic, getDecoyPrompts, getRandomTopic, getStreak } from "@/lib/practice";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Practice" };

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await requireUser("/practice");
  const { mode } = await searchParams;
  const quick = mode === "quick";

  const topic = quick ? await getRandomTopic() : await getDailyTopic();

  if (!topic) {
    return (
      <EmptyState
        title="No topics yet"
        body="The topic pool is empty. Run npm run db:seed to load the starter set of 50."
      />
    );
  }

  const [decoys, streak] = await Promise.all([getDecoyPrompts(topic.id), getStreak(user.id)]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      {streak && streak.currentStreak > 0 && (
        <p className="mb-8 text-center text-[13px] text-muted">
          {streak.currentStreak}-day streak. Keep it going.
        </p>
      )}

      <DailyRoll
        topicId={topic.id}
        topic={topic.promptText}
        decoys={decoys}
        category={topic.category}
        quick={quick}
      />

      <p className="mt-14 text-center text-[13px] text-muted">
        <Link href="/dashboard" className="hover:text-ink-soft hover:underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-[22px] font-semibold">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}
