"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { prepareQuestions } from "@/app/interview/actions";

/**
 * The ten seconds between pressing Begin and question one.
 *
 * This screen exists because the alternative was worse in both directions: a
 * POST held open for the whole generation, and — when Gemini answered 503 —
 * a bare 500 page that threw away the setup. Here the wait is visible, the
 * failure has somewhere to be reported, and retrying costs one click instead
 * of filling the form again.
 */
export function PreparingRound({
  sessionId,
  role,
  questionCount,
  focusAreas,
}: {
  sessionId: string;
  role: string;
  questionCount: number;
  focusAreas: string[];
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    // React runs effects twice in development. Without this guard that is two
    // generations, two bills, and a race on the same session.
    //
    // Deliberately no "cancelled" flag in the cleanup: it would abandon the
    // first run's result, and the ref guard makes the second run a no-op, so
    // the pair would leave the screen spinning forever over a set of questions
    // that had already been written.
    if (started.current) return;
    started.current = true;

    void (async () => {
      const result = await prepareQuestions(sessionId);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    })();
  }, [sessionId, router, attempt]);

  function retry() {
    setError(null);
    started.current = false;
    setAttempt((value) => value + 1);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-5 py-28 sm:px-6">
      <div className="rise">
        <p className="t-micro mb-6">Mock interview</p>
        <h1 className="t-display max-w-[13ch]">
          {error ? (
            <>
              That didn&apos;t <span className="text-ink-3">go through.</span>
            </>
          ) : (
            <>
              Writing your <span className="text-ink-3">questions.</span>
            </>
          )}
        </h1>
        <p className="t-lead mt-8 max-w-md">
          {error
            ? error
            : `${questionCount} questions for ${role}, built from your background. About ten seconds.`}
        </p>
      </div>

      {error ? (
        <div className="rise mt-12 flex flex-wrap items-center gap-4 [animation-delay:80ms]">
          <Button variant="primary" size="lg" icon={<RotateCcw className="size-4" />} onClick={retry}>
            Try again
          </Button>
          <Link href="/interview" className="t-meta text-ink-4 transition-colors hover:text-ink-2">
            Change the setup instead
          </Link>
        </div>
      ) : (
        <Surface material="liquid" radius="lg" className="rise mt-12 p-7 [animation-delay:80ms]">
          {/* Placeholder lines that fill in sequence. Not a spinner: a spinner
              says "something is happening", these say "questions are being
              written", which is the thing actually being waited for. */}
          <div className="space-y-4">
            {Array.from({ length: Math.min(questionCount, 5) }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <span className="t-numeric w-5 shrink-0 text-[13px] text-ink-4">{index + 1}</span>
                <motion.span
                  className="h-2 rounded-full bg-ink-4/25"
                  initial={reduceMotion ? { width: "60%" } : { width: "8%" }}
                  animate={{ width: ["8%", "92%", "8%"] }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: index * 0.22,
                  }}
                />
              </div>
            ))}
          </div>

          {focusAreas.length > 0 && (
            <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-line pt-6">
              <span className="t-micro mr-1">Concentrating on</span>
              {focusAreas.map((area) => (
                <span
                  key={area}
                  className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[12px] font-medium text-accent"
                >
                  {area}
                </span>
              ))}
            </div>
          )}
        </Surface>
      )}

      {!error && (
        <p className="t-meta mt-8 text-ink-4">
          The whole set is written before you start, so the interview is fixed — and if you close
          this tab, it&apos;s waiting for you on the dashboard.
        </p>
      )}
    </div>
  );
}
