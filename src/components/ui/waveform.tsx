"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Real voice-activity visualisation, driven by the microphone through a Web
 * Audio analyser — not a decorative loop that animates whether or not anyone
 * is speaking.
 *
 * This earns its place: while recording, the single thing a person needs to
 * know is "is it hearing me?". A fake waveform actively lies about that.
 *
 * Canvas rather than 60 animated DOM nodes, and a single rAF loop that stops
 * dead when the component unmounts or recording ends.
 */
export function Waveform({
  active,
  bars = 48,
  className,
  onLevel,
}: {
  active: boolean;
  bars?: number;
  className?: string;
  /** Smoothed 0-1 loudness, for anything else that wants to react to voice. */
  onLevel?: (level: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [denied, setDenied] = useState(false);
  const levelCallback = useRef(onLevel);
  levelCallback.current = onLevel;

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let stream: MediaStream | undefined;
    let audioContext: AudioContext | undefined;
    let frame = 0;
    let cancelled = false;

    // Each bar keeps its own eased value so the field settles like cloth
    // rather than snapping frame to frame.
    const heights = new Float32Array(bars).fill(0);

    async function begin() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (!cancelled) setDenied(true);
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);

      const spectrum = new Uint8Array(analyser.frequencyBinCount);
      const context = canvas!.getContext("2d");
      if (!context) return;

      const draw = () => {
        frame = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(spectrum);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = canvas!.clientWidth;
        const height = canvas!.clientHeight;
        if (canvas!.width !== width * dpr || canvas!.height !== height * dpr) {
          canvas!.width = width * dpr;
          canvas!.height = height * dpr;
        }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);

        // Speech energy sits low in the spectrum; sampling the whole range
        // would leave the bars flat while someone is talking normally.
        const usable = Math.floor(spectrum.length * 0.62);
        let sum = 0;

        const gap = 3;
        const barWidth = Math.max(1.5, (width - gap * (bars - 1)) / bars);

        for (let i = 0; i < bars; i++) {
          const bin = Math.floor((i / bars) * usable);
          const raw = spectrum[bin] / 255;
          sum += raw;

          const target = Math.pow(raw, 0.75);
          heights[i] += (target - heights[i]) * 0.32;

          const barHeight = Math.max(2, heights[i] * height * 0.92);
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;

          // Louder bars glow; quiet ones recede into the substrate.
          const intensity = 0.22 + heights[i] * 0.78;
          context.fillStyle = `oklch(76% 0.12 296 / ${intensity})`;

          context.beginPath();
          context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
          context.fill();
        }

        levelCallback.current?.(sum / bars);
      };

      draw();
    }

    void begin();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void audioContext?.close();
    };
  }, [active, bars]);

  if (!active) {
    // A flat resting line, so the space doesn't collapse and reflow the
    // layout the moment recording starts.
    return (
      <div className={className} aria-hidden>
        <div className="h-px w-full bg-[var(--color-line)]" />
      </div>
    );
  }

  if (denied) {
    return (
      <p className={`t-meta text-center ${className ?? ""}`}>
        No microphone signal — the level meter is off.
      </p>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="Microphone input level"
    />
  );
}
