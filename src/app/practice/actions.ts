"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { evaluations, practiceSessions } from "@/db/schema";
import { scoreAnswer } from "@/lib/ai/score";
import { toAppError, type AppErrorCode } from "@/lib/errors";
import {
  createPracticeSession,
  getDailyTopic,
  getOwnedSession,
  getRandomTopic,
  recordPractice,
} from "@/lib/practice";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireUserApi } from "@/lib/session";
import { tokensForScore } from "@/lib/scoring";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; retryAfterSeconds?: number } };

function fail(error: unknown, context: string): { ok: false; error: ActionResult<never>["error"] } {
  const appError = toAppError(error, context);
  return {
    ok: false,
    error: {
      code: appError.code,
      message: appError.message,
      retryAfterSeconds: appError.retryAfterSeconds,
    },
  };
}

/** Creates the session row, then sends the user into the practice room. */
export async function startSession(formData: FormData) {
  const user = await requireUserApi();
  const quick = formData.get("mode") === "quick";

  const topic = quick ? await getRandomTopic() : await getDailyTopic();
  if (!topic) {
    throw new Error("No topics are seeded yet. Run `npm run db:seed`.");
  }

  const session = await createPracticeSession({
    userId: user.id,
    topicId: topic.id,
    promptText: topic.promptText,
  });

  redirect(`/practice/${session.id}?prep=${quick ? 0 : 30}&speak=${quick ? 60 : 120}`);
}

const EvaluateInput = z.object({
  sessionId: z.string().uuid(),
  transcript: z.string().min(1).max(20_000),
  durationSeconds: z.number().int().min(1).max(3600),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function evaluateSession(
  raw: z.input<typeof EvaluateInput>,
): Promise<ActionResult<{ overallScore: number; streak: number; extended: boolean }>> {
  try {
    const user = await requireUserApi();
    const input = EvaluateInput.parse(raw);

    // Cap AI spend per user before we call anything paid.
    await enforceRateLimit(user.id);

    const session = await getOwnedSession(input.sessionId, user.id);

    const result = await scoreAnswer({
      userId: user.id,
      sessionId: session.id,
      topic: session.promptSnapshot ?? "Open topic",
      transcript: input.transcript,
      durationSeconds: input.durationSeconds,
      mode: session.mode,
      language: session.language,
    });

    // Upsert so a Retry on the same session replaces the old verdict.
    await db
      .insert(evaluations)
      .values({
        sessionId: session.id,
        scores: result.scores,
        overallScore: result.overallScore,
        strengths: result.strengths,
        improvements: result.improvements,
        fillerWords: result.fillerWords,
        transcript: input.transcript,
        improvedAnswer: result.improvedAnswer,
        summary: result.summary,
        wordCount: result.wordCount,
        wordsPerMinute: result.wordsPerMinute,
      })
      .onConflictDoUpdate({
        target: evaluations.sessionId,
        set: {
          scores: result.scores,
          overallScore: result.overallScore,
          strengths: result.strengths,
          improvements: result.improvements,
          fillerWords: result.fillerWords,
          transcript: input.transcript,
          improvedAnswer: result.improvedAnswer,
          summary: result.summary,
          wordCount: result.wordCount,
          wordsPerMinute: result.wordsPerMinute,
        },
      });

    await db
      .update(practiceSessions)
      .set({
        status: "completed",
        completedAt: new Date(),
        durationSeconds: input.durationSeconds,
      })
      .where(eq(practiceSessions.id, session.id));

    const { streak, extended } = await recordPractice(
      user.id,
      input.localDate,
      tokensForScore(result.overallScore),
    );

    revalidatePath("/dashboard");

    return {
      ok: true,
      data: { overallScore: result.overallScore, streak: streak.currentStreak, extended },
    };
  } catch (error) {
    return fail(error, "evaluateSession");
  }
}

/** Marks a session abandoned when the user backs out without speaking. */
export async function abandonSession(sessionId: string) {
  try {
    const user = await requireUserApi();
    await db
      .update(practiceSessions)
      .set({ status: "abandoned" })
      // Scoped by userId as well as id - a session id must never be enough on its own.
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, user.id)));
  } catch {
    // Best effort - never block navigation on this.
  }
}
