import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ScoreReport } from "@/components/score-report";
import { Button } from "@/components/ui/button";
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

  // Not scored yet — send them back to actually do the session.
  if (!evaluation) redirect(`/practice/${sessionId}`);

  const streak = await getStreak(user.id);

  return (
    <div className="mx-auto max-w-3xl px-5 pt-24 pb-28 sm:px-6">
      <ScoreReport
        topic={session.promptSnapshot ?? "Open topic"}
        evaluation={evaluation}
        streak={streak?.currentStreak ?? 0}
      />

      <div className="mt-20 flex flex-wrap justify-center gap-3 border-t border-line pt-12">
        <Link href="/practice">
          <Button variant="primary" size="lg">
            Practise another
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="glass" size="lg">
            Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
