"use server";

import { and, asc, desc, eq } from "drizzle-orm";
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
  });

  // No rate limit here any more: this function makes no model call. The limit
  // exists to cap AI spend, and charging a unit for writing one row would make
  // people hit the ceiling before the work that costs anything happens.
  const profile = await getProfile(user.id);
  const resume = profile?.resumeExtractedData;
  const written = profile?.skillsDescription;

  if (!resume && !written) {
    throw new AppError(
      "invalid_input",
      "Add a skills description or upload a resume first, so the questions are about you.",
    );
  }

  const role = input.role || resume?.recommendedRole || "a role in your field";
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

    const profile = await getProfile(user.id);
    const resume = profile?.resumeExtractedData;
    const written = profile?.skillsDescription;

    if (!resume && !written) {
      throw new AppError(
        "invalid_input",
        "Add a skills description or upload a resume first, so the questions are about you.",
      );
    }

    // Rebuilt here rather than carried through the session row: it is derived
    // from the profile, and a copy in the database would be a second source of
    // truth that goes stale the moment a resume is re-uploaded.
    const background = resume
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

    const config = session.config ?? {};
    await enforceRateLimit(user.id);

    const questions = await generateQuestions({
      userId: user.id,
      sessionId: session.id,
      persona: (config.persona ?? "professional") as InterviewerPersona,
      count: config.questionCount ?? 10,
      role: config.role ?? session.promptSnapshot ?? "a role in your field",
      background,
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

const AnswerInput = z.object({
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
 * Analyses a single answer immediately and returns the verdict plus the
 * running average, so the UI can show progress mid-interview rather than
 * banking everything until the end.
 */
export async function submitAnswer(
  raw: z.input<typeof AnswerInput>,
): Promise<
  Result<{
    overallScore: number;
    feedback: string;
    strengths: string[];
    improvements: string[];
    idealAnswer: string;
    runningAverage: number | null;
    attempt: number;
    delta: number | null;
  }>
> {
  try {
    const user = await requireUserApi();
    const input = AnswerInput.parse(raw);
    await enforceRateLimit(user.id);

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(
        and(eq(practiceSessions.id, input.sessionId), eq(practiceSessions.userId, user.id)),
      )
      .limit(1);

    if (!session) throw new AppError("not_found", "That interview doesn't exist.");

    const [question] = await db
      .select()
      .from(interviewQuestions)
      .where(
        and(
          eq(interviewQuestions.id, input.questionId),
          eq(interviewQuestions.sessionId, session.id),
        ),
      )
      .limit(1);

    if (!question) throw new AppError("not_found", "That question isn't part of this interview.");

    const config = session.config ?? {};

    const verdict = await analyseAnswer({
      userId: user.id,
      sessionId: session.id,
      question: question.question,
      kind: question.kind,
      transcript: input.transcript,
      persona: (config.persona ?? "professional") as InterviewerPersona,
      role: config.role ?? session.promptSnapshot ?? "the role",
      language: session.language,
    });

    // Attempts are append-only so the report can show a retry delta.
    const previous = await db
      .select({ attempt: interviewAnswers.attempt, overallScore: interviewAnswers.overallScore })
      .from(interviewAnswers)
      .where(eq(interviewAnswers.questionId, question.id))
      .orderBy(asc(interviewAnswers.attempt));

    const attempt = previous.length + 1;
    const firstScore = previous[0]?.overallScore ?? null;

    await db.insert(interviewAnswers).values({
      questionId: question.id,
      sessionId: session.id,
      attempt,
      transcript: input.transcript,
      inputMode: input.inputMode,
      scores: verdict.scores,
      overallScore: verdict.overallScore,
      feedback: verdict.feedback,
      strengths: verdict.strengths,
      improvements: verdict.improvements,
      idealAnswer: verdict.idealAnswer,
      durationSeconds: input.durationSeconds,
    });

    const all = await db
      .select({
        questionId: interviewAnswers.questionId,
        overallScore: interviewAnswers.overallScore,
      })
      .from(interviewAnswers)
      .where(eq(interviewAnswers.sessionId, session.id));

    revalidatePath(`/interview/${session.id}`);

    return {
      ok: true,
      data: {
        overallScore: verdict.overallScore,
        feedback: verdict.feedback,
        strengths: verdict.strengths,
        improvements: verdict.improvements,
        idealAnswer: verdict.idealAnswer,
        runningAverage: runningAverage(all),
        attempt,
        delta: firstScore === null ? null : verdict.overallScore - firstScore,
      },
    };
  } catch (error) {
    return fail(error, "submitAnswer");
  }
}

/** Closes the interview and writes the aggregate. */
export async function finishInterview(sessionId: string): Promise<Result<{ overall: number }>> {
  try {
    const user = await requireUserApi();

    const [session] = await db
      .select()
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

    if (answers.length === 0) {
      throw new AppError("invalid_input", "Answer at least one question before finishing.");
    }

    const overall = runningAverage(answers) ?? 0;

    await db
      .update(practiceSessions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(practiceSessions.id, session.id));

    await recordPractice(
      user.id,
      new Date().toLocaleDateString("en-CA"),
      tokensForScore(overall),
    );

    revalidatePath("/dashboard");
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
