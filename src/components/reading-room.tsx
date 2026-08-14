"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, RotateCcw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Surface } from "@/components/ui/surface";
import { useSpeech } from "@/lib/use-speech";
import { alignWords, toWords, type AlignedWord } from "@/lib/reading-scoring";
import { formatDuration } from "@/lib/utils";
import { submitReading } from "@/app/read/actions";

type Phase = "ready" | "reading" | "scoring" | "result" | "failed";
type Verdict = Awaited<ReturnType<typeof submitReading>>;

/** Nobody needs longer than this for a paragraph; a live mic left on does. */
const MAX_READ_SECONDS = 300;

export function ReadingRoom({
  sessionId,
  piece,
  previousBest,
}: {
  sessionId: string;
  piece: {
    id: string;
    title: string;
    body: string;
    focus: string | null;
    kind: "tongue_twister" | "passage";
    paceMin: number;
    paceMax: number;
  };
  previousBest: number | null;
}) {
  const reduceMotion = useReducedMotion();
  const speech = useSpeech("en");

  const [phase, setPhase] = useState<Phase>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Extract<Verdict, { ok: true }>["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAtRef = useRef(0);
  const sendRef = useRef<() => void>(() => {});

  const passageWords = useMemo(() => piece.body.split(/\s+/).filter(Boolean), [piece.body]);

  // Live progress: align what has been heard so far against the passage, so the
  // words light up as they land. Same function the server scores with, so the
  // preview cannot disagree with the result.
  const liveTranscript = `${speech.finalText} ${speech.interimText}`.trim();
  const liveAlignment = useMemo(() => {
    if (phase !== "reading" || !liveTranscript) return [];
    return alignWords(toWords(piece.body), toWords(liveTranscript));
  }, [phase, liveTranscript, piece.body]);

  /** Per passage word: has it been matched yet? Indexed by passage position. */
  const wordState = useMemo(() => {
    const states: (AlignedWord["op"] | null)[] = new Array(passageWords.length).fill(null);
    let index = 0;
    for (const step of liveAlignment) {
      if (step.op === "insert") continue;
      if (index < states.length) states[index] = step.op;
      index++;
    }
    return states;
  }, [liveAlignment, passageWords.length]);

  useEffect(() => {
    if (phase !== "reading") return;
    const id = setInterval(() => {
      setElapsed((value) => {
        const next = value + 1;
        if (next >= MAX_READ_SECONDS) sendRef.current();
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const finish = useCallback(async () => {
    const transcript = `${speech.finalText} ${speech.interimText}`.trim();
    speech.stop();

    if (!transcript) {
      setError("Nothing came through. Check your microphone and try again.");
      setPhase("failed");
      return;
    }

    const seconds = startedAtRef.current
      ? Math.max(1, (Date.now() - startedAtRef.current) / 1000)
      : Math.max(1, elapsed);

    setPhase("scoring");
    const response = await submitReading({
      sessionId,
      transcript,
      durationSeconds: Math.min(seconds, MAX_READ_SECONDS),
    });

    if (!response.ok) {
      setError(response.error.message);
      setPhase("failed");
      return;
    }

    setResult(response.data);
    setPhase("result");
  }, [elapsed, sessionId, speech]);

  sendRef.current = () => void finish();

  function begin() {
    speech.reset();
    setElapsed(0);
    setError(null);
    setResult(null);
    startedAtRef.current = Date.now();
    setPhase("reading");
    speech.start();
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-24 pb-24 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="t-micro">
          {piece.kind === "tongue_twister" ? "Tongue twister" : "Passage"}
          <span className="mx-3 text-ink-4">/</span>
          <span className="text-ink-2">{piece.title}</span>
        </p>
        <p className="t-micro">
          target {piece.paceMin}-{piece.paceMax} wpm
          {previousBest !== null && (
            <>
              <span className="mx-3 text-ink-4">/</span>
              <span className="text-accent">best {previousBest}</span>
            </>
          )}
        </p>
      </div>

      {/* The text. Large, generously leaded — this is a thing to be read from,
          not a paragraph to skim, and cramped type makes people stumble.

          Words that have NOT been read yet stay at full ink. An earlier version
          dimmed them to `ink-4` (42% lightness) on glass so the read ones would
          stand out, which is exactly backwards: the unread words are the ones
          the user still has to read, and this codebase has already been bitten
          once by faint text over a blurred surface. Only the words behind you
          change colour. */}
      <Surface material="dense" radius="lg" refract className="mt-10 p-7 sm:p-10">
        <p className="font-display text-[clamp(21px,3.4vw,28px)] leading-[1.75] tracking-[-0.01em] text-ink">
          {passageWords.map((word, index) => {
            const state = phase === "reading" ? wordState[index] : null;
            return (
              <span
                key={index}
                className="transition-colors duration-200"
                style={{
                  color:
                    state === "match"
                      ? "var(--color-positive)"
                      : state === "substitute" || state === "delete"
                        ? "var(--color-caution)"
                        : undefined,
                }}
              >
                {word}{" "}
              </span>
            );
          })}
        </p>
      </Surface>

      {piece.focus && phase !== "result" && (
        <p className="t-meta mt-4 text-ink-4">{piece.focus}</p>
      )}

      <div className="mt-10">
        {phase === "ready" && (
          <div className="flex flex-wrap items-center gap-5">
            <Button variant="primary" size="lg" icon={<Mic className="size-4.5" />} onClick={begin}>
              Start reading
            </Button>
            <p className="t-meta max-w-sm text-ink-4">
              Read it straight through. The words turn green as they land.
            </p>
          </div>
        )}

        {phase === "reading" && (
          <div className="flex flex-wrap items-center justify-between gap-6">
            <span className="t-numeric text-[34px] leading-none">{formatDuration(elapsed)}</span>
            <Button
              variant="primary"
              icon={<Square className="size-3.5 fill-current" />}
              onClick={() => void finish()}
            >
              Done
            </Button>
          </div>
        )}

        {phase === "scoring" && (
          <LoadingState title="Checking it word by word" detail="Accuracy, pace and completion." />
        )}

        {phase === "failed" && (
          <ErrorState message={error ?? "Something went wrong."} onRetry={begin} retryLabel="Read it again" />
        )}

        {phase === "result" && result && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
          >
            <Surface material="dense" radius="lg" refract className="p-7 sm:p-9">
              <div className="flex items-start justify-between gap-6">
                <p className="t-lead max-w-lg text-ink">{result.verdict}</p>
                <div className="shrink-0 text-right">
                  <p className="t-numeric text-[40px] leading-none">{result.overallScore}</p>
                  {result.delta !== null && result.delta !== 0 && (
                    <p
                      className="t-micro mt-2"
                      style={{
                        color:
                          result.delta > 0 ? "var(--color-positive)" : "var(--color-caution)",
                      }}
                    >
                      {result.delta > 0 ? "+" : ""}
                      {result.delta} vs best
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-6 border-t border-line pt-6 sm:grid-cols-4">
                <Figure
                  value={`${result.accuracy}%`}
                  label={`${result.matched} of ${result.totalWords} words`}
                />
                <Figure value={result.wordsPerMinute} label="words per minute" />
                <Figure value={`${result.paceScore}`} label="pace score" />
                <Figure value={`${result.completion}%`} label="finished" />
              </div>

              {result.stumbles.length > 0 && (
                <div className="mt-8 border-t border-line pt-6">
                  <p className="t-micro mb-4">Words that didn&apos;t land</p>
                  <div className="flex flex-wrap gap-2">
                    {result.stumbles.map((word) => (
                      <span
                        key={word}
                        className="rounded-full border border-[var(--color-caution)]/30 bg-[var(--color-caution)]/10 px-3 py-1 text-[13px] text-[var(--color-caution)]"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                  {result.pattern && <p className="t-body mt-4 text-ink-2">{result.pattern}</p>}
                </div>
              )}

              {result.drill && (
                <div className="mt-8 border-t border-line pt-6">
                  <p className="t-micro mb-3">Next time</p>
                  <p className="t-body text-ink-2">{result.drill}</p>
                </div>
              )}
            </Surface>

            {/* Said once here and once in the code that computes it: this is a
                recogniser's opinion of your clarity, not a pronunciation score. */}
            <p className="t-meta mt-4 text-ink-4">
              Accuracy is what a speech recogniser heard. It repairs slurred words in familiar
              phrases, so a high score is a good sign rather than proof of clean articulation.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={begin}>
                Read it again
              </Button>
              <Link href="/read">
                <Button variant="glass">Pick another</Button>
              </Link>
            </div>
          </motion.div>
        )}

        {speech.error && phase !== "result" && (
          <p className="t-meta mt-5 text-ink-2">{speech.error}</p>
        )}
      </div>
    </div>
  );
}

function Figure({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <p className="t-numeric text-[26px] leading-none">{value}</p>
      <p className="t-micro mt-2">{label}</p>
    </div>
  );
}
