import { Flame, Sparkles, TrendingUp } from "lucide-react";

import type { Evaluation } from "@/db/app-schema";
import { unmeasurableFor } from "@/lib/scoring";
import { SCORE_DIMENSIONS, SCORE_HINTS, SCORE_LABELS } from "@/lib/types";

export function ScoreReport({
  topic,
  evaluation,
  streak,
}: {
  topic: string;
  evaluation: Evaluation;
  streak: number;
}) {
  const fillerTotal = evaluation.fillerWords.reduce((sum, hit) => sum + hit.count, 0);
  const skipped = unmeasurableFor(evaluation.inputMode);

  return (
    <div className="rise">
      {/* Headline score */}
      <header className="text-center">
        <p className="t-label text-muted">Your report</p>
        <h1 className="t-heading mt-2 text-ink-soft">{topic}</h1>

        <div className="mt-6 flex items-baseline justify-center gap-1.5">
          <span className="t-numeric text-[64px] leading-none font-semibold">
            {evaluation.overallScore}
          </span>
          <span className="text-[20px] text-muted">/100</span>
        </div>

        {evaluation.summary && (
          <p className="t-body mx-auto mt-4 max-w-md text-ink-soft">{evaluation.summary}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[13px]">
          <Stat label={`${evaluation.wordCount ?? 0} words`} />
          {evaluation.wordsPerMinute !== null && <Stat label={`${evaluation.wordsPerMinute} wpm`} />}
          <Stat label={`${fillerTotal} filler${fillerTotal === 1 ? "" : "s"}`} />
          {streak > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">
              <Flame className="size-3.5" />
              {streak}-day streak
            </span>
          )}
        </div>
      </header>

      {/* Six dimensions */}
      <section className="card mt-9 p-6">
        <h2 className="mb-5 text-[12px] font-semibold tracking-wide text-muted uppercase">
          Breakdown
        </h2>
        <ul className="space-y-4">
          {SCORE_DIMENSIONS.map((dimension, index) => {
            const unmeasured = skipped.includes(dimension);
            const value = evaluation.scores[dimension];

            return (
              <li key={dimension} className={unmeasured ? "opacity-60" : undefined}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-[14.5px] font-medium">{SCORE_LABELS[dimension]}</span>
                  <span className="t-numeric text-[13.5px] text-ink-soft">
                    {unmeasured ? "n/a" : value}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-surface-2"
                  {...(unmeasured
                    ? {}
                    : {
                        role: "meter",
                        "aria-valuenow": value,
                        "aria-valuemin": 0,
                        "aria-valuemax": 100,
                        "aria-label": SCORE_LABELS[dimension],
                      })}
                >
                  {!unmeasured && (
                    <div
                      className="meter-fill h-full rounded-full bg-accent"
                      style={{
                        width: `${value}%`,
                        // Staggered so the bars read top-to-bottom as a sequence
                        // rather than landing as one block.
                        animationDelay: `${index * 70}ms`,
                      }}
                    />
                  )}
                </div>
                <p className="mt-1 text-[12.5px] text-muted">
                  {unmeasured
                    ? "Not scored - you typed this answer, so there's no speaking pace to measure."
                    : SCORE_HINTS[dimension]}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 border-t border-line pt-4 text-[12.5px] leading-relaxed text-muted">
          Pace and filler control are measured from your transcript and the clock, not judged by the
          model. The overall score is a weighted composite, not an average
          {skipped.length > 0 && ", and excludes anything that couldn't be measured"}.
        </p>
      </section>

      {/* Strengths / improvements */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <List
          icon={<Sparkles className="size-4 text-positive" />}
          title="What worked"
          items={evaluation.strengths}
        />
        <List
          icon={<TrendingUp className="size-4 text-warn" />}
          title="What to fix"
          items={evaluation.improvements}
        />
      </div>

      {/* Filler words */}
      {evaluation.fillerWords.length > 0 && (
        <section className="card mt-4 p-6">
          <h2 className="mb-3 text-[12px] font-semibold tracking-wide text-muted uppercase">
            Filler words
          </h2>
          <ul className="flex flex-wrap gap-2">
            {evaluation.fillerWords.map((hit) => (
              <li
                key={hit.word}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[13.5px]"
              >
                <span className="font-medium">{hit.word}</span>
                <span className="font-mono text-[12px] text-muted">x{hit.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Transcript with fillers highlighted */}
      <section className="card mt-4 p-6">
        <h2 className="mb-3 text-[12px] font-semibold tracking-wide text-muted uppercase">
          What you said
        </h2>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {highlightFillers(
            evaluation.transcript,
            evaluation.fillerWords.map((hit) => hit.word),
          )}
        </p>
      </section>

      {/* Improved answer */}
      {evaluation.improvedAnswer && (
        <section className="mt-4 rounded-[var(--radius-md)] border border-accent/25 bg-accent-soft/40 p-6">
          <h2 className="mb-3 text-[12px] font-semibold tracking-wide text-accent uppercase">
            The same answer, tightened
          </h2>
          <p className="text-[15px] leading-relaxed">{evaluation.improvedAnswer}</p>
          <p className="mt-3 text-[12.5px] text-muted">
            Your argument and your examples, with the slack taken out.
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[12px] text-ink-soft">
      {label}
    </span>
  );
}

function List({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <section className="card p-6">
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-muted uppercase">
        {icon}
        {title}
      </h2>
      <ul className="space-y-2.5">
        {items.map((item, index) => (
          <li key={index} className="text-[14.5px] leading-relaxed text-ink-soft">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Marks each filler occurrence in the transcript.
 *
 * Splits on a single alternation of the words we already counted, so the
 * highlighting can never disagree with the tally shown above it.
 */
function highlightFillers(transcript: string, fillers: string[]) {
  if (fillers.length === 0) return transcript;

  const escaped = fillers
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"))
    .sort((a, b) => b.length - a.length);

  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

  return transcript.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        className="rounded bg-warn/25 px-1 py-0.5 text-ink decoration-warn/60 underline-offset-2"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
