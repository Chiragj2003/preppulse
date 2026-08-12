"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeech } from "./use-speech";
import { useTTS } from "./use-tts";

/**
 * Audio flow states — the single source of truth for what the audio
 * subsystem is doing at any moment.
 *
 *   idle  →  listening  →  processing  →  speaking  →  listening
 *              ↑                                          |
 *              └──────────────────────────────────────────┘
 *
 * "idle" is the only state where neither mic nor speaker is active.
 * The flow guarantees mic and TTS are never both active at the same time,
 * which eliminates the acoustic feedback loop.
 */
export type AudioFlowState = "idle" | "listening" | "processing" | "speaking";

export interface AudioFlowOptions {
  /** Session language — forwarded to speech recognition and TTS. */
  language?: "en" | "hinglish" | "hi";
  /**
   * Milliseconds of silence before auto-sending. Higher = more forgiving
   * for users who pause to think. Defaults to 2500ms.
   */
  silenceMs?: number;
  /** If true, auto-start listening when the hook mounts. */
  autoStart?: boolean;
  /** Called when the silence timer fires and the transcript is auto-sent. */
  onAutoSend?: () => void;
}

/**
 * Coordinates speech recognition (mic) and text-to-speech (speaker) so they
 * never overlap. Provides a simple state machine that room components can
 * drive without worrying about the browser audio plumbing.
 *
 * The key invariant: when TTS is speaking, the mic is paused. When the mic
 * is recording, TTS is silent. This eliminates the acoustic feedback loop
 * where the mic would transcribe TTS output and send it back.
 */
export function useAudioFlow(options: AudioFlowOptions = {}) {
  const {
    language,
    silenceMs = 2500,
    autoStart = false,
  } = options;

  const [flowState, setFlowState] = useState<AudioFlowState>("idle");
  const flowStateRef = useRef<AudioFlowState>("idle");

  const speech = useSpeech(language);

  // Use refs for TTS callbacks to keep them stable and avoid re-creating
  // the tts hook. The callbacks reach into speech via ref.
  const speechRef = useRef(speech);
  speechRef.current = speech;

  const handleTTSStart = useCallback(() => {
    speechRef.current.pause();
    flowStateRef.current = "speaking";
    setFlowState("speaking");
  }, []);

  const handleTTSEnd = useCallback(() => {
    if (flowStateRef.current === "speaking") {
      speechRef.current.resume();
      flowStateRef.current = "listening";
      setFlowState("listening");
    }
  }, []);

  const tts = useTTS(language, {
    onPlaybackStart: handleTTSStart,
    onPlaybackEnd: handleTTSEnd,
  });

  // Refs for the auto-send timer
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTranscriptRef = useRef("");
  const onAutoSendRef = useRef(options.onAutoSend);
  onAutoSendRef.current = options.onAutoSend;

  // Track whether we've been started at least once
  const hasStartedRef = useRef(false);

  /**
   * Adaptive silence detection: reset the timer whenever the transcript
   * changes. If it stays the same for `silenceMs`, fire the auto-send.
   */
  useEffect(() => {
    if (flowStateRef.current !== "listening") {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      return;
    }

    const currentTranscript = `${speech.finalText} ${speech.interimText}`.trim();

    // Don't start the timer if there's nothing to send
    if (!currentTranscript) {
      lastTranscriptRef.current = "";
      return;
    }

    // If the transcript changed, reset the timer
    if (currentTranscript !== lastTranscriptRef.current) {
      lastTranscriptRef.current = currentTranscript;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        // Only auto-send if we're still in listening state and have no
        // active interim text (which would mean the user is mid-word)
        if (!speechRef.current.interimText && flowStateRef.current === "listening") {
          onAutoSendRef.current?.();
        }
      }, silenceMs);
    }

    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [flowState, speech.finalText, speech.interimText, silenceMs]);

  /** Start listening — activates the mic and enters the listening state. */
  const startListening = useCallback(() => {
    tts.stop(); // Cancel any in-flight TTS first
    speech.reset();
    speech.start();
    hasStartedRef.current = true;
    flowStateRef.current = "listening";
    setFlowState("listening");
  }, [speech, tts]);

  /** Stop everything — returns to idle. */
  const stopAll = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    tts.stop();
    speech.stop();
    flowStateRef.current = "idle";
    setFlowState("idle");
  }, [speech, tts]);

  /**
   * Transition to processing state. Stops the mic and clears the silence
   * timer. Call this when sending the transcript to the server.
   */
  const startProcessing = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    speech.stop();
    flowStateRef.current = "processing";
    setFlowState("processing");
  }, [speech]);

  /**
   * Speak text through TTS. Pauses the mic automatically (via the TTS
   * callbacks). Queues multiple calls.
   */
  const speakText = useCallback(
    (text: string, clearQueue = false) => {
      tts.speak(text, clearQueue);
    },
    [tts],
  );

  /**
   * Interrupt TTS playback and immediately resume listening. This is how
   * the user "takes the floor back" during a discussion.
   */
  const interrupt = useCallback(() => {
    tts.stop();
    speech.reset();
    speech.start();
    flowStateRef.current = "listening";
    setFlowState("listening");
  }, [speech, tts]);

  /** Get the current transcript text. Combines final and interim text. */
  const transcript = `${speech.finalText} ${speech.interimText}`.trim();

  /** Get only the finalized text (no in-progress words). */
  const finalTranscript = speech.finalText.trim();

  // Auto-start on mount if requested
  useEffect(() => {
    if (autoStart && !hasStartedRef.current) {
      startListening();
    }
  }, [autoStart, startListening]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  return {
    /** Current state of the audio flow machine. */
    flowState,

    /** The live transcript (final + interim text). */
    transcript,

    /** Only the finalized transcript text (no in-progress words). */
    finalTranscript,

    /** Whether speech recognition is currently active. */
    isListening: flowState === "listening" && speech.isRecording,

    /** Whether TTS is currently speaking. */
    isSpeaking: flowState === "speaking" || tts.isSpeaking,

    /** Whether the server is processing. */
    isProcessing: flowState === "processing",

    /** Whether speech recognition is supported in this browser. */
    supported: speech.supported,

    /** Any error from speech recognition. */
    error: speech.error,

    /** The raw speech hook — for typed mode fallback. */
    speech,

    /** The raw TTS hook — for direct control if needed. */
    tts,

    // Controls
    startListening,
    stopAll,
    startProcessing,
    speakText,
    interrupt,
  };
}
