import Link from "next/link";

import { getSession } from "@/lib/session";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * Floating clear-glass chrome that content scrolls *under*, rather than an
 * opaque bar that permanently eats a strip of the viewport. It's inset from
 * the edges so it reads as an object in the space, not a browser fixture.
 */
export async function SiteHeader() {
  const session = await getSession();

  return (
    <header
      className="fixed inset-x-0 top-0 px-4 pt-4 sm:px-6 sm:pt-5"
      style={{ zIndex: "var(--z-sticky)" }}
    >
      <div className="mx-auto flex h-[64px] max-w-6xl items-center justify-between rounded-full border border-white/10 bg-gradient-to-r from-accent/5 via-indigo-500/5 to-purple-500/5 pr-3 pl-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-[32px] saturate-150 transition-all duration-300">
        <div className="flex items-center">
          <Link
            href="/"
            className="group relative flex items-center gap-3"
            aria-label="PrepPulse home"
          >
            <Pulse />
            <span className="font-display text-[17px] font-semibold tracking-[-0.03em] text-ink transition-colors group-hover:text-accent">
              PrepPulse
            </span>
          </Link>
        </div>

        <nav className="flex items-center gap-1.5 sm:gap-2">
          {session?.user ? (
            <>
              <div className="hidden items-center gap-1 sm:flex mr-2">
                <Link href="/dashboard" className="pressable rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-black/5 hover:text-ink dark:hover:bg-white/10">Dashboard</Link>
                <Link href="/practice" className="pressable rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-black/5 hover:text-ink dark:hover:bg-white/10">Practice</Link>
                <Link href="/discuss" className="pressable rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-black/5 hover:text-ink dark:hover:bg-white/10">Discuss</Link>
              </div>
              <ThemeToggle />
              <UserMenu
                name={session.user.name}
                email={session.user.email}
                image={session.user.image}
              />
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link
                href="/sign-in"
                className="pressable rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-void hover:brightness-95"
              >
                Sign in
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

/**
 * The mark: a waveform pulse. Three strokes, drawn not imported, so it stays
 * crisp at any size and inherits the accent from the token layer.
 */
function Pulse() {
  return (
    <span className="relative grid size-7 place-items-center">
      <span className="absolute inset-0 rounded-[9px] bg-accent/12" />
      <svg viewBox="0 0 24 24" className="relative size-4" fill="none" aria-hidden>
        <path
          d="M2 12h3.2l2.4-7.2 3.9 14.4 2.7-9.2 1.7 2h6.1"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
