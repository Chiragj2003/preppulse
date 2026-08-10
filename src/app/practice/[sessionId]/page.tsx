import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PracticeRoom } from "@/components/practice-room";
import { getSessionWithEvaluation } from "@/lib/practice";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Practice room" };

export default async function PracticeRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ prep?: string; speak?: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser(`/practice/${sessionId}`);
  const { prep, speak } = await searchParams;

  const { session, evaluation } = await getSessionWithEvaluation(sessionId, user.id);

  // Already scored - no reason to sit through the timer again.
  if (evaluation) redirect(`/practice/${sessionId}/report`);

  return (
    <PracticeRoom
      sessionId={session.id}
      topic={session.promptSnapshot ?? "Open topic"}
      prepSeconds={clampSeconds(prep, 30, 0, 120)}
      speakSeconds={clampSeconds(speak, 120, 30, 600)}
    />
  );
}

function clampSeconds(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
