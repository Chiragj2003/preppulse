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
  /**
   * Hands the floor over automatically when the speaker pauses, so the room
   * needs no send button. Off only for text-first surfaces.
   */
  autoSend?: boolean;
  /** How long a pause ends a turn. */
  silenceMs?: number;
}

/**
 * How long a pause ends a turn.
 *
 * A judgement call: too short and it cuts people off mid-thought; too long and
 * the room feels dead. 1.1s is roughly the gap a person leaves before someone
 * else speaks, which is the behaviour being imitated. Interviews override this
 * upward — thinking mid-answer is normal there and must not end your turn.
 */
const DEFAULT_SILENCE_MS = 1100;
/** Below this, the "turn" is a cough or a stray noise, not an answer. */
const MIN_WORDS_TO_SEND = 2;
/** Mic energy that counts as the user talking over the AI. */
const BARGE_IN_LEVEL = 0.08;

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
    autoSend = true,
    silenceMs = DEFAULT_SILENCE_MS,
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

  // One-shot guard so a turn is handed over once, not once per render.
  const sendingRef = useRef<boolean>(false);

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

        // The one thing mic energy is actually good for: the user talking over
        // the AI takes the floor back instantly. End-of-turn is decided from
        // the transcript instead — see the idle effect below.
        if (statusRef.current === "speaking" && avg > BARGE_IN_LEVEL) {
          ttsRef.current.stop();
          interrupt();
        }

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      // Not fatal. The level meter goes flat and barge-in stops working, but
      // the recogniser still runs and turns still hand over on a pause — so
      // this must not raise an error the room treats as a dead session.
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

  /**
   * Hands the floor back to the user.
   *
   * Every path out of "processing" must call this. If a turn produces no
   * reply, or the request fails, or speech synthesis is unavailable, the
   * session would otherwise sit in "processing" forever with a live mic and
   * no way forward — which is exactly the dead end this had.
   */
  const resumeListening = useCallback(() => {
    speechRef.current.reset();
    speechRef.current.resume();
    sendingRef.current = false;
    setStatus("listening");
  }, []);

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

  /**
   * End of turn, detected from the transcript rather than the microphone.
   *
   * The obvious implementation watches mic energy and fires after N ms below a
   * threshold. It was the implementation here, and it is wrong twice over: in
   * a room with any background noise the level never drops far enough, so the
   * turn never ends; and a mid-sentence breath does drop below it, so the turn
   * ends early. Both failures land on the user as "the app ignored me".
   *
   * The recogniser already answers the real question — "have any new words
   * arrived?" — and it answers it after its own noise handling. Every new word
   * re-runs this effect and restarts the clock; when the words stop, the
   * timeout survives and the floor changes hands. No microphone permission
   * beyond what the recogniser already holds, and noise immunity for free.
   */
  useEffect(() => {
    if (!autoSend || status !== "listening" || sendingRef.current) return;

    const text = `${speech.finalText} ${speech.interimText}`.trim();
    // A cough or a door closing shouldn't take the floor.
    if (text.split(/\s+/).filter(Boolean).length < MIN_WORDS_TO_SEND) return;

    const timer = setTimeout(() => {
      if (statusRef.current !== "listening" || sendingRef.current) return;
      sendingRef.current = true;
      sendTurn(text);
    }, silenceMs);

    return () => clearTimeout(timer);
  }, [autoSend, status, speech.finalText, speech.interimText, silenceMs, sendTurn]);

  // Clear the one-shot guard whenever the floor comes back to the user, so the
  // next utterance can fire. Without this, auto-send works exactly once.
  useEffect(() => {
    if (status === "listening") sendingRef.current = false;
  }, [status]);

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
    /**
     * Whether pausing will actually hand the turn over. The room uses this to
     * decide whether to offer a manual send — an escape hatch that appears
     * only when the hands-free path genuinely cannot work, rather than a
     * button everyone has to find and press.
     */
    canAutoSend: autoSend && speech.supported && !speech.error,
    startSession,
    stopSession,
    interrupt,
    sendTurn,
    speakResponse,
    resumeListening,
    speech,
    tts,
  };
}
