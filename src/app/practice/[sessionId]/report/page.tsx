import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { ScoreReport } from "@/components/score-report";
import { ShareToggle } from "@/components/share-toggle";
import { Button } from "@/components/ui/button";
import { getSessionWithEvaluation, getStreak } from "@/lib/practice";
import { getEntitlements } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = { title: "Your report" };

export default async function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser(`/practice/${sessionId}/report`);

  let sessionResult;
  try {
    sessionResult = await getSessionWithEvaluation(sessionId, user.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") {
      notFound();
    }
    throw error;
  }
  const { session, evaluation } = sessionResult;

  // Not scored yet — send them back to actually do the session.
  if (!evaluation) redirect(`/practice/${sessionId}`);

  const [streak, entitlements] = await Promise.all([
    getStreak(user.id),
    getEntitlements(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 pt-24 pb-28 sm:px-6">
      <ScoreReport
        topic={session.promptSnapshot ?? "Open topic"}
        evaluation={evaluation}
        streak={streak?.currentStreak ?? 0}
      />

      <div className="mt-16 border-t border-line pt-10">
        <p className="t-micro mb-5">Share this result</p>
        <ShareToggle
          sessionId={session.id}
          initialSlug={session.shareSlug}
          locked={!entitlements.isPaid}
        />
      </div>

      <div className="mt-16 flex flex-wrap justify-center gap-3 border-t border-line pt-12">
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
