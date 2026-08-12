"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw, Sparkles } from "lucide-react";
import { Surface } from "@/components/ui/surface";

export interface RouletteTopicSlotProps {
  initialTopic: string;
  decoys?: string[];
  category?: string;
  onSpin?: () => Promise<string | void> | string | void;
  className?: string;
}

export function RouletteTopicSlot({
  initialTopic,
  decoys = [],
  category,
  onSpin,
  className = "",
}: RouletteTopicSlotProps) {
  const [topicText, setTopicText] = useState(initialTopic);
  const [isSpinning, setIsSpinning] = useState(false);
  const [landed, setLanded] = useState(true);
  const reduceMotion = useReducedMotion();
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setTopicText(initialTopic);
  }, [initialTopic]);

  useEffect(() => {
    const pending = animTimeoutRef.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const spinRoulette = useCallback(async () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setLanded(false);

    let nextTopic = initialTopic;
    if (onSpin) {
      const res = await onSpin();
      if (typeof res === "string") nextTopic = res;
    }

    if (reduceMotion) {
      setTopicText(nextTopic);
      setIsSpinning(false);
      setLanded(true);
      return;
    }

    // Top-to-Down Slot Reel Animation Sequence
    const samplePool = [
      "Should AI replace human interviewers?",
      "The ethics of gene editing in humans",
      "Is remote work making us less creative?",
      "How to build high-performance teams",
      "Universal basic income: pros and cons",
      "The role of space exploration in human progress",
      ...decoys,
    ];

    let delay = 50;
    let elapsed = 0;
    const totalSteps = 16;

    for (let i = 0; i < totalSteps; i++) {
      elapsed += delay;
      delay = Math.round(delay * 1.22); // Top-to-down deceleration curve

      animTimeoutRef.current.push(
        setTimeout(() => {
          const randomIndex = Math.floor(Math.random() * samplePool.length);
          setTopicText(samplePool[randomIndex] ?? initialTopic);
        }, elapsed)
      );
    }

    // Final Landing on Topic
    animTimeoutRef.current.push(
      setTimeout(() => {
        setTopicText(nextTopic);
        setIsSpinning(false);
        setLanded(true);
      }, elapsed + delay)
    );
  }, [decoys, initialTopic, isSpinning, onSpin, reduceMotion]);

  return (
    <div className={`w-full ${className}`}>
      {/* Top Header Row with Spin Trigger */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="t-micro">THE TOPIC</p>
          {category && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent/10 border border-accent/25 text-accent font-medium">
              {category}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => void spinRoulette()}
          disabled={isSpinning}
          className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent transition-all duration-300 hover:border-accent/60 hover:bg-accent/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-95 disabled:opacity-50"
        >
          <span className="relative z-10 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-accent" />
            <span>Spin the wheel</span>
          </span>
          <RotateCw
            className={`relative z-10 size-3.5 text-accent transition-transform duration-500 ${
              isSpinning ? "animate-spin" : "group-hover:rotate-180"
            }`}
          />
          {/* Glossy sheen effect */}
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
        </button>
      </div>

      {/* Roulette Slot Container */}
      <div style={{ perspective: "1200px" }}>
        <Surface
          material="dense"
          radius="lg"
          refract
          className="relative min-h-[160px] sm:min-h-[200px] flex items-center justify-center overflow-hidden p-7 sm:p-10 border border-line/80 shadow-2xl"
        >
          {/* Top-to-Down Slot Reel Motion */}
          <motion.div
            key={topicText}
            initial={reduceMotion ? false : { y: -70, opacity: 0.1, filter: "blur(8px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            transition={
              landed
                ? { type: "spring", stiffness: 280, damping: 22, bounce: 0.35 }
                : { duration: 0.08, ease: "linear" }
            }
            className="w-full text-center relative z-10"
          >
            <p className="t-title text-xl sm:text-2xl md:text-3xl max-w-2xl mx-auto text-ink font-normal leading-relaxed tracking-tight">
              {topicText}
            </p>
          </motion.div>

          {/* Radial Bloom Sweep when landed */}
          {landed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="pointer-events-none absolute inset-0 z-0"
              style={{
                background:
                  "radial-gradient(100% 70% at 50% 0%, oklch(76% 0.12 296 / 0.18), transparent 70%)",
              }}
            />
          )}
        </Surface>
      </div>
    </div>
  );
}
