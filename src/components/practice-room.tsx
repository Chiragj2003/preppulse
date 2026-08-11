"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Keyboard, Mic, Square } from "lucide-react";

import { abandonSession, evaluateSession } from "@/app/practice/actions";
import { useSpeech } from "@/lib/use-speech";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Timer } from "@/components/ui/timer";
import { Waveform } from "@/components/ui/waveform";

type Phase = "idle" | "prep" | "speaking" | "submitting" | "failed";

/**
 * The performance environment.
 *
 * Everything that isn't the topic, the clock, the voice or the one control
 * you need is stripped out while speaking. Chrome dims, the page stops
 * competing, and what remains is a room to talk in.
 */
export function PracticeRoom({
  sessionId,
  topic,
  prepSeconds,
  speakSeconds,
}: {
  sessionId: string;
  topic: string;
  prepSeconds: number;
  speakSeconds: number;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [remaining, setRemaining] = useState(prepSeconds || speakSeconds);
  const [error, setError] = useState<string | null>(null);
  const [typedMode, setTypedMode] = useState(false);

  const speech = useSpeech();
  const startedAtRef = useRef(0);

  /* One interval drives both phases; the phase decides what zero means. */
  useEffect(() => {
    if (phase !== "prep" && phase !== "speaking") return;

    const id = setInterval(() => {
      setRemaining((value) => {
        if (value > 1) return value - 1;
        clearInterval(id);
        if (phase === "prep") {
          setPhase("speaking");
          return speakSeconds;
        }
        return 0;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [phase, speakSeconds]);

  const { start: startMic, stop: stopMic } = speech;
  useEffect(() => {
    if (phase === "speaking" && !typedMode) startMic();
    else stopMic();
  }, [phase, typedMode, startMic, stopMic]);

  useEffect(() => {
    if (phase === "speaking" && startedAtRef.current === 0) startedAtRef.current = Date.now();
  }, [phase]);

  const transcript = typedMode ? speech.typed : `${speech.finalText} ${speech.interimText}`.trim();

  const submit = useCallback(async () => {
    const text = transcript.trim();
    if (!text) {
      setError("We didn't catch anything at all. Give it another go, or type your answer instead.");
      setPhase("failed");
      return;
    }

    setPhase("submitting");
    setError(null);

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
  }, [router, sessionId, speakSeconds, transcript, typedMode]);

  useEffect(() => {
    if (phase === "speaking" && remaining === 0) void submit();
  }, [phase, remaining, submit]);

  async function leave() {
    const midAnswer = phase === "speaking" && transcript.trim().length > 0;
    if (midAnswer && !window.confirm("Leave now and this answer won't be scored. Sure?")) return;
    stopMic();
    await abandonSession(sessionId);
    router.push("/dashboard");
  }

  const speaking = phase === "speaking";
  const urgent = speaking && remaining <= 15;
  const total = phase === "prep" ? prepSeconds : speakSeconds;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-5 pt-24 pb-16 sm:px-6">
      {/* Chrome recedes while speaking rather than disappearing — a control
          that vanishes is a control the user has to hunt for. */}
      <motion.div
        animate={{ opacity: speaking ? 0.35 : 1 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
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
      </motion.div>

      {/* Topic. Large while thinking, small once the clock is running — the
          hierarchy follows what you actually need at that moment. */}
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
              remaining={remaining}
              total={total}
              tone={phase === "prep" ? "neutral" : urgent ? "caution" : "accent"}
              label={phase === "prep" ? "Thinking" : urgent ? "Start wrapping up" : "Listening"}
              className="size-[clamp(230px,58vw,300px)]"
            />

            {/* Voice activity. Answers the only question that matters while
                recording: is it hearing me? */}
            {speaking && !typedMode && (
              <Waveform active className="mt-10 h-14 w-full max-w-md" />
            )}

            <div className="mt-10 flex items-center gap-3">
              {phase === "prep" ? (
                <Button
                  variant="glass"
                  onClick={() => {
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

      {/* Transcript */}
      {(speaking || phase === "failed" || typedMode) && (
        <motion.section
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-14"
        >
          <div className="mb-4 flex items-baseline justify-between">
            <p className="t-micro">{typedMode ? "Your answer" : "Transcript"}</p>
            {!speech.supported && !typedMode && (
              <p className="t-meta text-[var(--color-caution)]">Speech recognition unavailable</p>
            )}
          </div>

          {typedMode ? (
            <textarea
              value={speech.typed}
              onChange={(e) => speech.setTyped(e.target.value)}
              rows={8}
              placeholder="Type or paste what you'd say..."
              className="t-lead w-full resize-y rounded-[var(--radius-md)] border border-line bg-black/20 p-6 text-ink outline-none placeholder:text-ink-4 focus:border-accent"
            />
          ) : (
            /* Editorial: set at reading size with generous leading, not a
               cramped log. Settled words are ink; the in-flight phrase is
               dimmed, so you can see the machine still thinking. */
            <div className="min-h-[8rem] rounded-[var(--radius-md)] border border-line/60 p-6">
              {speech.finalText || speech.interimText ? (
                <p className="t-lead text-ink">
                  {speech.finalText}{" "}
                  <span className="text-ink-4">{speech.interimText}</span>
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
            {typedMode ? "Use the microphone instead" : "Mic not working? Type it instead"}
          </button>
        </motion.section>
      )}

      {speech.error && !typedMode && (
        <p className="t-meta mt-6 rounded-[var(--radius-xs)] border border-line/60 px-4 py-3 text-ink-2">
          {speech.error}
        </p>
      )}
    </div>
  );
}
