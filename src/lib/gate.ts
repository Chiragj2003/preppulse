import { redirect } from "next/navigation";

import { canUseMode, hasSessionsLeft } from "./billing";
import { getEntitlements, sessionsUsedToday } from "./progress";

/**
 * The single entitlement checkpoint.
 *
 * Every mode that can start a session goes through here, so there is exactly
 * one place to audit "is this user allowed to do this", and adding a plan
 * never means hunting for scattered `if (plan === 'pro')` checks.
 *
 * Two entry points on purpose:
 *
 *   checkCanStart   returns a reason, for pages that need to *render* a
 *                   paywall instead of a start button
 *   gateOrRedirect  enforces it in a server action, sending the user to
 *                   pricing rather than throwing
 *
 * Throwing from a form action renders Next's error boundary, so the carefully
 * written explanation never reaches the user — which is exactly what happened
 * the first time this was wired up.
 */
export interface LockReason {
  kind: "mode" | "limit";
  message: string;
}

export async function checkCanStart(
  userId: string,
  mode: string,
): Promise<LockReason | null> {
  const entitlements = await getEntitlements(userId);

  if (!canUseMode(entitlements, mode)) {
    return {
      kind: "mode",
      message: `${modeName(mode)} is part of Pro. Daily practice stays free — the other rooms are what the paid tiers unlock.`,
    };
  }

  const used = await sessionsUsedToday(userId);
  if (!hasSessionsLeft(entitlements, used)) {
    return {
      kind: "limit",
      message: `You've used all ${entitlements.dailySessionLimit} of today's free sessions. They reset tomorrow, or Pro removes the cap.`,
    };
  }

  return null;
}

/**
 * Server-action enforcement. Redirects rather than throwing, so the user lands
 * somewhere useful with an explanation instead of on an error page.
 *
 * `redirect()` works by throwing NEXT_REDIRECT, so this must be called outside
 * any try/catch that swallows errors.
 */
export async function gateOrRedirect(userId: string, mode: string): Promise<void> {
  const locked = await checkCanStart(userId, mode);
  if (locked) {
    redirect(`/pricing?locked=${encodeURIComponent(mode)}&why=${locked.kind}`);
  }
}

export function modeName(mode: string): string {
  switch (mode) {
    case "interview":
      return "Mock interviews";
    case "group_discussion":
      return "Group discussion";
    case "debate":
      return "Debate";
    case "scenario":
      return "Scenario rooms";
    case "conversation":
      return "Conversation mode";
    default:
      return "That mode";
  }
}
