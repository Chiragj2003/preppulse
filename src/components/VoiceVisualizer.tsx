"use client";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, Volume2, Radio, MessageSquare } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import type { VoiceSessionStatus } from "@/lib/useVoiceSession";

export interface VoiceVisualizerProps {
  status: VoiceSessionStatus;
  audioLevel: number;
  transcript?: string;
  isMicActive?: boolean;
  isSpeaking?: boolean;
  counterpartName?: string;
  className?: string;
  onToggleMic?: () => void;
  onStop?: () => void;
}

export function VoiceVisualizer({
  status,
  audioLevel,
  transcript = "",
  isMicActive = true,
  counterpartName = "AI Partner",
  className = "",
  onToggleMic,
  onStop,
}: VoiceVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  // 60fps Canvas render loop for dynamic pulsing audio waves
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animFrame: number;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let phase = 0;

    const render = () => {
      phase += 0.05;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const bars = 36;
      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      const centerY = height / 2;

      // Color scheme based on state
      let colorHue = 265; // Indigo for speaking
      if (status === "listening") colorHue = 160; // Emerald/Teal
      if (status === "interrupted") colorHue = 35; // Caution Amber
      if (status === "processing") colorHue = 210; // Blue

      for (let i = 0; i < bars; i++) {
        const x = i * (barWidth + gap);
        // Calculate dynamic wave height from audioLevel + sine wave phase
        const wave = Math.sin(phase + i * 0.25) * 0.5 + 0.5;
        const normalizedLevel = Math.max(0.08, audioLevel * 2.2 + wave * 0.15);
        const barHeight = Math.min(height * 0.85, Math.max(4, height * normalizedLevel * 0.8));

        const y = centerY - barHeight / 2;
        const alpha = Math.min(1, 0.35 + normalizedLevel * 0.65);

        ctx.fillStyle = `hsla(${colorHue}, 85%, 65%, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }

      animFrame = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [audioLevel, status]);

  const getStatusBadge = () => {
    switch (status) {
      case "listening":
        return { label: "Listening...", icon: <Mic className="size-3.5 text-[var(--color-positive)]" />, bg: "bg-[var(--color-positive)]/10 border-[var(--color-positive)]/30 text-[var(--color-positive)]" };
      case "speaking":
        return { label: `${counterpartName} Speaking`, icon: <Volume2 className="size-3.5 text-accent animate-pulse" />, bg: "bg-accent/10 border-accent/30 text-accent" };
      case "interrupted":
        return { label: "Go ahead", icon: <Mic className="size-3.5 text-[var(--color-caution)]" />, bg: "bg-[var(--color-caution)]/10 border-[var(--color-caution)]/30 text-[var(--color-caution)]" };
      case "processing":
        return { label: "Thinking...", icon: <Radio className="size-3.5 text-ink-3 animate-spin" />, bg: "bg-white/[0.06] border-line text-ink-2" };
      case "connecting":
        return { label: "Connecting...", icon: <Radio className="size-3.5 text-ink-3 animate-spin" />, bg: "bg-white/[0.06] border-line text-ink-3" };
      default:
        return { label: "Ready", icon: <Mic className="size-3.5 text-ink-3" />, bg: "bg-white/[0.06] border-line text-ink-3" };
    }
  };

  const badge = getStatusBadge();

  // Keep the newest words in view as they arrive, without moving the dock.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  return (
    <div className={`w-full max-w-xl mx-auto ${className}`}>
      <Surface material="frost" radius="lg" className="p-4 sm:p-5 border border-line/80 shadow-[var(--shadow-float)] relative overflow-hidden backdrop-blur-xl">
        {/* Top bar: Status indicator & toggle controls */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[12px] font-medium transition-all ${badge.bg}`}>
            {badge.icon}
            <span>{badge.label}</span>
          </div>

          {/* There was a "Cut in" button here. It was a button for something
              that already happens: the moment you start talking over the AI,
              the mic level crosses the barge-in threshold and the floor is
              yours. A control that duplicates a behaviour teaches people the
              behaviour doesn't exist. */}
          <div className="flex items-center gap-2">
            {onToggleMic && (
              <button
                type="button"
                onClick={onToggleMic}
                className={`grid size-11 place-items-center rounded-full border transition-all ${
                  isMicActive
                    ? "bg-accent/15 border-accent/40 text-accent hover:bg-accent/25"
                    : "bg-[var(--color-critical)]/15 border-[var(--color-critical)]/40 text-[var(--color-critical)] hover:bg-[var(--color-critical)]/25"
                }`}
                aria-label={isMicActive ? "Mute microphone" : "Unmute microphone"}
              >
                {isMicActive ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              </button>
            )}

            {onStop && (
              <button
                type="button"
                onClick={onStop}
                className="grid size-11 place-items-center rounded-full bg-white/[0.06] border border-line text-ink-3 hover:text-ink transition-colors"
                aria-label="Stop audio session"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="grid size-11 place-items-center rounded-full bg-white/[0.06] border border-line text-ink-3 hover:text-ink transition-colors"
              title="Toggle Live Transcript View"
            >
              <MessageSquare className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Dynamic Canvas Visualizer */}
        <div className="h-12 w-full flex items-center justify-center relative my-1">
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>

        {/* Live Speech Transcript Bubble */}
        <AnimatePresence>
          {(transcript || expanded) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              {/* Vibrancy: text sitting over a frosted, blurred surface needs
                  MORE weight and contrast than text on a solid one, not less.
                  `font-light` here was the legibility bug — 300-weight strokes
                  on blurred dark glass read as grey mush. Medium weight, full
                  ink, and a touch of tracking. */}
              <div className="mt-3 border-t border-line/40 pt-3 text-left">
                <p className="t-micro mb-1.5">Live words</p>
                {/* Capped and internally scrolled. This dock is anchored to the
                    bottom of the viewport, so an uncapped transcript grows
                    UPWARD and swallows the conversation behind it. Holding the
                    dock at a fixed maximum keeps the room visible however long
                    someone talks. */}
                <div
                  ref={scrollRef}
                  className="max-h-[7.5rem] overflow-y-auto overscroll-contain pr-1"
                >
                  {transcript ? (
                    <p className="text-[15px] leading-relaxed font-medium tracking-[0.005em] text-ink">
                      {transcript}
                    </p>
                  ) : (
                    <p className="text-[15px] leading-relaxed text-ink-3">
                      Speak naturally — your words appear here as you go.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Surface>
    </div>
  );
}
