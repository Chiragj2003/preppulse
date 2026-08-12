"use client";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, Volume2, Zap, Radio, MessageSquare } from "lucide-react";

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
  onInterrupt?: () => void;
  onStop?: () => void;
}

export function VoiceVisualizer({
  status,
  audioLevel,
  transcript = "",
  isMicActive = true,
  isSpeaking = false,
  counterpartName = "AI Partner",
  className = "",
  onToggleMic,
  onInterrupt,
  onStop,
}: VoiceVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
        return { label: "Listening...", icon: <Mic className="size-3.5 text-emerald-400" />, bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" };
      case "speaking":
        return { label: `${counterpartName} Speaking`, icon: <Volume2 className="size-3.5 text-indigo-400 animate-pulse" />, bg: "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" };
      case "interrupted":
        return { label: "Interrupted!", icon: <Zap className="size-3.5 text-amber-400" />, bg: "bg-amber-500/10 border-amber-500/30 text-amber-300" };
      case "processing":
        return { label: "Thinking...", icon: <Radio className="size-3.5 text-blue-400 animate-spin" />, bg: "bg-blue-500/10 border-blue-500/30 text-blue-300" };
      case "connecting":
        return { label: "Connecting...", icon: <Radio className="size-3.5 text-zinc-400 animate-spin" />, bg: "bg-zinc-500/10 border-zinc-500/30 text-zinc-300" };
      default:
        return { label: "Ready", icon: <Mic className="size-3.5 text-zinc-400" />, bg: "bg-zinc-500/10 border-zinc-500/30 text-zinc-300" };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className={`w-full max-w-xl mx-auto ${className}`}>
      <Surface material="frost" radius="lg" className="p-4 sm:p-5 border border-line/80 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        {/* Top bar: Status indicator & toggle controls */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[12px] font-medium transition-all ${badge.bg}`}>
            {badge.icon}
            <span>{badge.label}</span>
          </div>

          <div className="flex items-center gap-2">
            {isSpeaking && onInterrupt && (
              <button
                type="button"
                onClick={onInterrupt}
                className="pressable inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[12px] hover:bg-amber-500/25 transition-colors"
                title="Interrupt AI and take floor"
              >
                <Zap className="size-3" />
                <span>Cut in</span>
              </button>
            )}

            {onToggleMic && (
              <button
                type="button"
                onClick={onToggleMic}
                className={`p-2 rounded-full border transition-all ${
                  isMicActive
                    ? "bg-accent/15 border-accent/40 text-accent hover:bg-accent/25"
                    : "bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/25"
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
                className="p-2 rounded-full bg-zinc-800/60 border border-zinc-700 text-zinc-400 hover:text-ink transition-colors"
                aria-label="Stop audio session"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-2 rounded-full bg-zinc-800/60 border border-zinc-700 text-zinc-400 hover:text-ink transition-colors"
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
              <div className="mt-3 pt-3 border-t border-line/40 text-left">
                <p className="t-micro text-ink-4 mb-1">Live Words</p>
                <p className="t-body text-ink text-sm sm:text-base leading-relaxed font-light">
                  {transcript ? (
                    <span>{transcript}</span>
                  ) : (
                    <span className="italic text-ink-4">Speak naturally — your words appear here in real-time.</span>
                  )}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Surface>
    </div>
  );
}
