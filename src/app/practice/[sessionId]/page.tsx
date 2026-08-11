import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";

import { PracticeRoom } from "@/components/practice-room";
import { getSessionWithEvaluation } from "@/lib/practice";
import { requireUser } from "@/lib/session";
import { AppError } from "@/lib/errors";

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
