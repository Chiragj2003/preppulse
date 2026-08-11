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
      <div className="material m-clear mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full pr-2 pl-5">
        <Link
          href="/"
          className="group relative flex items-center gap-2.5"
          aria-label="PrepPulse home"
        >
          <Pulse />
          <span className="font-display text-[15.5px] font-medium tracking-[-0.02em]">
            PrepPulse
          </span>
        </Link>

        <nav className="flex items-center gap-1.5">
          {session?.user ? (
            <>
              <Link
                href="/practice"
                className="pressable hidden rounded-full px-4 py-2 text-[14px] text-ink-2 hover:bg-white/5 hover:text-ink sm:block"
              >
                Practice
              </Link>
              <Link
                href="/progress"
                className="pressable hidden rounded-full px-4 py-2 text-[14px] text-ink-2 hover:bg-white/5 hover:text-ink sm:block"
              >
                Progress
              </Link>
              <Link
                href="/dashboard"
                className="pressable rounded-full px-4 py-2 text-[14px] text-ink-2 hover:bg-white/5 hover:text-ink"
              >
                Dashboard
              </Link>
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
