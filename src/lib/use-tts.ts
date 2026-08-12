"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface TTSCallbacks {
  /** Called when TTS begins speaking (first utterance starts). */
  onPlaybackStart?: () => void;
  /** Called when TTS finishes all queued text (last utterance ends). */
  onPlaybackEnd?: () => void;
}

/**
 * Text-to-speech with a queue, voice selection, and coordination hooks.
 *
 * Fixes for known Chromium issues:
 * - Holds active utterances in a ref to prevent GC mid-speech.
 * - Listens for `voiceschanged` to handle async voice loading.
 * - Chunks long text into sentences to avoid the 15-second timeout.
 * - Exposes reactive `isSpeaking` for UI and mic coordination.
 */
export function useTTS(language?: string, callbacks?: TTSCallbacks) {
  const queueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Hold the active utterance in a ref so Chromium can't garbage-collect it.
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Cache voices after they load — getVoices() returns [] on first call in Chrome.
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Stable callback refs to avoid stale closures
  const onPlaybackStartRef = useRef(callbacks?.onPlaybackStart);
  const onPlaybackEndRef = useRef(callbacks?.onPlaybackEnd);
  onPlaybackStartRef.current = callbacks?.onPlaybackStart;
  onPlaybackEndRef.current = callbacks?.onPlaybackEnd;

  // Load voices: Chrome fires `voiceschanged` asynchronously
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };

    // Try immediately (works in Firefox)
    loadVoices();

    // Chrome/Edge: voices load async
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  // Cleanup on unmount — cancel any active speech
  useEffect(() => {
    return () => {
      queueRef.current = [];
      isSpeakingRef.current = false;
      activeUtteranceRef.current = null;
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const pickVoice = useCallback(() => {
    const voices = voicesRef.current;
    if (voices.length === 0) return undefined;

    const isHindi = language === "hi" || language === "hinglish";

    if (isHindi) {
      const hindi =
        voices.find((v) => v.name.includes("Swara")) ||
        voices.find((v) => v.name.includes("Madhur")) ||
        voices.find((v) => v.name.includes("हिन्दी")) ||
        voices.find((v) => v.lang.startsWith("hi-")) ||
        voices.find((v) => v.lang.startsWith("en-IN"));
      if (hindi) return hindi;
    }

    return (
      voices.find((v) => v.name.includes("Microsoft Aria Online (Natural)")) ||
      voices.find((v) => v.name.includes("Microsoft Jenny Online (Natural)")) ||
      voices.find((v) => v.name.includes("Google UK English Female")) ||
      voices.find((v) => v.name.includes("Google US English")) ||
      voices.find((v) => v.lang.startsWith("en-")) ||
      voices[0]
    );
  }, [language]);

  const processQueue = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (isSpeakingRef.current || queueRef.current.length === 0) {
      // If queue is empty and nothing is speaking, signal playback end
      if (!isSpeakingRef.current && queueRef.current.length === 0) {
        setIsSpeaking(false);
        onPlaybackEndRef.current?.();
      }
      return;
    }

    const text = queueRef.current.shift();
    if (!text) return;

    // Signal playback start on the first utterance
    if (!isSpeakingRef.current) {
      setIsSpeaking(true);
      onPlaybackStartRef.current?.();
    }

    isSpeakingRef.current = true;
    const utterance = new SpeechSynthesisUtterance(text);

    // Pin the utterance to prevent Chromium GC
    activeUtteranceRef.current = utterance;

    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      isSpeakingRef.current = false;
      activeUtteranceRef.current = null;
      processQueue();
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      activeUtteranceRef.current = null;
      processQueue();
    };

    window.speechSynthesis.speak(utterance);
  }, [pickVoice]);

  /**
   * Split text at sentence boundaries to avoid Chrome's ~15 second
   * per-utterance timeout. Chunks are ~200 chars max.
   */
  const chunkText = useCallback((text: string): string[] => {
    const MAX_CHUNK = 200;
    if (text.length <= MAX_CHUNK) return [text];

    const chunks: string[] = [];
    // Split on sentence-ending punctuation followed by a space or end
    const sentences = text.split(/(?<=[.!?])\s+/);
    let current = "";

    for (const sentence of sentences) {
      if (current.length + sentence.length + 1 > MAX_CHUNK && current) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    return chunks;
  }, []);

  const speak = useCallback(
    (text: string, clearQueue = false) => {
      if (clearQueue) {
        queueRef.current = [];
        isSpeakingRef.current = false;
        activeUtteranceRef.current = null;
        if (typeof window !== "undefined") window.speechSynthesis.cancel();
      }
      // Chunk the text and push each chunk to the queue
      const chunks = chunkText(text);
      queueRef.current.push(...chunks);
      processQueue();
    },
    [processQueue, chunkText],
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    isSpeakingRef.current = false;
    activeUtteranceRef.current = null;
    setIsSpeaking(false);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    onPlaybackEndRef.current?.();
  }, []);

  return { speak, stop, isSpeaking };
}
