/**
 * Demo seed script.
 * Populates realistic practice sessions, evaluations, streaks, and leaderboard entries
 * for demo/testing purposes.
 *
 * Usage:
 *   npx tsx src/db/seed-demo.ts
 */
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/auth-schema";
import { evaluations, practiceSessions, profiles, streaks, topics } from "@/db/app-schema";
import { recordScore } from "@/lib/leaderboard";

async function main() {
  console.log("🌱 Seeding demo data...");

  // 1. Ensure demo user exists
  const demoEmail = "demo@preppulse.dev";
  let [demoUser] = await db.select().from(users).where(eq(users.email, demoEmail)).limit(1);

  if (!demoUser) {
    [demoUser] = await db
      .insert(users)
      .values({
        id: "demo-user-id-001",
        name: "Demo Alex",
        email: demoEmail,
        emailVerified: true,
      })
      .returning();
    console.log("  Created demo user: Demo Alex");
  } else {
    console.log("  Found existing demo user: Demo Alex");
  }

  // 2. Ensure profile exists
  await db
    .insert(profiles)
    .values({
      userId: demoUser.id,
      skillsDescription: "Software engineer interested in backend architecture and system design.",
      preferredLanguage: "en",
    })
    .onConflictDoNothing({ target: profiles.userId });

  // 3. Ensure streak exists with realistic values
  await db
    .insert(streaks)
    .values({
      userId: demoUser.id,
      currentStreak: 5,
      longestStreak: 12,
      lastPracticeDate: new Date().toISOString().slice(0, 10),
      tokens: 450,
      totalSessions: 8,
    })
    .onConflictDoUpdate({
      target: streaks.userId,
      set: {
        currentStreak: 5,
        longestStreak: 12,
        tokens: 450,
        totalSessions: 8,
      },
    });

  // 4. Fetch existing topics
  const allTopics = await db.select().from(topics).limit(5);
  if (allTopics.length === 0) {
    console.log("⚠️ No topics found. Run `npm run db:seed` first!");
    process.exit(1);
  }

  // 5. Create demo practice sessions and evaluations
  const sampleData = [
    {
      topic: allTopics[0],
      duration: 115,
      score: 82,
      transcript:
        "Procrastination isn't always bad. Sometimes taking time away from a problem allows your subconscious to synthesize complex ideas, leading to better solutions when you finally sit down to work.",
      summary: "Clear argument with good structure and steady pace.",
      strengths: ["Great opening hook", "Clear logical progression"],
      improvements: ["Reduce minor filler pauses", "Expand on concrete examples"],
      scores: { fluency: 85, vocabulary: 80, structure: 85, clarity: 80, pace: 80, fillerControl: 82 },
    },
    {
      topic: allTopics[1] ?? allTopics[0],
      duration: 120,
      score: 76,
      transcript:
        "Time is the ultimate non-renewable resource. You can always earn more money, but you can never purchase an extra hour of life once it has passed.",
      summary: "Thoughtful perspective, steady pace throughout.",
      strengths: ["Strong central theme", "Evocative language"],
      improvements: ["Vary sentence length slightly", "Soften the ending transitions"],
      scores: { fluency: 78, vocabulary: 82, structure: 75, clarity: 75, pace: 70, fillerControl: 76 },
    },
  ];

  for (const item of sampleData) {
    const [session] = await db
      .insert(practiceSessions)
      .values({
        userId: demoUser.id,
        topicId: item.topic.id,
        mode: "random_topic",
        status: "completed",
        promptSnapshot: item.topic.promptText,
        durationSeconds: item.duration,
        completedAt: new Date(),
      })
      .returning();

    await db
      .insert(evaluations)
      .values({
        sessionId: session.id,
        scores: item.scores,
        overallScore: item.score,
        strengths: item.strengths,
        improvements: item.improvements,
        fillerWords: [{ word: "like", count: 2 }],
        transcript: item.transcript,
        summary: item.summary,
        improvedAnswer: item.transcript,
        wordCount: item.transcript.split(/\s+/).length,
        wordsPerMinute: 130,
        inputMode: "speech",
      })
      .onConflictDoNothing({ target: evaluations.sessionId });
  }

  // 6. Record leaderboard entry
  await recordScore(demoUser.id, demoUser.name, 82).catch(() => {});

  console.log("✅ Demo seed completed successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Demo seed failed:", err);
  process.exit(1);
});
