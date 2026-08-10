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
    // A missing/unreachable database shouldn't blank the whole page — treat it
    // as "signed out" and let the page render its signed-out state.
    console.error("[session] failed to resolve session", error);
    return null;
  }
});

/** For pages: bounce to sign-in, preserving where the user was heading. */
export async function requireUser(returnTo?: string) {
  const session = await getSession();
  if (!session?.user) {
    const target = returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in";
    redirect(target);
  }
  return session.user;
}

/** For API routes: throw a 401 AppError instead of redirecting. */
export async function requireUserApi() {
  const session = await getSession();
  if (!session?.user) {
    throw new AppError("unauthorized", "You need to be signed in to do that.");
  }
  return session.user;
}
