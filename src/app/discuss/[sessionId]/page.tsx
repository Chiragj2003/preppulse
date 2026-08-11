import type { Metadata } from "next";

import { DiscussionRoom } from "@/components/discussion-room";
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

  return (
    <DiscussionRoom
      sessionId={session.id}
      topic={session.promptSnapshot ?? "the topic"}
      mode={session.mode === "debate" ? "debate" : "group_discussion"}
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
