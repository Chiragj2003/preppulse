"use client";

import { Camera, CameraOff, Loader2 } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import type { LiveFrame, PresenceStatus } from "@/lib/usePresence";

/**
 * The camera panel: a small self-view and a live in-frame light. Live-only —
 * the end-of-session summary lives on the report page now
 * (`presence-summary-card.tsx`), because tracking runs continuously across
 * the whole interview and only has one summary, computed once at the end, not
 * a fresh one to show after every question.
 *
 * Deliberately small and deliberately quiet. It sits beside the thing the user
 * is actually doing — answering a question — and a large live readout of your
 * own face is a distraction machine, which is the opposite of what a mode that
 * measures distraction should be.
 */
export function PresenceMonitor({
  videoRef,
  status,
  live,
  errorDetail,
  onStart,
  onStop,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: PresenceStatus;
  live: LiveFrame;
  /** What actually went wrong, when `status === "error"`. */
  errorDetail?: string | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const busy = status === "loading" || status === "requesting";
  const on = status === "tracking";

  return (
    <Surface material="frost" radius="md" className="p-4">
      <div className="flex items-start gap-4">
        {/* The self-view stays mounted whatever the status — the ref has to
            exist before getUserMedia resolves or there is nowhere to attach
            the stream. Hidden rather than unmounted when off. */}
        <div
          className="relative shrink-0 overflow-hidden rounded-[var(--radius-xs)] bg-black/40"
          style={{ width: 96, height: 72 }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            className="size-full object-cover"
            style={{
              // Mirrored, because an un-mirrored self-view is disorienting —
              // everyone expects a mirror, not a photograph.
              transform: "scaleX(-1)",
              opacity: on ? 1 : 0,
            }}
          />
          {!on && (
            <span className="absolute inset-0 grid place-items-center text-ink-4">
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CameraOff className="size-4" />
              )}
            </span>
          )}
          {on && (
            <span
              className="absolute right-1.5 top-1.5 size-2 rounded-full transition-colors"
              style={{
                background: live.present
                  ? "var(--color-positive)"
                  : "var(--color-caution)",
              }}
              aria-hidden
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="t-micro">
              {status === "off" && "Camera off"}
              {status === "loading" && "Loading the face model"}
              {status === "requesting" && "Asking for the camera"}
              {status === "tracking" && (live.present ? "In frame" : "Face not visible")}
              {status === "denied" && "Camera blocked"}
              {status === "unsupported" && "No camera on this device"}
              {status === "insecure" && "Needs a secure connection"}
              {status === "error" && "Couldn't start tracking"}
            </p>

            <button
              type="button"
              onClick={on ? onStop : onStart}
              disabled={busy || status === "unsupported" || status === "insecure"}
              className="pressable inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 py-1 text-[12px] text-ink-2 transition-colors hover:text-ink disabled:opacity-40"
            >
              {on ? <CameraOff className="size-3" /> : <Camera className="size-3" />}
              {on ? "Turn off" : status === "error" ? "Try again" : "Turn on"}
            </button>
          </div>

          <p className="t-meta mt-2 text-ink-4">
            {status === "denied"
              ? "Allow camera access in your browser to track how you present."
              : status === "insecure"
                ? "Camera access only works over https — not available on this connection."
                : status === "error" && errorDetail
                  ? errorDetail
                  : status === "off"
                    ? "Optional. Tracks whether you hold the frame and how still you sit — nothing is recorded or uploaded."
                    : "Nothing is recorded or uploaded. Frames are measured and discarded."}
          </p>
        </div>
      </div>
    </Surface>
  );
}
