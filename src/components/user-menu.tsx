"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Surface } from "@/components/ui/surface";
import { signOut } from "@/lib/auth-client";

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

  // `||` not `??` — an empty name string is common for magic-link signups.
  const label = name?.trim() || email?.split("@")[0] || "Signed in";

  async function handleSignOut() {
    setBusy(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="group relative">
      <button
        type="button"
        className="pressable ml-1 grid size-9 place-items-center overflow-hidden rounded-full border border-line-bright/60 bg-white/5 text-[13px] font-medium text-ink-2"
        aria-label="Account menu"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar host varies by provider
          <img src={image} alt="" className="size-full object-cover" />
        ) : (
          label.charAt(0).toUpperCase()
        )}
      </button>

      <div className="invisible absolute right-0 top-full w-60 pt-3 opacity-0 transition-opacity duration-[var(--dur-fast)] group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <Surface material="frost" radius="sm" className="p-2">
          <div className="px-3 py-2.5">
            <p className="t-body truncate font-medium">{label}</p>
            <p className="t-meta truncate text-ink-4">{email}</p>
          </div>
          <a
            href="/settings"
            className="pressable block w-full rounded-[var(--radius-xs)] px-3 py-2.5 text-left text-[13.5px] text-ink-2 hover:bg-white/5 hover:text-ink"
          >
            Settings
          </a>
          <a
            href="/interview-prep"
            className="pressable block w-full rounded-[var(--radius-xs)] px-3 py-2.5 text-left text-[13.5px] text-ink-2 hover:bg-white/5 hover:text-ink"
          >
            Profile & Resume
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="pressable w-full rounded-[var(--radius-xs)] px-3 py-2.5 text-left text-[13.5px] text-ink-2 hover:bg-white/5 hover:text-ink disabled:opacity-50"
          >
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </Surface>
      </div>
    </div>
  );
}
