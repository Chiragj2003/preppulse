"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dices, Loader2, Sparkles } from "lucide-react";

import { startSession } from "@/app/practice/actions";

type Stage = "ready" | "rolling" | "revealed";

/**
 * The Daily Roll.
 *
 * A plain "here is today's topic" list would be correct and forgettable. The
 * reveal is the point: the topic tumbles past a few decoys, decelerating like a
 * slot reel, then lands with a spring. Bounce is earned here - the reel carried
 * momentum into the stop, which is exactly when overshoot reads as physical
 * rather than decorative.
 */
export function DailyRoll({
  topicId,
  topic,
  decoys,
  category,
  quick,
}: {
  topicId: string;
  topic: string;
  decoys: string[];
  category: string;
  quick: boolean;
}) {
  const [stage, setStage] = useState<Stage>("ready");
  // `step` keys the reel. The pool repeats over 11 swaps, so keying on the text
  // itself would produce duplicate keys and orphan the exiting nodes.
  const [{ text: display, step }, setSlot] = useState({ text: decoys[0] ?? topic, step: 0 });
  const [starting, setStarting] = useState(false);
  const reduceMotion = useReducedMotion();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Any timer still pending when we unmount would setState on a dead component.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const roll = useCallback(() => {
    if (stage !== "ready") return;

    if (reduceMotion) {
      setSlot({ text: topic, step: -1 });
      setStage("revealed");
      return;
    }

    setStage("rolling");

    // Deceleration curve: each swap waits longer than the last, so the reel
    // visibly slows into the landing instead of stopping dead.
    let delay = 70;
    let elapsed = 0;
    const pool = decoys.length ? decoys : [topic];

    for (let i = 0; i < 11; i++) {
      const index = i;
      elapsed += delay;
      delay = Math.round(delay * 1.28);
      timers.current.push(
        setTimeout(() => setSlot({ text: pool[index % pool.length], step: index + 1 }), elapsed),
      );
    }

    timers.current.push(
      setTimeout(() => {
        setSlot({ text: topic, step: -1 });
        setStage("revealed");
      }, elapsed + delay),
    );
  }, [decoys, reduceMotion, stage, topic]);

  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] font-medium text-ink-soft">
        <Sparkles className="size-3.5 text-accent" />
        {quick ? "Quick Challenge - 60 seconds" : "Today's roll"}
      </p>

      {/* The reel */}
      <motion.div
        animate={
          stage === "revealed" && !reduceMotion
            ? { scale: [1, 1.035, 1] }
            : stage === "rolling"
              ? { rotate: [0, -0.4, 0.4, 0] }
              : {}
        }
        transition={
          stage === "revealed"
            ? { type: "spring", bounce: 0.42, duration: 0.62 }
            : { duration: 0.18, repeat: Infinity }
        }
        className="card relative flex min-h-[190px] items-center justify-center overflow-hidden px-8 py-10 sm:min-h-[210px]"
      >
        {/* Accent wash on landing. Blur and scale animate together so it reads
            as a material arriving, not an opacity ramp. */}
        <motion.div
          aria-hidden
          initial={false}
          animate={
            stage === "revealed"
              ? { opacity: 1, scale: 1, filter: "blur(0px)" }
              : { opacity: 0, scale: 1.12, filter: "blur(14px)" }
          }
          transition={{ type: "spring", bounce: 0, duration: 0.55 }}
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent-soft/70 to-transparent"
        />

        {/* Deliberately not AnimatePresence. Swaps are 70-800ms apart, so an
            exit animation is never actually seen - and keeping exiting nodes
            mounted leaves a pile of stacked <p> elements behind. A keyed
            remount unmounts the old one outright and plays the new one in. */}
        <motion.p
          key={step}
          initial={reduceMotion ? false : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", bounce: 0, duration: 0.22 }}
          className={`t-title relative ${stage === "revealed" ? "text-ink" : "text-muted"}`}
          style={{ willChange: stage === "rolling" ? "transform, opacity" : undefined }}
        >
          {display}
        </motion.p>
      </motion.div>

      {/* Controls */}
      <div className="mt-7">
        {stage !== "revealed" ? (
          <button
            type="button"
            onClick={roll}
            disabled={stage === "rolling"}
            className="pressable inline-flex items-center gap-2.5 rounded-full bg-accent px-7 py-3.5 text-[15px] font-medium text-accent-ink shadow-[var(--shadow-soft)] hover:brightness-110 disabled:opacity-70"
          >
            <motion.span
              animate={stage === "rolling" ? { rotate: 360 } : { rotate: 0 }}
              transition={
                stage === "rolling"
                  ? { duration: 0.55, repeat: Infinity, ease: "linear" }
                  : { type: "spring", bounce: 0.3, duration: 0.4 }
              }
              className="grid place-items-center"
            >
              <Dices className="size-4.5" />
            </motion.span>
            {stage === "rolling" ? "Rolling..." : "Roll the topic"}
          </button>
        ) : (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.45 }}
            className="flex flex-col items-center gap-3"
          >
            <p className="text-[13px] text-muted">
              {category} - {quick ? "60 seconds, no prep" : "30 seconds to think, 2 minutes to talk"}
            </p>
            <form action={startSession} onSubmit={() => setStarting(true)}>
              <input type="hidden" name="topicId" value={topicId} />
              {quick && <input type="hidden" name="mode" value="quick" />}
              <button
                type="submit"
                disabled={starting}
                className="pressable inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-medium text-bg hover:opacity-90 disabled:opacity-60"
              >
                {starting && <Loader2 className="size-4 animate-spin" />}
                {starting ? "Setting up..." : "I'm ready - start"}
              </button>
            </form>
          </motion.div>
        )}
      </div>
    </div>
  );
}
