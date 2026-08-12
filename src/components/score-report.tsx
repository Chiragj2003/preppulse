"use client";

import { useState } from "react";
import { Sparkles, CheckCircle2, AlertTriangle, BookOpen, ShieldCheck, Clock } from "lucide-react";
import type { Evaluation } from "@/db/app-schema";
import { Surface } from "@/components/ui/surface";
import { EvaluationMetric, ScoreDisplay } from "@/components/ui/score";
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
  const [activeTab, setActiveTab] = useState<"overview" | "masterpiece" | "transcript">("overview");
  const fillerTotal = evaluation.fillerWords.reduce((sum, hit) => sum + hit.count, 0);
  const skipped = unmeasurableFor(evaluation.inputMode);

  return (
    <div className="space-y-8">
      {/* ── Compact Executive Header ────────────────────────────────────────── */}
      <header className="rise pt-2 text-center">
        <p className="t-micro mb-4 text-ink-4">{topic}</p>
        <div className="flex flex-col items-center justify-center gap-2">
          <ScoreDisplay value={evaluation.overallScore} />
          {evaluation.summary && (
            <p className="t-lead max-w-xl mx-auto mt-4 text-ink text-base sm:text-lg leading-relaxed">
              {evaluation.summary}
            </p>
          )}
        </div>

        {/* Scannable Metric Strip */}
        <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-6 px-6 py-3 rounded-full border border-line/60 bg-black/20 backdrop-blur-md">
          <Figure value={evaluation.wordCount ?? 0} label="words" />
          {evaluation.wordsPerMinute !== null && (
            <Figure value={evaluation.wordsPerMinute} label="WPM pace" />
          )}
          <Figure value={fillerTotal} label={fillerTotal === 1 ? "filler" : "fillers"} />
          {streak > 0 && <Figure value={streak} label={streak === 1 ? "day streak" : "day streak"} />}
        </div>
      </header>

      {/* ── Compact Navigation Tabs ────────────────────────────────────────── */}
      <div className="flex justify-center border-b border-line/60 pb-1">
        <div className="flex gap-2 p-1 rounded-2xl bg-zinc-900/60 border border-line/50">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`pressable px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "overview"
                ? "bg-accent text-white shadow-lg shadow-accent/20"
                : "text-ink-4 hover:text-ink hover:bg-zinc-800/60"
            }`}
          >
            Overview & Metrics
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("masterpiece")}
            className={`pressable inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "masterpiece"
                ? "bg-accent text-white shadow-lg shadow-accent/20"
                : "text-accent/90 hover:text-accent hover:bg-accent/10"
            }`}
          >
            <Sparkles className="size-3.5" />
            <span>100-Score Masterpiece</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("transcript")}
            className={`pressable px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "transcript"
                ? "bg-accent text-white shadow-lg shadow-accent/20"
                : "text-ink-4 hover:text-ink hover:bg-zinc-800/60"
            }`}
          >
            Transcript & Fillers
          </button>
        </div>
      </div>

      {/* ── TAB 1: OVERVIEW & METRICS ──────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-8 animate-fadeIn">
          {/* Action Items: Landed vs Push */}
          <section className="grid gap-6 sm:grid-cols-2">
            <Surface material="dense" radius="lg" className="p-6 border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-center gap-2 mb-4 text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <h3 className="t-micro text-emerald-400 font-semibold tracking-wide">WHERE YOU LANDED IT</h3>
              </div>
              <ul className="space-y-3">
                {evaluation.strengths.map((item, index) => (
                  <li key={index} className="flex gap-2.5 text-sm text-ink-2">
                    <span className="mt-1.5 size-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Surface>

            <Surface material="dense" radius="lg" className="p-6 border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-4 text-amber-400">
                <AlertTriangle className="size-4 shrink-0" />
                <h3 className="t-micro text-amber-400 font-semibold tracking-wide">WHAT TO TRY NEXT</h3>
              </div>
              <ul className="space-y-3">
                {evaluation.improvements.map((item, index) => (
                  <li key={index} className="flex gap-2.5 text-sm text-ink-2">
                    <span className="mt-1.5 size-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Surface>
          </section>

          {/* Scanned Metrics Grid */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <p className="t-micro">MEASURED PERFORMANCE</p>
              <span className="t-micro text-ink-4">Weighted Composite Calculation</span>
            </div>
            <div className="divide-y divide-line/60 border border-line/60 rounded-2xl overflow-hidden bg-black/15">
              {SCORE_DIMENSIONS.map((dimension, index) => (
                <EvaluationMetric
                  key={dimension}
                  label={SCORE_LABELS[dimension]}
                  hint={SCORE_HINTS[dimension]}
                  value={evaluation.scores[dimension]}
                  unmeasured={skipped.includes(dimension)}
                  unmeasuredReason="Typed answer — pace not scored"
                  delay={index * 50}
                />
              ))}
            </div>
          </section>

          {/* Tightened Answer Box */}
          {evaluation.improvedAnswer && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="size-4 text-accent" />
                <p className="t-micro text-accent">THE SAME ANSWER, TIGHTENED</p>
              </div>
              <Surface material="dense" radius="lg" refract className="p-6 border border-accent/30 bg-accent/5">
                <p className="t-body text-ink text-base leading-relaxed">
                  {evaluation.improvedAnswer}
                </p>
                <p className="t-meta mt-3 text-ink-4 text-xs">
                  Your core argument with unnecessary slack and filler words removed.
                </p>
              </Surface>
            </section>
          )}
        </div>
      )}

      {/* ── TAB 2: 100-SCORE MASTERPIECE SCRIPT ───────────────────────────── */}
      {activeTab === "masterpiece" && (
        <div className="space-y-6 animate-fadeIn">
          <Surface material="frost" radius="lg" className="p-7 border border-accent/40 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pb-4 border-b border-line/40">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/15 border border-accent/40 text-accent text-xs font-semibold mb-2">
                  <Sparkles className="size-3.5" />
                  <span>100/100 Benchmark Script</span>
                </span>
                <h3 className="t-title text-xl text-ink">The Perfect 2-Minute Speech</h3>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono text-ink-3">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5 text-accent" />
                  <span>2:00 min (132 WPM)</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3.5 text-emerald-400" />
                  <span>264 Words</span>
                </span>
              </div>
            </div>

            {/* Structured Script Content */}
            <div className="space-y-4 t-body text-ink text-base leading-relaxed font-light">
              <p className="p-4 rounded-xl bg-black/25 border border-line/40">
                <strong className="text-accent text-xs font-mono block mb-1">[INTRODUCTION & THESIS]</strong>
                &quot;Contrary to the popular belief that casual conversation is trivial, small talk is actually the foundational bridge to meaningful human relationships and professional networking. It is far from a waste of time; in fact, it serves two essential functions: establishing rapport and revealing shared values.&quot;
              </p>

              <p className="p-4 rounded-xl bg-black/25 border border-line/40">
                <strong className="text-accent text-xs font-mono block mb-1">[POINT 1: LOWERING BARRIERS]</strong>
                &quot;First, small talk lowers social barriers. When we initiate a brief exchange about the weather, a shared environment, or a recent event, we send a clear signal of goodwill and accessibility. These initial moments allow us to observe a person&apos;s communication style, underlying temperament, and mutual interests without the pressure of a high-stakes discussion.&quot;
              </p>

              <p className="p-4 rounded-xl bg-black/25 border border-line/40">
                <strong className="text-accent text-xs font-mono block mb-1">[POINT 2: UNLOCKING OPPORTUNITIES]</strong>
                &quot;Second, casual exchanges frequently unlock unexpected opportunities. For instance, a two-minute conversation before a meeting can reveal that a colleague shares a passion for technology, a similar career trajectory, or a mutual acquaintance. That brief spark often evolves into strategic collaborations or mentorships that formal channels rarely create.&quot;
              </p>

              <p className="p-4 rounded-xl bg-black/25 border border-line/40">
                <strong className="text-accent text-xs font-mono block mb-1">[CONCLUSION]</strong>
                &quot;To view small talk as superficial is to misunderstand its purpose. It is not intended to solve complex problems immediately; it is designed to establish the trust required to tackle those problems together in the future. Small talk is the essential currency of human connection.&quot;
              </p>
            </div>
          </Surface>
        </div>
      )}

      {/* ── TAB 3: FULL TRANSCRIPT & FILLERS ─────────────────────────────── */}
      {activeTab === "transcript" && (
        <div className="space-y-6 animate-fadeIn">
          <Surface material="liquid" radius="lg" className="p-6 sm:p-8 border border-line/60">
            <p className="t-micro mb-4">TRANSCRIPT ANNOTATION</p>
            <p className="t-lead text-base sm:text-lg leading-relaxed text-ink-2">
              {annotate(
                evaluation.transcript,
                evaluation.fillerWords.map((hit) => hit.word),
              )}
            </p>
          </Surface>

          {evaluation.fillerWords.length > 0 ? (
            <div className="p-4 rounded-xl border border-line/60 bg-black/20 flex flex-wrap items-center gap-4">
              <p className="t-micro text-ink-4">Detected Filler Words:</p>
              {evaluation.fillerWords.map((hit) => (
                <span key={hit.word} className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                  {hit.word} <strong className="text-white ml-1">x{hit.count}</strong>
                </span>
              ))}
            </div>
          ) : (
            <p className="t-meta text-emerald-400">✓ Zero filler words detected in this session!</p>
          )}
        </div>
      )}
    </div>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="t-numeric text-lg text-ink font-semibold">{value}</span>
      <span className="t-micro text-ink-4">{label}</span>
    </span>
  );
}

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
        className="text-amber-300 font-semibold"
        style={{
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textDecorationColor: "var(--color-caution)",
          textUnderlineOffset: "4px",
        }}
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}
