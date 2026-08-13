import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/practice";
import { requireUser } from "@/lib/session";
import { ResumeUpload } from "./resume-upload";
import { SkillsForm } from "./skills-form";

export const metadata: Metadata = { title: "Interview prep" };

/**
 * More structured and professional than the daily-practice screens, while
 * staying unmistakably the same product: same materials, same type scale,
 * same restraint. Only the composition tightens up.
 */
export default async function InterviewPrepPage() {
  const user = await requireUser("/interview-prep");
  const profile = await getProfile(user.id);

  // Named separately, because "we have something to interview you on" and "we
  // have read your resume" are different facts. Collapsing them into one
  // `ready` flag is what put a green "Ready" under a resume that had not been
  // uploaded yet — true, but answering a question nobody asked.
  const hasResume = Boolean(profile?.resumeExtractedData);
  const hasDescription = Boolean(profile?.skillsDescription);
  const ready = hasResume || hasDescription;

  return (
    <div className="mx-auto max-w-3xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise">
        <p className="t-micro mb-7">Interview preparation</p>
        <h1 className="t-display max-w-[14ch]">
          Tell us what <span className="text-ink-3">you actually do.</span>
        </h1>
        <p className="t-lead mt-8 max-w-lg">
          Mock rounds get built around your experience rather than a generic question bank — the
          questions you&apos;d really be asked, analysed one answer at a time.
        </p>
      </header>

      <section className="rise mt-16 [animation-delay:80ms]">
        <p className="t-micro mb-5">In your own words</p>
        <SkillsForm initialValue={profile?.skillsDescription ?? ""} />
      </section>

      <section className="rise mt-14 [animation-delay:140ms]">
        <p className="t-micro mb-5">Or upload a resume</p>
        <ResumeUpload existing={profile?.resumeExtractedData ?? null} />
      </section>

      {ready && (
        <section className="rise mt-16 border-t border-line pt-10 [animation-delay:200ms]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-lg">
              <p className="t-micro mb-4">
                {hasResume ? "Resume read" : "Description saved"}
              </p>
              <h2 className="t-heading">Run a mock round</h2>
              <p className="t-body mt-2 text-ink-3">
                {hasResume
                  ? "Questions will come from your resume — the projects, tools and claims above. You pick which technologies they dig into."
                  : "Questions will come from what you wrote above. Upload a resume too and they get sharper: real projects to ask about, and technologies to choose from."}
              </p>
            </div>
            <Link href="/interview" className="shrink-0">
              <Button variant="primary" size="lg">
                Start a mock interview
              </Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
