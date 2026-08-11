import type { DayPoint } from "@/lib/gamification";

/**
 * Hand-drawn SVG, no charting library.
 *
 * The requirement was to avoid generic dashboard charts, and a library would
 * have brought its own visual opinions — gridlines, tooltips, a legend — that
 * would then need overriding to look like the rest of the product. This is
 * about sixty lines and inherits the design tokens directly.
 *
 * A server component: there is no interaction here, so there is no reason to
 * ship it to the browser.
 */
export function ProgressChart({ series }: { series: DayPoint[] }) {
  const width = 760;
  const height = 200;
  const padding = { top: 16, bottom: 28, left: 0, right: 0 };
  const plotHeight = height - padding.top - padding.bottom;

  const step = series.length > 1 ? width / (series.length - 1) : width;
  const scored = series.filter((p) => p.averageScore !== null);

  // Fixed 0-100 domain. Auto-scaling to the data would make a 4-point wobble
  // look like a cliff, which is a chart lying about the size of a change.
  const y = (score: number) => padding.top + plotHeight * (1 - score / 100);

  const points = series
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.averageScore !== null);

  // Rest days break the line rather than being interpolated through: joining
  // across a gap would invent a score for a day nobody practised.
  const segments: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  let previousIndex = -2;

  for (const { point, index } of points) {
    if (index !== previousIndex + 1 && run.length > 0) {
      segments.push(run);
      run = [];
    }
    run.push({ x: index * step, y: y(point.averageScore!) });
    previousIndex = index;
  }
  if (run.length > 0) segments.push(run);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`Average score over the last ${series.length} days`}
      >
        {/* Reference lines at 50 and 75, unlabelled inside the plot */}
        {[50, 75].map((mark) => (
          <line
            key={mark}
            x1={0}
            x2={width}
            y1={y(mark)}
            y2={y(mark)}
            stroke="var(--color-line)"
            strokeDasharray="2 6"
          />
        ))}

        {/* Session-count bars: presence, sitting behind the score line */}
        {series.map((point, index) => {
          if (point.sessions === 0) return null;
          const barHeight = Math.min(plotHeight, point.sessions * 10);
          return (
            <rect
              key={point.date}
              x={index * step - 3}
              y={padding.top + plotHeight - barHeight}
              width={6}
              height={barHeight}
              rx={3}
              fill="var(--color-accent)"
              opacity={0.14}
            />
          );
        })}

        {segments.map((segment, i) => (
          <polyline
            key={i}
            points={segment.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 8px var(--color-accent))" }}
          />
        ))}

        {points.map(({ point, index }) => (
          <circle
            key={point.date}
            cx={index * step}
            cy={y(point.averageScore!)}
            r={3.5}
            fill="var(--color-void)"
            stroke="var(--color-accent)"
            strokeWidth={2}
          />
        ))}

        {/* Only the ends are labelled. A label per day is noise at this width. */}
        <text
          x={0}
          y={height - 6}
          fill="var(--color-ink-4)"
          fontSize="11"
          fontFamily="var(--font-mono)"
        >
          {formatDay(series[0]?.date)}
        </text>
        <text
          x={width}
          y={height - 6}
          textAnchor="end"
          fill="var(--color-ink-4)"
          fontSize="11"
          fontFamily="var(--font-mono)"
        >
          Today
        </text>
      </svg>

      <figcaption className="t-meta mt-4 text-ink-4">
        {scored.length === 0
          ? "No scored sessions in this window yet."
          : `Average score per day across ${scored.length} active ${scored.length === 1 ? "day" : "days"}. Bars show how many sessions you ran.`}
      </figcaption>
    </figure>
  );
}

function formatDay(date?: string) {
  if (!date) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
