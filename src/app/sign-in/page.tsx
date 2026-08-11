import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { getSession } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Asymmetric: a large editorial statement on the left, the form as a compact
 * dense-glass panel on the right. A centred card on an empty page is the most
 * anonymous layout in software.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  const { next } = await searchParams;

  if (session?.user) redirect(safeNext(next));

  return (
    <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-16 px-5 pt-28 pb-16 sm:px-6 lg:grid-cols-[1.05fr_minmax(380px,420px)] lg:gap-24">
      <div className="rise hidden lg:block">
        <p className="t-micro mb-8">PrepPulse</p>
        <h1 className="t-display max-w-[13ch]">
          Two minutes
          <br />
          <span className="text-ink-3">of talking</span>
          <br />
          changes how
          <br />
          you sound.
        </h1>
        <p className="t-lead mt-10 max-w-sm">
          One topic a day, a clock, and an honest read on how it landed.
        </p>
      </div>

      <div className="rise w-full [animation-delay:80ms]">
        <div className="mb-8 lg:hidden">
          <h1 className="t-title">Welcome to PrepPulse</h1>
        </div>

        <Suspense
          fallback={<div className="h-80 animate-pulse rounded-[var(--radius-lg)] bg-white/5" />}
        >
          <SignInForm
            googleEnabled={env.has.google}
            emailEnabled={env.has.email}
            isDev={!env.isProduction}
            next={safeNext(next)}
          />
        </Suspense>

        <p className="t-meta mt-8 max-w-sm text-ink-4">
          A portfolio project. Your practice transcripts are stored so you can read them back.
        </p>
      </div>
    </div>
  );
}

/** Only same-site relative paths, so ?next= can't become an open redirect. */
function safeNext(next?: string) {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}
