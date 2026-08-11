"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();

  // Don't show back button on the main entry points
  if (pathname === "/" || pathname === "/dashboard") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="pressable group flex size-9 items-center justify-center rounded-full border border-line bg-white/5 text-ink-2 transition-colors hover:bg-white/10 hover:text-ink mr-2"
      aria-label="Go back"
    >
      <ArrowLeft className="size-4 transition-transform duration-[var(--dur-base)] group-hover:-translate-x-0.5" />
    </button>
  );
}
