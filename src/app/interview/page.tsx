import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { checkCanStart } from "@/lib/gate";
import { getProfile } from "@/lib/practice";
import { requireOnboardedUser } from "@/lib/session";
import { INTERVIEWER_PERSONAS, PERSONA_BLURBS, PERSONA_LABELS } from "@/lib/types";
import { startInterview } from "./actions";

export const metadata: Metadata = { title: "Mock interview" };

/**
 * Setup, not a wizard. One screen: who is interviewing you, for what, how long.
 */
export default async function InterviewSetupPage() {
  const { user } = await requireOnboardedUser("/interview");
  const [profile, locked] = await Promise.all([
    getProfile(user.id),
    checkCanStart(user.id, "interview"),
  ]);

  const resume = profile?.resumeExtractedData;
  const ready = Boolean(resume || profile?.skillsDescription);

  if (locked) {
    return (
      <div className="mx-auto max-w-2xl px-5 pt-32 pb-24 sm:px-6">
        <p className="t-micro mb-6">Mock interview</p>
        <h1 className="t-display max-w-[14ch]">
          Interviews are <span className="text-ink-3">part of Pro.</span>
        </h1>
        <p className="t-lead mt-8 max-w-md">{locked.message}</p>
        <Link href="/pricing" className="mt-10 inline-block">
          <Button variant="primary" size="lg">
            See the plans
          </Button>
        </Link>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-2xl px-5 pt-32 pb-24 sm:px-6">
        <p className="t-micro mb-6">Mock interview</p>
        <h1 className="t-display max-w-[14ch]">
          First, tell us <span className="text-ink-3">what you do.</span>
        </h1>
        <p className="t-lead mt-8 max-w-md">
          The questions are built from your actual background. Without it we&apos;d just be handing
          you a generic question bank, which you can find anywhere.
        </p>
        <Link href="/interview-prep" className="mt-10 inline-block">
          <Button variant="primary" size="lg">
            Set up your profile
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise">
        <p className="t-micro mb-6">Mock interview</p>
        <h1 className="t-display max-w-[13ch]">
          Who&apos;s taking <span className="text-ink-3">the round?</span>
        </h1>
        {resume?.recommendedFocus && (
          <p className="t-lead mt-8 max-w-xl">{resume.recommendedFocus}</p>
        )}
      </header>

      <form action={startInterview} className="rise mt-14 space-y-12 [animation-delay:80ms]">
        {/* Persona */}
        <fieldset>
          <legend className="t-micro mb-5">Interviewer</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {INTERVIEWER_PERSONAS.map((persona, index) => (
              <label key={persona} className="cursor-pointer">
                <input
                  type="radio"
                  name="persona"
                  value={persona}
                  defaultChecked={index === 1}
                  className="peer sr-only"
                />
                <Surface
                  material="liquid"
                  radius="md"
                  className="h-full p-5 transition-all peer-checked:ring-2 peer-checked:ring-accent peer-checked:bg-accent/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
                >
                  <p className="t-heading">{PERSONA_LABELS[persona]}</p>
                  <p className="t-meta mt-1.5">{PERSONA_BLURBS[persona]}</p>
                </Surface>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Role + length */}
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <label htmlFor="role" className="t-micro mb-4 block">
              Role
            </label>
            <input
              id="role"
              name="role"
              type="text"
              defaultValue={resume?.recommendedRole ?? ""}
              placeholder="Frontend Engineer"
              className="w-full rounded-[var(--radius-xs)] border border-line bg-black/25 px-4 py-3.5 text-[15px] outline-none placeholder:text-ink-4 focus:border-accent"
            />
            {resume?.recommendedRole && (
              <p className="t-meta mt-2 text-ink-4">Suggested from your resume. Change it freely.</p>
            )}
          </div>

          <div>
            <label htmlFor="questionCount" className="t-micro mb-4 block">
              Questions
            </label>
            <select
              id="questionCount"
              name="questionCount"
              defaultValue="10"
              className="w-full appearance-none rounded-[var(--radius-xs)] border border-line bg-black/25 px-4 py-3.5 text-[15px] outline-none focus:border-accent"
            >
              {[5, 8, 10, 12, 15].map((n) => (
                <option key={n} value={n} className="bg-black text-ink">
                  {n} questions
                </option>
              ))}
            </select>
            <p className="t-meta mt-2 text-ink-4">Ten runs about 10-15 minutes.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 border-t border-line pt-8">
          <SubmitButton variant="primary" size="lg">
            Begin the interview
          </SubmitButton>
          <p className="t-meta max-w-xs text-ink-4">
            Questions are written for you before you start, so the set is fixed.
          </p>
        </div>
      </form>
    </div>
  );
}
