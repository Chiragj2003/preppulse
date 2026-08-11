"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveSkillsDescription } from "./actions";

export function SkillsForm({ initialValue }: { initialValue: string }) {
  const [state, action, pending] = useActionState(saveSkillsDescription, null);

  return (
    <form action={action}>
      <label htmlFor="skills" className="sr-only">
        What you do
      </label>
      <textarea
        id="skills"
        name="skills"
        rows={8}
        defaultValue={initialValue}
        placeholder="Final-year CS student. Built a React dashboard for a college fest handling 2k signups, and a Python tool that scrapes job listings. Comfortable with JS, Python and SQL; applying for frontend and full-stack roles."
        className="t-lead w-full resize-y rounded-[var(--radius-md)] border border-line bg-black/25 p-6 text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent"
      />

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <Button type="submit" variant="primary" loading={pending}>
          Save to profile
        </Button>

        {state?.message && (
          <p
            role="status"
            className={cn(
              "t-meta",
              state.ok ? "text-[var(--color-positive)]" : "text-[var(--color-critical)]",
            )}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
