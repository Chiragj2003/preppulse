import type { Metadata } from "next";
import Link from "next/link";

import { DeviceCheck } from "./device-check";

export const metadata: Metadata = {
  title: "Device check",
  robots: { index: false, follow: false },
};

/**
 * What this device can actually do.
 *
 * Two jobs. For a user whose microphone "isn't working", it says which layer
 * is failing instead of leaving them to guess. For deciding whether PrepPulse
 * can ship as an installable web app, it answers the only question that
 * matters — whether the speech recogniser works on iOS — on the actual phone,
 * rather than from a compatibility table that averages over versions.
 *
 * Public and unauthenticated on purpose: someone who cannot get the mic
 * working may also be someone who cannot get signed in.
 */
export default function DiagnosticsPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise">
        <p className="t-micro mb-6">Device check</p>
        <h1 className="t-display max-w-[13ch]">
          What this browser <span className="text-ink-3">can do.</span>
        </h1>
        <p className="t-lead mt-8 max-w-lg">
          PrepPulse leans on four browser features. If practice is not working, this says which
          one is missing — and on a phone it answers whether speaking practice will work here at
          all.
        </p>
      </header>

      <DeviceCheck />

      <p className="mt-16 text-center">
        <Link href="/" className="t-micro transition-colors hover:text-ink-2">
          Back to PrepPulse
        </Link>
      </p>
    </div>
  );
}
