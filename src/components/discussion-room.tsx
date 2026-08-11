"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { finishDiscussion, speak } from "@/app/discuss/actions";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Surface } from "@/components/ui/surface";
import {
  computeGdMetrics,
  personaById,
  presenceVerdict,
  STAGE_BRIEF,
  type DebateStage,
} from "@/lib/gd-metrics";

interface Turn {
  id: string;
  speaker: string | null;
  content: string;
  stage: string | null;
  isRebuttal: boolean;
  wordCount: number;
  role: string;
}

/**
 * The room. A transcript that grows, one composer, and a live read on how much
 * of the floor the user is taking — the metric that actually changes behaviour
 * mid-discussion, since both silence and dominating cost you.
 */
export function DiscussionRoom({
  sessionId,
  topic,
  mode,
  stance,
  completed,
  initialTurns,
}: {
  sessionId: string;
  topic: string;
  mode: "group_discussion" | "debate";
  stance: "for" | "against";
  completed: boolean;
  initialTurns: Turn[];
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<DebateStage>(
    (initialTurns.at(-1)?.stage as DebateStage) ?? "opening",
  );
  const [done, setDone] = useState(completed);
  const endRef = useRef<HTMLDivElement | null>(null);

  const isDebate = mode === "debate";

  const metrics = computeGdMetrics(
    turns.map((t) => ({
      speaker: t.speaker,
      content: t.content,
      isRebuttal: t.isRebuttal,
      introducesArgument: t.role === "candidate_argument",
      wordCount: t.wordCount,
    })),
  );

  const presence = presenceVerdict(metrics.speakingSharePct, isDebate ? 2 : 5);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" });
  }, [turns.length, reduceMotion]);

  async function send() {
    const content = draft.trim();
    if (!content || busy) return;

    setBusy(true);
    setError(null);

    // Optimistic: the user's own words appear immediately. Waiting on the
    // round trip to show what you just said makes the room feel dead.
    const optimistic: Turn = {
      id: `local-${Date.now()}`,
      speaker: null,
      content,
      stage: isDebate ? stage : null,
      isRebuttal: false,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      role: "candidate",
    };
    setTurns((prev) => [...prev, optimistic]);
    setDraft("");

    const result = await speak({ sessionId, content });
    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      setTurns((prev) => prev.filter((t) => t.id !== optimistic.id));
      setDraft(content);
      return;
    }

    setTurns((prev) => [
      // Patch the optimistic turn with the tags the model just assigned, or
      // the live arguments/rebuttals counters stay at zero until a refresh.
      ...prev.map((turn) =>
        turn.id === optimistic.id
          ? {
              ...turn,
              isRebuttal: result.data.userTurn.isRebuttal,
              role: result.data.userTurn.introducesArgument ? "candidate_argument" : "candidate",
            }
          : turn,
      ),
      ...result.data.replies.map((reply, i) => ({
        id: `reply-${Date.now()}-${i}`,
        speaker: reply.speaker,
        content: reply.content,
        stage: isDebate ? stage : null,
        isRebuttal: false,
        wordCount: reply.content.split(/\s+/).filter(Boolean).length,
        role: "panel",
      })),
    ]);

    if (result.data.stage) setStage(result.data.stage);
    if (result.data.finished) setDone(true);
  }

  async function end() {
    setBusy(true);
    const result = await finishDiscussion(sessionId);
    setBusy(false);
    if (result.ok) {
      setDone(true);
      router.refresh();
    } else {
      setError(result.error.message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-24 pb-40 sm:px-6">
      {/* Topic + live standing */}
      <header className="rise">
        <p className="t-micro mb-5">
          {isDebate ? `Debate / you are ${stance}` : "Group discussion"}
          {isDebate && (
            <>
              <span className="mx-3 text-ink-4">/</span>
              <span className="text-accent">{stage}</span>
            </>
          )}
        </p>
        <h1 className="t-title max-w-2xl">{topic}</h1>
        {isDebate && <p className="t-meta mt-4">{STAGE_BRIEF[stage]}</p>}
      </header>

      <div className="mt-8 flex flex-wrap items-baseline gap-x-10 gap-y-4 border-y border-line py-5">
        <Figure value={`${metrics.speakingSharePct}%`} label="your airtime" />
        <Figure value={metrics.argumentsIntroduced} label="arguments" />
        <Figure value={metrics.directRebuttals} label="rebuttals" />
        <span className="t-meta ml-auto text-ink-4">{presence.label}</span>
      </div>

      {/* Transcript */}
      <div className="mt-10 space-y-7">
        {turns.length === 0 && (
          <p className="t-lead text-ink-4">
            {isDebate
              ? "Open the debate. State your position and the ground you'll fight on."
              : "Open the discussion. Say what you think and why."}
          </p>
        )}

        {turns.map((turn) => {
          const persona = turn.speaker ? personaById(turn.speaker) : null;
          const isUser = turn.speaker === null;
          const name = isUser
            ? "You"
            : (persona?.name ?? (turn.speaker === "opponent" ? "Opponent" : turn.speaker));

          return (
            <motion.div
              key={turn.id}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.45 }}
              className={isUser ? "pl-0 sm:pl-16" : ""}
            >
              <p className="t-micro mb-2.5" style={{ color: isUser ? "var(--color-accent)" : undefined }}>
                {name}
                {persona && <span className="ml-3 text-ink-4">{persona.trait}</span>}
              </p>
              {isUser ? (
                <Surface material="dense" radius="md" className="p-5">
                  <p className="t-body text-ink">{turn.content}</p>
                </Surface>
              ) : (
                <p className="t-body max-w-2xl text-ink-2">{turn.content}</p>
              )}
            </motion.div>
          );
        })}

        {busy && (
          <p className="t-micro" style={{ animation: "breathe 1.4s var(--ease-in-out) infinite" }}>
            {isDebate ? "Your opponent is thinking" : "The panel is reacting"}
          </p>
        )}

        <div ref={endRef} />
      </div>

      {error && (
        <ErrorState message={error} onRetry={() => setError(null)} retryLabel="Dismiss" />
      )}

      {/* Composer, pinned so the user can always speak */}
      {!done ? (
        <div
          className="fixed inset-x-0 bottom-0 px-4 pb-4 sm:px-6 sm:pb-6"
          style={{ zIndex: "var(--z-sticky)" }}
        >
          <Surface material="frost" radius="lg" className="mx-auto max-w-3xl p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line. In a fast-moving
                  // discussion, reaching for a button every turn kills momentum.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                placeholder={isDebate ? `Your ${stage}...` : "Make your point..."}
                className="t-body max-h-40 min-h-[3.5rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-ink outline-none placeholder:text-ink-4"
              />
              <Button
                variant="primary"
                onClick={() => void send()}
                loading={busy}
                disabled={!draft.trim()}
                icon={<Send className="size-4" />}
              >
                Say it
              </Button>
            </div>
          </Surface>

          <div className="mx-auto mt-3 flex max-w-3xl justify-center">
            <button
              type="button"
              onClick={() => void end()}
              disabled={busy || turns.length === 0}
              className="pressable t-micro hover:text-ink-2 disabled:opacity-40"
            >
              End and see how I did
            </button>
          </div>
        </div>
      ) : (
        <Surface material="dense" radius="lg" refract className="mt-14 p-7 sm:p-9">
          <p className="t-micro mb-5">How that went</p>
          <p className="t-title">{presence.label}</p>
          <p className="t-lead mt-4 max-w-lg">{presence.detail}</p>

          <div className="mt-8 flex flex-wrap items-baseline gap-x-10 gap-y-4 border-t border-line pt-6">
            <Figure value={`${metrics.speakingSharePct}%`} label="airtime" />
            <Figure value={metrics.userTurns} label="turns taken" />
            <Figure value={metrics.argumentsIntroduced} label="arguments introduced" />
            <Figure value={metrics.directRebuttals} label="direct rebuttals" />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => router.push("/discuss")}>
              Go again
            </Button>
            <Button variant="glass" onClick={() => router.push("/dashboard")}>
              Dashboard
            </Button>
          </div>
        </Surface>
      )}
    </div>
  );
}

function Figure({ value, label }: { value: number | string; label: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="t-numeric text-[20px] text-ink">{value}</span>
      <span className="t-micro">{label}</span>
    </span>
  );
}
