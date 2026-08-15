"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Volume2, Sparkles } from "lucide-react";

import { finishDiscussion, speak } from "@/app/discuss/actions";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Surface } from "@/components/ui/surface";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { useVoiceSession, type VoiceSessionMode } from "@/lib/useVoiceSession";
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

export type RoomMode = "group_discussion" | "debate" | "conversation" | "scenario";

export function DiscussionRoom({
  sessionId,
  topic,
  title,
  mode,
  stance,
  counterpartName,
  language,
  completed,
  initialTurns,
}: {
  sessionId: string;
  topic: string;
  title?: string;
  mode: RoomMode;
  stance: "for" | "against";
  counterpartName?: string;
  language: string;
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
  const [typedMode, setTypedMode] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);

  const isDebate = mode === "debate";
  const isRolePlay = mode === "scenario" || mode === "conversation";

  const sendRef = useRef<(spokenText?: string) => void>(() => {});

  // Advanced Voice Session Hook with low-latency VAD & auto-interrupt
  const voiceSession = useVoiceSession({
    sessionId,
    mode: mode as VoiceSessionMode,
    topic,
    stance,
    stage,
    language: language as "en" | "hinglish" | "hi",
    autoSave: true,
    onTurnComplete: (speaker, text) => {
      // Pass the text through. The recogniser has already been reset by this
      // point, so `send()` cannot recover it on its own.
      if (speaker === null && text.trim()) {
        void sendRef.current(text);
      }
    },
    onInterrupted: () => {
      console.log("[DiscussionRoom] Candidate interrupted AI speech");
    },
  });

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

  // The composer/voice dock is fixed to the bottom of the viewport, so
  // scrolling a message to `block: "end"` parks it *behind* the dock and looks
  // like the scroll stopped halfway. The sentinel carries a scroll margin the
  // height of the dock, so the newest turn lands fully clear of it.
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [turns.length, reduceMotion]);

  /**
   * `spokenText` is passed in by the voice path, and that matters: `sendTurn`
   * resets the recogniser before firing this callback, so re-reading
   * `voiceSession.transcript` here would always find it empty and bail — which
   * left the session stuck on "processing" with a live mic and no way out.
   */
  const send = useCallback(async (spokenText?: string) => {
    const content = (spokenText ?? (typedMode ? draft : voiceSession.transcript)).trim();
    if (!content || busy) {
      // Nothing to send; make sure the floor goes back rather than hanging.
      if (!typedMode) voiceSession.resumeListening();
      return;
    }

    setBusy(true);
    setError(null);

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
      if (!typedMode) voiceSession.resumeListening();
      return;
    }

    setTurns((prev) => [
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

    if (!typedMode) {
      if (result.data.replies.length > 0) {
        const fullReply = result.data.replies.map((r) => r.content).join(" ");
        const speakerId = result.data.replies[0]?.speaker || "ai";
        voiceSession.speakResponse(fullReply, speakerId);
        // speakResponse drives status: speaking -> listening via TTS callbacks.
      } else {
        // No reply came back. Hand the floor straight back rather than waiting
        // on a TTS "ended" event that will never fire.
        voiceSession.resumeListening();
      }
    }
  }, [typedMode, voiceSession, busy, draft, isDebate, stage, sessionId]);

  sendRef.current = send;

  async function end() {
    voiceSession.stopSession();
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

  function replayTurn(content: string) {
    voiceSession.speakResponse(content);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-24 pb-48 sm:px-6">
      {/* Header */}
      <header className="rise">
        <div className="flex items-center justify-between gap-4 mb-4">
          <p className="t-micro">
            {isDebate
              ? `Debate / you are ${stance}`
              : isRolePlay
                ? (title ?? "Role play")
                : "Group discussion"}
            {isDebate && (
              <>
                <span className="mx-3 text-ink-4">/</span>
                <span className="text-accent">{stage}</span>
              </>
            )}
            {isRolePlay && counterpartName && (
              <>
                <span className="mx-3 text-ink-4">/</span>
                <span className="text-ink-2">with {counterpartName}</span>
              </>
            )}
          </p>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-medium">
            <Sparkles className="size-3.5" />
            <span>Advanced Audio Active</span>
          </span>
        </div>

        <h1 className="t-title max-w-2xl">{topic}</h1>
        {isDebate && <p className="t-meta mt-4">{STAGE_BRIEF[stage]}</p>}
      </header>

      {!isRolePlay && (
        <div className="mt-8 flex flex-wrap items-baseline gap-x-10 gap-y-4 border-y border-line py-5">
          <Figure value={`${metrics.speakingSharePct}%`} label="your airtime" />
          <Figure value={metrics.argumentsIntroduced} label="arguments" />
          <Figure value={metrics.directRebuttals} label="rebuttals" />
          <span className="t-meta ml-auto text-ink-4">{presence.label}</span>
        </div>
      )}

      {/* Transcript List */}
      <div className="mt-10 space-y-7">
        {turns.length === 0 && (
          <p className="t-lead text-ink-4">
            {isDebate
              ? "Open the debate. State your position and the ground you'll fight on."
              : isRolePlay
                ? "They've opened. Reply as you actually would."
                : "Open the discussion. Say what you think and why."}
          </p>
        )}

        {turns.map((turn) => {
          const persona = turn.speaker ? personaById(turn.speaker) : null;
          const isUser = turn.speaker === null;
          const name = isUser
            ? "You"
            : (persona?.name ??
              counterpartName ??
              (turn.speaker === "opponent" ? "Opponent" : turn.speaker));

          return (
            <motion.div
              key={turn.id}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.45 }}
              className={isUser ? "pl-0 sm:pl-16" : ""}
            >
              <div className="flex items-center gap-2 mb-2.5">
                <p className="t-micro" style={{ color: isUser ? "var(--color-accent)" : undefined }}>
                  {name}
                  {persona && <span className="ml-3 text-ink-4">{persona.trait}</span>}
                </p>
                {!isUser && (
                  <button
                    type="button"
                    className="pressable ml-auto text-ink-4 hover:text-ink-2"
                    onClick={() => replayTurn(turn.content)}
                    aria-label={`Replay ${name}'s response`}
                  >
                    <Volume2 className="size-3.5" />
                  </button>
                )}
              </div>
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

        {/* scroll-mb clears the fixed dock, so "scroll to newest" actually
            lands the newest turn in view instead of underneath it. */}
        <div ref={endRef} className="scroll-mb-56 h-px" />
      </div>

      {error && (
        <ErrorState message={error} onRetry={() => setError(null)} retryLabel="Dismiss" />
      )}

      {/* Floating Audio Control & Visualizer Dock */}
      {!done ? (
        <div
          className="pb-safe fixed inset-x-0 bottom-0 px-4 sm:px-6"
          style={{ zIndex: "var(--z-sticky)" }}
        >
          <div className="mx-auto max-w-3xl space-y-3">
            {!typedMode ? (
              <VoiceVisualizer
                status={voiceSession.status}
                audioLevel={voiceSession.audioLevel}
                transcript={voiceSession.transcript}
                isMicActive={voiceSession.isMicActive}
                isSpeaking={voiceSession.isSpeaking}
                counterpartName={isDebate ? "Opponent" : counterpartName || "Panel"}
                onToggleMic={() => {
                  if (voiceSession.status === "idle") {
                    void voiceSession.startSession();
                  } else {
                    voiceSession.stopSession();
                  }
                }}
                onStop={voiceSession.stopSession}
              />
            ) : (
              <Surface material="frost" radius="lg" className="p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    rows={2}
                    placeholder={isDebate ? `Your ${stage}...` : "Make your point..."}
                    className="t-body max-h-40 min-h-[3.5rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-ink outline-none placeholder:text-ink-4"
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="primary"
                      onClick={() => void send()}
                      loading={busy}
                      disabled={!draft.trim()}
                      icon={<Send className="size-4" />}
                    >
                      Say it
                    </Button>
                    <button
                      type="button"
                      className="pressable t-meta text-ink-4 hover:text-ink-2 self-center"
                      onClick={() => setTypedMode(false)}
                    >
                      Use Voice
                    </button>
                  </div>
                </div>
              </Surface>
            )}

            <div className="flex items-center justify-between max-w-xl mx-auto px-2">
              <button
                type="button"
                className="pressable t-meta text-ink-4 hover:text-ink-2 text-xs"
                onClick={() => setTypedMode((v) => !v)}
              >
                {typedMode ? "Switch to Voice Mode" : "Switch to Typed Mode"}
              </button>

              <button
                type="button"
                onClick={() => void end()}
                disabled={busy || turns.length === 0}
                className="pressable t-micro hover:text-ink-2 disabled:opacity-40"
              >
                End and see report
              </button>
            </div>
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
