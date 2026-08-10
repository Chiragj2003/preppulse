"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

  // `||` not `??` - an empty name string is common for magic-link signups.
  const label = name?.trim() || email?.split("@")[0] || "Signed in";
  const initial = label.charAt(0).toUpperCase();

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
        className="pressable ml-1 grid size-8 place-items-center overflow-hidden rounded-full bg-surface-2 text-[13px] font-semibold text-ink-soft"
        aria-label="Account menu"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar host varies by provider
          <img src={image} alt="" className="size-full object-cover" />
        ) : (
          initial
        )}
      </button>

      <div className="invisible absolute right-0 top-full w-56 pt-2 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <div className="card p-1.5">
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] font-medium">{name ?? "Signed in"}</p>
            <p className="truncate text-[12px] text-muted">{email}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="pressable w-full rounded-xs px-2.5 py-2 text-left text-[13px] text-ink-soft hover:bg-surface-2 disabled:opacity-50"
          >
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
