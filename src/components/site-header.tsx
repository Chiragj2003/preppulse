import Link from "next/link";

import { LogoMark } from "@/components/ui/logo";
import { getSession } from "@/lib/session";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { Notifications } from "./notifications";

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
      {/* `.m-clear` is the floating-chrome material: blur, saturation, the
          masked specular hairline and the depth shadow, all from tokens. The
          hand-rolled version here was a second glass recipe plus a three-stop
          tint that put indigo and purple into a one-accent palette. */}
      <div className="material m-clear mx-auto flex h-[64px] max-w-6xl items-center justify-between rounded-full pr-3 pl-6">
        <div className="flex items-center">
          <Link
            href="/"
            className="pressable group flex items-center gap-2.5"
            aria-label="PrepPulse home"
          >
            <span className="relative grid size-8 shrink-0 place-items-center">
              <span
                className="absolute inset-0 rounded-[10px] bg-accent/12 transition-colors duration-[var(--dur-base)] group-hover:bg-accent/20"
                aria-hidden
              />
              <LogoMark className="relative size-[19px] text-accent" />
            </span>
            <span className="font-display text-[17px] font-semibold tracking-[-0.03em] text-ink transition-colors duration-[var(--dur-base)] group-hover:text-accent">
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
                <Link href="/interview" className="pressable rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-black/5 hover:text-ink dark:hover:bg-white/10">Interview</Link>
                <Link href="/discuss" className="pressable rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-black/5 hover:text-ink dark:hover:bg-white/10">Discuss</Link>
                <Link href="/leaderboard" className="pressable rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-black/5 hover:text-ink dark:hover:bg-white/10">Leaderboard</Link>
              </div>
              <Notifications />
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

// The mark now lives in components/ui/logo.tsx, so the header, the favicon and
// the social card all draw the same geometry instead of three copies drifting.
