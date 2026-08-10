"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState } from "react";

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
        rows={7}
        defaultValue={initialValue}
        placeholder="Final-year CS student. Built a React dashboard for a college fest handling 2k signups, and a small Python tool that scrapes job listings. Comfortable with JS, Python and SQL; applying for frontend and full-stack roles."
        className="w-full resize-y rounded-[var(--radius-sm)] border border-line bg-surface p-4 text-[15px] leading-relaxed outline-none placeholder:text-muted focus:border-accent"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="pressable inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[14.5px] font-medium text-bg hover:opacity-90 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? "Saving..." : "Save to profile"}
        </button>

        {state?.message && (
          <p
            role="status"
            className={`inline-flex items-center gap-1.5 text-[13.5px] ${
              state.ok ? "text-positive" : "text-danger"
            }`}
          >
            {state.ok && <Check className="size-3.5" />}
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
