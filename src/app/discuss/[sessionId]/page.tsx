import type { Metadata } from "next";

import { DiscussionRoom, type RoomMode } from "@/components/discussion-room";
import { scenarioById } from "@/lib/scenarios";
import { requireUser } from "@/lib/session";
import { getDiscussion } from "../actions";

export const metadata: Metadata = { title: "Discussion" };

export default async function DiscussionRoomPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser(`/discuss/${sessionId}`);
  const { session, turns } = await getDiscussion(sessionId, user.id);

  const scenario = session.config?.scenarioId ? scenarioById(session.config.scenarioId) : null;

  return (
    <DiscussionRoom
      sessionId={session.id}
      topic={scenario?.objective ?? session.promptSnapshot ?? "the topic"}
      title={scenario?.title ?? session.promptSnapshot ?? undefined}
      mode={session.mode as RoomMode}
      counterpartName={scenario?.counterpart.name}
      stance={session.config?.userStance ?? "for"}
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
