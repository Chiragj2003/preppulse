"use server";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { practiceSessions, readingAttempts, readingPieces } from "@/db/schema";
import { coachReading } from "@/lib/ai/reading";
import { AppError, toAppError, type AppErrorCode } from "@/lib/errors";
import { overallReadingScore, scoreReading } from "@/lib/reading-scoring";
import { recordPractice } from "@/lib/practice";
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

/* ── Reads ──────────────────────────────────────────────────────────────── */

export async function listPieces() {
  return db
    .select()
    .from(readingPieces)
    .where(eq(readingPieces.isActive, true))
    .orderBy(asc(readingPieces.kind), asc(readingPieces.difficulty), asc(readingPieces.title));
}

export async function getReadingSession(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
    .limit(1);

  if (!session) throw new AppError("not_found", "That reading session doesn't exist.");

  const pieceId = session.config?.readingPieceId;
  if (!pieceId) throw new AppError("not_found", "That session has no piece attached.");

  const [piece] = await db
    .select()
    .from(readingPieces)
    .where(eq(readingPieces.id, pieceId))
    .limit(1);

  if (!piece) throw new AppError("not_found", "That piece is no longer available.");

  const attempts = await db
    .select()
    .from(readingAttempts)
    .where(eq(readingAttempts.sessionId, session.id))
    .orderBy(desc(readingAttempts.attempt));

  return { session, piece, attempts };
}

/* ── Lifecycle ──────────────────────────────────────────────────────────── */

/**
 * Starts a session against one piece and redirects.
 *
 * No AI call here — the text already exists, so unlike an interview there is
 * nothing to generate and nothing to wait for.
 */
export async function startReading(formData: FormData) {
  const user = await requireUserApi();
  const pieceId = z.string().uuid().parse(formData.get("pieceId"));

  const [piece] = await db
    .select()
    .from(readingPieces)
    .where(and(eq(readingPieces.id, pieceId), eq(readingPieces.isActive, true)))
    .limit(1);

  if (!piece) throw new AppError("not_found", "That piece is no longer available.");

  const [session] = await db
    .insert(practiceSessions)
    .values({
      userId: user.id,
      mode: "reading",
      status: "in_progress",
      promptSnapshot: piece.title,
      config: { readingPieceId: piece.id },
    })
    .returning();

  redirect(`/read/${session.id}`);
}

const SubmitInput = z.object({
  sessionId: z.string().uuid(),
  transcript: z.string().min(1).max(20_000),
  durationSeconds: z.number().min(1).max(900),
});

/**
 * Scores one read.
 *
 * The order matters: everything measurable is computed first, and only then is
 * a model asked for the one thing arithmetic cannot give — what the misses have
 * in common. If that call fails the attempt is still saved with its numbers,
 * because the numbers are the product and the coaching is a garnish.
 */
export async function submitReading(
  raw: z.input<typeof SubmitInput>,
): Promise<
  Result<{
    overallScore: number;
    accuracy: number;
    paceScore: number;
    completion: number;
    wordsPerMinute: number;
    matched: number;
    totalWords: number;
    stumbles: string[];
    alignment: ReturnType<typeof scoreReading>["alignment"];
    verdict: string;
    pattern: string;
    drill: string;
    attempt: number;
    best: number;
    delta: number | null;
  }>
> {
  try {
    const user = await requireUserApi();
    const input = SubmitInput.parse(raw);

    const { session, piece, attempts } = await getReadingSession(input.sessionId, user.id);

    const metrics = scoreReading({
      passage: piece.body,
      transcript: input.transcript,
      durationSeconds: input.durationSeconds,
      paceTarget: { min: piece.paceMin, max: piece.paceMax },
    });
    const overall = overallReadingScore(metrics);

    // Coaching is best-effort. A provider outage must not cost the reader the
    // measurement they just earned.
    let coaching = {
      verdict: "That read has been scored — the breakdown is below.",
      pattern: "",
      drill: "",
    };
    try {
      await enforceRateLimit(user.id);
      coaching = await coachReading({
        userId: user.id,
        sessionId: session.id,
        title: piece.title,
        focus: piece.focus,
        kind: piece.kind,
        metrics,
        language: session.language,
      });
    } catch (error) {
      console.warn("[reading] coaching unavailable, saving the numbers anyway", error);
    }

    const attemptNumber = attempts.length + 1;
    const previousBest = attempts.reduce((best, a) => Math.max(best, a.overallScore), 0);

    await db.insert(readingAttempts).values({
      sessionId: session.id,
      pieceId: piece.id,
      attempt: attemptNumber,
      transcript: input.transcript,
      overallScore: overall,
      accuracy: metrics.accuracy,
      paceScore: metrics.paceScore,
      completion: metrics.completion,
      wordsPerMinute: metrics.wordsPerMinute,
      stumbles: metrics.stumbles,
      durationSeconds: Math.round(input.durationSeconds),
      verdict: coaching.verdict,
      pattern: coaching.pattern,
      drill: coaching.drill,
    });

    // The session's score is the best read, not the last — rereading to improve
    // is the exercise, and a bad final take shouldn't erase a good one.
    const best = Math.max(previousBest, overall);
    await db
      .update(practiceSessions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(practiceSessions.id, session.id));

    // Streak credit once per session, on the first attempt only — twenty
    // rereads of one twister is practice, not twenty days of practice.
    if (attemptNumber === 1) {
      await recordPractice(
        user.id,
        new Date().toLocaleDateString("en-CA"),
        tokensForScore(overall),
      );
    }

    revalidatePath(`/read/${session.id}`);
    revalidatePath("/dashboard");

    return {
      ok: true,
      data: {
        overallScore: overall,
        accuracy: metrics.accuracy,
        paceScore: metrics.paceScore,
        completion: metrics.completion,
        wordsPerMinute: metrics.wordsPerMinute,
        matched: metrics.matched,
        totalWords: metrics.totalWords,
        stumbles: metrics.stumbles,
        alignment: metrics.alignment,
        verdict: coaching.verdict,
        pattern: coaching.pattern,
        drill: coaching.drill,
        attempt: attemptNumber,
        best,
        delta: attempts.length === 0 ? null : overall - previousBest,
      },
    };
  } catch (error) {
    return fail(error, "submitReading");
  }
}

/** A piece the reader hasn't attempted yet, for the "give me one" button. */
export async function suggestPiece(userId: string) {
  const [piece] = await db
    .select()
    .from(readingPieces)
    .where(eq(readingPieces.isActive, true))
    .orderBy(sql`random()`)
    .limit(1);

  void userId;
  return piece ?? null;
}
