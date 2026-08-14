import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReadingRoom } from "@/components/reading-room";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { getReadingSession } from "../actions";

export const metadata: Metadata = { title: "Read aloud" };

export default async function ReadingRoomPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser(`/read/${sessionId}`);

  let loaded;
  try {
    loaded = await getReadingSession(sessionId, user.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }

  const { session, piece, attempts } = loaded;
  const best = attempts.reduce<number | null>(
    (highest, attempt) => Math.max(highest ?? 0, attempt.overallScore),
    null,
  );

  return (
    <ReadingRoom
      sessionId={session.id}
      piece={{
        id: piece.id,
        title: piece.title,
        body: piece.body,
        focus: piece.focus,
        kind: piece.kind,
        paceMin: piece.paceMin,
        paceMax: piece.paceMax,
      }}
      previousBest={best}
    />
  );
}
