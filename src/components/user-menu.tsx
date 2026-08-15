"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Surface } from "@/components/ui/surface";
import { signOut } from "@/lib/auth-client";

/**
 * The primary destinations.
 *
 * They live in the header on desktop and in here on mobile, where the floating
 * pill has no room for five links beside a logo and three controls. Before
 * this, a phone had no way back to the dashboard at all — the header nav is
 * `hidden sm:flex`, and this menu only held Settings and Sign out.
 */
const DESTINATIONS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/practice", label: "Practice" },
  { href: "/read", label: "Read aloud" },
  { href: "/interview", label: "Mock interview" },
  { href: "/discuss", label: "Discuss" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function UserMenu({
  name,
  email,
  image,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  // `||` not `??` — an empty name string is common for magic-link signups.
  const label = name?.trim() || email?.split("@")[0] || "Signed in";

  // The menu used to open on `group-hover`, which does not exist on a
  // touchscreen — so on a phone the avatar was a button that did nothing.
  // An explicit toggle works for both, and closes the way people expect.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setBusy(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  // 44px minimum on every row: Apple's floor for a reliable tap, and the
  // difference between a menu you can use one-handed and one you fight.
  const row =
    "pressable flex min-h-11 w-full items-center rounded-[var(--radius-xs)] px-3 text-left text-[13.5px] text-ink-2 hover:bg-white/5 hover:text-ink";

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="pressable ml-1 grid size-11 place-items-center overflow-hidden rounded-full border border-line-bright/60 bg-white/5 text-[13px] font-medium text-ink-2"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar host varies by provider
          <img src={image} alt="" className="size-9 rounded-full object-cover" />
        ) : (
          label.charAt(0).toUpperCase()
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full w-60 pt-3" role="menu">
          <Surface material="frost" radius="sm" className="p-2">
            <div className="px-3 py-2.5">
              <p className="t-body truncate font-medium">{label}</p>
              <p className="t-meta truncate text-ink-4">{email}</p>
            </div>

            {/* Navigation, phones only — the header already shows these from
                the `sm` breakpoint up, and duplicating them on desktop would
                be two routes to the same place in one glance. */}
            <div className="my-1 border-t border-line pt-1 sm:hidden">
              {DESTINATIONS.map((item) => (
                <a key={item.href} href={item.href} className={row} onClick={() => setOpen(false)}>
                  {item.label}
                </a>
              ))}
            </div>

            <div className="border-t border-line pt-1">
              <a href="/settings" className={row} onClick={() => setOpen(false)}>
                Settings
              </a>
              <a href="/interview-prep" className={row} onClick={() => setOpen(false)}>
                Profile &amp; Resume
              </a>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={busy}
                className={`${row} disabled:opacity-50`}
              >
                {busy ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </Surface>
        </div>
      )}
    </div>
  );
}
