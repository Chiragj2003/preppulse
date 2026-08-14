/**
 * Seeds the topic pool. Idempotent - `prompt_text` is unique, so re-running
 * updates category/difficulty in place rather than creating duplicates.
 *
 *   npm run db:seed
 */
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import { plans, readingPieces, topics } from "./app-schema";
import { SEED_PLANS } from "./plans";
import { SEED_READING_PIECES } from "./reading-pieces";
import { SEED_TOPICS } from "./topics";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Check your .env file.");

  const db = drizzle(neon(url));

  const inserted = await db
    .insert(topics)
    .values(SEED_TOPICS)
    .onConflictDoUpdate({
      target: topics.promptText,
      set: {
        category: sql.raw("excluded.category"),
        difficulty: sql.raw("excluded.difficulty"),
        isActive: sql.raw("excluded.is_active"),
      },
    })
    .returning({ id: topics.id });

  // Plans are upserted on slug, so re-running updates prices in place rather
  // than creating a second "Pro" that nobody is subscribed to.
  const seededPlans = await db
    .insert(plans)
    .values(SEED_PLANS)
    .onConflictDoUpdate({
      target: plans.slug,
      set: {
        name: sql.raw("excluded.name"),
        tagline: sql.raw("excluded.tagline"),
        priceMonthly: sql.raw("excluded.price_monthly"),
        currency: sql.raw("excluded.currency"),
        features: sql.raw("excluded.features"),
        dailySessionLimit: sql.raw("excluded.daily_session_limit"),
        unlockedModes: sql.raw("excluded.unlocked_modes"),
        sortOrder: sql.raw("excluded.sort_order"),
        isActive: sql.raw("excluded.is_active"),
      },
    })
    .returning({ slug: plans.slug });

  console.log(`Seeded ${seededPlans.length} plans: ${seededPlans.map((p) => p.slug).join(", ")}`);

  // Upserted on title so editing a passage's wording in the seed file corrects
  // it in place — important, because the scoring aligns against this exact text
  // and a duplicate row would leave old attempts graded against old wording.
  const pieces = await db
    .insert(readingPieces)
    .values(SEED_READING_PIECES)
    .onConflictDoUpdate({
      target: readingPieces.title,
      set: {
        kind: sql.raw("excluded.kind"),
        difficulty: sql.raw("excluded.difficulty"),
        body: sql.raw("excluded.body"),
        focus: sql.raw("excluded.focus"),
        paceMin: sql.raw("excluded.pace_min"),
        paceMax: sql.raw("excluded.pace_max"),
        isActive: sql.raw("excluded.is_active"),
      },
    })
    .returning({ id: readingPieces.id });

  const twisters = SEED_READING_PIECES.filter((p) => p.kind === "tongue_twister").length;
  console.log(
    `Seeded ${pieces.length} reading pieces (${twisters} tongue twisters, ${pieces.length - twisters} passages)`,
  );

  const byCategory = SEED_TOPICS.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Seeded ${inserted.length} topics across ${Object.keys(byCategory).length} categories:`);
  for (const [category, count] of Object.entries(byCategory).sort()) {
    console.log(`  ${category.padEnd(12)} ${count}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
