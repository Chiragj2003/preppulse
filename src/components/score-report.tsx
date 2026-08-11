import type { Evaluation } from "@/db/app-schema";
import { Surface } from "@/components/ui/surface";
import { EvaluationMetric, ScoreDisplay } from "@/components/ui/score";
import { unmeasurableFor } from "@/lib/scoring";
import { SCORE_DIMENSIONS, SCORE_HINTS, SCORE_LABELS } from "@/lib/types";

/**
 * The report reads as coaching, not a scorecard.
 *
 * Order is deliberate: what you did well, what to fix, then the evidence, then
 * the measurements. A person who has just spoken for two minutes wants to know
 * how it went before they want six numbers — leading with the metrics turns a
 * coaching session into a performance review.
 */
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
    <div className="space-y-16">
      {/* ── Verdict ──────────────────────────────────────────────────────── */}
      <header className="rise pt-6 text-center">
        <p className="t-micro mb-8">{topic}</p>
        <ScoreDisplay value={evaluation.overallScore} />
        {evaluation.summary && (
          <p className="t-lead mx-auto mt-9 max-w-lg text-ink">{evaluation.summary}</p>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <Figure value={evaluation.wordCount ?? 0} label="words" />
          {evaluation.wordsPerMinute !== null && (
            <Figure value={evaluation.wordsPerMinute} label="per minute" />
          )}
          <Figure value={fillerTotal} label={fillerTotal === 1 ? "filler" : "fillers"} />
          {streak > 0 && <Figure value={streak} label={streak === 1 ? "day" : "day streak"} />}
        </div>
      </header>

      <div className="rule" />

      {/* ── Where you landed it / where to push ──────────────────────────── */}
      <section className="rise grid gap-12 sm:grid-cols-2 [animation-delay:80ms]">
        <Coaching
          eyebrow="Where you landed it"
          items={evaluation.strengths}
          accent="var(--color-positive)"
        />
        <Coaching
          eyebrow="What to try next"
          items={evaluation.improvements}
          accent="var(--color-caution)"
        />
      </section>

      {/* ── The tape ─────────────────────────────────────────────────────── */}
      <section className="rise [animation-delay:140ms]">
        <p className="t-micro mb-6">What you said</p>
        <Surface material="liquid" radius="lg" className="p-7 sm:p-10">
          <p className="t-lead text-[17px] leading-[1.85] text-ink-2">
            {annotate(
              evaluation.transcript,
              evaluation.fillerWords.map((hit) => hit.word),
            )}
          </p>
        </Surface>

        {evaluation.fillerWords.length > 0 && (
          <div className="mt-6 flex flex-wrap items-baseline gap-x-7 gap-y-3">
            <p className="t-micro">Filler</p>
            {evaluation.fillerWords.map((hit) => (
              <span key={hit.word} className="t-meta text-ink-2">
                {hit.word}
                <span className="t-numeric ml-2 text-[12px] text-ink-4">{hit.count}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── The rewrite ──────────────────────────────────────────────────── */}
      {evaluation.improvedAnswer && (
        <section className="rise [animation-delay:180ms]">
          <p className="t-micro mb-6">The same answer, tightened</p>
          <Surface material="dense" radius="lg" refract className="p-7 sm:p-10">
            <p className="t-lead text-[17px] leading-[1.85] text-ink">
              {evaluation.improvedAnswer}
            </p>
          </Surface>
          <p className="t-meta mt-4 text-ink-4">
            Your argument and your examples — with the slack taken out.
          </p>
        </section>
      )}

      {/* ── Measurements last ────────────────────────────────────────────── */}
      <section className="rise [animation-delay:220ms]">
        <p className="t-micro mb-2">Measured</p>
        <div className="divide-y divide-line/70">
          {SCORE_DIMENSIONS.map((dimension, index) => (
            <EvaluationMetric
              key={dimension}
              label={SCORE_LABELS[dimension]}
              hint={SCORE_HINTS[dimension]}
              value={evaluation.scores[dimension]}
              unmeasured={skipped.includes(dimension)}
              unmeasuredReason="Not scored — you typed this answer, so there's no speaking pace to measure."
              delay={index * 70}
            />
          ))}
        </div>
        <p className="t-meta mt-6 max-w-xl text-ink-4">
          Pace and filler control are counted from your transcript and the clock, not judged by a
          model. The headline figure is a weighted composite
          {skipped.length > 0 && " over what could actually be measured"} — never a plain average.
        </p>
      </section>
    </div>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="t-numeric text-[20px] text-ink">{value}</span>
      <span className="t-micro">{label}</span>
    </span>
  );
}

function Coaching({
  eyebrow,
  items,
  accent,
}: {
  eyebrow: string;
  items: string[];
  accent: string;
}) {
  return (
    <div>
      <p className="t-micro mb-6">{eyebrow}</p>
      <ul className="space-y-6">
        {items.map((item, index) => (
          <li key={index} className="flex gap-4">
            <span
              className="mt-2.5 h-px w-6 shrink-0"
              style={{ background: accent }}
              aria-hidden
            />
            <p className="t-body text-ink-2">{item}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Filler words as intelligent annotation, not error highlighting.
 *
 * A red background on every "um" reads as a spellchecker screaming at you. So
 * the word is simply dimmed and underlined with a faint dotted rule — present,
 * findable, and clearly a note in the margin rather than a mistake. The
 * pattern is built from the same list the tally uses, so the marks in the text
 * can never disagree with the counts beneath it.
 */
function annotate(transcript: string, fillers: string[]) {
  if (fillers.length === 0) return transcript;

  const escaped = fillers
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"))
    .sort((a, b) => b.length - a.length);

  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

  return transcript.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <span
        key={index}
        className="text-ink-4"
        style={{
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textDecorationColor: "var(--color-caution)",
          textUnderlineOffset: "5px",
        }}
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}
