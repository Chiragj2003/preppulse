"use client";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";

/**
 * Time as a visual object, not a number in a card.
 *
 * The digits are the size of a headline and the remaining time is drawn as a
 * thin arc of light around them, so the room reads at a glance from across a
 * desk. The arc transitions linearly over exactly one second — easing it would
 * drift it out of sync with the digits, which is the kind of mismatch you feel
 * before you can name it.
 */
export function Timer({
  remaining,
  total,
  tone = "accent",
  label,
  className,
}: {
  remaining: number;
  total: number;
  tone?: "neutral" | "accent" | "caution";
  label?: string;
  className?: string;
}) {
  const progress = total > 0 ? 1 - remaining / total : 0;
  const radius = 132;
  const circumference = 2 * Math.PI * radius;

  const stroke = {
    neutral: "var(--color-ink-4)",
    accent: "var(--color-accent)",
    caution: "var(--color-caution)",
  }[tone];

  return (
    <div className={cn("relative grid place-items-center", className)}>
      <svg
        viewBox="0 0 300 300"
        className="absolute size-full -rotate-90 overflow-visible"
        aria-hidden
      >
        <circle
          cx="150"
          cy="150"
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="2"
        />
        <circle
          cx="150"
          cy="150"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * progress}
          style={{
            transition: "stroke-dashoffset 1s linear, stroke 500ms var(--ease-out)",
            filter: `drop-shadow(0 0 12px ${stroke})`,
          }}
        />
      </svg>

      <div className="relative flex flex-col items-center">
        <span
          className="t-numeric text-[clamp(3.5rem,12vw,5.5rem)] leading-none font-medium transition-colors duration-500"
          style={{ color: tone === "caution" ? "var(--color-caution)" : "var(--color-ink)" }}
          // Announce only at meaningful thresholds, not on every tick.
          aria-live="off"
        >
          {formatDuration(remaining)}
        </span>
        {label && <span className="t-micro mt-4">{label}</span>}
      </div>
    </div>
  );
}
