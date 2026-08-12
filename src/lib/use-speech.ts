"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechLanguage = "en" | "hinglish" | "hi";

export function useSpeech(language?: SpeechLanguage) {
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantsToRunRef = useRef(false);

  // Refs for tracking state inside the interval heartbeat
  const isPausedRef = useRef(false);
  const isRecordingRef = useRef(false);
  const lastResultTimestampRef = useRef(Date.now());

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      setError("This browser can't transcribe speech. Type your answers instead.");
      return;
    }

    const recognition = new Ctor();

    // Map language parameter to BCP-47
    let langCode = "en-IN";
    if (language === "en") langCode = "en-US";
    else if (language === "hi") langCode = "hi-IN";
    else if (language === "hinglish") langCode = "en-IN";

    recognition.lang = langCode;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      lastResultTimestampRef.current = Date.now();
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

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantsToRunRef.current = false;
        setError("Microphone access was blocked. Allow it, or type your answer instead.");
      } else if (event.error === "audio-capture") {
        wantsToRunRef.current = false;
        setError("No microphone found. Type your answer instead.");
      } else if (event.error === "network") {
        setError("Speech recognition lost its connection. Check your internet.");
      } else if (event.error === "no-speech") {
        // Let auto-restart handle this without setting a user-facing error
      }
    };

    recognition.onstart = () => {
      setIsRecording(true);
      lastResultTimestampRef.current = Date.now();
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (wantsToRunRef.current && !isPausedRef.current) {
        try {
          recognition.start();
        } catch {
          /* already starting */
        }
      }
    };

    recognitionRef.current = recognition;

    // Heartbeat check every 10 seconds to recover from Chrome's silent death
    const heartbeat = setInterval(() => {
      if (wantsToRunRef.current && isRecordingRef.current && !isPausedRef.current) {
        const now = Date.now();
        if (now - lastResultTimestampRef.current > 10000) {
          try {
            // Calling stop() will trigger onend, which will subsequently call start()
            // because wantsToRunRef is still true.
            recognition.stop();
          } catch {
            // ignore errors if it fails to stop
          }
        }
      }
    }, 10000);

    return () => {
      clearInterval(heartbeat);
      wantsToRunRef.current = false;
      // Detach all event handlers fully to prevent leaks
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onstart = null;
      recognition.onend = null;
      recognition.abort();
    };
  }, [language]);

  const start = useCallback(() => {
    if (!recognitionRef.current || wantsToRunRef.current) return;
    wantsToRunRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);
    setError(null);
    lastResultTimestampRef.current = Date.now();
    try {
      recognitionRef.current.start();
    } catch {
      /* already running */
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    wantsToRunRef.current = false;
    isPausedRef.current = false;
    setIsPaused(false);
    setInterimText(""); // Clear interim text to avoid stale half-words
    recognitionRef.current.stop();
  }, []);

  const pause = useCallback(() => {
    if (!recognitionRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    recognitionRef.current.stop(); // Stop engine but keep intent to run active
  }, []);

  const resume = useCallback(() => {
    if (!recognitionRef.current) return;
    isPausedRef.current = false;
    setIsPaused(false);
    lastResultTimestampRef.current = Date.now();
    try {
      recognitionRef.current.start();
    } catch {
      /* already running */
    }
  }, []);

  const reset = useCallback(() => {
    setFinalText("");
    setInterimText("");
    setTyped("");
  }, []);

  return {
    finalText,
    interimText,
    typed,
    setTyped,
    error,
    supported,
    isRecording,
    isPaused,
    start,
    stop,
    pause,
    resume,
    reset,
  };
}
