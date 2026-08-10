"use client";

import { Loader2, Mail } from "lucide-react";
import { useState } from "react";

import { signIn } from "@/lib/auth-client";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export function SignInForm({
  googleEnabled,
  emailEnabled,
  next,
}: {
  googleEnabled: boolean;
  emailEnabled: boolean;
  next: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleGoogle() {
    setGoogleBusy(true);
    const { error } = await signIn.social({ provider: "google", callbackURL: next });
    if (error) {
      setGoogleBusy(false);
      setStatus({ kind: "error", message: error.message ?? "Google sign-in didn't go through." });
    }
  }

  async function handleMagicLink(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus({ kind: "sending" });
    const { error } = await signIn.magicLink({ email: trimmed, callbackURL: next });

    setStatus(
      error
        ? { kind: "error", message: error.message ?? "We couldn't send that link. Try again." }
        : { kind: "sent", email: trimmed },
    );
  }

  if (status.kind === "sent") {
    return (
      <div className="card mt-8 p-6 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
          <Mail className="size-5" />
        </div>
        <h2 className="mt-4 text-[17px] font-semibold">Check your inbox</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
          We sent a sign-in link to <span className="font-medium text-ink">{status.email}</span>. It
          works once and expires in 10 minutes.
        </p>
        {!emailEnabled && (
          <p className="mt-4 rounded-[var(--radius-xs)] bg-surface-2 px-3 py-2.5 text-left text-[13px] leading-relaxed text-ink-soft">
            <span className="font-medium text-ink">Dev note:</span> no email provider is configured,
            so the link was printed in the terminal running <code className="font-mono">npm run dev</code>{" "}
            instead of being emailed.
          </p>
        )}
        <button
          type="button"
          onClick={() => setStatus({ kind: "idle" })}
          className="pressable mt-4 text-[13.5px] text-accent hover:underline"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {googleEnabled ? (
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleBusy}
          className="pressable card flex w-full items-center justify-center gap-2.5 px-4 py-3 text-[15px] font-medium hover:bg-surface-2 disabled:opacity-60"
        >
          {googleBusy ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark />}
          Continue with Google
        </button>
      ) : (
        <p className="rounded-[var(--radius-xs)] border border-dashed border-line px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
          Google sign-in is off until <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
          <code className="font-mono">GOOGLE_CLIENT_SECRET</code> are set. Magic link works now.
        </p>
      )}

      <div className="my-5 flex items-center gap-3 text-[12px] text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleMagicLink} className="space-y-2.5">
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-[var(--radius-xs)] border border-line bg-surface px-3.5 py-3 text-[15px] outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          disabled={status.kind === "sending"}
          className="pressable flex w-full items-center justify-center gap-2 rounded-[var(--radius-xs)] bg-accent px-4 py-3 text-[15px] font-medium text-accent-ink hover:brightness-110 disabled:opacity-60"
        >
          {status.kind === "sending" && <Loader2 className="size-4 animate-spin" />}
          {status.kind === "sending" ? "Sending link..." : "Email me a sign-in link"}
        </button>
      </form>

      {status.kind === "error" && (
        <p role="alert" className="mt-3 text-[13.5px] text-danger">
          {status.message}
        </p>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.57-5.17 3.57-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
