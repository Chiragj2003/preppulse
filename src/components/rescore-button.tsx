"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { rescoreAnswer } from "@/app/interview/actions";

/**
 * The report's answer to a batch failure.
 *
 * Scoring ten answers back-to-back is more likely to have one hit a transient
 * provider error than the old one-at-a-time flow ever was — see D74/D79. This
 * is what makes that acceptable: nothing the candidate said is lost, only
 * delayed, and getting the score is one click, not a support request.
 */
export function RescoreButton({ sessionId, questionId }: { sessionId: string; questionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");

  async function retry() {
    setState("busy");
    const result = await rescoreAnswer(sessionId, questionId);
    if (result.ok) {
      router.refresh();
    } else {
      setState("failed");
    }
  }

  return (
    <div>
      <Button
        variant="glass"
        size="sm"
        icon={<RotateCcw className="size-3.5" />}
        loading={state === "busy"}
        onClick={() => void retry()}
      >
        Try scoring this one again
      </Button>
      {state === "failed" && (
        <p className="t-meta mt-2 text-ink-2">Still couldn&apos;t score it. Give it a moment and try again.</p>
      )}
    </div>
  );
}
