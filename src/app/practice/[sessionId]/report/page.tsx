import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";

import { ScoreReport } from "@/components/score-report";
import { ShareToggle } from "@/components/share-toggle";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { getSessionWithEvaluation, getStreak } from "@/lib/practice";
import { getEntitlements } from "@/lib/progress";
import { requireUser } from "@/lib/session";

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
  } catch {
    sessionResult = null;
  }

  if (!sessionResult) {
    return (
      <div className="mx-auto max-w-xl px-5 pt-32 pb-24 text-center">
        <Surface material="dense" radius="lg" refract className="p-8 sm:p-10">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertCircle className="size-7" />
          </div>
          <h1 className="t-title text-2xl">Session Report Unavailable</h1>
          <p className="t-lead mt-3 text-ink-3">
            We couldn&apos;t find a completed score report for session ID <code className="text-accent text-xs font-mono px-2 py-1 rounded bg-accent/10">{sessionId}</code>.
            It may belong to a different account, or hasn&apos;t been scored yet.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/practice">
              <Button variant="primary" size="lg">
                Start New Practice
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="glass" size="lg" icon={<ArrowLeft className="size-4" />}>
                Dashboard
              </Button>
            </Link>
          </div>
        </Surface>
      </div>
    );
  }

  const { session, evaluation } = sessionResult;

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
