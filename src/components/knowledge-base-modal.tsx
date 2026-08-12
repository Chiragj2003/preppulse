"use client";

import { useState } from "react";
import { BookOpen, X } from "lucide-react";
import { Surface } from "./ui/surface";

export function KnowledgeBaseModal({ knowledgeBase }: { knowledgeBase: string | null }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!knowledgeBase) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
      >
        <BookOpen className="size-4" />
        Read about this topic
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 transition-opacity">
          <Surface material="liquid" radius="lg" className="relative w-full max-w-2xl overflow-hidden shadow-[var(--shadow-float)] rise">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 rounded-full p-2 text-ink-3 hover:bg-white/10 hover:text-ink transition-colors"
            >
              <X className="size-5" />
            </button>
            <div className="p-6 sm:p-8">
              <h2 className="t-heading text-xl mb-4 flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent/20 text-accent">
                  <BookOpen className="size-4" />
                </span>
                Topic Background
              </h2>
              <div className="prose prose-invert max-w-none text-ink-2">
                <p className="whitespace-pre-wrap leading-relaxed">{knowledgeBase}</p>
              </div>
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-void hover:brightness-110 transition-all"
                >
                  I&apos;m ready
                </button>
              </div>
            </div>
          </Surface>
        </div>
      )}
    </>
  );
}
