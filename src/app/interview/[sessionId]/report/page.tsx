import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EvaluationMetric, ScoreDisplay } from "@/components/ui/score";
import { Surface } from "@/components/ui/surface";
import { PresenceSummaryCard } from "@/components/presence-summary-card";
import { RescoreButton } from "@/components/rescore-button";
import { aggregateScores, runningAverage } from "@/lib/interview-scoring";
import { requireUser } from "@/lib/session";
import {
  ANSWER_DIMENSIONS,
  ANSWER_HINTS,
  ANSWER_LABELS,
  PERSONA_LABELS,
  type InterviewerPersona,
} from "@/lib/types";
import { getInterview } from "../../actions";

export const metadata: Metadata = { title: "Interview report" };

const DIFFICULTY_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

export default async function InterviewReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser(`/interview/${sessionId}/report`);

  let sessionResult;
  try {
    sessionResult = await getInterview(sessionId, user.id);
  } catch {
    sessionResult = null;
  }

  if (!sessionResult) {
    return (
      <div className="mx-auto max-w-xl px-5 pt-32 pb-24 text-center">
        <Surface material="dense" radius="lg" refract className="p-8 sm:p-10">
          <h1 className="t-title text-2xl">Interview Report Unavailable</h1>
          <p className="t-lead mt-3 text-ink-3">
            We couldn&apos;t load the interview report for ID <code className="text-accent text-xs font-mono px-2 py-1 rounded bg-accent/10">{sessionId}</code>.
            It may belong to a different account, or hasn&apos;t been completed.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/interview">
              <Button variant="primary" size="lg">
                Start New Interview
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="glass" size="lg">
                Dashboard
              </Button>
            </Link>
          </div>
        </Surface>
      </div>
    );
  }

  const { session, questions, answers } = sessionResult;
  if (answers.length === 0) redirect(`/interview/${sessionId}`);

  // Scoring runs once, in a batch, after the interview ends (D79) — which
  // means an answer can exist here without a score yet, or with one that
  // failed. Every calculation below that assumes a number narrows to this
  // subset first, so a still-pending row can never become `NaN` on the page
  // instead of the honest "not scored yet" state further down.
  const scored = answers.filter(
    (a): a is typeof a & { overallScore: number; scores: NonNullable<typeof a.scores>; feedback: string } =>
      a.overallScore !== null && a.scores !== null,
  );

  const overall = runningAverage(scored) ?? 0;
  const dimensions = aggregateScores(scored);
  const persona = (session.config?.persona ?? "professional") as InterviewerPersona;

  // Best scored attempt per question, plus the first, so we can show a retry
  // delta. Only scored attempts compete for "best" — an unscored retry isn't
  // comparable to one that already has a number.
  const byQuestion = new Map<string, { best: (typeof scored)[number]; first: (typeof scored)[number] }>();
  for (const answer of [...scored].sort((a, b) => a.attempt - b.attempt)) {
    const entry = byQuestion.get(answer.questionId);
    if (!entry) byQuestion.set(answer.questionId, { best: answer, first: answer });
    else if (answer.overallScore > entry.best.overallScore) entry.best = answer;
  }

  // Any question with a saved transcript but no entry in byQuestion means
  // every attempt at it is still pending or failed — the one place on this
  // page that isn't a number, and the one place with a retry button instead
  // of a score.
  const unscoredQuestions = questions.filter(
    (q) => answers.some((a) => a.questionId === q.id) && !byQuestion.has(q.id),
  );

  const answeredQuestions = questions.filter((q) => byQuestion.has(q.id));

  // Counted from the questions actually answered, not from what was requested
  // at setup — the honest version of "we tested you on what you picked" is the
  // one that reflects the round you finished, including the one you walked out
  // of halfway through.
  const focusCounts = new Map<string, number>();
  for (const question of answeredQuestions) {
    if (question.focusArea) {
      focusCounts.set(question.focusArea, (focusCounts.get(question.focusArea) ?? 0) + 1);
    }
  }
  const focusAreas = [...focusCounts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count);

  const strongest = [...byQuestion.values()].sort((a, b) => b.best.overallScore - a.best.overallScore)[0];
  const weakest = [...byQuestion.values()].sort((a, b) => a.best.overallScore - b.best.overallScore)[0];

  return (
    <div className="mx-auto max-w-3xl px-5 pt-24 pb-28 sm:px-6">
      {/* Verdict */}
      <header className="rise text-center">
        <p className="t-micro mb-8">
          {PERSONA_LABELS[persona]}
          <span className="mx-3 text-ink-4">/</span>
          <span className="text-ink-2">{session.config?.role ?? session.promptSnapshot}</span>
        </p>
        <ScoreDisplay value={overall} />
        <p className="t-lead mx-auto mt-8 max-w-lg text-ink">
          {answeredQuestions.length} of {questions.length} questions scored.{" "}
          {overall >= 75
            ? "That would have been a solid round."
            : overall >= 55
              ? "Competent, with clear places to sharpen."
              : "Plenty to work on — which is the point of practising."}
        </p>

        {focusAreas.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <span className="t-micro mr-1">Tested on</span>
            {focusAreas.map(({ area, count }) => (
              <span
                key={area}
                className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[12px] font-medium text-accent"
              >
                {area}
                <span className="ml-1.5 text-accent/60">×{count}</span>
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="rule mt-14" />

      {/* Dimensions */}
      <section className="rise mt-14 [animation-delay:80ms]">
        <p className="t-micro mb-2">Across every answer</p>
        <div className="divide-y divide-line/70">
          {ANSWER_DIMENSIONS.map((dimension, index) => (
            <EvaluationMetric
              key={dimension}
              label={ANSWER_LABELS[dimension]}
              hint={ANSWER_HINTS[dimension]}
              value={dimensions[dimension]}
              delay={index * 70}
            />
          ))}
        </div>
        <p className="t-meta mt-6 max-w-xl text-ink-4">
          Relevance and substance are weighted highest: a fluent answer to a question nobody asked
          is the most common way a real round goes badly. Where you retried, only your best attempt
          counts.
        </p>
      </section>

      {/* Highs and lows */}
      {strongest && weakest && strongest.best.id !== weakest.best.id && (
        <section className="rise mt-16 grid gap-4 sm:grid-cols-2 [animation-delay:120ms]">
          <Highlight
            eyebrow="Strongest answer"
            score={strongest.best.overallScore}
            question={questions.find((q) => q.id === strongest.best.questionId)?.question ?? ""}
            note={strongest.best.feedback}
          />
          <Highlight
            eyebrow="Weakest answer"
            score={weakest.best.overallScore}
            question={questions.find((q) => q.id === weakest.best.questionId)?.question ?? ""}
            note={weakest.best.feedback}
          />
        </section>
      )}

      {session.presenceSummary && (
        <section className="rise mt-16 [animation-delay:140ms]">
          <PresenceSummaryCard summary={session.presenceSummary} />
        </section>
      )}

      {/* Anything the batch couldn't score */}
      {unscoredQuestions.length > 0 && (
        <section className="rise mt-16 [animation-delay:150ms]">
          <p className="t-micro mb-2">Couldn&apos;t be scored yet</p>
          <div className="divide-y divide-line/70 border-t border-line">
            {unscoredQuestions.map((question) => {
              const latestAttempt = answers
                .filter((a) => a.questionId === question.id)
                .sort((a, b) => b.attempt - a.attempt)[0];
              return (
                <div key={question.id} className="space-y-4 py-6">
                  <p className="t-body text-ink-2">{question.question}</p>
                  {latestAttempt?.failureReason && (
                    <p className="t-meta text-ink-4">{latestAttempt.failureReason}</p>
                  )}
                  <RescoreButton sessionId={sessionId} questionId={question.id} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Question by question */}
      <section className="rise mt-16 [animation-delay:160ms]">
        <p className="t-micro mb-2">Question by question</p>
        <div className="divide-y divide-line/70 border-t border-line">
          {answeredQuestions.map((question) => {
            const entry = byQuestion.get(question.id)!;
            const delta =
              entry.best.attempt > 1 ? entry.best.overallScore - entry.first.overallScore : null;

            return (
              <details key={question.id} className="group py-6">
                <summary className="flex cursor-pointer list-none items-baseline gap-6">
                  <span className="t-numeric w-10 shrink-0 text-[20px] text-ink">
                    {entry.best.overallScore}
                  </span>
                  <span className="t-body flex-1 text-ink-2 transition-colors group-hover:text-ink">
                    {question.question}
                    <span className="ml-3 inline-block whitespace-nowrap rounded-full border border-line px-2.5 py-0.5 align-middle text-[12px] text-ink-4">
                      {DIFFICULTY_LABEL[question.difficulty]}
                    </span>
                    {question.focusArea && (
                      <span className="ml-2 inline-block whitespace-nowrap rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 align-middle text-[12px] font-medium text-accent">
                        {question.focusArea}
                      </span>
                    )}
                  </span>
                  {delta !== null && delta !== 0 && (
                    <span
                      className="t-micro shrink-0"
                      style={{
                        color: delta > 0 ? "var(--color-positive)" : "var(--color-caution)",
                      }}
                    >
                      {delta > 0 ? "+" : ""}
                      {delta}
                    </span>
                  )}
                </summary>

                <div className="mt-5 space-y-5 pl-16">
                  <p className="t-body text-ink-2">{entry.best.feedback}</p>

                  {(entry.best.strengths.length > 0 || entry.best.improvements.length > 0) && (
                    <div className="grid gap-5 sm:grid-cols-2">
                      {entry.best.strengths.length > 0 && (
                        <Notes title="Worked" items={entry.best.strengths} accent="var(--color-positive)" />
                      )}
                      {entry.best.improvements.length > 0 && (
                        <Notes title="Fix" items={entry.best.improvements} accent="var(--color-caution)" />
                      )}
                    </div>
                  )}

                  <div>
                    <p className="t-micro mb-3">What you said</p>
                    <p className="t-body text-ink-3">{entry.best.transcript}</p>
                  </div>

                  {entry.best.idealAnswer && (
                    <Surface material="liquid" radius="md" className="p-5">
                      <p className="t-micro mb-3">A strong answer</p>
                      <p className="t-body text-ink-2">{entry.best.idealAnswer}</p>
                    </Surface>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <div className="mt-20 flex flex-wrap justify-center gap-3 border-t border-line pt-12">
        <Link href="/interview">
          <Button variant="primary" size="lg">
            Run another round
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="glass" size="lg">
            Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Highlight({
  eyebrow,
  score,
  question,
  note,
}: {
  eyebrow: string;
  score: number;
  question: string;
  note: string;
}) {
  return (
    <Surface material="liquid" radius="md" className="p-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="t-micro">{eyebrow}</p>
        <p className="t-numeric text-[22px]">{score}</p>
      </div>
      <p className="t-body mt-4 text-ink">{question}</p>
      <p className="t-meta mt-3">{note}</p>
    </Surface>
  );
}

function Notes({ title, items, accent }: { title: string; items: string[]; accent: string }) {
  return (
    <div>
      <p className="t-micro mb-4">{title}</p>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-2.5 h-px w-4 shrink-0" style={{ background: accent }} aria-hidden />
            <p className="t-body text-ink-2">{item}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
