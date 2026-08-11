import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, practiceSessions, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Surface } from "@/components/ui/surface";
import { BackButton } from "@/components/back-button";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  await requireUser("/leaderboard");

  const topSessions = await db
    .select({
      sessionId: practiceSessions.id,
      userId: practiceSessions.userId,
      name: users.name,
      email: users.email,
      score: evaluations.overallScore,
      transcript: practiceSessions.promptSnapshot,
      mode: practiceSessions.mode,
      date: practiceSessions.createdAt,
    })
    .from(practiceSessions)
    .innerJoin(evaluations, eq(evaluations.sessionId, practiceSessions.id))
    .innerJoin(users, eq(users.id, practiceSessions.userId))
    .where(eq(practiceSessions.status, "completed"))
    .orderBy(desc(evaluations.overallScore))
    .limit(5);

  return (
    <div className="mx-auto max-w-4xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise relative mb-12">
        <div className="absolute -left-12 top-0 hidden md:block">
          <BackButton />
        </div>
        <p className="t-micro mb-6 flex items-center gap-3">
          <span className="md:hidden"><BackButton /></span>
          Leaderboard
        </p>
        <h1 className="t-display">
          Top 5 Performances
        </h1>
        <p className="t-lead mt-4 max-w-xl text-ink-3">
          Read what the highest scoring candidates spoke about and how they were rated.
        </p>
      </header>

      <div className="rise flex flex-col gap-6 [animation-delay:80ms]">
        {topSessions.map((session, index) => (
          <Surface key={session.sessionId} material="liquid" radius="lg" className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-xl font-display font-bold text-accent">
                  #{index + 1}
                </div>
                <div>
                  <p className="t-heading text-ink">{session.name || session.email?.split("@")[0] || "Anonymous"}</p>
                  <p className="t-meta text-ink-3 capitalize">{session.mode.replace("_", " ")}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="t-display text-4xl text-accent">{session.score}</p>
                <p className="t-meta">Overall Score</p>
              </div>
            </div>
            
            <div>
              <p className="t-micro mb-3 text-ink-3">Topic</p>
              <p className="t-body mb-6 text-ink-2">{session.transcript}</p>
            </div>
            
            <div className="mt-4">
              <a
                href={`/${session.mode === "random_topic" ? "practice" : "discuss"}/${session.sessionId}/report`}
                className="t-micro text-accent hover:underline"
              >
                Read full report & transcript &rarr;
              </a>
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}
