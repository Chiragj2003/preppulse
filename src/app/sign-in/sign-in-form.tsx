"use client";

import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { authClient, signIn } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Method = "password" | "code";
type Notice = { tone: "error" | "info"; text: string } | null;

const field = cn(
  "w-full rounded-[var(--radius-xs)] border border-line bg-black/25 px-4 py-3.5",
  "text-[15px] text-ink outline-none transition-colors",
  "placeholder:text-ink-4 focus:border-accent",
);

export function SignInForm({
  googleEnabled,
  emailEnabled,
  isDev,
  next,
}: {
  googleEnabled: boolean;
  emailEnabled: boolean;
  isDev: boolean;
  next: string;
}) {
  const [method, setMethod] = useState<Method>("password");
  const [notice, setNotice] = useState<Notice>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleGoogle() {
    setGoogleBusy(true);
    try {
      const { error } = await signIn.social({ provider: "google", callbackURL: next });
      if (error) {
        setGoogleBusy(false);
        setNotice({ tone: "error", text: error.message ?? "Google sign-in didn't go through." });
      }
    } catch {
      setGoogleBusy(false);
      setNotice({ tone: "error", text: "Couldn't reach Google. Check your connection." });
    }
  }

  return (
    <Surface material="dense" radius="lg" className="p-7 sm:p-8">
      {googleEnabled ? (
        <Button
          variant="glass"
          size="lg"
          className="w-full"
          loading={googleBusy}
          onClick={handleGoogle}
          icon={<GoogleMark />}
        >
          Continue with Google
        </Button>
      ) : (
        <p className="t-meta rounded-[var(--radius-xs)] border border-dashed border-line px-4 py-3 text-ink-4">
          Google is off until <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
          <code className="font-mono">GOOGLE_CLIENT_SECRET</code> are set. Everything below works
          now.
        </p>
      )}

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-line" />
        <span className="t-micro">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* Two methods, not four. A wall of equal-weight options makes people
          choose instead of sign in. */}
      <div role="tablist" aria-label="Sign-in method" className="mb-6 flex gap-6 border-b border-line">
        {(
          [
            ["password", "Password"],
            ["code", "Email code"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={method === value}
            onClick={() => {
              setMethod(value);
              setNotice(null);
            }}
            className={cn(
              "pressable relative -mb-px pb-3 text-[14px] transition-colors",
              method === value ? "text-ink" : "text-ink-4 hover:text-ink-2",
            )}
          >
            {label}
            {method === value && (
              <span className="absolute inset-x-0 bottom-0 h-px bg-accent shadow-[0_0_8px_var(--color-accent)]" />
            )}
          </button>
        ))}
      </div>

      {method === "password" ? (
        <PasswordPanel next={next} setNotice={setNotice} onUseCode={() => setMethod("code")} />
      ) : (
        <CodePanel next={next} setNotice={setNotice} emailEnabled={emailEnabled} isDev={isDev} />
      )}

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "t-meta mt-4",
            notice.tone === "error" ? "text-[var(--color-critical)]" : "text-ink-2",
          )}
        >
          {notice.text}
        </p>
      )}
    </Surface>
  );
}

function PasswordPanel({
  next,
  setNotice,
  onUseCode,
}: {
  next: string;
  setNotice: (n: Notice) => void;
  onUseCode: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();

    if (mode === "signup" && password.length < 8) {
      setNotice({ tone: "error", text: "Passwords need to be at least 8 characters." });
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      const { error } =
        mode === "signin"
          ? await signIn.email({ email, password, callbackURL: next })
          : await authClient.signUp.email({ email, password, name: name || email.split("@")[0] });

      if (error) {
        setBusy(false);
        setNotice({ tone: "error", text: friendlyAuthError(error, mode) });
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setBusy(false);
      setNotice({ tone: "error", text: "We couldn't reach the server. Check your connection." });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {mode === "signup" && (
        <input name="name" type="text" autoComplete="name" placeholder="Your name (optional)" className={field} />
      )}

      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        className={field}
      />

      <input
        name="password"
        type="password"
        required
        minLength={mode === "signup" ? 8 : undefined}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        placeholder={mode === "signin" ? "Password" : "Password (8+ characters)"}
        className={field}
      />

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
        {mode === "signin" ? "Sign in" : "Create account"}
      </Button>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setNotice(null);
          }}
          className="pressable text-[13px] text-accent hover:underline"
        >
          {mode === "signin" ? "Create an account" : "I already have an account"}
        </button>

        {mode === "signin" && (
          <button
            type="button"
            onClick={() => {
              onUseCode();
              setNotice({
                tone: "info",
                text: "No password needed — we'll email a code that signs you in.",
              });
            }}
            className="pressable text-[13px] text-ink-4 hover:text-ink-2"
          >
            Forgot password?
          </button>
        )}
      </div>
    </form>
  );
}

function CodePanel({
  next,
  setNotice,
  emailEnabled,
  isDev,
}: {
  next: string;
  setNotice: (n: Notice) => void;
  emailEnabled: boolean;
  isDev: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode(address: string) {
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: address,
        type: "sign-in",
      });
      setBusy(false);
      if (error) {
        setNotice({ tone: "error", text: error.message ?? "We couldn't send that code." });
        return false;
      }
      return true;
    } catch {
      setBusy(false);
      setNotice({ tone: "error", text: "We couldn't reach the server. Check your connection." });
      return false;
    }
  }

  async function handleRequest(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    if (await sendCode(address)) setStep("code");
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    const otp = code.trim();
    if (otp.length < 6) return;

    setBusy(true);
    setNotice(null);

    try {
      const { error } = await signIn.emailOtp({ email: email.trim(), otp });
      if (error) {
        setBusy(false);
        setCode("");
        setNotice({
          tone: "error",
          text: /invalid|incorrect/i.test(error.message ?? "")
            ? "That code isn't right. Three tries before it's cancelled."
            : (error.message ?? "We couldn't verify that code."),
        });
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setBusy(false);
      setNotice({ tone: "error", text: "We couldn't reach the server. Check your connection." });
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={handleVerify} className="space-y-3">
        <p className="t-meta flex items-center gap-2 text-ink-2">
          <Mail className="size-3.5 shrink-0 text-accent" />
          Sent to <span className="text-ink">{email}</span>
        </p>

        <label htmlFor="otp" className="sr-only">
          Six-digit code
        </label>
        <input
          id="otp"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          autoFocus
          className={cn(field, "t-numeric text-center text-[30px] tracking-[0.34em]")}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={busy}
          disabled={code.length < 6}
        >
          Verify and sign in
        </Button>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setNotice(null);
            }}
            className="pressable inline-flex items-center gap-1.5 text-[13px] text-ink-4 hover:text-ink-2"
          >
            <ArrowLeft className="size-3.5" />
            Change email
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await sendCode(email.trim())) {
                setCode("");
                setNotice({ tone: "info", text: "New code sent. The previous one no longer works." });
              }
            }}
            className="pressable text-[13px] text-accent hover:underline disabled:opacity-50"
          >
            Resend
          </button>
        </div>

        {isDev && (
          <p className="t-meta mt-3 rounded-[var(--radius-xs)] border border-line px-3.5 py-3 text-ink-3">
            <span className="text-ink">Dev:</span>{" "}
            {emailEnabled
              ? "if the provider rejects the address, the code is printed in the terminal running "
              : "no email provider configured, so the code went to the terminal running "}
            <code className="font-mono">npm run dev</code>.
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest} className="space-y-3">
      <label htmlFor="code-email" className="sr-only">
        Email address
      </label>
      <input
        id="code-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={field}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        loading={busy}
        icon={<KeyRound className="size-4" />}
      >
        Email me a 6-digit code
      </Button>

      <p className="t-meta pt-1 text-ink-4">
        No password needed. We&apos;ll create your account if you don&apos;t have one.
      </p>
    </form>
  );
}

function friendlyAuthError(error: { message?: string; code?: string }, mode: "signin" | "signup") {
  const raw = error.message ?? "";

  if (/already exists|already registered/i.test(raw)) {
    return "There's already an account with that email. Try signing in instead.";
  }
  if (/invalid email or password|invalid credentials/i.test(raw)) {
    return "That email and password don't match. If you signed up with Google or a code, use that instead.";
  }
  if (/password/i.test(raw) && /short|length/i.test(raw)) {
    return "Passwords need to be at least 8 characters.";
  }
  return raw || (mode === "signin" ? "We couldn't sign you in." : "We couldn't create that account.");
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
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
