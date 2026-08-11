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
  const ready = Boolean(profile?.skillsDescription || profile?.resumeExtractedData);

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
              <p className="t-micro mb-4">Ready</p>
              <h2 className="t-heading">Run a mock round</h2>
              <p className="t-body mt-2 text-ink-3">
                Pick an interviewer and how many questions. They&apos;re written for you before you
                start.
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
