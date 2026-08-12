"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeech } from "./use-speech";
import { useTTS } from "./use-tts";

export type VoiceSessionMode = "group_discussion" | "debate" | "interview" | "conversation" | "scenario";

export type VoiceSessionStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "interrupted"
  | "error";

export interface VoiceSessionOptions {
  sessionId: string;
  mode: VoiceSessionMode;
  persona?: string;
  topic?: string;
  stance?: "for" | "against";
  stage?: string;
  language?: "en" | "hinglish" | "hi";
  autoSave?: boolean;
  onTurnComplete?: (speaker: string | null, text: string) => void;
  onInterrupted?: () => void;
}

export function useVoiceSession(options: VoiceSessionOptions) {
  const {
    sessionId,
    mode,
    persona,
    topic,
    stance,
    stage,
    language = "en",
    autoSave = true,
    onTurnComplete,
    onInterrupted,
  } = options;

  const [status, setStatus] = useState<VoiceSessionStatus>("idle");
  const statusRef = useRef<VoiceSessionStatus>("idle");
  statusRef.current = status;

  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio nodes for VAD (Voice Activity Detection)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Stable callbacks for speech and TTS
  const speech = useSpeech(language);
  const speechRef = useRef(speech);
  speechRef.current = speech;

  const onTurnCompleteRef = useRef(onTurnComplete);
  onTurnCompleteRef.current = onTurnComplete;
  const onInterruptedRef = useRef(onInterrupted);
  onInterruptedRef.current = onInterrupted;

  // Interrupt helper
  const interrupt = useCallback(() => {
    setStatus("interrupted");
    speechRef.current.resume();
    onInterruptedRef.current?.();
  }, []);

  const handleTTSStart = useCallback(() => {
    speechRef.current.pause();
    setStatus("speaking");
  }, []);

  const handleTTSEnd = useCallback(() => {
    if (statusRef.current === "speaking" || statusRef.current === "interrupted") {
      speechRef.current.resume();
      setStatus("listening");
    }
  }, []);

  const tts = useTTS(language, {
    onPlaybackStart: handleTTSStart,
    onPlaybackEnd: handleTTSEnd,
  });

  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  // Persist transcript turn to API
  const saveTurnToDb = useCallback(
    async (speaker: string | null, content: string, role = "candidate") => {
      if (!autoSave || !content.trim()) return;
      try {
        await fetch("/api/transcripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            speaker,
            content: content.trim(),
            role,
            stage,
          }),
        });
      } catch (err) {
        console.warn("[voiceSession] failed to auto-save turn to db", err);
      }
    },
    [autoSave, sessionId, stage],
  );

  // VAD Loop: Sample mic audio energy in real-time
  const startVAD = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        const usableBins = Math.floor(dataArray.length * 0.6);
        for (let i = 0; i < usableBins; i++) {
          sum += dataArray[i];
        }
        const avg = sum / (usableBins * 255);
        setAudioLevel(avg);

        // VAD INSTANT CUTOFF: If AI is speaking and user starts talking loudly (> 0.08 energy)
        if (statusRef.current === "speaking" && avg > 0.08) {
          console.log("[voiceSession] VAD trigger: User interrupted AI speech");
          ttsRef.current.stop();
          interrupt();
        }

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.warn("[voiceSession] VAD audio stream error", err);
    }
  }, [interrupt]);

  const stopVAD = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Initialize Voice Session
  const startSession = useCallback(async () => {
    try {
      setStatus("connecting");
      setErrorMessage(null);

      // Initialize session configuration from backend
      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          mode,
          persona,
          topic,
          stance,
          stage,
          language,
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to start voice session");
      }

      await startVAD();
      speechRef.current.reset();
      speechRef.current.start();
      setStatus("listening");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error starting session";
      setErrorMessage(msg);
      setStatus("error");
    }
  }, [sessionId, mode, persona, topic, stance, stage, language, startVAD]);

  // Stop Session
  const stopSession = useCallback(() => {
    stopVAD();
    ttsRef.current.stop();
    speechRef.current.stop();
    setStatus("idle");
  }, [stopVAD]);

  // Send completed turn
  const sendTurn = useCallback(
    (content: string, speaker: string | null = null, role = "candidate") => {
      if (!content.trim()) return;
      speechRef.current.reset();
      setStatus("processing");
      void saveTurnToDb(speaker, content, role);
      onTurnCompleteRef.current?.(speaker, content);
    },
    [saveTurnToDb],
  );

  // Play AI response voice
  const speakResponse = useCallback(
    (text: string, speakerId = "ai") => {
      if (!text.trim()) return;
      ttsRef.current.speak(text, true);
      void saveTurnToDb(speakerId, text, "panel");
    },
    [saveTurnToDb],
  );

  useEffect(() => {
    return () => {
      stopVAD();
    };
  }, [stopVAD]);

  return {
    status,
    audioLevel,
    errorMessage,
    transcript: `${speech.finalText} ${speech.interimText}`.trim(),
    finalTranscript: speech.finalText.trim(),
    interimTranscript: speech.interimText.trim(),
    isMicActive: speech.isRecording && !speech.isPaused,
    isSpeaking: tts.isSpeaking || status === "speaking",
    isSupported: speech.supported,
    startSession,
    stopSession,
    interrupt,
    sendTurn,
    speakResponse,
    speech,
    tts,
  };
}
