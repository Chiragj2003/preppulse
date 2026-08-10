import { FileText, Lock } from "lucide-react";
import type { Metadata } from "next";

import { getProfile } from "@/lib/practice";
import { requireUser } from "@/lib/session";
import { SkillsForm } from "./skills-form";

export const metadata: Metadata = { title: "Interview prep" };

export default async function InterviewPrepPage() {
  const user = await requireUser("/interview-prep");
  const profile = await getProfile(user.id);

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <header className="rise">
        <p className="text-[12px] font-semibold tracking-wide text-accent uppercase">Serious mode</p>
        <h1 className="mt-2 text-[30px] leading-tight font-semibold">Preparing for an interview?</h1>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-soft">
          Tell PrepPulse what you actually do. Mock rounds get built around your experience instead
          of generic question banks.
        </p>
      </header>

      <section className="rise mt-9 [animation-delay:80ms]">
        <h2 className="mb-3 text-[12px] font-semibold tracking-wide text-muted uppercase">
          In your own words
        </h2>
        <SkillsForm initialValue={profile?.skillsDescription ?? ""} />
      </section>

      <section className="rise mt-8 [animation-delay:140ms]">
        <h2 className="mb-3 text-[12px] font-semibold tracking-wide text-muted uppercase">
          Or upload a resume
        </h2>
        <div className="card flex items-start gap-4 p-6 opacity-70">
          <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-surface-2 text-muted">
            <FileText className="size-5" />
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-[15px] font-medium">
              PDF resume parsing
              <Lock className="size-3.5 text-muted" />
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
              Lands in Phase 3. Gemini reads the PDF, pulls out skills, experience and projects, and
              recommends the interview type. Only the extracted JSON is stored - the file itself is
              never kept.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
