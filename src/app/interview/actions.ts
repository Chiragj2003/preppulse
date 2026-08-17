"use server";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import {
  interviewAnswers,
  interviewQuestions,
  practiceSessions,
  profiles,
} from "@/db/schema";
import { analyseAnswer, generateQuestions } from "@/lib/ai/interview";
import { assertPdf, MAX_RESUME_BYTES } from "@/lib/ai/gemini";
import { extractResume } from "@/lib/ai/interview";
import { AppError, toAppError, type AppErrorCode } from "@/lib/errors";
import { gateOrRedirect } from "@/lib/gate";
import { runningAverage } from "@/lib/interview-scoring";
import { getProfile, recordPractice } from "@/lib/practice";
import type { PresenceSummary } from "@/lib/presence-scoring";
import { enforceRateLimit } from "@/lib/rate-limit";
import { tokensForScore } from "@/lib/scoring";
import { requireUserApi } from "@/lib/session";
import { MAX_ANSWER_SECONDS, MAX_TRANSCRIPT_CHARS, type InterviewerPersona } from "@/lib/types";

export interface ActionError {
  code: AppErrorCode;
  message: string;
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

function fail(error: unknown, context: string): { ok: false; error: ActionError } {
  const appError = toAppError(error, context);
  return { ok: false, error: { code: appError.code, message: appError.message } };
}

/* ── Resume ─────────────────────────────────────────────────────────────── */

/**
 * Parses the PDF and stores only the extracted JSON. The uploaded file is held
 * in memory for the length of this call and never written to disk or object
 * storage — that is the whole privacy position, and it also means there is no
 * bucket to secure or clean up.
 */
export async function uploadResume(
  _prev: Result<{ role: string }> | null,
  formData: FormData,
): Promise<Result<{ role: string }>> {
  try {
    const user = await requireUserApi();
    const file = formData.get("resume");

    if (!(file instanceof File)) {
      throw new AppError("invalid_input", "Choose a PDF to upload.");
    }
    assertPdf(file);
    await enforceRateLimit(user.id);

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.byteLength > MAX_RESUME_BYTES) {
      throw new AppError("invalid_input", "That PDF is over 4MB.");
    }

    const extracted = await extractResume({
      userId: user.id,
      pdfBase64: bytes.toString("base64"),
    });

    await getProfile(user.id);
    await db
      .update(profiles)
      .set({
        resumeExtractedData: extracted,
        resumeUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, user.id));

    revalidatePath("/interview-prep");
    revalidatePath("/interview");

    return { ok: true, data: { role: extracted.recommendedRole ?? "your field" } };
  } catch (error) {
    return fail(error, "uploadResume");
  }
}

/* ── Session lifecycle ──────────────────────────────────────────────────── */

const StartInput = z.object({
  persona: z.enum(["friendly", "professional", "challenging", "stress"]),
  questionCount: z.coerce.number().int().min(3).max(15),
  role: z.string().trim().max(120).optional(),
  // Chips from the setup screen. Trimmed and capped here rather than trusted
  // from the client, since they go straight into a prompt.
  focusAreas: z
    .array(z.string().trim().min(1).max(48))
    .max(6)
    .default([]),
  // Radio on the setup screen: "my background" vs "just these topics".
  // Coerced from the string a native <input type="radio"> sends.
  useBackground: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

/**
 * Creates the session and redirects. It does NOT wait for the questions.
 *
 * Generating them here meant the Begin button held a POST open for ten to
 * twenty seconds and then, if Gemini answered 503 "high demand", threw from a
 * server action — which Next renders as a bare 500 page. The user lost their
 * whole setup to a condition that clears in about a second.
 *
 * The session row is the cheap, reliable part, so it is written first and the
 * user is moved to the room immediately. The room asks for the questions and
 * shows what is happening while they are written, which also means a failure
 * has somewhere to be reported and a retry button to sit next to.
 */
export async function startInterview(formData: FormData) {
  const user = await requireUserApi();
  await gateOrRedirect(user.id, "interview");

  const input = StartInput.parse({
    persona: formData.get("persona"),
    questionCount: formData.get("questionCount"),
    role: formData.get("role") || undefined,
    focusAreas: formData.getAll("focus").filter((v): v is string => typeof v === "string"),
    useBackground: formData.get("useBackground") || undefined,
  });

  // No rate limit here any more: this function makes no model call. The limit
  // exists to cap AI spend, and charging a unit for writing one row would make
  // people hit the ceiling before the work that costs anything happens.
  const profile = await getProfile(user.id);
  const resume = profile?.resumeExtractedData;
  const written = profile?.skillsDescription;

  if (input.useBackground) {
    if (!resume && !written) {
      throw new AppError(
        "invalid_input",
        "Add a skills description or upload a resume first, so the questions are about you — or switch to general practice below.",
      );
    }
  } else if (input.focusAreas.length === 0 && !input.role) {
    // General mode has nothing else to draw questions from — the role and the
    // focus chips are the entire content source once the resume is off.
    throw new AppError(
      "invalid_input",
      "Pick at least one technology, or name a role, for general practice.",
    );
  }

  const role = input.useBackground
    ? input.role || resume?.recommendedRole || "a role in your field"
    : input.role ||
      (input.focusAreas.length > 0 ? `${input.focusAreas.join(", ")} practice` : "a role in your field");
  const preferredLanguage = profile?.preferredLanguage ?? "en";

  const [session] = await db
    .insert(practiceSessions)
    .values({
      userId: user.id,
      mode: "interview",
      status: "in_progress",
      promptSnapshot: role,
      language: preferredLanguage,
      config: {
        persona: input.persona,
        questionCount: input.questionCount,
        role,
        focusAreas: input.focusAreas,
        useBackground: input.useBackground,
      },
    })
    .returning();

  // Everything the generator needs is in `config`, so the room can ask for the
  // questions itself — and ask again if the first attempt failed.
  redirect(`/interview/${session.id}`);
}

/**
 * Writes the question set for a session that doesn't have one yet.
 *
 * Called from the room rather than from the setup form, so the wait is
 * something the user watches happen instead of a hung button. Safe to call
 * twice: it returns early if questions already exist, and the unique index on
 * (session_id, position) is the backstop if two calls somehow race.
 */
export async function prepareQuestions(sessionId: string): Promise<Result<{ count: number }>> {
  try {
    const user = await requireUserApi();

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, user.id)))
      .limit(1);

    if (!session) throw new AppError("not_found", "That interview doesn't exist.");

    const existing = await db
      .select({ id: interviewQuestions.id })
      .from(interviewQuestions)
      .where(eq(interviewQuestions.sessionId, session.id));

    if (existing.length > 0) return { ok: true, data: { count: existing.length } };

    const config = session.config ?? {};
    // Older sessions were written before this flag existed and always used
    // the background, so an absent value means true, not false.
    const useBackground = config.useBackground ?? true;

    const profile = await getProfile(user.id);
    const resume = profile?.resumeExtractedData;
    const written = profile?.skillsDescription;

    if (useBackground && !resume && !written) {
      throw new AppError(
        "invalid_input",
        "Add a skills description or upload a resume first, so the questions are about you.",
      );
    }

    // Rebuilt here rather than carried through the session row: it is derived
    // from the profile, and a copy in the database would be a second source of
    // truth that goes stale the moment a resume is re-uploaded. Skipped
    // entirely in general mode — see `useBackground` on `generateQuestions`.
    const background = !useBackground
      ? ""
      : resume
        ? [
            resume.summary,
            `Skills: ${resume.skills.join(", ")}`,
            ...resume.experience.map(
              (e) =>
                `${e.role} at ${e.company}${e.period ? ` (${e.period})` : ""}. ${(e.highlights ?? []).join(" ")}`,
            ),
            ...resume.projects.map(
              (p) => `Project ${p.name}: ${p.description ?? ""} ${(p.tech ?? []).join(", ")}`,
            ),
            written,
          ]
            .filter(Boolean)
            .join("\n")
        : (written ?? "");

    await enforceRateLimit(user.id);

    const questions = await generateQuestions({
      userId: user.id,
      sessionId: session.id,
      persona: (config.persona ?? "professional") as InterviewerPersona,
      count: config.questionCount ?? 10,
      role: config.role ?? session.promptSnapshot ?? "a role in your field",
      background,
      useBackground,
      focusAreas: config.focusAreas ?? [],
      language: session.language,
    });

    await db
      .insert(interviewQuestions)
      .values(questions.map((q) => ({ ...q, sessionId: session.id })));

    revalidatePath(`/interview/${session.id}`);
    return { ok: true, data: { count: questions.length } };
  } catch (error) {
    return fail(error, "prepareQuestions");
  }
}

/* ── Answering ──────────────────────────────────────────────────────────── */

const TranscriptInput = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  // Clamped rather than rejected: a transcript over the cap still contains a
  // real answer, and throwing it away punishes the candidate for a limit that
  // exists to protect the bill.
  transcript: z
    .string()
    .min(1)
    .transform((value) => value.slice(0, MAX_TRANSCRIPT_CHARS)),
  durationSeconds: z
    .number()
    .int()
    .min(1)
    .transform((value) => Math.min(value, MAX_ANSWER_SECONDS)),
  inputMode: z.enum(["speech", "typed"]).default("speech"),
});

/**
 * Saves what the candidate said. No model call — this is the whole point.
 *
 * Scoring moved to `analyseSession`, run once after the interview ends (see
 * the note on `analyseAnswer`). This function's only job is to get the
 * transcript into durable storage fast enough that the room can move to the
 * next question without the candidate waiting on a network round trip, and
 * without a browser crash between questions losing an answer that was never
 * written down.
 */
export async function submitTranscript(
  raw: z.input<typeof TranscriptInput>,
): Promise<Result<{ answeredCount: number }>> {
  try {
    const user = await requireUserApi();
    const input = TranscriptInput.parse(raw);

    const [session] = await db
      .select({ id: practiceSessions.id })
      .from(practiceSessions)
      .where(
        and(eq(practiceSessions.id, input.sessionId), eq(practiceSessions.userId, user.id)),
      )
      .limit(1);

    if (!session) throw new AppError("not_found", "That interview doesn't exist.");

    const [question] = await db
      .select({ id: interviewQuestions.id })
      .from(interviewQuestions)
      .where(
        and(
          eq(interviewQuestions.id, input.questionId),
          eq(interviewQuestions.sessionId, session.id),
        ),
      )
      .limit(1);

    if (!question) throw new AppError("not_found", "That question isn't part of this interview.");

    // Append-only, same as before: a duplicate submit (a double-click, a retry
    // after a dropped request) adds an attempt rather than corrupting one.
    // `analyseSession` only ever scores the latest attempt per question, so a
    // stray extra row costs nothing beyond a little storage.
    const [{ count: previousCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(interviewAnswers)
      .where(eq(interviewAnswers.questionId, question.id));

    await db.insert(interviewAnswers).values({
      questionId: question.id,
      sessionId: session.id,
      attempt: previousCount + 1,
      transcript: input.transcript,
      inputMode: input.inputMode,
      status: "pending",
      durationSeconds: input.durationSeconds,
    });

    const [{ count: answeredCount }] = await db
      .select({ count: sql<number>`count(distinct ${interviewAnswers.questionId})::int` })
      .from(interviewAnswers)
      .where(eq(interviewAnswers.sessionId, session.id));

    revalidatePath(`/interview/${session.id}`);
    return { ok: true, data: { answeredCount } };
  } catch (error) {
    return fail(error, "submitTranscript");
  }
}

/**
 * Scores one saved-but-unscored answer and writes the result in place.
 *
 * The one function both `analyseSession` (the normal batch-at-the-end path)
 * and `rescoreAnswer` (the report page's per-question retry) call, so the two
 * paths can't drift into scoring an answer two different ways.
 */
async function scoreOneAnswer(
  userId: string,
  answer: { id: string; sessionId: string; questionId: string; transcript: string },
  question: { question: string; kind: (typeof interviewQuestions.$inferSelect)["kind"] },
  session: { config: unknown; promptSnapshot: string | null; language: (typeof practiceSessions.$inferSelect)["language"] },
): Promise<void> {
  const config = (session.config ?? {}) as { persona?: InterviewerPersona; role?: string };

  try {
    await enforceRateLimit(userId);
    const verdict = await analyseAnswer({
      userId,
      sessionId: answer.sessionId,
      question: question.question,
      kind: question.kind,
      transcript: answer.transcript,
      persona: config.persona ?? "professional",
      role: config.role ?? session.promptSnapshot ?? "the role",
      language: session.language,
    });

    await db
      .update(interviewAnswers)
      .set({
        status: "scored",
        failureReason: null,
        scores: verdict.scores,
        overallScore: verdict.overallScore,
        feedback: verdict.feedback,
        strengths: verdict.strengths,
        improvements: verdict.improvements,
        idealAnswer: verdict.idealAnswer,
      })
      .where(eq(interviewAnswers.id, answer.id));
  } catch (error) {
    // One bad answer must not sink the other nine. Mark it and move on — the
    // report offers a retry, so nothing the candidate said is lost, only
    // delayed.
    const message = error instanceof AppError ? error.message : "Couldn't be scored.";
    await db
      .update(interviewAnswers)
      .set({ status: "failed", failureReason: message.slice(0, 300) })
      .where(eq(interviewAnswers.id, answer.id));
  }
}

/** Runs `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Scores every answer in the session that doesn't have a score yet.
 *
 * Called once, when the candidate reaches the end — not per question. Answers
 * are read by `overallScore IS NULL` rather than `status = 'pending'`: the two
 * should always agree, but a row a previous partial run marked `failed` still
 * has a null score and still deserves another attempt, and using the score as
 * the source of truth means a bug in status bookkeeping can never make the
 * report silently drop a real answer.
 *
 * Runs up to three calls concurrently. Sequential would mean a ten-question
 * interview waiting on ten calls back to back; unbounded parallelism would
 * throw ten requests at the rate limiter and the providers at once. Three is
 * comfortably inside both.
 */
export async function analyseSession(
  sessionId: string,
): Promise<Result<{ scored: number; failed: number }>> {
  try {
    const user = await requireUserApi();

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, user.id)))
      .limit(1);

    if (!session) throw new AppError("not_found", "That interview doesn't exist.");

    const rows = await db
      .select({
        id: interviewAnswers.id,
        questionId: interviewAnswers.questionId,
        transcript: interviewAnswers.transcript,
        overallScore: interviewAnswers.overallScore,
        attempt: interviewAnswers.attempt,
        question: interviewQuestions.question,
        kind: interviewQuestions.kind,
      })
      .from(interviewAnswers)
      .innerJoin(interviewQuestions, eq(interviewQuestions.id, interviewAnswers.questionId))
      .where(eq(interviewAnswers.sessionId, sessionId));

    // Latest attempt per question only. If the room ever produced more than
    // one saved attempt for the same question (a duplicate submit), the
    // earlier ones are superseded rather than double-billed for a model call.
    const latestPerQuestion = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const current = latestPerQuestion.get(row.questionId);
      if (!current || row.attempt > current.attempt) latestPerQuestion.set(row.questionId, row);
    }

    const pending = [...latestPerQuestion.values()].filter((row) => row.overallScore === null);

    await mapWithConcurrency(pending, 3, (row) =>
      scoreOneAnswer(
        user.id,
        { id: row.id, sessionId, questionId: row.questionId, transcript: row.transcript },
        { question: row.question, kind: row.kind },
        session,
      ),
    );

    const after = await db
      .select({ overallScore: interviewAnswers.overallScore, id: interviewAnswers.id })
      .from(interviewAnswers)
      .where(and(eq(interviewAnswers.sessionId, sessionId), inArray(interviewAnswers.id, pending.map((p) => p.id))));

    const scored = after.filter((row) => row.overallScore !== null).length;

    revalidatePath(`/interview/${sessionId}`);
    revalidatePath(`/interview/${sessionId}/report`);
    return { ok: true, data: { scored, failed: pending.length - scored } };
  } catch (error) {
    return fail(error, "analyseSession");
  }
}

/** Re-scores one answer that failed during the batch. The report's retry button. */
export async function rescoreAnswer(
  sessionId: string,
  questionId: string,
): Promise<Result<{ overallScore: number }>> {
  try {
    const user = await requireUserApi();

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, user.id)))
      .limit(1);

    if (!session) throw new AppError("not_found", "That interview doesn't exist.");

    const [row] = await db
      .select({
        id: interviewAnswers.id,
        transcript: interviewAnswers.transcript,
        attempt: interviewAnswers.attempt,
        question: interviewQuestions.question,
        kind: interviewQuestions.kind,
      })
      .from(interviewAnswers)
      .innerJoin(interviewQuestions, eq(interviewQuestions.id, interviewAnswers.questionId))
      .where(and(eq(interviewAnswers.sessionId, sessionId), eq(interviewAnswers.questionId, questionId)))
      .orderBy(desc(interviewAnswers.attempt))
      .limit(1);

    if (!row) throw new AppError("not_found", "No answer to rescore for that question.");

    await scoreOneAnswer(
      user.id,
      { id: row.id, sessionId, questionId, transcript: row.transcript },
      { question: row.question, kind: row.kind },
      session,
    );

    const [updated] = await db
      .select({ overallScore: interviewAnswers.overallScore })
      .from(interviewAnswers)
      .where(eq(interviewAnswers.id, row.id))
      .limit(1);

    if (!updated || updated.overallScore === null) {
      throw new AppError("provider_unavailable", "Still couldn't score that one. Try again shortly.");
    }

    revalidatePath(`/interview/${sessionId}/report`);
    return { ok: true, data: { overallScore: updated.overallScore } };
  } catch (error) {
    return fail(error, "rescoreAnswer");
  }
}

/**
 * Closes the interview: writes the aggregate, saves the session's camera
 * presence summary if tracking was on, records the day's practice.
 *
 * Requires `analyseSession` to have already run — this only reads scores, it
 * never generates them. Requires at least one *scored* answer, not merely one
 * saved answer: a session where every question failed to score has nothing
 * to show a report about, and completing it anyway would bury that failure
 * behind a report page with no numbers on it.
 */
export async function finishInterview(
  sessionId: string,
  presenceSummary?: PresenceSummary,
): Promise<Result<{ overall: number }>> {
  try {
    const user = await requireUserApi();

    const [session] = await db
      .select({ id: practiceSessions.id })
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, user.id)))
      .limit(1);

    if (!session) throw new AppError("not_found", "That interview doesn't exist.");

    const answers = await db
      .select({
        questionId: interviewAnswers.questionId,
        overallScore: interviewAnswers.overallScore,
      })
      .from(interviewAnswers)
      .where(eq(interviewAnswers.sessionId, session.id));

    // `overallScore` is `number | null` here — narrow before handing rows to
    // interview-scoring.ts, whose maths assumes every row it sees has a score.
    const scored = answers.filter(
      (row): row is { questionId: string; overallScore: number } => row.overallScore !== null,
    );

    if (scored.length === 0) {
      throw new AppError(
        "invalid_input",
        "None of your answers could be scored yet. Try again in a moment.",
      );
    }

    const overall = runningAverage(scored) ?? 0;

    await db
      .update(practiceSessions)
      .set({
        status: "completed",
        completedAt: new Date(),
        ...(presenceSummary ? { presenceSummary } : {}),
      })
      .where(eq(practiceSessions.id, session.id));

    await recordPractice(
      user.id,
      new Date().toLocaleDateString("en-CA"),
      tokensForScore(overall),
    );

    revalidatePath("/dashboard");
    revalidatePath(`/interview/${sessionId}/report`);
    return { ok: true, data: { overall } };
  } catch (error) {
    return fail(error, "finishInterview");
  }
}

/* ── Reads ──────────────────────────────────────────────────────────────── */

export async function getInterview(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
    .limit(1);

  if (!session) throw new AppError("not_found", "That interview doesn't exist.");

  const questions = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.sessionId, sessionId))
    .orderBy(asc(interviewQuestions.position));

  const answers = await db
    .select()
    .from(interviewAnswers)
    .where(eq(interviewAnswers.sessionId, sessionId))
    .orderBy(desc(interviewAnswers.attempt));

  return { session, questions, answers };
}
