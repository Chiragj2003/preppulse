import Groq from "groq-sdk";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { topics } from "@/db/app-schema";
import { env } from "@/lib/env";
import { getCached, setCached } from "@/lib/redis";

/**
 * Groq decommissions models on a rolling basis. Trying the next id on a
 * model-not-found error means one retirement doesn't take the app down with it.
 */
const MODELS = [
  process.env.GROQ_MODEL,
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
].filter((m): m is string => Boolean(m));

/**
 * Caching strategy:
 * 1. Redis cache (`brief:${topicId}`) -> return if found
 * 2. Postgres `cachedBrief` column -> populate Redis & return if found
 * 3. Groq generation -> store in Postgres, populate Redis, return
 *
 * Gracefully degrades to return null on any Redis/Groq failure.
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

  // 3. Groq generation
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

async function generateBrief(promptText: string): Promise<string | null> {
  const client = new Groq({ apiKey: env.groqApiKey, timeout: 15_000, maxRetries: 1 });

  const prompt = `Generate a 2-3 sentence angle-opener for the following topic (something to get the user thinking). Keep it simple and punchy.

TOPIC: ${promptText}`;

  for (const model of MODELS) {
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.7,
        max_tokens: 150,
        messages: [
          {
            role: "system",
            content:
              "You are a witty, insightful conversation starter. You reply ONLY with a 2-3 sentence opener, no quotes, no conversational filler.",
          },
          { role: "user", content: prompt },
        ],
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (content) return content;
    } catch (error) {
      if (!isModelUnavailable(error)) {
        console.warn(`[topic-brief] generation failed on ${model}`, error);
        break;
      }
      console.warn(`[topic-brief] model "${model}" unavailable, trying next`);
    }
  }

  return null;
}

function isModelUnavailable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : "";
  return status === 404 || /decommission|does not exist|model_not_found/i.test(message);
}
