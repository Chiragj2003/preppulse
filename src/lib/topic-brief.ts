import { eq } from "drizzle-orm";

import { db } from "@/db";
import { topics } from "@/db/app-schema";
import { callAIText } from "@/lib/ai/provider";
import { getCached, setCached } from "@/lib/redis";

/**
 * Caching strategy:
 * 1. Redis cache (`brief:${topicId}`) -> return if found
 * 2. Postgres `cachedBrief` column -> populate Redis & return if found
 * 3. AI generation (whichever provider AI_PROVIDER names) -> store in Postgres, populate Redis, return
 *
 * Gracefully degrades to return null on any Redis/AI failure.
 */
export async function getTopicBrief(topicId: string, promptText: string): Promise<string | null> {
  const cacheKey = `brief:${topicId}`;

  // 1. Redis check
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  // 2. Postgres check
  try {
    const record = await db
      .select({ cachedBrief: topics.cachedBrief })
      .from(topics)
      .where(eq(topics.id, topicId))
      .limit(1)
      .then((res) => res[0]);

    if (record?.cachedBrief) {
      await setCached(cacheKey, record.cachedBrief, 86400);
      return record.cachedBrief;
    }
  } catch (error) {
    console.warn(`[topic-brief] pg select failed for ${topicId}`, error);
  }

  // 3. AI generation
  const generated = await generateBrief(promptText);
  if (!generated) return null;

  // 4. Store back in DB & Redis
  try {
    await db
      .update(topics)
      .set({ cachedBrief: generated })
      .where(eq(topics.id, topicId));
  } catch (error) {
    console.warn(`[topic-brief] pg update failed for ${topicId}`, error);
  }

  await setCached(cacheKey, generated, 86400);

  return generated;
}

/**
 * Best-effort: a missing brief costs the user a nice-to-have, so a failure
 * returns null and the room renders without one rather than blocking on it.
 * A short timeout for the same reason — nobody should wait on this.
 */
async function generateBrief(promptText: string): Promise<string | null> {
  try {
    return await callAIText({
      prompt: `Generate a 2-3 sentence angle-opener for the following topic (something to get the user thinking). Keep it simple and punchy.

TOPIC: ${promptText}`,
      system:
        "You are a witty, insightful conversation starter. You reply ONLY with a 2-3 sentence opener, no quotes, no conversational filler.",
      // This mode's own provider before AI_PROVIDER existed — see provider.ts.
      defaultProvider: "groq",
      operation: "topic_brief",
      userId: "system",
      temperature: 0.7,
      maxOutputTokens: 150,
      timeoutMs: 15_000,
    });
  } catch (error) {
    console.warn("[topic-brief] generation failed", error);
    return null;
  }
}
