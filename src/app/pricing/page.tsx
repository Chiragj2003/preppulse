import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/billing";
import { getEntitlements } from "@/lib/progress";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Pricing" };

/**
 * Not three cards in a row.
 *
 * Plans are rows on a shared baseline, so the eye reads down the price column
 * and across the differences rather than comparing three boxed islands. Every
 * number on this page comes from the database — nothing here is hardcoded.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const [session, { changed }] = await Promise.all([getSession(), searchParams]);

  const available = await db
    .select()
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder));

  const current = session?.user ? await getEntitlements(session.user.id) : null;

  return (
    <div className="mx-auto max-w-5xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise max-w-2xl">
        <p className="t-micro mb-6">Pricing</p>
        <h1 className="t-display">
          Practise free forever. <span className="text-ink-3">Pay when you need the rooms.</span>
        </h1>
        <p className="t-lead mt-8 max-w-lg">
          The daily habit is the product, and it costs nothing. Interviews, group discussions and
          debates are where the paid tiers start.
        </p>
      </header>

      {changed && (
        <p
          role="status"
          className="t-meta rise mt-8 inline-block rounded-full border border-line bg-accent-wash/40 px-4 py-2 text-ink"
        >
          {changed === "free"
            ? "You're back on Free. Nothing was charged."
            : `You're on ${changed[0].toUpperCase() + changed.slice(1)} now.`}
        </p>
      )}

      <div className="rise mt-16 [animation-delay:80ms]">
        {available.map((plan, index) => {
          const isCurrent = current?.planSlug === plan.slug;

          return (
            <article
              key={plan.id}
              className="grid gap-8 border-t border-line py-10 sm:grid-cols-[minmax(0,15rem)_1fr_auto] sm:gap-12"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div>
                <h2 className="t-title">{plan.name}</h2>
                <p className="t-meta mt-2 max-w-[22ch]">{plan.tagline}</p>

                <p className="mt-6 flex items-baseline gap-2">
                  <span className="t-numeric text-[38px] leading-none">
                    {formatPrice(plan.priceMonthly, plan.currency)}
                  </span>
                  {plan.priceMonthly > 0 && <span className="t-micro">per month</span>}
                </p>
              </div>

              <ul className="space-y-2.5 self-center">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="mt-1 size-3.5 shrink-0 text-accent" aria-hidden />
                    <span className="t-body text-ink-2">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="self-center">
                {isCurrent ? (
                  <p className="t-micro">Current plan</p>
                ) : session?.user ? (
                  <Link href={`/pricing/checkout?plan=${plan.slug}`}>
                    <Button variant={plan.priceMonthly > 0 ? "primary" : "glass"} size="lg">
                      {plan.priceMonthly === 0 ? "Downgrade" : `Choose ${plan.name}`}
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/sign-in?next=${encodeURIComponent(`/pricing/checkout?plan=${plan.slug}`)}`}>
                    <Button variant={plan.priceMonthly > 0 ? "primary" : "glass"} size="lg">
                      {plan.priceMonthly === 0 ? "Start free" : `Choose ${plan.name}`}
                    </Button>
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="t-meta mt-14 max-w-xl border-t border-line pt-8 text-ink-4">
        This is a portfolio project. Checkout is a scaffold — no payment gateway is connected and no
        card details are stored or transmitted. Choosing a paid plan simply flips your account so
        the gated features can be demonstrated.
      </p>
    </div>
  );
}
