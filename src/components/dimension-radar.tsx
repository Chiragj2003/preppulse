"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

import type { DimensionAverages } from "@/lib/progress";
import { SCORE_DIMENSIONS, SCORE_LABELS } from "@/lib/types";

/**
 * Six axes, two polygons: this month against the month before it.
 *
 * A single polygon tells you your shape but not whether it's moving, which is
 * the only thing a returning user wants to know. The previous window is drawn
 * underneath in muted ink so improvement reads as the accent pushing outward
 * past a ghost.
 *
 * Recharts rather than hand-rolled polar maths: it is already a dependency and
 * already renders the sibling area chart on this page, so a second charting
 * approach here would be inconsistent for no gain. Every colour is a token.
 */
export function DimensionRadar({ data }: { data: DimensionAverages }) {
  if (!data.current) return null;

  const points = SCORE_DIMENSIONS.map((dimension) => ({
    axis: SCORE_LABELS[dimension],
    current: data.current![dimension],
    previous: data.previous?.[dimension] ?? null,
  }));

  const hasComparison = data.previous !== null;

  return (
    <figure>
      <div className="h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={points} outerRadius="72%" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <PolarGrid stroke="var(--color-line)" strokeDasharray="2 5" />

            <PolarAngleAxis
              dataKey="axis"
              tick={{
                fill: "var(--color-ink-3)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
              }}
            />

            {/* Fixed 0-100. Auto-scaling would make a five-point difference
                look like a transformation. */}
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />

            {hasComparison && (
              <Radar
                name="Previous 30 days"
                dataKey="previous"
                stroke="var(--color-ink-4)"
                strokeWidth={1.5}
                fill="var(--color-ink-4)"
                fillOpacity={0.08}
                isAnimationActive={false}
              />
            )}

            <Radar
              name="Last 30 days"
              dataKey="current"
              stroke="var(--color-accent)"
              strokeWidth={2}
              fill="var(--color-accent)"
              fillOpacity={0.18}
              dot={{ r: 3, fill: "var(--color-void)", stroke: "var(--color-accent)", strokeWidth: 2 }}
              animationDuration={700}
              animationEasing="ease-out"
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="t-micro flex items-center gap-2">
          <span className="h-px w-4 bg-accent" aria-hidden />
          Last 30 days
          <span className="text-ink-4">({data.currentSessions})</span>
        </span>

        {hasComparison ? (
          <span className="t-micro flex items-center gap-2">
            <span className="h-px w-4 bg-[var(--color-ink-4)]" aria-hidden />
            Previous 30
            <span className="text-ink-4">({data.previousSessions})</span>
          </span>
        ) : (
          <span className="t-micro text-ink-4">
            No earlier sessions to compare against yet
          </span>
        )}
      </figcaption>
    </figure>
  );
}
