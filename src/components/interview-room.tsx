"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Keyboard, Mic, RotateCcw, Square, Volume2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { PresenceMonitor } from "@/components/presence-monitor";
import { usePresence } from "@/lib/usePresence";
import { useVoiceSession } from "@/lib/useVoiceSession";
import {
  MAX_ANSWER_SECONDS,
  PERSONA_LABELS,
  type Difficulty,
  type InterviewerPersona,
  type QuestionKind,
} from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { analyseSession, finishInterview, submitTranscript } from "@/app/interview/actions";

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

/** How long the "Saved" beat holds before auto-advancing to the next question. */
const SAVED_PAUSE_MS = 700;

interface Question {
  id: string;
  position: number;
  question: string;
  kind: QuestionKind;
  difficulty: Difficulty;
  /** The technology this question tests, when the candidate asked for one. */
  focusArea: string | null;
  /** Has any transcript been saved for this question, regardless of score. */
  answered: boolean;
}

type Phase = "asking" | "answering" | "saved" | "analyzing" | "failed";

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

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
    questions.findIndex((q) => !q.answered),
  );
  const allAnsweredOnLoad = firstUnanswered === -1;
  const [index, setIndex] = useState(allAnsweredOnLoad ? questions.length - 1 : firstUnanswered);
  const [phase, setPhase] = useState<Phase>("asking");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [typedMode, setTypedMode] = useState(false);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(
    () => new Set(questions.filter((q) => q.answered).map((q) => q.id)),
  );
  const [finishing, setFinishing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const question = questions[index];
  const answeredCount = answeredIds.size;
  const allAnswered = answeredCount >= questions.length;
  const startedAtRef = useRef(0);

  // The room hands the turn over on a pause, which means the callback fires
  // from inside the voice session. `sendTurn` resets the recogniser before it
  // calls back, so the spoken text has to travel as an argument — reading the
  // transcript again here would find it already cleared.
  const sendRef = useRef<(spokenText?: string) => void>(() => {});

  // Opt-in and off by default. Tracks the WHOLE interview as one continuous
  // recording rather than restarting per question — both because a candidate
  // shouldn't have to re-grant camera access every answer, and because
  // restarting the underlying <video> element each question was the actual
  // bug behind "the camera stops working": see the always-mounted monitor
  // below.
  const presence = usePresence();
  const presenceStartedRef = useRef(false);
  const { status: presenceStatus, start: startPresence, beginRecording: beginPresenceRecording, endRecording: endPresenceRecording } = presence;

  // Recording begins the moment tracking actually begins, not when the
  // candidate happens to click "Answer this" — those are two different
  // events and gating on the second is racy against the first, which is
  // async (camera permission, then the face model, then the stream). One
  // continuous recording from here to `finishAndAnalyze`'s endRecording.
  useEffect(() => {
    if (presenceStatus === "tracking" && !presenceStartedRef.current) {
      presenceStartedRef.current = true;
      beginPresenceRecording();
    }
  }, [presenceStatus, beginPresenceRecording]);

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

  /**
   * Runs the analysis + completion pair once every question has a saved
   * transcript. Split into two server calls (score everything, then close
   * out) rather than one, so a failure after scoring nine of ten answers
   * still leaves those nine scored — retrying re-enters at `analyseSession`,
   * which only touches what's still unscored, not from zero.
   */
  const finishAndAnalyze = useCallback(async () => {
    setPhase("analyzing");
    setError(null);

    const presenceSummary = endPresenceRecording() ?? undefined;

    const scoring = await analyseSession(sessionId);
    if (!scoring.ok) {
      setError(scoring.error.message);
      setPhase("failed");
      return;
    }

    const result = await finishInterview(sessionId, presenceSummary);
    if (!result.ok) {
      setError(result.error.message);
      setPhase("failed");
      return;
    }

    router.push(`/interview/${sessionId}/report`);
  }, [sessionId, router, endPresenceRecording]);

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
      setHint(null);
      setError(null);

      const seconds = startedAtRef.current
        ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
        : Math.max(1, elapsed);

      // Fast: no model call happens here. See submitTranscript.
      const result = await submitTranscript({
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

      const nextAnsweredIds = new Set(answeredIds);
      nextAnsweredIds.add(question.id);
      setAnsweredIds(nextAnsweredIds);
      setPhase("saved");

      const isLastUnanswered = nextAnsweredIds.size >= questions.length;

      window.setTimeout(() => {
        if (isLastUnanswered) {
          void finishAndAnalyze();
          return;
        }
        // Advance to the next question the candidate hasn't answered yet,
        // rather than always index+1 — someone who used "End here" earlier in
        // the list and came back can still be filling gaps out of order.
        const next = questions.findIndex((q) => !nextAnsweredIds.has(q.id));
        setIndex(next === -1 ? index : next);
        voiceSession.speech.reset();
        setElapsed(0);
        startedAtRef.current = 0;
        setPhase("asking");
      }, SAVED_PAUSE_MS);
    },
    [elapsed, question?.id, sessionId, typedMode, voiceSession, answeredIds, questions, index, finishAndAnalyze],
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
    void voiceSession.startSession();
  }

  async function endHere() {
    voiceSession.stopSession();
    setFinishing(true);
    await finishAndAnalyze();
    setFinishing(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-24 pb-24 sm:px-6">
      {/* Rail: position, persona */}
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

          <p className="t-micro">{answeredCount} of {questions.length} answered</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-5 flex gap-1.5" aria-hidden>
        {questions.map((q, i) => (
          <span
            key={q.id}
            className="h-0.5 flex-1 rounded-full transition-colors duration-500"
            style={{
              background: answeredIds.has(q.id)
                ? "var(--color-accent)"
                : i === index
                  ? "var(--color-ink-4)"
                  : "var(--color-line)",
            }}
          />
        ))}
      </div>

      {phase !== "analyzing" && phase !== "failed" && question && (
        <>
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
              <span
                className="rounded-full border px-2.5 py-0.5 text-[12px] font-medium"
                style={{
                  borderColor:
                    question.difficulty === "hard"
                      ? "color-mix(in oklch, var(--color-caution) 40%, transparent)"
                      : "var(--color-line)",
                  background:
                    question.difficulty === "hard"
                      ? "color-mix(in oklch, var(--color-caution) 12%, transparent)"
                      : "transparent",
                  color: question.difficulty === "hard" ? "var(--color-caution)" : "var(--color-ink-3)",
                }}
              >
                {DIFFICULTY_LABEL[question.difficulty]}
              </span>
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
                  /* No stop control. The whole point is that you answer and
                     stop, the way you would to a person — a "done answering"
                     button turns every pause into a decision about whether
                     to reach for the mouse. The manual submit below appears
                     only if the recogniser can't run, which is the one case
                     where stopping cannot be detected. */
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

            {phase === "saved" && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-[var(--color-positive)]"
              >
                <Check className="size-5" />
                <p className="t-body">
                  {answeredCount >= questions.length
                    ? "That's everything — reading your answers now."
                    : "Saved. Next question…"}
                </p>
              </motion.div>
            )}
          </div>

          {/* Presence monitor stays mounted for the whole room rather than
              only during "answering" — swapping it in and out per question
              used to tear down and recreate the <video> element, which
              silently detached the live camera stream from the DOM after the
              first question and made tracking look broken. Hidden with CSS
              between answers instead of unmounted, so the stream survives. */}
          {!typedMode && (
            <div className={phase === "answering" ? "mt-6" : "mt-6 hidden"}>
              <PresenceMonitor
                videoRef={presence.videoRef}
                status={presence.status}
                live={presence.live}
                errorDetail={presence.errorDetail}
                onStart={() => void startPresence()}
                onStop={presence.stop}
              />
            </div>
          )}
        </>
      )}

      {phase === "analyzing" && (
        <div className="mt-16">
          <p className="t-micro mb-6">Reading every answer</p>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={q.id} className="flex items-center gap-4">
                <span className="t-numeric w-5 shrink-0 text-[13px] text-ink-4">{i + 1}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full">
                  <motion.span
                    className="block h-full w-full origin-left rounded-full bg-ink-4/25"
                    initial={{ scaleX: reduceMotion ? 0.6 : 0.08 }}
                    animate={reduceMotion ? { scaleX: 0.6 } : { scaleX: [0.08, 0.92, 0.08] }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }
                    }
                  />
                </span>
              </div>
            ))}
          </div>
          <p className="t-meta mt-8 text-ink-4">
            Scoring content, clarity, relevance and structure on each answer. Usually a few
            seconds a question.
          </p>
        </div>
      )}

      {phase === "failed" && (
        <div className="mt-16">
          <ErrorState
            message={error ?? "Something went wrong."}
            onRetry={() => void finishAndAnalyze()}
            retryLabel="Try again"
          />
          <p className="t-meta mt-4 text-ink-4">
            Anything already scored is safe — this only retries what didn&apos;t finish.
          </p>
        </div>
      )}

      {answeredCount > 0 && phase !== "analyzing" && phase !== "failed" && !allAnswered && (
        <div className="mt-16 border-t border-line pt-8">
          <button
            type="button"
            onClick={() => void endHere()}
            disabled={finishing}
            className="pressable t-meta text-ink-4 hover:text-ink-2 disabled:opacity-40"
          >
            End here and see the report on what I&apos;ve answered
          </button>
        </div>
      )}

      {allAnswered && phase === "asking" && (
        <div className="mt-16 border-t border-line pt-8">
          <Button variant="primary" icon={<RotateCcw className="size-4" />} loading={finishing} onClick={() => void endHere()}>
            See my results
          </Button>
        </div>
      )}
    </div>
  );
}
