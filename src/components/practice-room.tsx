"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Keyboard, Loader2, Mic, Square } from "lucide-react";

import { abandonSession, evaluateSession } from "@/app/practice/actions";
import { formatDuration } from "@/lib/utils";

type Phase = "idle" | "prep" | "speaking" | "submitting" | "failed";

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
  const spokeForRef = useRef(0);

  /* ── Countdown ──────────────────────────────────────────────────────────
   * One interval drives both phases; the phase decides what hitting zero means.
   */
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

  // Start/stop the mic exactly when the speaking phase starts/ends.
  // Depend on the stable callbacks, not the hook's result object, which is a
  // fresh identity every render and would re-run this constantly.
  const { start: startMic, stop: stopMic } = speech;
  useEffect(() => {
    if (phase === "speaking" && !typedMode) startMic();
    else stopMic();
  }, [phase, typedMode, startMic, stopMic]);

  // Stamp the moment speaking began. Read at submit time rather than written on
  // cleanup, because "I'm done" submits while still in the speaking phase.
  useEffect(() => {
    if (phase === "speaking" && spokeForRef.current === 0) spokeForRef.current = Date.now();
  }, [phase]);

  const transcript = typedMode ? speech.typed : `${speech.finalText} ${speech.interimText}`.trim();

  const submit = useCallback(async () => {
    const text = transcript.trim();
    if (!text) {
      setError("We didn't catch anything. Try again, or switch to typing your answer.");
      setPhase("failed");
      return;
    }

    setPhase("submitting");
    setError(null);

    const elapsed = spokeForRef.current
      ? Math.max(1, Math.round((Date.now() - spokeForRef.current) / 1000))
      : speakSeconds;

    const result = await evaluateSession({
      sessionId,
      transcript: text,
      durationSeconds: Math.min(elapsed, speakSeconds),
      // Local date, so a 1am session counts as today for the streak.
      localDate: new Date().toLocaleDateString("en-CA"),
      // Typed answers get pace excluded from the score rather than measured
      // from the wall clock, which would penalise the accessibility fallback.
      inputMode: typedMode ? "typed" : "speech",
    });

    if (result.ok) {
      router.push(`/practice/${sessionId}/report`);
      return;
    }

    setError(result.error.message);
    setPhase("failed");
  }, [router, sessionId, speakSeconds, transcript, typedMode]);

  // Auto-submit the moment the clock runs out.
  useEffect(() => {
    if (phase === "speaking" && remaining === 0) void submit();
  }, [phase, remaining, submit]);

  const total = phase === "prep" ? prepSeconds : speakSeconds;
  const progress = total > 0 ? 1 - remaining / total : 0;

  const urgent = phase === "speaking" && remaining <= 10;

  /** Wayfinding: there is always a way out, and it says what leaving costs. */
  async function leave() {
    const midAnswer = phase === "speaking" && transcript.trim().length > 0;
    if (midAnswer && !window.confirm("Leave now and this answer won't be scored. Sure?")) return;
    stopMic();
    await abandonSession(sessionId);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
      <button
        type="button"
        onClick={() => void leave()}
        disabled={phase === "submitting"}
        className="pressable mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink-soft disabled:opacity-40"
      >
        <ArrowLeft className="size-3.5" />
        Leave session
      </button>

      {/* Topic */}
      <div className="card p-7 text-center">
        <p className="t-label mb-3 text-muted">Your topic</p>
        <h1 className="t-title">{topic}</h1>
      </div>

      {/* Timer + state.
          Keyed remount rather than AnimatePresence: each phase replaces the
          last outright, and an exit animation on a state machine this linear
          buys nothing while risking a stale panel staying on screen. */}
      <div className="mt-7 flex flex-col items-center">
        <div>
          <motion.div
            key={phase}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="text-center"
          >
            {phase === "idle" && (
              <>
                <p className="text-[15px] text-ink-soft">
                  {prepSeconds > 0
                    ? `${prepSeconds} seconds to gather your thoughts, then ${Math.round(speakSeconds / 60)} minute${speakSeconds >= 120 ? "s" : ""} to talk.`
                    : `No prep time. ${speakSeconds} seconds on the clock.`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPhase(prepSeconds > 0 ? "prep" : "speaking");
                    setRemaining(prepSeconds > 0 ? prepSeconds : speakSeconds);
                  }}
                  className="pressable mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-[15px] font-medium text-accent-ink hover:brightness-110"
                >
                  <Mic className="size-4.5" />
                  Start
                </button>
              </>
            )}

            {(phase === "prep" || phase === "speaking") && (
              <>
                <TimerRing
                  progress={progress}
                  tone={phase === "prep" ? "neutral" : urgent ? "warn" : "accent"}
                >
                  {formatDuration(remaining)}
                </TimerRing>
                <p className="mt-4 text-[15px] font-medium" aria-live="polite">
                  {phase === "prep"
                    ? "Think it through..."
                    : urgent
                      ? "Start wrapping up"
                      : "Listening..."}
                </p>
                {phase === "speaking" && (
                  <button
                    type="button"
                    onClick={() => void submit()}
                    className="pressable mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-[14px] font-medium hover:bg-surface-2"
                  >
                    <Square className="size-3.5 fill-current" />
                    I&apos;m done
                  </button>
                )}
                {phase === "prep" && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhase("speaking");
                      setRemaining(speakSeconds);
                    }}
                    className="pressable mt-5 block text-[13.5px] text-accent hover:underline"
                  >
                    Skip the prep, I&apos;m ready
                  </button>
                )}
              </>
            )}

            {phase === "submitting" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="size-7 animate-spin text-accent" />
                <p className="text-[15px] font-medium">Building your report...</p>
                <p className="text-[13px] text-muted">Scoring six dimensions against your transcript.</p>
              </div>
            )}

            {phase === "failed" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <AlertCircle className="size-7 text-warn" />
                <p className="max-w-sm text-[14.5px] leading-relaxed text-ink-soft">{error}</p>
                <button
                  type="button"
                  onClick={() => void submit()}
                  className="pressable mt-1 rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-bg hover:opacity-90"
                >
                  Try scoring again
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Transcript */}
      {(phase === "speaking" || phase === "failed" || typedMode) && (
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">
              {typedMode ? "Your answer" : "Live transcript"}
            </p>
            {!speech.supported && !typedMode && (
              <span className="text-[12px] text-warn">Speech recognition unavailable</span>
            )}
          </div>

          {typedMode ? (
            <textarea
              value={speech.typed}
              onChange={(e) => speech.setTyped(e.target.value)}
              rows={7}
              placeholder="Type or paste what you'd say..."
              className="w-full resize-y rounded-[var(--radius-sm)] border border-line bg-surface p-4 text-[15px] leading-relaxed outline-none placeholder:text-muted focus:border-accent"
            />
          ) : (
            <div className="card min-h-[120px] p-4 text-[15px] leading-relaxed">
              {speech.finalText || speech.interimText ? (
                <p>
                  {speech.finalText}{" "}
                  <span className="text-muted">{speech.interimText}</span>
                </p>
              ) : (
                <p className="text-muted">Your words will appear here as you speak.</p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setTypedMode((value) => !value);
              setError(null);
            }}
            className="pressable mt-3 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink-soft"
          >
            <Keyboard className="size-3.5" />
            {typedMode ? "Use the microphone instead" : "Mic not working? Type it instead"}
          </button>
        </div>
      )}

      {speech.error && !typedMode && (
        <p className="mt-4 rounded-[var(--radius-xs)] bg-surface-2 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink-soft">
          {speech.error}
        </p>
      )}
    </div>
  );
}

/* ── Timer ring ───────────────────────────────────────────────────────────
 * SVG stroke-dashoffset rather than a JS-driven arc: the browser interpolates
 * it on the compositor, and it degrades to a static ring under reduced motion.
 */
function TimerRing({
  progress,
  tone,
  children,
}: {
  progress: number;
  tone: "neutral" | "accent" | "warn";
  children: React.ReactNode;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const stroke = `var(--color-${tone === "neutral" ? "muted" : tone === "warn" ? "warn" : "accent"})`;

  return (
    <div className="relative grid size-[136px] place-items-center">
      <svg viewBox="0 0 120 120" className="absolute size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="6" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * progress}
          // Linear over exactly one second so the arc tracks the clock 1:1
          // instead of easing and drifting out of sync with the digits.
          style={{ transition: "stroke-dashoffset 1s linear, stroke 400ms ease" }}
        />
      </svg>
      <span
        className="t-numeric relative text-[26px] font-semibold transition-colors duration-300"
        style={{ color: tone === "warn" ? "var(--color-warn)" : undefined }}
      >
        {children}
      </span>
    </div>
  );
}

/* ── Speech recognition ─────────────────────────────────────────────────── */

function useSpeech() {
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantsToRunRef = useRef(false);

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!Ctor) {
      setSupported(false);
      setError(
        "This browser can't transcribe speech - that's Chrome, Edge and Safari only. Use the typing option below, or switch browser.",
      );
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      let settled = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) settled += result[0].transcript;
        else interim += result[0].transcript;
      }

      if (settled) setFinalText((prev) => `${prev} ${settled}`.trim());
      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantsToRunRef.current = false;
        setError(
          "Microphone access was blocked. Allow it in your browser's address bar, or type your answer instead.",
        );
      } else if (event.error === "audio-capture") {
        wantsToRunRef.current = false;
        setError("No microphone found. Plug one in, or type your answer instead.");
      } else if (event.error === "network") {
        setError("Speech recognition lost its connection. What we caught so far is kept.");
      }
      // "no-speech" and "aborted" are normal during pauses - onend restarts us.
    };

    // Chrome stops the service after a few seconds of silence. Restart while
    // the user is still meant to be speaking, or long pauses truncate answers.
    recognition.onend = () => {
      if (wantsToRunRef.current) {
        try {
          recognition.start();
        } catch {
          /* already starting - harmless */
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      wantsToRunRef.current = false;
      recognition.onend = null;
      recognition.abort();
    };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current || wantsToRunRef.current) return;
    wantsToRunRef.current = true;
    try {
      recognitionRef.current.start();
    } catch {
      /* already running */
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    wantsToRunRef.current = false;
    recognitionRef.current.stop();
  }, []);

  return { finalText, interimText, typed, setTyped, error, supported, start, stop };
}
