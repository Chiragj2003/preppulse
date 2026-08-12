"use client";

import { useState, useTransition } from "react";
import { Check, Sparkles, User, Mail, IdCard, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { checkUsernameAvailability, completeOnboarding } from "./actions";

export function OnboardingForm({
  user,
  initialUsername = "",
  initialAge = 22,
  initialSkills = "",
  initialLanguage = "en",
}: {
  user: { id: string; email: string; name?: string | null };
  initialUsername?: string;
  initialAge?: number;
  initialSkills?: string;
  initialLanguage?: string;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [name, setName] = useState(user.name || "");
  const [age, setAge] = useState<number>(initialAge || 22);
  const [skills, setSkills] = useState(initialSkills);
  const [language, setLanguage] = useState(initialLanguage);

  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  async function handleUsernameChange(value: string) {
    const clean = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(clean);
    setAvailable(null);
    setErrorMsg(null);

    if (clean.length < 3) return;

    setChecking(true);
    const res = await checkUsernameAvailability(clean);
    setChecking(false);

    if (res.ok) {
      setAvailable(res.data.available);
      setSuggestions(res.data.suggestions);
    }
  }

  function applySuggestion(sug: string) {
    setUsername(sug);
    setAvailable(true);
    setSuggestions([]);
  }

  return (
    <Surface material="dense" radius="lg" refract className="p-7 sm:p-10 border border-line/80 shadow-[var(--shadow-float)]">
      <div className="flex items-center gap-3 mb-6">
        <span className="p-2.5 rounded-xl bg-accent/15 border border-accent/30 text-accent">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="t-heading text-lg">Complete Your Profile</h2>
          <p className="t-meta text-ink-4">Set up your username and account details to start practicing.</p>
        </div>
      </div>

      {/* Unique User ID & Verified Email Banner */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 p-4 rounded-xl border border-line/60 bg-black/20">
        <div className="flex items-center gap-3">
          <Mail className="size-4 text-accent shrink-0" />
          <div className="overflow-hidden">
            <p className="t-micro text-ink-4">Account Email</p>
            <p className="t-body text-sm text-ink font-mono truncate">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-line/40 pt-3 sm:pt-0 sm:pl-4">
          <IdCard className="size-4 text-[var(--color-positive)] shrink-0" />
          <div className="overflow-hidden">
            <p className="t-micro text-ink-4">Unique User ID</p>
            <p className="t-body text-xs text-ink-3 font-mono truncate" title={user.id}>{user.id}</p>
          </div>
        </div>
      </div>

      <form
        action={(formData) => {
          setErrorMsg(null);
          startTransition(async () => {
            try {
              await completeOnboarding(formData);
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Failed to update profile";
              setErrorMsg(msg);
            }
          });
        }}
        className="space-y-6"
      >
        {/* Name */}
        <div>
          <label className="t-micro mb-2 block" htmlFor="name">
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-4" />
            <input
              id="name"
              name="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Rivera"
              className="t-body w-full rounded-xl border border-line bg-black/25 pl-10 pr-4 py-3 text-ink outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Username with Suggestions & Real-Time Availability Check */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="t-micro" htmlFor="username">
              Unique Username <span className="text-accent">*</span>
            </label>
            {checking && <span className="t-micro text-ink-4 animate-pulse">Checking availability...</span>}
            {!checking && available === true && (
              <span className="t-micro text-[var(--color-positive)] inline-flex items-center gap-1">
                <Check className="size-3" /> Available
              </span>
            )}
            {!checking && available === false && (
              <span className="t-micro text-[var(--color-critical)] inline-flex items-center gap-1">
                <AlertCircle className="size-3" /> Taken
              </span>
            )}
          </div>

          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 t-body text-ink-4 font-mono">@</span>
            <input
              id="username"
              name="username"
              type="text"
              required
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="username"
              className={`t-body w-full rounded-xl border bg-black/25 pl-8 pr-4 py-3 font-mono text-ink outline-none transition-colors ${
                available === true
                  ? "border-[var(--color-positive)]/60 focus:border-[var(--color-positive)]"
                  : available === false
                    ? "border-[var(--color-critical)]/60 focus:border-[var(--color-critical)]"
                    : "border-line focus:border-accent"
              }`}
            />
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-3">
              <p className="t-micro text-ink-4 mb-2">Suggested Username Handles:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => applySuggestion(sug)}
                    className="pressable text-xs font-mono px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-colors"
                  >
                    @{sug}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Age & Preferred Language */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="t-micro mb-2 block" htmlFor="age">
              Age <span className="text-accent">*</span>
            </label>
            <input
              id="age"
              name="age"
              type="number"
              min={10}
              max={120}
              required
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              className="t-body w-full rounded-xl border border-line bg-black/25 px-4 py-3 text-ink outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="t-micro mb-2 block" htmlFor="preferredLanguage">
              Preferred Language
            </label>
            <select
              id="preferredLanguage"
              name="preferredLanguage"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="t-body w-full rounded-xl border border-line bg-black/25 px-4 py-3 text-ink outline-none focus:border-accent"
            >
              <option value="en" className="bg-raised text-ink">English</option>
              <option value="hinglish" className="bg-raised text-ink">Hinglish</option>
              <option value="hi" className="bg-raised text-ink">Hindi (हिन्दी)</option>
            </select>
          </div>
        </div>

        {/* Skills Description */}
        <div>
          <label className="t-micro mb-2 block" htmlFor="skillsDescription">
            Skills & Background (Optional)
          </label>
          <textarea
            id="skillsDescription"
            name="skillsDescription"
            rows={3}
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="e.g. Full-stack software developer interested in distributed systems, AI, and public speaking."
            className="t-body w-full resize-y rounded-xl border border-line bg-black/25 p-4 text-ink outline-none placeholder:text-ink-4 focus:border-accent"
          />
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl border border-[var(--color-critical)]/30 bg-[var(--color-critical)]/10 text-[var(--color-critical)] text-sm flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full justify-center"
          loading={isPending}
          disabled={!username.trim() || available === false}
        >
          Save Profile & Continue
        </Button>
      </form>
    </Surface>
  );
}
