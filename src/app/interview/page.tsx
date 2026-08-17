import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { checkCanStart } from "@/lib/gate";
import { getProfile } from "@/lib/practice";
import { requireOnboardedUser } from "@/lib/session";
import { INTERVIEWER_PERSONAS, PERSONA_BLURBS, PERSONA_LABELS } from "@/lib/types";
import type { ResumeExtract } from "@/lib/types";
import { startInterview } from "./actions";
import { FocusPicker } from "./focus-picker";

export const metadata: Metadata = { title: "Mock interview" };

/**
 * Everything the candidate has claimed they know, in one list.
 *
 * Skills and project tech are the same kind of thing to an interviewer, and
 * they overlap heavily, so they're merged and deduped case-insensitively —
 * "Postgres" listed under both skills and a project is one chip, not two.
 */
function technologiesFrom(resume: ResumeExtract | null | undefined): string[] {
  if (!resume) return [];

  const seen = new Map<string, string>();
  for (const item of [...resume.skills, ...resume.projects.flatMap((p) => p.tech ?? [])]) {
    const value = item.trim();
    if (!value || value.length > 32) continue;
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  }

  return [...seen.values()].slice(0, 24);
}

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
  const skillsDescription = profile?.skillsDescription;
  // "ready" used to gate the whole page — no resume meant no interview at
  // all, full stop. That was the actual complaint: someone who just wants
  // general C# and JavaScript practice was being forced through a resume
  // upload to get there. It now only decides whether "based on my
  // background" is offered as a choice; general practice needs no profile.
  const hasBackground = Boolean(resume || skillsDescription);
  const technologies = technologiesFrom(resume);

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
        {/* Background source. This used to be a hard gate on the whole page —
            no resume meant no interview. That was the actual friction: someone
            who wants plain C# and JavaScript practice was being forced through
            a resume upload to get anywhere. The choice is explicit instead. */}
        <fieldset>
          <legend className="t-micro mb-2">What should this round draw on?</legend>
          <p className="t-meta mb-5 max-w-md text-ink-4">
            Based on your background lets questions reference your real projects and claims.
            General keeps things textbook — no resume, no personal history, just the technologies
            you pick below.
          </p>

          {(resume || skillsDescription) && (
            <Surface material="frost" radius="md" className="mb-4 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="t-micro mb-2">On file</p>
                  {resume ? (
                    <p className="t-body text-ink-2">
                      {resume.recommendedRole && <>Suggested role: {resume.recommendedRole}. </>}
                      {resume.skills.length > 0 && (
                        <>
                          Skills: {resume.skills.slice(0, 10).join(", ")}
                          {resume.skills.length > 10 ? "…" : ""}.
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="t-body line-clamp-2 text-ink-2">{skillsDescription}</p>
                  )}
                </div>
                <Link
                  href="/interview-prep"
                  className="t-meta shrink-0 whitespace-nowrap text-accent hover:underline"
                >
                  Change it
                </Link>
              </div>
            </Surface>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={hasBackground ? "cursor-pointer" : "cursor-not-allowed"}>
              <input
                type="radio"
                name="useBackground"
                value="true"
                defaultChecked={hasBackground}
                disabled={!hasBackground}
                className="peer sr-only"
              />
              <Surface
                material="liquid"
                radius="md"
                className="h-full p-5 transition-all peer-checked:ring-2 peer-checked:ring-accent peer-checked:bg-accent/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent [label:has(input:disabled)_&]:opacity-40"
              >
                <p className="t-heading">Based on my background</p>
                <p className="t-meta mt-1.5">
                  {hasBackground ? (
                    "Draws on the resume or skills above."
                  ) : (
                    <>
                      Nothing on file yet —{" "}
                      <Link href="/interview-prep" className="text-accent hover:underline">
                        add one
                      </Link>{" "}
                      to unlock this.
                    </>
                  )}
                </p>
              </Surface>
            </label>

            <label className="cursor-pointer">
              <input
                type="radio"
                name="useBackground"
                value="false"
                defaultChecked={!hasBackground}
                className="peer sr-only"
              />
              <Surface
                material="liquid"
                radius="md"
                className="h-full p-5 transition-all peer-checked:ring-2 peer-checked:ring-accent peer-checked:bg-accent/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
              >
                <p className="t-heading">General practice</p>
                <p className="t-meta mt-1.5">
                  Textbook questions on the technologies you pick below, independent of anything
                  on file.
                </p>
              </Surface>
            </label>
          </div>
        </fieldset>

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

        {/* Focus */}
        <fieldset>
          <legend className="t-micro mb-2">What should they dig into?</legend>
          <p className="t-meta mb-5 max-w-md text-ink-4">
            {technologies.length > 0
              ? "Pulled from your resume. Pick the ones you want tested — or add whatever the job description asks for."
              : "Name the technologies you want tested. Anything you add here is what the technical questions will be about."}
          </p>
          <FocusPicker suggestions={technologies} />
        </fieldset>

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
