"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speech recogniser that transcribes audio into text.
 * Requires browser support for SpeechRecognition.
 */
export function useSpeech() {
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantsToRunRef = useRef(false);

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      setError("This browser can't transcribe speech. Type your answers instead.");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      let settled = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) settled += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (settled) setFinalText((prev) => `${prev} ${settled}`.trim());
      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantsToRunRef.current = false;
        setError("Microphone access was blocked. Allow it, or type your answer instead.");
      } else if (event.error === "audio-capture") {
        wantsToRunRef.current = false;
        setError("No microphone found. Type your answer instead.");
      }
    };

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => {
      setIsRecording(false);
      if (wantsToRunRef.current) {
        try {
          recognition.start();
        } catch {
          /* already starting */
        }
      }
    };

    recognitionRef.current = recognition;
    return () => {
      wantsToRunRef.current = false;
      recognition.onend = null;
      recognition.abort();
    };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current || wantsToRunRef.current) return;
    wantsToRunRef.current = true;
    try {
      recognitionRef.current.start();
    } catch {
      /* already running */
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    wantsToRunRef.current = false;
    recognitionRef.current.stop();
  }, []);

  const reset = useCallback(() => {
    setFinalText("");
    setInterimText("");
    setTyped("");
  }, []);

  return { finalText, interimText, typed, setTyped, error, supported, isRecording, start, stop, reset };
}
