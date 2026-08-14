"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Keyboard, Mic, RotateCcw, Square, Volume2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Surface } from "@/components/ui/surface";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { PresenceMonitor } from "@/components/presence-monitor";
import { usePresence } from "@/lib/usePresence";
import { useVoiceSession } from "@/lib/useVoiceSession";
import {
  MAX_ANSWER_SECONDS,
  PERSONA_LABELS,
  type InterviewerPersona,
  type QuestionKind,
} from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { finishInterview, submitAnswer } from "@/app/interview/actions";

/**
 * A pause this long ends your answer.
 *
 * Longer than the discussion room's 1.1s on purpose: thinking mid-answer is
 * normal in an interview and must not hand the floor back. Chrome finalises a
 * result about a second after you stop, so the felt pause is nearer three
 * seconds — which is what a real interviewer waits before speaking.
 */
const ANSWER_SILENCE_MS = 2400;

/** Below this the model refuses to judge, so submitting would only waste a call. */
const MIN_ANSWER_WORDS = 10;

/** Warn from here, so the cut-off is never a surprise. */
const WARN_FROM_SECONDS = MAX_ANSWER_SECONDS - 60;

interface Question {
  id: string;
  position: number;
  question: string;
  kind: QuestionKind;
  /** The technology this question tests, when the candidate asked for one. */
  focusArea: string | null;
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
  const [hint, setHint] = useState<string | null>(null);

  const question = questions[index];
  const answeredCount = Object.keys(scores).length;
  const startedAtRef = useRef(0);

  // The room hands the turn over on a pause, which means the callback fires
  // from inside the voice session. `sendTurn` resets the recogniser before it
  // calls back, so the spoken text has to travel as an argument — reading the
  // transcript again here would find it already cleared.
  const sendRef = useRef<(spokenText?: string) => void>(() => {});

  // Opt-in and off by default. It costs a camera permission and a megabyte of
  // model, and plenty of people practise somewhere they would rather not be
  // filmed — so it is offered, never assumed.
  const presence = usePresence();
  // Pulled out because `presence` is a fresh object each render while its
  // callbacks are stable — putting the object in the dependency array below
  // would rebuild `send` on every render and memoise nothing.
  const { endRecording: endPresenceRecording } = presence;

  const voiceSession = useVoiceSession({
    sessionId,
    mode: "interview",
    persona,
    topic: role,
    language: language as "en" | "hinglish" | "hi",
    autoSave: true,
    silenceMs: ANSWER_SILENCE_MS,
    // Typing is a deliberate act with its own submit; only spoken answers end
    // themselves.
    autoSend: !typedMode,
    onTurnComplete: (_speaker, text) => sendRef.current(text),
  });

  // Timer while answering, with the hard cap enforced here as well as on the
  // server. The server clamp protects the bill; this protects the candidate
  // from discovering ten minutes later that nothing was listening.
  useEffect(() => {
    if (phase !== "answering") return;
    const id = setInterval(() => {
      setElapsed((value) => {
        const next = value + 1;
        if (next >= MAX_ANSWER_SECONDS) sendRef.current();
        return next;
      });
    }, 1000);
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

  const send = useCallback(
    async (spokenText?: string) => {
      const text = (
        spokenText ??
        (typedMode ? voiceSession.speech.typed : voiceSession.transcript)
      ).trim();

      const words = text.split(/\s+/).filter(Boolean).length;

      // Too little to judge. Don't burn a model call and don't drop the user
      // into an error screen for clearing their throat — reopen the mic and
      // say what's missing.
      if (words < MIN_ANSWER_WORDS) {
        if (typedMode) {
          setHint("That's too short to score. Give it a couple more sentences.");
          return;
        }
        setHint(
          text
            ? "That was too short to score — keep going, we're still listening."
            : "Nothing came through yet. Start talking whenever you're ready.",
        );
        voiceSession.resumeListening();
        return;
      }

      voiceSession.stopSession();
      endPresenceRecording();
      setHint(null);
      setPhase("scoring");
      setError(null);

      const seconds = startedAtRef.current
        ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
        : Math.max(1, elapsed);

      const result = await submitAnswer({
        sessionId,
        questionId: question.id,
        transcript: text,
        durationSeconds: Math.min(seconds, MAX_ANSWER_SECONDS),
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
    },
    [elapsed, question?.id, sessionId, typedMode, voiceSession, endPresenceRecording],
  );

  // The voice session calls back through this ref, so it always reaches the
  // current closure rather than the one captured when the session started.
  sendRef.current = (spokenText?: string) => void send(spokenText);

  function beginAnswering() {
    voiceSession.speech.reset();
    setElapsed(0);
    setHint(null);
    setError(null);
    startedAtRef.current = Date.now();
    setPhase("answering");
    presence.beginRecording();
    void voiceSession.startSession();
  }

  function goNext() {
    if (index < questions.length - 1) {
      voiceSession.stopSession();
      setIndex(index + 1);
      voiceSession.speech.reset();
      setVerdict(null);
      setElapsed(0);
      setHint(null);
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
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <p className="t-micro">
            Question {index + 1}
            <span className="mx-3 text-ink-4">/</span>
            <span className="text-ink-2">{question.kind}</span>
          </p>
          {question.focusArea && (
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[12px] font-medium text-accent">
              {question.focusArea}
            </span>
          )}
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
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-6">
              <span className="t-numeric text-[34px] leading-none">{formatDuration(elapsed)}</span>
              <p className="t-meta text-ink-4">
                {elapsed >= WARN_FROM_SECONDS ? (
                  <span style={{ color: "var(--color-caution)" }}>
                    Wrapping up in {formatDuration(MAX_ANSWER_SECONDS - elapsed)} — finish your point.
                  </span>
                ) : typedMode ? (
                  "Submit when you're done."
                ) : (
                  "Just stop talking when you're finished. Pausing hands it over."
                )}
              </p>
            </div>

            {!typedMode ? (
              /* No stop control. The whole point is that you answer and stop,
                 the way you would to a person — a "done answering" button
                 turns every pause into a decision about whether to reach for
                 the mouse. The manual submit below appears only if the
                 recogniser can't run, which is the one case where stopping
                 cannot be detected. */
              <VoiceVisualizer
                status={voiceSession.status}
                audioLevel={voiceSession.audioLevel}
                transcript={voiceSession.transcript}
                isMicActive={voiceSession.isMicActive}
                isSpeaking={voiceSession.isSpeaking}
                counterpartName={PERSONA_LABELS[persona]}
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
                <div className="mt-5">
                  <Button
                    variant="primary"
                    icon={<Square className="size-3.5 fill-current" />}
                    onClick={() => void send()}
                  >
                    Submit answer
                  </Button>
                </div>
              </div>
            )}

            {!typedMode && !voiceSession.canAutoSend && (
              <div className="mt-6">
                <p className="t-meta mb-3 text-ink-2">
                  Your browser can&apos;t hand the turn over on its own, so send it manually.
                </p>
                <Button
                  variant="glass"
                  icon={<Square className="size-3.5 fill-current" />}
                  onClick={() => void send()}
                >
                  Done answering
                </Button>
              </div>
            )}

            {hint && <p className="t-meta mt-5 text-ink-2">{hint}</p>}

            {!typedMode && (
              <div className="mt-6">
                <PresenceMonitor
                  videoRef={presence.videoRef}
                  status={presence.status}
                  live={presence.live}
                  summary={null}
                  onStart={() => {
                    void (async () => {
                      await presence.start();
                      presence.beginRecording();
                    })();
                  }}
                  onStop={presence.stop}
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

            {presence.summary && presence.summary.samples > 0 && (
              <div className="mt-4">
                <PresenceMonitor
                  videoRef={presence.videoRef}
                  status={presence.status}
                  live={presence.live}
                  summary={presence.summary}
                  onStart={() => void presence.start()}
                  onStop={presence.stop}
                />
              </div>
            )}

            {/* The model answer is deliberately withheld until the report.
                Reading a perfect answer to question 3 and then answering
                question 4 is how you end up practising recall instead of
                thinking — you unconsciously reach for the phrasing you just
                read. It's all waiting at the end, question by question, where
                comparing it to what you actually said is the point. */}
            <p className="t-meta mt-4 text-ink-4">
              A model answer to this one is saved for the report at the end.
            </p>

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
