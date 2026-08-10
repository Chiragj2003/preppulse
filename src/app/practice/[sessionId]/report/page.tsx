import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ScoreReport } from "@/components/score-report";
import { getSessionWithEvaluation, getStreak } from "@/lib/practice";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your report" };

export default async function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser(`/practice/${sessionId}/report`);

  const { session, evaluation } = await getSessionWithEvaluation(sessionId, user.id);

  // Not scored yet - send them back to actually do the session.
  if (!evaluation) redirect(`/practice/${sessionId}`);

  const streak = await getStreak(user.id);

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
      <ScoreReport
        topic={session.promptSnapshot ?? "Open topic"}
        evaluation={evaluation}
        streak={streak?.currentStreak ?? 0}
      />

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          href="/practice"
          className="pressable rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-accent-ink hover:brightness-110"
        >
          Practise another
        </Link>
        <Link
          href="/dashboard"
          className="pressable rounded-full border border-line bg-surface px-6 py-3 text-[15px] font-medium hover:bg-surface-2"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
