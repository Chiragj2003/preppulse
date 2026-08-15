"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Mic, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";

type Verdict = "pass" | "fail" | "warn" | "pending";

interface Row {
  name: string;
  verdict: Verdict;
  detail: string;
  /** Why it matters, in the user's terms. */
  meaning: string;
}

/**
 * A live capability probe.
 *
 * Everything here is measured in the running browser rather than inferred from
 * a user-agent string. Feature tables average over versions and lie about the
 * one that matters — whether *continuous* recognition survives on this exact
 * iOS build, which is the difference between hands-free practice and a text
 * box.
 */
export function DeviceCheck() {
  const [rows, setRows] = useState<Row[]>([]);
  const [liveTest, setLiveTest] = useState<"idle" | "running" | "done">("idle");
  const [heard, setHeard] = useState("");
  const [liveNote, setLiveNote] = useState<string | null>(null);

  useEffect(() => {
    const out: Row[] = [];

    /* Speech recognition — the one that decides everything. */
    const Recognition =
      typeof window !== "undefined"
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;

    if (!Recognition) {
      out.push({
        name: "Speech recognition",
        verdict: "fail",
        detail: "Not available in this browser",
        meaning:
          "Speaking practice will fall back to typing. On iPhone, try Safari — third-party browsers on iOS often lack it.",
      });
    } else {
      out.push({
        name: "Speech recognition",
        verdict: "pass",
        detail: "Available",
        meaning: "Your speech can be transcribed. Run the live test below to confirm it really works.",
      });
    }

    /* Microphone access. */
    const hasMedia =
      typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    out.push({
      name: "Microphone",
      verdict: hasMedia ? "pass" : "fail",
      detail: hasMedia ? "Available" : "Not available",
      meaning: hasMedia
        ? "Used for the level meter and to hand the turn over when you talk over the AI."
        : "Needs a secure connection (https). On http, browsers block the microphone entirely.",
    });

    /* Secure context — the usual cause of a missing microphone. */
    const secure = typeof window !== "undefined" && window.isSecureContext;
    out.push({
      name: "Secure connection",
      verdict: secure ? "pass" : "fail",
      detail: secure ? "https or localhost" : "Insecure origin",
      meaning: secure
        ? "Microphone and camera are permitted here."
        : "Browsers refuse microphone and camera access on an insecure origin. This is the first thing to fix.",
    });

    /* Speech synthesis — how the interviewer talks back. */
    const hasTts = typeof window !== "undefined" && "speechSynthesis" in window;
    out.push({
      name: "Speech synthesis",
      verdict: hasTts ? "pass" : "warn",
      detail: hasTts ? "Available" : "Not available",
      meaning: hasTts
        ? "Questions and panel replies can be read aloud."
        : "Everything still works, but nothing will be spoken to you.",
    });

    /* Camera — optional, only for presence tracking. */
    out.push({
      name: "Camera (optional)",
      verdict: hasMedia ? "pass" : "warn",
      detail: hasMedia ? "Available" : "Not available",
      meaning: "Only used if you switch presence tracking on. Practice works fine without it.",
    });

    /* Installability — the PWA question. */
    const standalone =
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true);
    out.push({
      name: "Installed to home screen",
      verdict: standalone ? "pass" : "warn",
      detail: standalone ? "Running as an installed app" : "Running in the browser",
      meaning: standalone
        ? "You are in the installed app."
        : "Optional. Add to Home Screen gives it its own icon and hides the browser bars.",
    });

    setRows(out);
  }, []);

  /**
   * The live test.
   *
   * A feature check only proves the constructor exists. What decides whether
   * hands-free practice works is whether `continuous` mode keeps returning
   * results — on some iOS builds recognition starts, returns one phrase, and
   * silently stops. That is invisible to a capability check and obvious here.
   */
  const runLiveTest = useCallback(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    setHeard("");
    setLiveNote(null);
    setLiveTest("running");

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    let results = 0;
    let ended = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      results++;
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      setHeard(text.trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setLiveNote(
        event.error === "not-allowed"
          ? "Microphone permission was refused. Allow it and run the test again."
          : `Recogniser error: ${event.error}`,
      );
    };

    recognition.onend = () => {
      if (ended) return;
      ended = true;
      setLiveTest("done");
      if (results === 0) {
        setLiveNote(
          (note) =>
            note ??
            "The recogniser started but returned nothing. Either nothing was said, or this browser stops continuous recognition early — which means hands-free practice will not work here.",
        );
      }
    };

    recognition.start();

    // Ten seconds is long enough to prove continuous mode survives past the
    // first phrase, which is the failure this test exists to catch.
    setTimeout(() => {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    }, 10_000);
  }, []);

  const icon = {
    pass: <Check className="size-3.5" style={{ color: "var(--color-positive)" }} />,
    fail: <X className="size-3.5" style={{ color: "var(--color-critical)" }} />,
    warn: <span className="block size-1.5 rounded-full bg-[var(--color-caution)]" />,
    pending: <Loader2 className="size-3.5 animate-spin" />,
  };

  const canSpeak = rows.find((r) => r.name === "Speech recognition")?.verdict === "pass";

  return (
    <>
      <section className="rise mt-14 [animation-delay:80ms]">
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((row) => (
            <li key={row.name} className="grid grid-cols-[20px_1fr] gap-x-4 gap-y-1 py-5">
              <span className="mt-1 grid size-5 place-items-center">{icon[row.verdict]}</span>
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="t-heading">{row.name}</p>
                  <p className="t-micro">{row.detail}</p>
                </div>
                <p className="t-body mt-1.5 text-ink-3">{row.meaning}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {canSpeak && (
        <section className="rise mt-14 [animation-delay:140ms]">
          <Surface material="dense" radius="lg" className="p-7">
            <p className="t-micro mb-4">Live test</p>
            <h2 className="t-heading">Does it keep listening?</h2>
            <p className="t-body mt-2 text-ink-3">
              The check above only proves the recogniser exists. Some browsers start it, return one
              phrase and quietly stop — which breaks hands-free practice without any error. Press
              start and read this sentence aloud, slowly, twice.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button
                variant="primary"
                icon={<Mic className="size-4" />}
                onClick={runLiveTest}
                disabled={liveTest === "running"}
              >
                {liveTest === "running" ? "Listening for 10s…" : "Start the test"}
              </Button>
              {liveTest === "running" && (
                <span className="t-meta text-ink-4">Speak now — keep going until it stops.</span>
              )}
            </div>

            {(heard || liveTest === "done") && (
              <div className="mt-6 border-t border-line pt-5">
                <p className="t-micro mb-2">Heard</p>
                <p className="text-[15px] font-medium leading-relaxed text-ink">
                  {heard || "— nothing —"}
                </p>
                {liveTest === "done" && heard.split(/\s+/).filter(Boolean).length >= 8 && (
                  <p className="t-body mt-4" style={{ color: "var(--color-positive)" }}>
                    Continuous recognition held. Hands-free practice will work on this device.
                  </p>
                )}
              </div>
            )}

            {liveNote && <p className="t-body mt-4 text-ink-2">{liveNote}</p>}
          </Surface>
        </section>
      )}
    </>
  );
}
