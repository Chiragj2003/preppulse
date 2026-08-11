import { cn } from "@/lib/utils";

/**
 * The headline score. Set at display scale in the mono face, because a number
 * that carries this much weight should read as a measurement, not a label.
 * The /100 is deliberately tiny — the contrast between the two is what makes
 * the figure feel considered.
 */
export function ScoreDisplay({
  value,
  caption,
  className,
}: {
  value: number;
  caption?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="flex items-start gap-2">
        <span className="t-numeric text-[clamp(4.5rem,16vw,8rem)] leading-[0.85] font-medium">
          {value}
        </span>
        <span className="t-micro mt-3">/100</span>
      </div>
      {caption && <p className="t-micro mt-5">{caption}</p>}
    </div>
  );
}

/**
 * One measured dimension.
 *
 * The bar is a hairline, not a chunky progress track — at this weight a row of
 * six reads as a precision instrument rather than a set of loading bars. A
 * dimension we could not honestly measure is drawn dimmed with no bar at all,
 * never as a zero.
 */
export function EvaluationMetric({
  label,
  hint,
  value,
  unmeasured = false,
  unmeasuredReason,
  delay = 0,
}: {
  label: string;
  hint: string;
  value: number;
  unmeasured?: boolean;
  unmeasuredReason?: string;
  delay?: number;
}) {
  return (
    <div className={cn("py-4", unmeasured && "opacity-45")}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="t-body font-medium">{label}</span>
        <span className="t-numeric text-[15px] text-ink-2">{unmeasured ? "—" : value}</span>
      </div>

      <div
        className="mt-3 h-px w-full bg-[var(--color-line)]"
        {...(unmeasured
          ? {}
          : {
              role: "meter",
              "aria-valuenow": value,
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-label": label,
            })}
      >
        {!unmeasured && (
          <div
            className="h-px origin-left"
            style={{
              width: `${value}%`,
              background: "var(--color-accent)",
              boxShadow: "0 0 8px var(--color-accent)",
              animation: `grow 900ms var(--ease-out) ${delay}ms backwards`,
            }}
          />
        )}
      </div>

      <p className="t-meta mt-2.5 text-ink-4">{unmeasured ? unmeasuredReason : hint}</p>
    </div>
  );
}
