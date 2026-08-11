"use client";

import { useCallback, useRef } from "react";

export function useTTS() {
  const queueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);

  const processQueue = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (isSpeakingRef.current || queueRef.current.length === 0) return;

    const text = queueRef.current.shift();
    if (!text) return;

    isSpeakingRef.current = true;
    const utterance = new SpeechSynthesisUtterance(text);
    
    const voices = window.speechSynthesis.getVoices();
    const voice =
      voices.find((v) => v.name.includes("Google UK English Female")) ||
      voices.find((v) => v.name.includes("Google US English")) ||
      voices.find((v) => v.lang.startsWith("en-")) ||
      voices[0];

    if (voice) utterance.voice = voice;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      isSpeakingRef.current = false;
      processQueue();
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      processQueue();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback(
    (text: string, clearQueue = false) => {
      if (clearQueue) {
        queueRef.current = [];
        if (typeof window !== "undefined") window.speechSynthesis.cancel();
        isSpeakingRef.current = false;
      }
      queueRef.current.push(text);
      processQueue();
    },
    [processQueue],
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    isSpeakingRef.current = false;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return { speak, stop };
}
