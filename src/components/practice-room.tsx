"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Keyboard, Mic, Square, Sparkles } from "lucide-react";

import { abandonSession, evaluateSession } from "@/app/practice/actions";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Timer } from "@/components/ui/timer";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { useVoiceSession } from "@/lib/useVoiceSession";

type Phase = "idle" | "prep" | "speaking" | "submitting" | "failed";

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

export function PracticeRoom({
  sessionId,
  topic,
  prepSeconds,
  speakSeconds,
  language = "en",
}: {
  sessionId: string;
  topic: string;
  prepSeconds: number;
  speakSeconds: number;
  language?: string;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [remaining, setRemaining] = useState(prepSeconds || speakSeconds);
  const [error, setError] = useState<string | null>(null);
  const [typedMode, setTypedMode] = useState(false);
  const [graceCountdown, setGraceCountdown] = useState<number | null>(null);

  const voiceSession = useVoiceSession({
    sessionId,
    mode: "conversation",
    topic,
    language: language as "en" | "hinglish" | "hi",
    autoSave: true,
  });

  const startedAtRef = useRef(0);

  /* One interval drives both phases */
  useEffect(() => {
    if (phase !== "prep" && phase !== "speaking") return;

    const id = setInterval(() => {
      setRemaining((value) => {
        if (value > 1) {
          if (phase === "speaking" && value === 16) {
            playChime(440, 200);
          }
          return value - 1;
        }
        clearInterval(id);
        if (phase === "prep") {
          playChime(880, 150);
          setPhase("speaking");
          return speakSeconds;
        }
        setGraceCountdown(2);
        return 0;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [phase, speakSeconds]);

  // Grace period countdown
  useEffect(() => {
    if (graceCountdown === null || graceCountdown <= 0) return;

    const id = setTimeout(() => {
      setGraceCountdown((v) => {
        if (v !== null && v <= 1) {
          return 0;
        }
        return v !== null ? v - 1 : null;
      });
    }, 1000);

    return () => clearTimeout(id);
  }, [graceCountdown]);

  useEffect(() => {
    if (phase === "speaking" && !typedMode) {
      void voiceSession.startSession();
    } else if (phase !== "speaking") {
      voiceSession.stopSession();
    }
  }, [phase, typedMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === "speaking" && startedAtRef.current === 0) startedAtRef.current = Date.now();
  }, [phase]);

  const transcript = typedMode ? voiceSession.speech.typed : voiceSession.transcript;

  const submit = useCallback(async () => {
    const text = transcript.trim();
    if (!text) {
      setError("We didn't catch anything at all. Give it another go, or type your answer instead.");
      setPhase("failed");
      return;
    }

    voiceSession.stopSession();
    setPhase("submitting");
    setError(null);
    setGraceCountdown(null);

    const elapsed = startedAtRef.current
      ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      : speakSeconds;

    const result = await evaluateSession({
      sessionId,
      transcript: text,
      durationSeconds: Math.min(elapsed, speakSeconds),
      localDate: new Date().toLocaleDateString("en-CA"),
      inputMode: typedMode ? "typed" : "speech",
    });

    if (result.ok) {
      router.push(`/practice/${sessionId}/report`);
      return;
    }

    setError(result.error.message);
    setPhase("failed");
  }, [router, sessionId, speakSeconds, transcript, typedMode, voiceSession]);

  useEffect(() => {
    if (phase === "speaking" && graceCountdown === 0) void submit();
  }, [phase, graceCountdown, submit]);

  async function leave() {
    const midAnswer = phase === "speaking" && transcript.trim().length > 0;
    if (midAnswer && !window.confirm("Leave now and this answer won't be scored. Sure?")) return;
    voiceSession.stopSession();
    await abandonSession(sessionId);
    router.push("/dashboard");
  }

  const speaking = phase === "speaking";
  const urgent = speaking && remaining <= 15;
  const total = phase === "prep" ? prepSeconds : speakSeconds;
  const isInGrace = graceCountdown !== null && graceCountdown > 0;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-5 pt-24 pb-16 sm:px-6">
      <motion.div
        animate={{ opacity: speaking ? 0.35 : 1 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <button
          type="button"
          onClick={() => void leave()}
          disabled={phase === "submitting"}
          className="pressable inline-flex items-center gap-2 text-[13px] text-ink-3 hover:text-ink disabled:opacity-40"
        >
          <ArrowLeft className="size-3.5" />
          Leave session
        </button>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-medium">
          <Sparkles className="size-3.5" />
          <span>Real-time Audio Flow</span>
        </span>
      </motion.div>

      {/* Topic */}
      <motion.div
        animate={{ scale: speaking ? 0.82 : 1, opacity: speaking ? 0.55 : 1 }}
        transition={{ type: "spring", bounce: 0, duration: 0.6 }}
        style={{ transformOrigin: "top center" }}
        className="mt-10 text-center"
      >
        <p className="t-micro mb-5">Your topic</p>
        <h1 className="t-title mx-auto max-w-2xl">{topic}</h1>
      </motion.div>

      <div className="mt-10 flex flex-col items-center">
        {phase === "idle" && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
            className="flex flex-col items-center"
          >
            <p className="t-body max-w-sm text-center text-ink-2">
              {prepSeconds > 0
                ? `${prepSeconds} seconds to gather your thoughts, then ${Math.round(speakSeconds / 60)} minute${speakSeconds >= 120 ? "s" : ""} on the clock.`
                : `No prep time. ${speakSeconds} seconds on the clock.`}
            </p>
            <Button
              variant="primary"
              size="lg"
              icon={<Mic className="size-4.5" />}
              className="mt-8"
              onClick={() => {
                setPhase(prepSeconds > 0 ? "prep" : "speaking");
                setRemaining(prepSeconds > 0 ? prepSeconds : speakSeconds);
                if (prepSeconds === 0) playChime(880, 150);
              }}
            >
              Begin
            </Button>
          </motion.div>
        )}

        {(phase === "prep" || speaking) && (
          <motion.div
            key="clock"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
            className="flex w-full flex-col items-center"
          >
            <Timer
              remaining={isInGrace ? graceCountdown : remaining}
              total={isInGrace ? 2 : total}
              tone={phase === "prep" ? "neutral" : isInGrace ? "caution" : urgent ? "caution" : "accent"}
              label={
                phase === "prep"
                  ? "Thinking"
                  : isInGrace
                    ? "Wrapping up..."
                    : urgent
                      ? "Start wrapping up"
                      : "Listening"
              }
              className="size-[clamp(230px,58vw,300px)]"
            />

            {speaking && !typedMode && (
              <div className="mt-8 w-full max-w-md">
                <VoiceVisualizer
                  status={voiceSession.status}
                  audioLevel={voiceSession.audioLevel}
                  transcript={voiceSession.transcript}
                  isMicActive={voiceSession.isMicActive}
                  isSpeaking={voiceSession.isSpeaking}
                  counterpartName="PrepPulse AI"
                  onStop={() => void submit()}
                />
              </div>
            )}

            <div className="mt-8 flex items-center gap-3">
              {phase === "prep" ? (
                <Button
                  variant="glass"
                  onClick={() => {
                    playChime(880, 150);
                    setPhase("speaking");
                    setRemaining(speakSeconds);
                  }}
                >
                  Skip the prep
                </Button>
              ) : (
                <Button
                  variant="glass"
                  icon={<Square className="size-3.5 fill-current" />}
                  onClick={() => void submit()}
                >
                  I&apos;m done
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {phase === "submitting" && (
          <LoadingState
            title="Reading your answer"
            detail="Measuring pace and filler here, sending the rest to be judged."
          />
        )}

        {phase === "failed" && (
          <ErrorState
            title="We couldn't score that"
            message={error ?? "Something went wrong."}
            onRetry={() => void submit()}
            retryLabel="Try scoring again"
          />
        )}
      </div>

      {(speaking || phase === "failed" || typedMode) && (
        <motion.section
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-14"
        >
          <div className="mb-4 flex items-baseline justify-between">
            <p className="t-micro">{typedMode ? "Your answer" : "Transcript"}</p>
          </div>

          {typedMode ? (
            <textarea
              value={voiceSession.speech.typed}
              onChange={(e) => voiceSession.speech.setTyped(e.target.value)}
              rows={8}
              placeholder="Type or paste what you'd say..."
              className="t-lead w-full resize-y rounded-[var(--radius-md)] border border-line bg-black/20 p-6 text-ink outline-none placeholder:text-ink-4 focus:border-accent"
            />
          ) : (
            <div className="min-h-[8rem] rounded-[var(--radius-md)] border border-line/60 p-6">
              {voiceSession.transcript ? (
                <p className="t-lead text-ink">
                  {voiceSession.transcript}
                </p>
              ) : (
                <p className="t-lead text-ink-4">Your words appear here as you speak.</p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setTypedMode((v) => !v);
              setError(null);
            }}
            className="pressable mt-4 inline-flex items-center gap-2 text-[13px] text-ink-4 hover:text-ink-2"
          >
            <Keyboard className="size-3.5" />
            {typedMode ? "Use microphone instead" : "Type answer instead"}
          </button>
        </motion.section>
      )}
    </div>
  );
}
