"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { plans, practiceSessions, subscriptions } from "@/db/schema";
import { nextPeriodEnd } from "@/lib/billing";
import { AppError, toAppError, type AppErrorCode } from "@/lib/errors";
import { requireUserApi } from "@/lib/session";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string } };

/**
 * The dummy payment gateway.
 *
 * Everything a real integration needs is already here: a plan, a provider, a
 * provider reference, and a period end. `capturePayment` is the ONLY function
 * that would change when Stripe or Razorpay is wired in — it would create an
 * intent and return a redirect instead of fabricating a reference. Nothing
 * else in the codebase knows how payment works.
 */
async function capturePayment(input: {
  planSlug: string;
  amountMinor: number;
}): Promise<{ ok: true; reference: string } | { ok: false; reason: string }> {
  // A real gateway call goes here. The scaffold accepts everything, which is
  // the point: the UX around payment is what's being built, not the payment.
  const reference = `dummy_${input.planSlug}_${Date.now().toString(36)}`;
  return { ok: true, reference };
}

const CheckoutInput = z.object({
  planSlug: z.string().min(1).max(40),
  // Collected by the form and deliberately never read. See the checkout page.
  card: z.string().optional(),
});

export async function checkout(formData: FormData) {
  const user = await requireUserApi();

  const input = CheckoutInput.parse({
    planSlug: formData.get("planSlug"),
    card: formData.get("card") ?? undefined,
  });

  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.slug, input.planSlug), eq(plans.isActive, true)))
    .limit(1);

  if (!plan) throw new AppError("not_found", "That plan doesn't exist.");

  if (plan.priceMonthly === 0) {
    // Downgrading is just ending the paid subscription.
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, "active")));

    revalidatePath("/pricing");
    redirect("/pricing?changed=free");
  }

  const payment = await capturePayment({
    planSlug: plan.slug,
    amountMinor: plan.priceMonthly,
  });

  if (!payment.ok) {
    throw new AppError("invalid_input", payment.reason);
  }

  // One active subscription per user: cancel the old before starting the new.
  await db
    .update(subscriptions)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, "active")));

  await db.insert(subscriptions).values({
    userId: user.id,
    planId: plan.id,
    status: "active",
    provider: "dummy",
    providerRef: payment.reference,
    currentPeriodEnd: nextPeriodEnd(),
  });

  revalidatePath("/pricing");
  revalidatePath("/dashboard");
  redirect(`/pricing?changed=${plan.slug}`);
}

/* ── Sharing (Phase 5) ──────────────────────────────────────────────────── */

/**
 * Sharing is opt-in and revocable. The slug is random and separate from the
 * session id, so a public URL can never be guessed from an id and revoking a
 * share is a slug change rather than deleting the session.
 */
export async function toggleShare(sessionId: string): Promise<Result<{ slug: string | null }>> {
  try {
    const user = await requireUserApi();

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, user.id)))
      .limit(1);

    if (!session) throw new AppError("not_found", "That session doesn't exist.");

    if (session.shareSlug) {
      await db
        .update(practiceSessions)
        .set({ shareSlug: null, sharedAt: null })
        .where(eq(practiceSessions.id, sessionId));
      revalidatePath(`/practice/${sessionId}/report`);
      return { ok: true, data: { slug: null } };
    }

    const slug = randomSlug();
    await db
      .update(practiceSessions)
      .set({ shareSlug: slug, sharedAt: new Date() })
      .where(eq(practiceSessions.id, sessionId));

    revalidatePath(`/practice/${sessionId}/report`);
    return { ok: true, data: { slug } };
  } catch (error) {
    const appError = toAppError(error, "toggleShare");
    return { ok: false, error: { code: appError.code, message: appError.message } };
  }
}

function randomSlug(): string {
  // 12 chars of base32-ish entropy: unguessable, still readable aloud.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
