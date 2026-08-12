"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Keyboard, Mic, RotateCcw, Square, Volume2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Surface } from "@/components/ui/surface";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { useVoiceSession } from "@/lib/useVoiceSession";
import { PERSONA_LABELS, type InterviewerPersona, type QuestionKind } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { finishInterview, submitAnswer } from "@/app/interview/actions";

interface Question {
  id: string;
  position: number;
  question: string;
  kind: QuestionKind;
  answeredScore: number | null;
}

type Verdict = Awaited<ReturnType<typeof submitAnswer>>;
type Phase = "asking" | "answering" | "scoring" | "verdict" | "failed";

function playChime(frequency = 880, durationMs = 120) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    osc.onended = () => ctx.close();
  } catch {
    /* AudioContext fallback */
  }
}

export function InterviewRoom({
  sessionId,
  role,
  persona,
  questions,
  language = "en",
}: {
  sessionId: string;
  role: string;
  persona: InterviewerPersona;
  questions: Question[];
  language?: string;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const firstUnanswered = Math.max(
    0,
    questions.findIndex((q) => q.answeredScore === null),
  );
  const [index, setIndex] = useState(firstUnanswered === -1 ? 0 : firstUnanswered);
  const [phase, setPhase] = useState<Phase>("asking");
  const [verdict, setVerdict] = useState<Extract<Verdict, { ok: true }>["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [typedMode, setTypedMode] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      questions.filter((q) => q.answeredScore !== null).map((q) => [q.id, q.answeredScore!]),
    ),
  );
  const [average, setAverage] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);

  const question = questions[index];
  const answeredCount = Object.keys(scores).length;
  const startedAtRef = useRef(0);

  const voiceSession = useVoiceSession({
    sessionId,
    mode: "interview",
    persona,
    topic: role,
    language: language as "en" | "hinglish" | "hi",
    autoSave: true,
  });

  // Timer while answering
  useEffect(() => {
    if (phase !== "answering") return;
    const id = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Read question aloud on display
  useEffect(() => {
    if (phase === "asking" && question && !typedMode) {
      const timer = setTimeout(() => {
        playChime(660, 100);
        voiceSession.speakResponse(question.question, "interviewer");
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [phase, question?.id, typedMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async () => {
    const text = (typedMode ? voiceSession.speech.typed : voiceSession.transcript).trim();
    if (!text) {
      setError("We didn't catch an answer. Try again, or type it instead.");
      setPhase("failed");
      return;
    }

    voiceSession.stopSession();
    setPhase("scoring");
    setError(null);

    const seconds = startedAtRef.current
      ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      : Math.max(1, elapsed);

    const result = await submitAnswer({
      sessionId,
      questionId: question.id,
      transcript: text,
      durationSeconds: seconds,
      inputMode: typedMode ? "typed" : "speech",
    });

    if (!result.ok) {
      setError(result.error.message);
      setPhase("failed");
      return;
    }

    setVerdict(result.data);
    setScores((prev) => ({
      ...prev,
      [question.id]: Math.max(prev[question.id] ?? 0, result.data.overallScore),
    }));
    setAverage(result.data.runningAverage);
    setPhase("verdict");

    if (!typedMode) {
      playChime(440, 150);
      voiceSession.speakResponse(result.data.feedback, "interviewer");
    }
  }, [elapsed, question?.id, sessionId, typedMode, voiceSession]);

  function beginAnswering() {
    voiceSession.speech.reset();
    setElapsed(0);
    startedAtRef.current = Date.now();
    setPhase("answering");
    void voiceSession.startSession();
  }

  function goNext() {
    if (index < questions.length - 1) {
      voiceSession.stopSession();
      setIndex(index + 1);
      voiceSession.speech.reset();
      setVerdict(null);
      setElapsed(0);
      startedAtRef.current = 0;
      setPhase("asking");
    }
  }

  async function complete() {
    voiceSession.stopSession();
    setFinishing(true);
    const result = await finishInterview(sessionId);
    if (result.ok) {
      router.push(`/interview/${sessionId}/report`);
    } else {
      setFinishing(false);
      setError(result.error.message);
      setPhase("failed");
    }
  }

  const allAnswered = answeredCount >= questions.length;

  return (
    <div className="mx-auto max-w-3xl px-5 pt-24 pb-24 sm:px-6">
      {/* Rail: position, persona, running average */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="t-micro">
          {PERSONA_LABELS[persona]}
          <span className="mx-3 text-ink-4">/</span>
          <span className="text-ink-2">{role}</span>
        </p>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-medium">
            <Sparkles className="size-3.5" />
            <span>Structured Interview Flow</span>
          </span>

          <p className="t-micro">
            {answeredCount} of {questions.length} answered
            {average !== null && (
              <>
                <span className="mx-3 text-ink-4">/</span>
                <span className="text-accent">avg {average}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-5 flex gap-1.5" aria-hidden>
        {questions.map((q, i) => (
          <span
            key={q.id}
            className="h-0.5 flex-1 rounded-full transition-colors duration-500"
            style={{
              background:
                scores[q.id] !== undefined
                  ? "var(--color-accent)"
                  : i === index
                    ? "var(--color-ink-4)"
                    : "var(--color-line)",
            }}
          />
        ))}
      </div>

      {/* Question Header */}
      <motion.div
        key={question.id}
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.5 }}
        className="mt-12"
      >
        <div className="flex items-center gap-3 mb-5">
          <p className="t-micro">
            Question {index + 1}
            <span className="mx-3 text-ink-4">/</span>
            <span className="text-ink-2">{question.kind}</span>
          </p>
          <button
            type="button"
            className="pressable text-ink-4 hover:text-ink-2"
            onClick={() => voiceSession.speakResponse(question.question, "interviewer")}
            aria-label="Read question aloud"
          >
            <Volume2 className="size-3.5" />
          </button>
        </div>
        <h1 className="t-title max-w-2xl">{question.question}</h1>
      </motion.div>

      {/* Body */}
      <div className="mt-10">
        {phase === "asking" && (
          <div className="flex flex-wrap items-center gap-5">
            <Button
              variant="primary"
              size="lg"
              icon={<Mic className="size-4.5" />}
              onClick={beginAnswering}
            >
              Answer this
            </Button>
            {scores[question.id] !== undefined && (
              <p className="t-meta text-ink-4">
                Already answered — scored {scores[question.id]}. Answering again keeps the better one.
              </p>
            )}
          </div>
        )}

        {phase === "answering" && (
          <div>
            <div className="flex items-center justify-between gap-6 mb-6">
              <span className="t-numeric text-[34px] leading-none">{formatDuration(elapsed)}</span>
              <Button
                variant="glass"
                icon={<Square className="size-3.5 fill-current" />}
                onClick={() => void send()}
              >
                Done answering
              </Button>
            </div>

            {!typedMode ? (
              <VoiceVisualizer
                status={voiceSession.status}
                audioLevel={voiceSession.audioLevel}
                transcript={voiceSession.transcript}
                isMicActive={voiceSession.isMicActive}
                isSpeaking={voiceSession.isSpeaking}
                counterpartName={PERSONA_LABELS[persona]}
                onInterrupt={voiceSession.interrupt}
                onStop={() => void send()}
              />
            ) : (
              <div className="mt-8">
                <textarea
                  value={voiceSession.speech.typed}
                  onChange={(e) => voiceSession.speech.setTyped(e.target.value)}
                  rows={8}
                  placeholder="Type your answer..."
                  className="t-lead w-full resize-y rounded-[var(--radius-md)] border border-line bg-black/25 p-6 text-ink outline-none placeholder:text-ink-4 focus:border-accent"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setTypedMode((v) => !v)}
              className="pressable mt-6 inline-flex items-center gap-2 text-[13px] text-ink-4 hover:text-ink-2"
            >
              <Keyboard className="size-3.5" />
              {typedMode ? "Use microphone" : "Type answer instead"}
            </button>

            {voiceSession.errorMessage && (
              <p className="t-meta mt-5 text-ink-2">{voiceSession.errorMessage}</p>
            )}
          </div>
        )}

        {phase === "scoring" && (
          <LoadingState
            title="Reading that answer"
            detail="Checking substance, clarity, relevance and structure."
          />
        )}

        {phase === "failed" && (
          <ErrorState
            message={error ?? "Something went wrong."}
            onRetry={() => void send()}
            retryLabel="Try scoring again"
          />
        )}

        {phase === "verdict" && verdict && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
          >
            <Surface material="dense" radius="lg" refract className="p-7 sm:p-9">
              <div className="flex items-start justify-between gap-6">
                <p className="t-lead max-w-lg text-ink">{verdict.feedback}</p>
                <div className="shrink-0 text-right">
                  <p className="t-numeric text-[40px] leading-none">{verdict.overallScore}</p>
                  {verdict.delta !== null && (
                    <p
                      className="t-micro mt-2"
                      style={{
                        color:
                          verdict.delta > 0
                            ? "var(--color-positive)"
                            : verdict.delta < 0
                              ? "var(--color-caution)"
                              : undefined,
                      }}
                    >
                      {verdict.delta > 0 ? "+" : ""}
                      {verdict.delta} vs first
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-8 grid gap-8 sm:grid-cols-2">
                <Notes title="Worked" items={verdict.strengths} accent="var(--color-positive)" />
                <Notes title="Fix" items={verdict.improvements} accent="var(--color-caution)" />
              </div>
            </Surface>

            <details className="group mt-4">
              <summary className="t-micro cursor-pointer list-none py-3 transition-colors hover:text-ink-2">
                Show a strong answer to this question
              </summary>
              <Surface material="liquid" radius="md" className="mt-2 p-6">
                <p className="t-lead text-[16px] leading-[1.8] text-ink-2">{verdict.idealAnswer}</p>
              </Surface>
            </details>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="glass" icon={<RotateCcw className="size-4" />} onClick={beginAnswering}>
                Retry this answer
              </Button>

              {index < questions.length - 1 ? (
                <Button
                  variant="primary"
                  icon={<ArrowRight className="size-4" />}
                  onClick={goNext}
                >
                  Next question
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={<Check className="size-4" />}
                  loading={finishing}
                  onClick={() => void complete()}
                >
                  Finish and see report
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {answeredCount > 0 && phase !== "scoring" && !allAnswered && (
        <div className="mt-16 border-t border-line pt-8">
          <button
            type="button"
            onClick={() => void complete()}
            disabled={finishing}
            className="pressable t-meta text-ink-4 hover:text-ink-2 disabled:opacity-40"
          >
            End here and see the report on what I&apos;ve answered
          </button>
        </div>
      )}
    </div>
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
