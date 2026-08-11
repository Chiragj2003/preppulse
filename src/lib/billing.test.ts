/**
 * Self-check for entitlements and money handling.
 *
 *   npx tsx src/lib/billing.test.ts
 *
 * These decide what someone has paid for, so the failure modes are giving
 * away paid features and charging for free ones.
 */
import { strict as assert } from "node:assert";

import {
  canUseMode,
  entitlementsFor,
  formatPrice,
  hasSessionsLeft,
  isSubscriptionActive,
  nextPeriodEnd,
  sessionsRemaining,
} from "./billing";

const pro = {
  slug: "pro",
  name: "Pro",
  dailySessionLimit: null,
  unlockedModes: ["interview", "group_discussion", "debate"],
  priceMonthly: 49900,
};

/* ── default is always free, never generous ────────────────────────────── */
{
  const free = entitlementsFor(null);
  assert.equal(free.planSlug, "free");
  assert.equal(free.isPaid, false);
  assert.equal(free.dailySessionLimit, 3, "no subscription means the free cap");
  assert.ok(canUseMode(free, "random_topic"), "daily practice is always free");
  assert.ok(!canUseMode(free, "interview"), "paid modes stay locked without a plan");
  assert.ok(!canUseMode(free, "debate"));
}

/* ── a paid plan adds to the free set, never replaces it ───────────────── */
{
  const paid = entitlementsFor(pro);
  assert.equal(paid.isPaid, true);
  assert.equal(paid.dailySessionLimit, null, "null means unlimited");
  assert.ok(canUseMode(paid, "interview"));
  assert.ok(
    canUseMode(paid, "random_topic"),
    "upgrading must never remove access to the free mode",
  );
  assert.ok(!canUseMode(paid, "scenario"), "modes not listed stay locked");
}

/* ── session limits ────────────────────────────────────────────────────── */
{
  const free = entitlementsFor(null);
  assert.ok(hasSessionsLeft(free, 0));
  assert.ok(hasSessionsLeft(free, 2));
  assert.ok(!hasSessionsLeft(free, 3), "the limit is a ceiling, not a target");
  assert.ok(!hasSessionsLeft(free, 99));

  assert.equal(sessionsRemaining(free, 0), 3);
  assert.equal(sessionsRemaining(free, 3), 0);
  assert.equal(sessionsRemaining(free, 10), 0, "remaining never goes negative");

  const paid = entitlementsFor(pro);
  assert.ok(hasSessionsLeft(paid, 10_000), "unlimited really is unlimited");
  assert.equal(sessionsRemaining(paid, 500), null, "unlimited reports null, not a number");
}

/* ── subscription validity ─────────────────────────────────────────────── */
{
  const now = new Date("2026-06-15T00:00:00Z");
  const future = new Date("2026-07-15T00:00:00Z");
  const past = new Date("2026-05-15T00:00:00Z");

  assert.equal(isSubscriptionActive(null, now), false);
  assert.equal(isSubscriptionActive({ status: "active", currentPeriodEnd: future }, now), true);
  assert.equal(isSubscriptionActive({ status: "cancelled", currentPeriodEnd: future }, now), false);

  // The date check is the important one: with a real gateway a row can sit at
  // "active" until a webhook arrives, and a webhook that never arrives must
  // not grant access forever.
  assert.equal(
    isSubscriptionActive({ status: "active", currentPeriodEnd: past }, now),
    false,
    "an expired period revokes access even while the status says active",
  );

  // No period end means an open-ended grant (e.g. a comped account).
  assert.equal(isSubscriptionActive({ status: "active", currentPeriodEnd: null }, now), true);
}

/* ── money ─────────────────────────────────────────────────────────────── */
assert.equal(formatPrice(0, "INR"), "Free");
assert.equal(formatPrice(49900, "INR"), "₹499");
assert.equal(formatPrice(99900, "INR"), "₹999");
assert.equal(formatPrice(1999, "USD"), "$19.99");
assert.equal(formatPrice(50, "INR"), "₹0.50", "sub-unit amounts keep both decimals");
assert.equal(formatPrice(1234, "EUR"), "12.34 EUR", "unknown currencies degrade readably");

/* ── period rollover ───────────────────────────────────────────────────── */
{
  assert.equal(
    nextPeriodEnd(new Date("2026-01-15T00:00:00Z")).toISOString().slice(0, 10),
    "2026-02-15",
  );

  // The 31st must not skip a short month into March.
  const fromLongMonth = nextPeriodEnd(new Date("2026-01-31T00:00:00Z"));
  assert.equal(fromLongMonth.getUTCMonth(), 1, "31 Jan rolls into February, not March");

  // Leap year still lands inside February.
  const leap = nextPeriodEnd(new Date("2028-01-31T00:00:00Z"));
  assert.equal(leap.getUTCMonth(), 1);
  assert.equal(leap.getUTCDate(), 29);
}

console.log("billing: all checks passed");
