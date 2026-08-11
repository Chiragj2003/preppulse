"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function SpinWheelButton({ href }: { href: string }) {
  const [spinning, setSpinning] = useState(false);
  const searchParams = useSearchParams();

  // Reset spinning when search params change (meaning the spin is complete and topic loaded)
  useEffect(() => {
    setSpinning(false);
  }, [searchParams]);

  return (
    <Link
      href={href}
      scroll={false}
      onClick={() => setSpinning(true)}
      className="group relative flex items-center gap-2 overflow-hidden rounded-full border border-accent/20 bg-accent/5 px-4 py-2 text-[13px] font-medium text-accent transition-all duration-300 hover:border-accent/40 hover:bg-accent/15 hover:shadow-[var(--shadow-accent)] active:scale-95"
    >
      <span className="relative z-10">Spin the wheel</span>
      <span
        className={`relative z-10 transition-transform ${
          spinning ? "animate-spin duration-700" : "duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-[360deg]"
        }`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
        </svg>
      </span>
      {/* Glossy sheen overlay */}
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
    </Link>
  );
}
