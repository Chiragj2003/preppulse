"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { checkUsernameAvailability, completeOnboarding } from "./actions";

/** One field style for the whole form. 10px radius, matching every other input. */
const field =
  "w-full rounded-[var(--radius-xs)] border border-line bg-black/25 px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent";

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
    <Surface material="dense" radius="lg" refract className="overflow-hidden">
      {/* Header sits on its own tinted band so the form below reads as a
          separate layer rather than one long undifferentiated panel. */}
      <div className="border-b border-line/60 bg-white/[0.02] px-7 py-6 sm:px-10">
        <p className="t-micro mb-3">Step one of one</p>
        <h2 className="t-title">Set up your profile</h2>
        <p className="t-body mt-2 max-w-md text-ink-3">
          A handle so other people can find you on the leaderboard, and a line about
          yourself so your practice can be built around what you actually do.
        </p>
        <p className="t-meta mt-4 text-ink-4">
          Signed in as <span className="text-ink-2">{user.email}</span>
        </p>
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
        className="space-y-7 px-7 py-8 sm:px-10"
      >
        {/* Name */}
        <div>
          <label className="t-micro mb-2.5 block" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Rivera"
            className={field}
          />
        </div>

        {/* Handle */}
        <div>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <label className="t-micro" htmlFor="username">
              Handle
            </label>
            {checking && (
              <span className="t-meta inline-flex items-center gap-1.5 text-ink-4">
                <Loader2 className="size-3 animate-spin" />
                Checking
              </span>
            )}
            {!checking && available === true && (
              <span className="t-meta inline-flex items-center gap-1.5 text-[var(--color-positive)]">
                <Check className="size-3" />
                Available
              </span>
            )}
            {!checking && available === false && (
              <span className="t-meta text-[var(--color-critical)]">Already taken</span>
            )}
          </div>

          <div className="relative">
            <span className="t-numeric pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] text-ink-4">
              @
            </span>
            <input
              id="username"
              name="username"
              type="text"
              required
              minLength={3}
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="alexrivera"
              className={`${field} t-numeric pl-9 ${
                available === true
                  ? "border-[var(--color-positive)]/60 focus:border-[var(--color-positive)]"
                  : available === false
                    ? "border-[var(--color-critical)]/60 focus:border-[var(--color-critical)]"
                    : ""
              }`}
            />
          </div>

          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="t-meta text-ink-4">Try</span>
              {suggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => applySuggestion(sug)}
                  className="pressable t-numeric rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[12.5px] text-accent hover:bg-accent/20"
                >
                  @{sug}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Age + language */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="t-micro mb-2.5 block" htmlFor="age">
              Age
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
              className={`${field} t-numeric`}
            />
          </div>

          <div>
            <label className="t-micro mb-2.5 block" htmlFor="preferredLanguage">
              Practice language
            </label>
            <select
              id="preferredLanguage"
              name="preferredLanguage"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={`${field} appearance-none`}
            >
              <option value="en" className="bg-raised text-ink">
                English
              </option>
              <option value="hinglish" className="bg-raised text-ink">
                Hinglish
              </option>
              <option value="hi" className="bg-raised text-ink">
                Hindi (हिन्दी)
              </option>
            </select>
          </div>
        </div>

        {/* Short description. Not decorative: this is what interview questions
            and scenario briefs are generated from, so the label says so. */}
        <div>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <label className="t-micro" htmlFor="skillsDescription">
              A line about you
            </label>
            <span className="t-meta text-ink-4">{skills.trim().length} characters</span>
          </div>
          <textarea
            id="skillsDescription"
            name="skillsDescription"
            rows={3}
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="Final-year CS student. Built a React dashboard for a college fest that handled 2,000 signups. Applying for frontend roles."
            className={`${field} resize-y leading-relaxed`}
          />
          <p className="t-meta mt-2 text-ink-4">
            Mock interviews and role-plays are built from this. Two sentences is plenty —
            you can change it any time in settings.
          </p>
        </div>

        {errorMsg && (
          <p
            role="alert"
            className="t-body flex items-start gap-2.5 rounded-[var(--radius-xs)] border border-[var(--color-critical)]/30 bg-[var(--color-critical)]/10 px-4 py-3 text-[var(--color-critical)]"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {errorMsg}
          </p>
        )}

        <div className="border-t border-line/60 pt-6">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={isPending}
            disabled={!username.trim() || available === false}
          >
            Save and start practising
          </Button>
        </div>
      </form>
    </Surface>
  );
}
