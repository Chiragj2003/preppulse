import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DiscussionRoom, type RoomMode } from "@/components/discussion-room";
import { scenarioById } from "@/lib/scenarios";
import { requireUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { getDiscussion } from "../actions";

export const metadata: Metadata = { title: "Discussion" };

export default async function DiscussionRoomPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser(`/discuss/${sessionId}`);
  let sessionResult;
  try {
    sessionResult = await getDiscussion(sessionId, user.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") {
      notFound();
    }
    throw error;
  }
  const { session, turns } = sessionResult;

  const scenario = session.config?.scenarioId ? scenarioById(session.config.scenarioId) : null;

  return (
    <DiscussionRoom
      sessionId={session.id}
      topic={scenario?.objective ?? session.promptSnapshot ?? "the topic"}
      title={scenario?.title ?? session.promptSnapshot ?? undefined}
      mode={session.mode as RoomMode}
      counterpartName={scenario?.counterpart.name}
      stance={session.config?.userStance ?? "for"}
      language={session.language}
      completed={session.status === "completed"}
      initialTurns={turns.map((t) => ({
        id: t.id,
        speaker: t.speaker,
        content: t.content,
        stage: t.stage,
        isRebuttal: t.isRebuttal,
        wordCount: t.wordCount,
        role: t.role,
      }))}
    />
  );
}
