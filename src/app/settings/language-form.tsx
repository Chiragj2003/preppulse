"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { Language } from "@/lib/types";

import { updateLanguage } from "./actions";

/**
 * Language selector form. Uses `useActionState` so the save confirmation
 * renders from the server action's return value, not from optimistic client
 * state that could disagree with the database.
 */
export function LanguageForm({
  current,
  labels,
}: {
  current: Language;
  labels: Record<Language, string>;
}) {
  const [state, action, pending] = useActionState(updateLanguage, null);

  return (
    <Surface material="liquid" radius="lg" className="p-7">
      <form action={action}>
        <label className="t-heading block" htmlFor="language-select">
          Language
        </label>
        <p className="t-meta mt-1.5 text-ink-4">
          AI coaching and prompts will use this language.
        </p>

        <select
          key={current}
          id="language-select"
          name="language"
          defaultValue={current}
          className="mt-5 w-full max-w-xs rounded-[var(--radius-sm)] border border-line bg-void px-4 py-3 text-[14px] text-ink outline-none focus:border-accent"
        >
          {(Object.entries(labels) as [Language, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <div className="mt-6 flex items-center gap-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving\u2026" : "Save"}
          </Button>

          {state?.saved && (
            <p className="t-meta text-accent animate-in fade-in">
              Saved
            </p>
          )}
        </div>
      </form>
    </Surface>
  );
}
