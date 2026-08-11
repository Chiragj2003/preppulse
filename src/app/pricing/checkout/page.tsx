import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { formatPrice } from "@/lib/billing";
import { requireUser } from "@/lib/session";
import { checkout } from "../actions";

export const metadata: Metadata = { title: "Checkout" };

/**
 * The dummy checkout.
 *
 * The card fields are real inputs so the flow feels complete, but the values
 * are never read, never stored and never transmitted — `checkout()` ignores
 * them entirely. The notice below says so plainly rather than letting anyone
 * assume a fake gateway is a real one.
 *
 * When a real gateway is wired in, this component and `capturePayment()` are
 * the only things that change.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: slug } = await searchParams;
  await requireUser(`/pricing/checkout?plan=${slug ?? ""}`);

  if (!slug) redirect("/pricing");

  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.slug, slug), eq(plans.isActive, true)))
    .limit(1);

  if (!plan) redirect("/pricing");

  const isFree = plan.priceMonthly === 0;

  return (
    <div className="mx-auto max-w-lg px-5 pt-28 pb-24 sm:px-6">
      <p className="t-micro rise mb-6">
        <Link href="/pricing" className="transition-colors hover:text-ink-2">
          Pricing
        </Link>
        <span className="mx-3 text-ink-4">/</span>
        <span className="text-ink-2">Checkout</span>
      </p>

      <h1 className="t-display rise [animation-delay:60ms]">{plan.name}</h1>

      <div className="rise mt-8 flex items-baseline gap-3 [animation-delay:80ms]">
        <span className="t-numeric text-[40px] leading-none">
          {formatPrice(plan.priceMonthly, plan.currency)}
        </span>
        {!isFree && <span className="t-micro">per month</span>}
      </div>

      <form action={checkout} className="rise mt-12 [animation-delay:120ms]">
        <input type="hidden" name="planSlug" value={plan.slug} />

        {!isFree && (
          <Surface material="dense" radius="lg" className="p-6">
            <p className="t-micro mb-5">Card details</p>

            <div className="space-y-3">
              <input
                name="card"
                inputMode="numeric"
                autoComplete="off"
                placeholder="4242 4242 4242 4242"
                defaultValue="4242 4242 4242 4242"
                className="t-numeric w-full rounded-[var(--radius-xs)] border border-line bg-black/25 px-4 py-3.5 text-[15px] outline-none placeholder:text-ink-4 focus:border-accent"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="expiry"
                  placeholder="12 / 30"
                  defaultValue="12 / 30"
                  autoComplete="off"
                  className="t-numeric w-full rounded-[var(--radius-xs)] border border-line bg-black/25 px-4 py-3.5 text-[15px] outline-none placeholder:text-ink-4 focus:border-accent"
                />
                <input
                  name="cvc"
                  placeholder="123"
                  defaultValue="123"
                  autoComplete="off"
                  className="t-numeric w-full rounded-[var(--radius-xs)] border border-line bg-black/25 px-4 py-3.5 text-[15px] outline-none placeholder:text-ink-4 focus:border-accent"
                />
              </div>
            </div>

            <p className="t-meta mt-5 flex items-start gap-2.5 text-ink-4">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Prefilled test values. This is a scaffold — no gateway is connected, and whatever
                you type here is discarded rather than sent anywhere.
              </span>
            </p>
          </Surface>
        )}

        <Button type="submit" variant="primary" size="lg" className="mt-8 w-full">
          {isFree ? "Switch to Free" : `Pay ${formatPrice(plan.priceMonthly, plan.currency)}`}
        </Button>

        <p className="t-meta mt-5 text-center text-ink-4">
          {isFree
            ? "Your paid plan ends and nothing is charged."
            : "Cancels any existing plan and starts a new month."}
        </p>
      </form>
    </div>
  );
}
