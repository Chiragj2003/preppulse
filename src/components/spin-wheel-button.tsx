"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { RotateCw, Sparkles } from "lucide-react";

export function SpinWheelButton({ href, onClick }: { href?: string; onClick?: () => void }) {
  const [spinning, setSpinning] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    setSpinning(false);
  }, [searchParams]);

  const handleClick = () => {
    setSpinning(true);
    if (onClick) onClick();
  };

  const buttonContent = (
    <>
      <span className="relative z-10 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-accent" />
        <span>Spin the wheel</span>
      </span>
      <RotateCw
        className={`relative z-10 size-3.5 text-accent transition-transform duration-500 ${
          spinning ? "animate-spin" : "group-hover:rotate-180"
        }`}
      />
      {/* Glossy sheen overlay */}
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
    </>
  );

  const className =
    "group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent transition-all duration-300 hover:border-accent/60 hover:bg-accent/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-95";

  if (href) {
    return (
      <Link href={href} scroll={false} onClick={handleClick} className={className}>
        {buttonContent}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {buttonContent}
    </button>
  );
}
