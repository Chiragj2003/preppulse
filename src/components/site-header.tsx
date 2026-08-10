import Link from "next/link";

import { getSession } from "@/lib/session";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="chrome sticky top-0 z-50">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-lg bg-accent text-accent-ink">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden>
              <path
                d="M3 12h3.5l2-6 3.5 12 2.5-8 1.8 2h4.7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          PrepPulse
        </Link>

        <nav className="flex items-center gap-1 text-[14px]">
          {session?.user ? (
            <>
              <Link
                href="/dashboard"
                className="pressable rounded-full px-3 py-1.5 text-ink-soft hover:bg-surface-2 hover:text-ink"
              >
                Dashboard
              </Link>
              <UserMenu name={session.user.name} email={session.user.email} image={session.user.image} />
            </>
          ) : (
            <Link
              href="/sign-in"
              className="pressable rounded-full bg-ink px-4 py-1.5 font-medium text-bg hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
