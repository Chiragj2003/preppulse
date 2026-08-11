"use client";

import { FileText, Upload } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { uploadResume } from "@/app/interview/actions";
import type { ResumeExtract } from "@/lib/types";

export function ResumeUpload({ existing }: { existing: ResumeExtract | null }) {
  const [state, action, pending] = useActionState(uploadResume, null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={action}>
      <Surface material="liquid" radius="md" className="p-6 sm:p-7">
        <label className="flex cursor-pointer flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-accent-wash/50 text-accent">
              <FileText className="size-5" />
            </span>
            <span>
              <span className="t-heading block">
                {fileName ?? (existing ? "Replace your resume" : "Upload a PDF resume")}
              </span>
              <span className="t-meta mt-1 block">
                Read directly by Gemini. Only the extracted details are stored — the file itself is
                never kept.
              </span>
            </span>
          </span>

          <input
            type="file"
            name="resume"
            accept="application/pdf"
            required
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <span className="pressable inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-line-bright/60 bg-white/5 px-5 text-[14px] font-medium hover:bg-white/10">
            <Upload className="size-4" />
            Choose file
          </span>
        </label>

        {fileName && (
          <div className="mt-6 flex flex-wrap items-center gap-5 border-t border-line pt-5">
            <Button type="submit" variant="primary" loading={pending}>
              {pending ? "Reading it" : "Extract my background"}
            </Button>
            <p className="t-meta text-ink-4">Takes a few seconds.</p>
          </div>
        )}

        {state && !state.ok && (
          <p role="alert" className="t-meta mt-5 text-[var(--color-critical)]">
            {state.error.message}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="t-meta mt-5 text-[var(--color-positive)]">
            Done. We&apos;ll interview you for {state.data.role}.
          </p>
        )}
      </Surface>

      {existing && (
        <div className="mt-5">
          <p className="t-micro mb-4">What we read from it</p>
          <div className="space-y-4">
            {existing.recommendedRole && (
              <p className="t-body text-ink-2">
                <span className="text-ink-4">Suggested role </span>
                {existing.recommendedRole}
              </p>
            )}
            {existing.skills.length > 0 && (
              <p className="t-body text-ink-2">
                <span className="text-ink-4">Skills </span>
                {existing.skills.slice(0, 18).join(", ")}
              </p>
            )}
            {existing.experience.length > 0 && (
              <p className="t-body text-ink-2">
                <span className="text-ink-4">Experience </span>
                {existing.experience.map((e) => `${e.role} at ${e.company}`).join("; ")}
              </p>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
