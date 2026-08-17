import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";

import { InterviewRoom } from "@/components/interview-room";
import { PreparingRound } from "@/components/preparing-round";
import { requireUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import type { InterviewerPersona } from "@/lib/types";
import { getInterview } from "../actions";

export const metadata: Metadata = { title: "Interview" };

export default async function InterviewRoomPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser(`/interview/${sessionId}`);

  let sessionResult;
  try {
    sessionResult = await getInterview(sessionId, user.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") {
      notFound();
    }
    throw error;
  }
  const { session, questions, answers } = sessionResult;

  if (session.status === "completed") redirect(`/interview/${sessionId}/report`);

  // The session row is written before the questions exist, so landing here with
  // an empty set is the normal first render, not an error.
  if (questions.length === 0) {
    return (
      <PreparingRound
        sessionId={session.id}
        role={session.config?.role ?? session.promptSnapshot ?? "the role"}
        questionCount={session.config?.questionCount ?? 10}
        focusAreas={session.config?.focusAreas ?? []}
      />
    );
  }

  // The room only needs to know whether a transcript was saved for a
  // question, not what it scored — scoring happens once, in a batch, after
  // the whole interview is answered. See D79 in decisions.md.
  const answeredIds = new Set(answers.map((a) => a.questionId));

  return (
    <InterviewRoom
      sessionId={session.id}
      role={session.config?.role ?? session.promptSnapshot ?? "the role"}
      persona={(session.config?.persona ?? "professional") as InterviewerPersona}
      language={session.language}
      questions={questions.map((q) => ({
        id: q.id,
        position: q.position,
        question: q.question,
        kind: q.kind,
        difficulty: q.difficulty,
        focusArea: q.focusArea,
        answered: answeredIds.has(q.id),
      }))}
    />
  );
}
