"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/auth-schema";
import { profiles } from "@/db/app-schema";
import { AppError, toAppError, type AppErrorCode } from "@/lib/errors";
import { getProfile } from "@/lib/practice";
import { requireUserApi } from "@/lib/session";

export interface ActionError {
  code: AppErrorCode;
  message: string;
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

function fail(error: unknown, context: string): { ok: false; error: ActionError } {
  const appError = toAppError(error, context);
  return { ok: false, error: { code: appError.code, message: appError.message } };
}

/** Generate smart username suggestions based on user email or name. */
export async function suggestUsernames(email: string, name?: string): Promise<string[]> {
  const baseFromEmail = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9_]/g, "") || "user";
  const baseFromName = name ? name.toLowerCase().replace(/[^a-z0-9_]/g, "") : "";
  const base = baseFromName.length >= 3 ? baseFromName : baseFromEmail;

  const year = new Date().getFullYear();
  const candidates = [
    base,
    `${base}_${year}`,
    `${base}_prep`,
    `${base}_pulse`,
    `dev_${base}`,
    `${base}_${Math.floor(100 + Math.random() * 900)}`,
  ];

  const existing = await db
    .select({ username: profiles.username })
    .from(profiles);
  const taken = new Set(existing.map((p) => p.username?.toLowerCase()).filter(Boolean));

  return candidates.filter((c) => !taken.has(c.toLowerCase())).slice(0, 4);
}

/** Check if a username is available. */
export async function checkUsernameAvailability(rawUsername: string): Promise<Result<{ available: boolean; suggestions: string[] }>> {
  try {
    const user = await requireUserApi();
    const username = rawUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");

    if (!username || username.length < 3) {
      return { ok: true, data: { available: false, suggestions: await suggestUsernames(user.email ?? "user", user.name ?? "") } };
    }

    const [existing] = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(and(eq(profiles.username, username), ne(profiles.userId, user.id)))
      .limit(1);

    const available = !existing;
    const suggestions = available ? [] : await suggestUsernames(user.email ?? "user", user.name ?? "");

    return { ok: true, data: { available, suggestions } };
  } catch (error) {
    return fail(error, "checkUsernameAvailability");
  }
}

const OnboardingSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(30)
    .regex(/^[a-z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  age: z.coerce.number().int().min(10, "Age must be at least 10").max(120, "Age must be valid"),
  skillsDescription: z.string().trim().max(1000).optional(),
  preferredLanguage: z.enum(["en", "hinglish", "hi"]).default("en"),
});

export async function completeOnboarding(formData: FormData) {
  const user = await requireUserApi();

  const input = OnboardingSchema.parse({
    name: formData.get("name"),
    username: formData.get("username"),
    age: formData.get("age"),
    skillsDescription: formData.get("skillsDescription") || undefined,
    preferredLanguage: formData.get("preferredLanguage") || "en",
  });

  // Verify username uniqueness
  const [existingUser] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(and(eq(profiles.username, input.username), ne(profiles.userId, user.id)))
    .limit(1);

  if (existingUser) {
    throw new AppError("invalid_input", `Username "@${input.username}" is already taken. Try a different one.`);
  }

  // 1. Update name on auth user record
  await db
    .update(users)
    .set({ name: input.name })
    .where(eq(users.id, user.id));

  // 2. Ensure profile exists and update
  await getProfile(user.id);
  await db
    .update(profiles)
    .set({
      username: input.username,
      age: input.age,
      skillsDescription: input.skillsDescription ?? null,
      preferredLanguage: input.preferredLanguage,
      onboardingCompleted: true,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, user.id));

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  revalidatePath("/onboarding");

  redirect("/dashboard");
}
