import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { evaluations, practiceSessions } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { ScoreDisplay } from "@/components/ui/score";
import { SCORE_DIMENSIONS, SCORE_LABELS } from "@/lib/types";

/**
 * A public result card.
 *
 * Reachable only via an unguessable opt-in slug, and deliberately partial: the
 * score, the topic and the shape of the breakdown, but never the transcript,
 * the coaching notes or the person's name. Sharing a result should not mean
 * publishing a recording of yourself thinking aloud.
 */
async function loadCard(slug: string) {
  const [row] = await db
    .select({
      topic: practiceSessions.promptSnapshot,
      createdAt: practiceSessions.createdAt,
      overallScore: evaluations.overallScore,
      scores: evaluations.scores,
      wordCount: evaluations.wordCount,
      wordsPerMinute: evaluations.wordsPerMinute,
    })
    .from(practiceSessions)
    .innerJoin(evaluations, eq(evaluations.sessionId, practiceSessions.id))
    .where(eq(practiceSessions.shareSlug, slug))
    .limit(1);

  return row ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = await loadCard(slug);
  if (!card) return { title: "Result" };

  return {
    title: `${card.overallScore}/100 on PrepPulse`,
    description: `"${card.topic}" — scored ${card.overallScore} out of 100 for fluency, structure and clarity.`,
    openGraph: {
      title: `${card.overallScore}/100 on PrepPulse`,
      description: `"${card.topic}"`,
    },
  };
}

export default async function ShareCardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = await loadCard(slug);

  // A revoked share is indistinguishable from one that never existed.
  if (!card) notFound();

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-28 sm:px-6">
      <Surface material="dense" radius="lg" refract className="rise overflow-hidden p-8 sm:p-12">
        <p className="t-micro mb-8">PrepPulse / two-minute extempore</p>

        <h1 className="t-title mb-10">{card.topic}</h1>

        <ScoreDisplay value={card.overallScore} />

        <ul className="mt-12 space-y-3">
          {SCORE_DIMENSIONS.map((dimension) => (
            <li key={dimension} className="flex items-center gap-4">
              <span className="t-meta w-28 shrink-0 text-ink-3">{SCORE_LABELS[dimension]}</span>
              <span className="h-px flex-1 bg-[var(--color-line)]">
                <span
                  className="block h-px"
                  style={{
                    width: `${card.scores[dimension]}%`,
                    background: "var(--color-accent)",
                    boxShadow: "0 0 8px var(--color-accent)",
                  }}
                />
              </span>
              <span className="t-numeric w-8 text-right text-[13px] text-ink-2">
                {card.scores[dimension]}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-line pt-6">
          <span className="t-micro">{card.wordCount ?? 0} words</span>
          {card.wordsPerMinute !== null && (
            <span className="t-micro">{card.wordsPerMinute} per minute</span>
          )}
          <span className="t-micro ml-auto">
            {card.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        </div>
      </Surface>

      <div className="rise mt-10 text-center [animation-delay:100ms]">
        <p className="t-lead mb-6">Two minutes on a topic you didn&apos;t see coming.</p>
        <Link href="/">
          <Button variant="primary" size="lg">
            Try today&apos;s topic
          </Button>
        </Link>
      </div>
    </div>
  );
}
