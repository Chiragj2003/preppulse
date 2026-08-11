import type { Plan } from "@/db/app-schema";

/**
 * Pure entitlement logic. No I/O, no gateway.
 *
 * The whole point of Phase 6 is that swapping the dummy checkout for a real
 * gateway touches the checkout component and a webhook, and nothing else. That
 * only holds if "what is this user allowed to do" is decided here, from plan
 * rows, rather than being scattered through the screens as `if (plan ===
 * "pro")` checks.
 */

export const FREE_MODES = ["random_topic"] as const;

export interface Entitlements {
  planSlug: string;
  planName: string;
  /** null means unlimited. */
  dailySessionLimit: number | null;
  unlockedModes: string[];
  isPaid: boolean;
}

/** Falls back to the free plan whenever a subscription is absent or lapsed. */
export function entitlementsFor(
  plan: Pick<Plan, "slug" | "name" | "dailySessionLimit" | "unlockedModes" | "priceMonthly"> | null,
): Entitlements {
  if (!plan) {
    return {
      planSlug: "free",
      planName: "Free",
      dailySessionLimit: 3,
      unlockedModes: [...FREE_MODES],
      isPaid: false,
    };
  }

  return {
    planSlug: plan.slug,
    planName: plan.name,
    dailySessionLimit: plan.dailySessionLimit,
    unlockedModes: [...FREE_MODES, ...plan.unlockedModes],
    isPaid: plan.priceMonthly > 0,
  };
}

export function canUseMode(entitlements: Entitlements, mode: string): boolean {
  return entitlements.unlockedModes.includes(mode);
}

export function hasSessionsLeft(entitlements: Entitlements, usedToday: number): boolean {
  if (entitlements.dailySessionLimit === null) return true;
  return usedToday < entitlements.dailySessionLimit;
}

export function sessionsRemaining(
  entitlements: Entitlements,
  usedToday: number,
): number | null {
  if (entitlements.dailySessionLimit === null) return null;
  return Math.max(0, entitlements.dailySessionLimit - usedToday);
}

/**
 * A subscription is active only while its period is still running.
 *
 * The date check is here rather than relying on a status column alone, because
 * with a real gateway the row can sit at `active` until a webhook arrives —
 * and a webhook that never arrives should not grant free access forever.
 */
export function isSubscriptionActive(
  subscription: { status: string; currentPeriodEnd: Date | null } | null,
  now = new Date(),
): boolean {
  if (!subscription) return false;
  if (subscription.status !== "active") return false;
  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < now) return false;
  return true;
}

/** Minor units to a display string. Money is never a float. */
export function formatPrice(minorUnits: number, currency: string): string {
  if (minorUnits === 0) return "Free";

  const major = minorUnits / 100;
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : "";
  const formatted = Number.isInteger(major) ? String(major) : major.toFixed(2);

  return symbol ? `${symbol}${formatted}` : `${formatted} ${currency}`;
}

/** One month on, clamped so the 31st doesn't skip February. */
export function nextPeriodEnd(from = new Date()): Date {
  const end = new Date(from);
  const day = end.getUTCDate();
  end.setUTCMonth(end.getUTCMonth() + 1);
  if (end.getUTCDate() < day) end.setUTCDate(0);
  return end;
}
