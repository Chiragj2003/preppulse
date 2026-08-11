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

        <div className="mt-5 flex flex-col gap-3 max-w-sm">
          {(Object.entries(labels) as [Language, string][]).map(([value, label]) => (
            <label
              key={value}
              className={`flex items-center gap-3 cursor-pointer rounded-xl border p-4 transition-all duration-300 has-[:checked]:border-accent has-[:checked]:bg-accent/10 border-white/10 hover:bg-white/5`}
            >
              <input
                type="radio"
                name="language"
                value={value}
                defaultChecked={current === value}
                className="peer sr-only"
              />
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-ink-4 peer-checked:border-accent">
                <span className="h-2.5 w-2.5 rounded-full bg-accent opacity-0 transition-opacity peer-checked:opacity-100" />
              </span>
              <span className="t-body text-ink font-medium">{label}</span>
            </label>
          ))}
        </div>

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
