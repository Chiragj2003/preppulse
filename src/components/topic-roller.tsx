"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

export function TopicRoller({ topic }: { topic: { id: string; promptText: string } }) {
  const router = useRouter();
  const [isRolling, setIsRolling] = useState(false);

  const startRoll = () => {
    setIsRolling(true);
    // Animation runs for 800ms, then route
    setTimeout(() => {
      router.push("/practice");
    }, 800);
  };

  return (
    <div className="mt-12 flex flex-col items-start gap-8 lg:flex-row lg:items-end w-full">
      <div className="flex-1 w-full max-w-lg flex justify-center perspective-[1200px]">
        {/* The 3D Liquid Glass Roller */}
        <div
          className="liquid-glass liquid-glass-inner rounded-[3rem] p-10 sm:p-12 flex flex-col gap-8 relative overflow-hidden group w-full aspect-square justify-center items-center text-center"
          style={{
            transformStyle: "preserve-3d",
            transform: isRolling ? "rotateX(360deg) scale(0.92)" : "rotateX(0deg) scale(1)",
            transition: "transform 800ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {/* Reference Background Layers */}
          <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-transparent opacity-60 pointer-events-none mix-blend-screen" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] opacity-50 pointer-events-none" />
          
          {/* Subtle moving sheen on hover */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 transition-opacity duration-500 hover:opacity-100" />

          <div className="flex flex-col justify-between items-center relative z-10 w-full h-full">
            <div className="t-micro text-ink-3 uppercase tracking-wider w-full flex justify-between items-center">
              <span>Today, everyone gets</span>
              <div className="flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                <span className="font-mono text-[10px] tracking-widest text-accent">LIVE</span>
              </div>
            </div>

            <div className="flex-grow flex items-center justify-center">
              <h2 className="font-display text-[28px] sm:text-[36px] font-bold text-ink relative z-10 leading-tight drop-shadow-md">
                {topic.promptText}
              </h2>
            </div>

            <div className="text-center">
              <div className="font-display text-[32px] sm:text-[40px] font-bold text-accent drop-shadow-[0_0_12px_rgba(206,189,255,0.5)] leading-none">2:00</div>
              <div className="t-micro uppercase tracking-wider text-[10px] mt-2">on the clock</div>
            </div>
          </div>
        </div>
      </div>

      {/* Primary CTA */}
      <button
        onClick={startRoll}
        disabled={isRolling}
        className="liquid-glass group relative flex h-[54px] shrink-0 items-center gap-3 rounded-full bg-accent/10 px-6 font-medium text-accent transition-all duration-300 hover:scale-105 hover:bg-accent/20 hover:shadow-[var(--shadow-accent)] active:scale-95 disabled:opacity-50"
      >
        <span className="relative z-10">Start today&apos;s roll</span>
        <span className="relative z-10 grid size-8 place-items-center rounded-full bg-accent/20 transition-transform duration-300 group-hover:translate-x-1">
          <ArrowUpRight className="size-4" />
        </span>
        {/* Animated sheen */}
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full z-0" />
      </button>
    </div>
  );
}
