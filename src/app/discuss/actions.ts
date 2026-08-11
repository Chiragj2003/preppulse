"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Filter } from "bad-words";

import { db } from "@/db";
import { discussionTurns, practiceSessions } from "@/db/schema";
import { respondToDebate, respondToDiscussion, respondToScenario } from "@/lib/ai/discussion";
import { scenarioById } from "@/lib/scenarios";
import { AppError, toAppError, type AppErrorCode } from "@/lib/errors";
import { gateOrRedirect } from "@/lib/gate";
import { computeGdMetrics, countWordsIn, GD_PERSONAS, nextStage, type DebateStage } from "@/lib/gd-metrics";
import { getRandomTopic, getTopicById, getProfile, recordPractice } from "@/lib/practice";
import { scoreRoleplay } from "@/lib/roleplay-scoring";
import { enforceRateLimit } from "@/lib/rate-limit";
import { tokensForScore } from "@/lib/scoring";
import { requireUserApi } from "@/lib/session";

export interface ActionError {
  code: AppErrorCode;
  message: string;
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

function fail(error: unknown, context: string): { ok: false; error: ActionError } {
  const appError = toAppError(error, context);
  return { ok: false, error: { code: appError.code, message: appError.message } };
}

const StartInput = z.object({
  mode: z.enum(["group_discussion", "debate"]),
  topicId: z.string().uuid().optional(),
  stance: z.enum(["for", "against"]).optional(),
});

export async function startDiscussion(formData: FormData) {
  const user = await requireUserApi();

  const input = StartInput.parse({
    // parsed first so the gate can name the mode the user actually asked for
    mode: formData.get("mode"),
    topicId: formData.get("topicId") || undefined,
    stance: formData.get("stance") || undefined,
  });

  await gateOrRedirect(user.id, input.mode);

  const topic = input.topicId ? await getTopicById(input.topicId) : await getRandomTopic();
  if (!topic) throw new AppError("not_found", "No topics are seeded yet.");

  const profile = await getProfile(user.id);

  const selectedPersonas = formData.getAll("selectedPersonas") as string[];
  const finalPersonas = selectedPersonas.length > 0 ? selectedPersonas : GD_PERSONAS.map((p) => p.id);

  const [session] = await db
    .insert(practiceSessions)
    .values({
      userId: user.id,
      topicId: topic.id,
      mode: input.mode,
      status: "in_progress",
      language: profile?.preferredLanguage ?? "en",
      promptSnapshot: topic.promptText,
      config: {
        personaIds: finalPersonas,
        userStance: input.stance ?? "for",
      },
    })
    .returning();

  redirect(`/discuss/${session.id}`);
}

const SpeakInput = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1).max(8000),
});

/**
 * One user turn in, the panel's reaction out.
 *
 * Turns are appended with an explicit position rather than relying on
 * insertion order, so the transcript can never be reassembled wrongly.
 */
export async function speak(
  raw: z.input<typeof SpeakInput>,
): Promise<
  Result<{
    replies: { speaker: string; content: string }[];
    /** Tags for the turn just sent, so the client can update its live metrics
     *  without waiting for a refresh. */
    userTurn: { isRebuttal: boolean; introducesArgument: boolean };
    stage: DebateStage | null;
    finished: boolean;
  }>
> {
  try {
    const user = await requireUserApi();
    const input = SpeakInput.parse(raw);
    await enforceRateLimit(user.id);

    const filter = new Filter();
    if (filter.isProfane(input.content)) {
      throw new AppError("invalid_input", "Your response contained inappropriate language. Please keep it professional.");
    }

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, input.sessionId), eq(practiceSessions.userId, user.id)))
      .limit(1);

    if (!session) throw new AppError("not_found", "That discussion doesn't exist.");
    if (session.status === "completed") {
      throw new AppError("invalid_input", "This discussion has already finished.");
    }

    const history = await db
      .select()
      .from(discussionTurns)
      .where(eq(discussionTurns.sessionId, session.id))
      .orderBy(asc(discussionTurns.position));

    const isDebate = session.mode === "debate";
    const isRolePlay = session.mode === "scenario" || session.mode === "conversation";
    const stage = (history.at(-1)?.stage as DebateStage | undefined) ?? "opening";

    const scenario = isRolePlay ? scenarioById(session.config?.scenarioId ?? "") : undefined;
    if (isRolePlay && !scenario) {
      throw new AppError("not_found", "That scenario no longer exists.");
    }

    const result = isRolePlay
      ? await respondToScenario({
          userId: user.id,
          sessionId: session.id,
          scenario: scenario!,
          history: history.map((t) => ({ speaker: t.speaker, content: t.content })),
          userTurn: input.content,
          language: session.language,
        })
      : isDebate
      ? await respondToDebate({
          userId: user.id,
          sessionId: session.id,
          topic: session.promptSnapshot ?? "the motion",
          userStance: session.config?.userStance ?? "for",
          stage,
          history: history.map((t) => ({ speaker: t.speaker, content: t.content })),
          userTurn: input.content,
          language: session.language,
        })
      : await respondToDiscussion({
          userId: user.id,
          sessionId: session.id,
          topic: session.promptSnapshot ?? "the topic",
          history: history.map((t) => ({ speaker: t.speaker, content: t.content })),
          userTurn: input.content,
          personaIds: session.config?.personaIds ?? GD_PERSONAS.map((p) => p.id),
          language: session.language,
        });

    let position = history.length;

    await db.insert(discussionTurns).values({
      sessionId: session.id,
      position: position++,
      speaker: null,
      role: "candidate",
      content: input.content,
      stage: isDebate ? stage : null,
      isRebuttal: result.userTurn.isRebuttal,
      wordCount: countWordsIn(input.content),
    });

    // The model's judgement on the user's turn is stored on the row so the
    // metrics can simply tally it later, rather than re-asking.
    if (result.userTurn.introducesArgument) {
      await db
        .update(discussionTurns)
        .set({ role: "candidate_argument" })
        .where(
          and(
            eq(discussionTurns.sessionId, session.id),
            eq(discussionTurns.position, position - 1),
          ),
        );
    }

    const replies = result.replies.slice(0, 3);
    if (replies.length > 0) {
      await db.insert(discussionTurns).values(
        replies.map((reply, i) => ({
          sessionId: session.id,
          position: position + i,
          speaker: reply.speaker,
          role: "panel",
          content: reply.content,
          stage: isDebate ? stage : null,
          isRebuttal: reply.isRebuttal,
          wordCount: countWordsIn(reply.content),
        })),
      );
    }

    const upcoming = isDebate ? nextStage(stage) : null;

    revalidatePath(`/discuss/${session.id}`);

    return {
      ok: true,
      data: {
        replies: replies.map((r) => ({ speaker: r.speaker, content: r.content })),
        userTurn: result.userTurn,
        stage: upcoming,
        finished: isDebate && upcoming === null,
      },
    };
  } catch (error) {
    return fail(error, "speak");
  }
}

/** Ends the session and stores the computed metrics. */
export async function finishDiscussion(sessionId: string): Promise<Result<{ share: number }>> {
  try {
    const user = await requireUserApi();

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, user.id)))
      .limit(1);

    if (!session) throw new AppError("not_found", "That discussion doesn't exist.");

    const turns = await db
      .select()
      .from(discussionTurns)
      .where(eq(discussionTurns.sessionId, sessionId))
      .orderBy(asc(discussionTurns.position));

    if (turns.length === 0) {
      throw new AppError("invalid_input", "Say something before ending the discussion.");
    }

    const metrics = computeGdMetrics(
      turns.map((t) => ({
        speaker: t.speaker,
        content: t.content,
        isRebuttal: t.isRebuttal,
        introducesArgument: t.role === "candidate_argument",
        wordCount: t.wordCount,
      })),
    );

    const isRolePlay = session.mode === "scenario" || session.mode === "conversation";
    const userTurnCount = turns.filter((t) => t.speaker === null).length;

    let score = metrics.speakingSharePct;

    if (isRolePlay) {
      const scenario = scenarioById(session.config?.scenarioId ?? "");
      const criteria = scenario?.successLooksLike ?? [];
      const userArgs = turns.filter((t) => t.speaker === null && t.role === "candidate_argument").length;
      const userRebuttals = turns.filter((t) => t.speaker === null && t.isRebuttal).length;

      // Evaluate criteria heuristically from turn metrics without LLM I/O
      const criteriaResults = criteria.map((_, i) => {
        if (i === 0) return userTurnCount >= 1;
        if (i === 1) return userArgs > 0 || userRebuttals > 0 || userTurnCount >= 2;
        return userTurnCount >= 3;
      });

      const roleplayScore = scoreRoleplay({
        criteriaResults,
        turnCount: turns.length,
        userTurnCount,
      });

      score = roleplayScore.overallScore;
    }

    await db
      .update(practiceSessions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(practiceSessions.id, sessionId));

    await recordPractice(
      user.id,
      new Date().toLocaleDateString("en-CA"),
      tokensForScore(score),
    );

    revalidatePath("/dashboard");
    return { ok: true, data: { share: score } };
  } catch (error) {
    return fail(error, "finishDiscussion");
  }
}

export async function getDiscussion(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
    .limit(1);

  if (!session) throw new AppError("not_found", "That discussion doesn't exist.");

  const turns = await db
    .select()
    .from(discussionTurns)
    .where(eq(discussionTurns.sessionId, sessionId))
    .orderBy(asc(discussionTurns.position));

  return { session, turns };
}
