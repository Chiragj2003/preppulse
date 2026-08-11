import type { Metadata } from "next";

import { Surface } from "@/components/ui/surface";
import { getProfile } from "@/lib/practice";
import { requireUser } from "@/lib/session";
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
        <Surface material="liquid" radius="md" className="p-7 opacity-60">
          <div className="flex items-baseline justify-between gap-6">
            <p className="t-heading">PDF resume parsing</p>
            <span className="t-micro shrink-0">Phase 3</span>
          </div>
          <p className="t-body mt-3 max-w-xl text-ink-3">
            Gemini reads the PDF, extracts skills, experience and projects, and recommends the
            interview type. Only the extracted JSON is stored — the file itself is never kept.
          </p>
        </Surface>
      </section>
    </div>
  );
}
