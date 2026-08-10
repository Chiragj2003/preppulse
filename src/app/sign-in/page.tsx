import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { getSession } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  const { next } = await searchParams;

  if (session?.user) redirect(safeNext(next));

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-md items-center px-5 py-12">
      <div className="rise w-full">
        <h1 className="text-[30px] leading-tight font-semibold">Welcome to PrepPulse</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Sign in with a password, or have us email you a six-digit code. Google works too.
        </p>

        <Suspense fallback={<div className="mt-8 h-48 animate-pulse rounded-[var(--radius-md)] bg-surface-2" />}>
          <SignInForm
            googleEnabled={env.has.google}
            emailEnabled={env.has.email}
            isDev={!env.isProduction}
            next={safeNext(next)}
          />
        </Suspense>

        <p className="mt-8 text-center text-[12.5px] leading-relaxed text-muted">
          By continuing you agree that this is a portfolio project and your practice transcripts are
          stored so you can read them back.
        </p>
      </div>
    </div>
  );
}

/** Only allow same-site relative paths, so ?next= can't become an open redirect. */
function safeNext(next?: string) {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}
