"use client";

import { useState } from "react";
import { Surface } from "@/components/ui/surface";
import type { DiscussionPersona } from "@/lib/types";

export function PersonaSelector({ personas }: { personas: DiscussionPersona[] }) {
  // Pre-select the first 4 by default
  const [selected, setSelected] = useState<Set<string>>(
    new Set(personas.slice(0, 4).map((p) => p.id))
  );

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= 4) return; // Max 4 allowed
      next.add(id);
    }
    setSelected(next);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="t-micro">Who&apos;s in the room</p>
        <p className="t-meta">
          <span className={selected.size === 4 ? "text-accent" : "text-ink-4"}>
            {selected.size}
          </span>
          <span className="text-ink-4"> / 4 selected</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {personas.map((persona) => {
          const isSelected = selected.has(persona.id);
          const isDisabled = !isSelected && selected.size >= 4;

          return (
            <label
              key={persona.id}
              className={`group cursor-pointer transition-all duration-300 ${isDisabled ? "opacity-30 grayscale" : !isSelected && selected.size > 0 ? "opacity-60" : "opacity-100"}`}
            >
              <input
                type="checkbox"
                name="selectedPersonas"
                value={persona.id}
                checked={isSelected}
                onChange={() => toggle(persona.id)}
                disabled={isDisabled}
                className="peer sr-only"
              />
              <Surface
                material="liquid"
                radius="md"
                className="h-full p-5 transition-all duration-300 peer-checked:bg-accent/20 peer-checked:border-accent peer-checked:ring-1 peer-checked:ring-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-heading transition-colors group-has-checked:text-accent">{persona.name}</p>
                  <span className="t-micro">{persona.trait}</span>
                </div>
                <p className="t-meta mt-2">{persona.instruction}</p>
              </Surface>
            </label>
          );
        })}
      </div>
    </div>
  );
}
