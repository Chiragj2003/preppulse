import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "./auth";
import { AppError } from "./errors";

/**
 * Cached per request, so multiple server components asking "who is this?"
 * cost one lookup rather than one each.
 */
export const getSession = cache(async () => {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch (error) {
    // Next signals "this route can't be static" and "redirect" by throwing.
    // Swallowing those would break its control flow, so let them through.
    if (isFrameworkSignal(error)) throw error;

    // A missing or unreachable database shouldn't blank the whole page - treat
    // it as "signed out" and let the page render its signed-out state.
    console.error("[session] failed to resolve session", error);
    return null;
  }
});

/** Next.js uses thrown errors for control flow; they carry a `digest` tag. */
function isFrameworkSignal(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return (
    typeof digest === "string" &&
    (digest === "DYNAMIC_SERVER_USAGE" ||
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_NOT_FOUND") ||
      digest.startsWith("BAILOUT_TO_CLIENT_SIDE_RENDERING"))
  );
}

/** For pages: bounce to sign-in, preserving where the user was heading. */
export async function requireUser(returnTo?: string) {
  const session = await getSession();
  if (!session?.user) {
    const target = returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in";
    redirect(target);
  }
  return session.user;
}

/**
 * Enforces mandatory profile completion after login.
 * If user hasn't set up unique username & age/onboarding, redirects to /onboarding.
 */
export async function requireOnboardedUser(returnTo?: string) {
  const user = await requireUser(returnTo);
  const { getProfile } = await import("./practice");
  const profile = await getProfile(user.id);

  if ((!profile?.onboardingCompleted || !profile?.username) && returnTo !== "/onboarding") {
    redirect("/onboarding");
  }

  return { user, profile };
}

/** For API routes: throw a 401 AppError instead of redirecting. */
export async function requireUserApi() {
  const session = await getSession();
  if (!session?.user) {
    throw new AppError("unauthorized", "You need to be signed in to do that.");
  }
  return session.user;
}

