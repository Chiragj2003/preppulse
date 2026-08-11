"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getProfile } from "@/lib/practice";
import { requireUserApi } from "@/lib/session";
import type { Language } from "@/lib/types";

const ALLOWED: Set<string> = new Set(["en", "hinglish", "hi"]);

/**
 * Updates the user's preferred language across all AI coaching.
 *
 * Validates against the enum rather than trusting the client, and upserts the
 * profile so a fresh user who goes straight to Settings doesn't 404.
 */
export async function updateLanguage(
  _prev: { saved: boolean } | null,
  formData: FormData,
): Promise<{ saved: boolean }> {
  const user = await requireUserApi();
  const raw = formData.get("language");

  if (typeof raw !== "string" || !ALLOWED.has(raw)) {
    return { saved: false };
  }

  const language = raw as Language;

  // Ensure the profile row exists before updating.
  await getProfile(user.id);

  await db
    .update(profiles)
    .set({ preferredLanguage: language, updatedAt: new Date() })
    .where(eq(profiles.userId, user.id));

  revalidatePath("/settings");
  revalidatePath("/practice");
  revalidatePath("/dashboard");

  return { saved: true };
}
