"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { startSession } from "@/app/practice/actions";
import { Button } from "@/components/ui/button";

type Stage = "ready" | "winding" | "rolling" | "settling" | "revealed";

/**
 * The Daily Roll — the one interaction that has to feel like PrepPulse.
 *
 * Staged as a physical event rather than a state change:
 *
 *   anticipation  the slab compresses and dims, like something being wound up
 *   movement      topics tumble past, decelerating on a curve
 *   reveal        the real topic lands and the slab overshoots
 *   settling      light blooms across the surface, then calms
 *
 * Bounce appears exactly once, on the landing, because the reel carried
 * momentum into it. Overshoot on anything that merely faded in would read as
 * decoration.
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
  // Keyed on a step counter, not the text: the pool repeats across swaps, and
  // duplicate keys would leave orphaned nodes stacked in the slab.
  const [{ text, step }, setSlot] = useState({ text: decoys[0] ?? topic, step: 0 });
  const [starting, setStarting] = useState(false);
  const reduceMotion = useReducedMotion();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

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

    // Anticipation. Nothing moves for a beat — the pause is what makes the
    // release feel like a release.
    setStage("winding");

    timers.current.push(
      setTimeout(() => {
        setStage("rolling");

        let delay = 62;
        let elapsed = 0;
        const pool = decoys.length ? decoys : [topic];

        for (let i = 0; i < 12; i++) {
          const index = i;
          elapsed += delay;
          delay = Math.round(delay * 1.29); // deceleration curve
          timers.current.push(
            setTimeout(
              () => setSlot({ text: pool[index % pool.length], step: index + 1 }),
              elapsed,
            ),
          );
        }

        timers.current.push(
          setTimeout(() => {
            setSlot({ text: topic, step: -1 });
            setStage("settling");
          }, elapsed + delay),
        );

        timers.current.push(
          setTimeout(() => setStage("revealed"), elapsed + delay + 700),
        );
      }, 380),
    );
  }, [decoys, reduceMotion, stage, topic]);

  const landed = stage === "settling" || stage === "revealed";

  return (
    <div className="w-full">
      {/* The slab. Perspective lives on the wrapper so the surface can pitch
          in depth rather than merely scaling. */}
      <div style={{ perspective: "1400px" }}>
        <motion.div
          animate={
            reduceMotion
              ? {}
              : stage === "winding"
                ? { scale: 0.965, rotateX: 4, filter: "brightness(0.72)" }
                : stage === "rolling"
                  ? { scale: 0.985, rotateX: 1.5, filter: "brightness(0.88)" }
                  : landed
                    ? { scale: 1, rotateX: 0, filter: "brightness(1)" }
                    : {}
          }
          transition={
            stage === "settling"
              ? { type: "spring", bounce: 0.38, duration: 0.85 }
              : { type: "spring", bounce: 0, duration: 0.42 }
          }
          className="material m-dense relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-[var(--radius-lg)] px-8 py-14 sm:min-h-[340px] sm:px-14"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Light blooming from the top-left as the topic lands. */}
          <motion.div
            aria-hidden
            initial={false}
            animate={{
              opacity: landed ? 1 : 0,
              scale: landed ? 1 : 1.15,
              filter: landed ? "blur(0px)" : "blur(22px)",
            }}
            transition={{ type: "spring", bounce: 0, duration: 0.9 }}
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(115% 85% at 14% 0%, oklch(76% 0.12 296 / 0.2), transparent 58%)",
            }}
          />

          {/* A specular sweep that crosses the slab once, on landing. */}
          {landed && !reduceMotion && (
            <motion.div
              aria-hidden
              initial={{ x: "-130%" }}
              animate={{ x: "130%" }}
              transition={{ duration: 1.1, ease: [0.23, 1, 0.32, 1] }}
              className="pointer-events-none absolute inset-y-0 w-1/2"
              style={{
                background:
                  "linear-gradient(100deg, transparent, oklch(100% 0 0 / 0.07), transparent)",
              }}
            />
          )}

          <motion.p
            key={step}
            initial={reduceMotion ? false : { y: -65, opacity: 0.1, filter: "blur(7px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            transition={
              landed
                ? { type: "spring", stiffness: 280, damping: 22, bounce: 0.35 }
                : { duration: 0.09, ease: "linear" }
            }
            className={`t-title relative max-w-2xl text-center transition-colors duration-500 ${
              landed ? "text-ink font-normal" : "text-ink-4"
            }`}
            style={{ willChange: stage === "rolling" ? "transform, opacity" : undefined }}
          >
            {text}
          </motion.p>

          {/* Category, revealed only once the topic is real. */}
          <motion.p
            aria-hidden={!landed}
            initial={false}
            animate={{ opacity: landed ? 1 : 0 }}
            transition={{ duration: 0.4, delay: landed ? 0.25 : 0 }}
            className="t-micro absolute bottom-6 left-1/2 -translate-x-1/2"
          >
            {category}
          </motion.p>
        </motion.div>
      </div>

      {/* Controls */}
      <div className="mt-9 flex flex-col items-center">
        {stage !== "revealed" ? (
          <Button
            variant="primary"
            size="lg"
            onClick={roll}
            disabled={stage !== "ready"}
            loading={stage === "winding" || stage === "rolling" || stage === "settling"}
          >
            {quick ? "Roll a topic" : "Roll today's topic"}
          </Button>
        ) : (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
            className="flex flex-col items-center gap-5"
          >
            <p className="t-micro">
              {quick ? "60 seconds / no prep" : "30 seconds to think / 2 minutes to talk"}
            </p>
            <form action={startSession} onSubmit={() => setStarting(true)}>
              <input type="hidden" name="topicId" value={topicId} />
              {quick && <input type="hidden" name="mode" value="quick" />}
              <Button type="submit" variant="primary" size="lg" loading={starting}>
                I&apos;m ready
              </Button>
            </form>
          </motion.div>
        )}
      </div>
    </div>
  );
}
