"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

/**
 * Past a handful, "focus" stops meaning anything: ten technologies across ten
 * questions is one question each, which is the broad round you'd have got
 * anyway.
 */
const MAX_FOCUS = 6;

/**
 * Which technologies this round should dig into.
 *
 * The suggestions are the candidate's own — pulled straight out of the resume
 * they uploaded — rather than a hardcoded list of every framework in existence.
 * A fixed list would be wrong for most people and stale within a year, and the
 * only technologies worth being interviewed on are the ones you claimed.
 *
 * Free entry stays open on top of that, because the thing you most need to
 * practise is often the one on the job description rather than on your CV.
 *
 * Selections are emitted as repeated hidden inputs so the server action reads
 * them with `formData.getAll("focus")` — no JSON round-trip to parse or
 * validate on the other side.
 */
export function FocusPicker({ suggestions }: { suggestions: string[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const all = [...suggestions, ...extra];
  const atLimit = selected.length >= MAX_FOCUS;

  function toggle(item: string) {
    setSelected((prev) =>
      prev.includes(item)
        ? prev.filter((s) => s !== item)
        : prev.length >= MAX_FOCUS
          ? prev
          : [...prev, item],
    );
  }

  function addDraft() {
    const value = draft.trim().replace(/,+$/, "");
    if (!value) return;

    // Case-insensitive, so typing "react" when the resume said "React" selects
    // the existing chip instead of creating a near-duplicate.
    const existing = all.find((item) => item.toLowerCase() === value.toLowerCase());
    if (existing) {
      if (!selected.includes(existing)) toggle(existing);
    } else if (!atLimit) {
      setExtra((prev) => [...prev, value]);
      setSelected((prev) => [...prev, value]);
    }
    setDraft("");
  }

  return (
    <div>
      {all.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {all.map((item) => {
            const on = selected.includes(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggle(item)}
                aria-pressed={on}
                disabled={!on && atLimit}
                className={`pressable rounded-full border px-3.5 py-1.5 text-[13px] transition-colors duration-[var(--dur-base)] disabled:cursor-not-allowed disabled:opacity-35 ${
                  on
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-line bg-white/[0.04] text-ink-2 hover:border-line-bright hover:text-ink"
                }`}
              >
                {item}
                {on && <X className="ml-1.5 inline size-3 align-[-1px]" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter must not submit the form — this input adds a chip, and
            // starting a whole interview by pressing Enter mid-thought is the
            // kind of accident that costs a real minute of waiting.
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addDraft();
            }
          }}
          placeholder={atLimit ? `${MAX_FOCUS} is the maximum` : "Add anything else — Kubernetes, System design…"}
          disabled={atLimit}
          aria-label="Add a technology or topic"
          className="w-full rounded-[var(--radius-xs)] border border-line bg-black/25 px-4 py-3 text-[15px] outline-none placeholder:text-ink-4 focus:border-accent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={atLimit || !draft.trim()}
          aria-label="Add"
          className="pressable grid size-[46px] shrink-0 place-items-center rounded-[var(--radius-xs)] border border-line bg-white/[0.04] text-ink-2 hover:text-ink disabled:opacity-35"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {selected.map((item) => (
        <input key={item} type="hidden" name="focus" value={item} />
      ))}

      <p className="t-meta mt-3 text-ink-4">
        {selected.length === 0
          ? "Leave this empty and the round covers your background broadly."
          : `${selected.length} selected — the technical questions will concentrate here.`}
      </p>
    </div>
  );
}
