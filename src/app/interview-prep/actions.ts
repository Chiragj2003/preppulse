"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { toAppError } from "@/lib/errors";
import { getProfile } from "@/lib/practice";
import { requireUserApi } from "@/lib/session";

const SkillsInput = z
  .string()
  .trim()
  .min(30, "Give us a bit more to work with - a couple of sentences is plenty.")
  .max(4000, "That's longer than we need. Trim it to the essentials.");

export async function saveSkillsDescription(
  _prev: { ok: boolean; message?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const user = await requireUserApi();
    const parsed = SkillsInput.safeParse(formData.get("skills"));

    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message };
    }

    await getProfile(user.id); // ensures the row exists

    await db
      .update(profiles)
      .set({ skillsDescription: parsed.data, updatedAt: new Date() })
      .where(eq(profiles.userId, user.id));

    revalidatePath("/interview-prep");
    revalidatePath("/dashboard");

    return { ok: true, message: "Saved. Mock interviews will use this from Phase 3." };
  } catch (error) {
    return { ok: false, message: toAppError(error, "saveSkillsDescription").message };
  }
}
