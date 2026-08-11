"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";

import { toggleShare } from "@/app/pricing/actions";
import { Button } from "@/components/ui/button";

/**
 * Opt-in sharing. Off until the user turns it on, and revocable in one click.
 *
 * The URL is shown in full rather than hidden behind a "Copy" button alone,
 * because someone deciding whether to make something public should be able to
 * see exactly what they are publishing.
 */
export function ShareToggle({
  sessionId,
  initialSlug,
  locked,
}: {
  sessionId: string;
  initialSlug: string | null;
  locked: boolean;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = slug ? `${typeof window === "undefined" ? "" : window.location.origin}/s/${slug}` : null;

  async function toggle() {
    setBusy(true);
    setError(null);
    const result = await toggleShare(sessionId);
    setBusy(false);
    if (result.ok) setSlug(result.data.slug);
    else setError(result.error.message);
  }

  if (locked) {
    return (
      <p className="t-meta text-ink-4">
        Shareable result cards are part of Pro.{" "}
        <a href="/pricing" className="text-accent hover:underline">
          See plans
        </a>
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="glass"
          size="sm"
          loading={busy}
          onClick={() => void toggle()}
          icon={<Link2 className="size-3.5" />}
        >
          {slug ? "Stop sharing" : "Create a share link"}
        </Button>

        {url && (
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="pressable inline-flex items-center gap-2 text-[13px] text-ink-4 hover:text-ink-2"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        )}
      </div>

      {url && (
        <p className="t-meta mt-3 break-all text-ink-4">
          {url}
          <span className="mt-1 block">
            Shows the score and breakdown only — never your transcript or your name.
          </span>
        </p>
      )}

      {error && (
        <p role="alert" className="t-meta mt-3 text-[var(--color-critical)]">
          {error}
        </p>
      )}
    </div>
  );
}
