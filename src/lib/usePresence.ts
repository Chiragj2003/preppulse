"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  summarisePresence,
  type Expression,
  type PresenceSample,
  type PresenceSummary,
} from "./presence-scoring";

/**
 * Camera presence tracking.
 *
 * Two deliberate choices about cost, because this runs alongside speech
 * recognition, a TTS voice and a canvas visualiser on a laptop that is probably
 * also running a browser with forty tabs:
 *
 * 1. `tinyFaceDetector` rather than the SSD or MTCNN models. It is ~190KB and
 *    designed for exactly this — a face box from a webcam frame, fast, on a
 *    machine with no GPU budget to spare.
 * 2. Four detections a second, not sixty. Facial expression does not change
 *    meaningfully inside 250ms, and a `requestAnimationFrame` loop would spend
 *    fifteen times the CPU to produce the same summary.
 *
 * The library and its weights load only when tracking is switched on — a
 * dynamic import keeps roughly a megabyte of TensorFlow out of the bundle for
 * everyone who never turns the camera on.
 */

/** Detections per second. See the note above. */
const DETECT_INTERVAL_MS = 250;

/** Where the weights live. Copied from the package into public/models. */
const MODEL_URL = "/models";

export type PresenceStatus =
  | "off"
  | "loading"
  | "requesting"
  | "tracking"
  | "denied"
  | "unsupported"
  | "insecure"
  | "error";

export interface LiveFrame {
  present: boolean;
  top: Expression | null;
  expressions: Partial<Record<Expression, number>>;
}

type FaceApi = typeof import("@vladmandic/face-api");

let faceApiPromise: Promise<FaceApi> | null = null;

/**
 * Load the library and both models exactly once per page.
 *
 * Cached in a module-level promise rather than component state, so toggling the
 * camera off and on again — or mounting a second monitor — doesn't re-download
 * half a megabyte of weights.
 */
async function loadFaceApi(): Promise<FaceApi> {
  if (!faceApiPromise) {
    faceApiPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })().catch((error) => {
      // Don't cache a failure — a flaky first load should be retryable.
      faceApiPromise = null;
      throw error;
    });
  }
  return faceApiPromise;
}

export function usePresence() {
  const [status, setStatus] = useState<PresenceStatus>("off");
  const [live, setLive] = useState<LiveFrame>({ present: false, top: null, expressions: {} });
  const [summary, setSummary] = useState<PresenceSummary | null>(null);
  // What actually went wrong, for the one status ("error") that is otherwise
  // a dead end. Without this, a failed model fetch and a camera already in
  // use by another tab are indistinguishable — both just say "unavailable."
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Samples are a ref, not state: at four a second over a ten-minute interview
  // that is 2,400 entries, and re-rendering the room on every one of them would
  // be a self-inflicted performance problem.
  const samplesRef = useRef<PresenceSample[]>([]);
  const recordingRef = useRef(false);
  const startedAtRef = useRef(0);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    recordingRef.current = false;
    setStatus("off");
    setErrorDetail(null);
    setLive({ present: false, top: null, expressions: {} });
  }, []);

  const start = useCallback(async () => {
    // Re-entrant clicks — a slow model load plus an impatient second click on
    // "Turn on" — used to fire a second getUserMedia request on top of the
    // first, leaking a MediaStream that nothing ever stopped. Every non-off,
    // non-terminal status means a start is already in flight or done.
    if (status === "loading" || status === "requesting" || status === "tracking") return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    // The single most common reason a camera silently "doesn't work": the
    // page isn't secure. Browsers refuse getUserMedia outright on http, and
    // the resulting error is often a generic SecurityError that reads exactly
    // like a permission block — checking this directly means the message can
    // say what is actually wrong instead of "camera unavailable."
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatus("insecure");
      return;
    }

    setErrorDetail(null);

    try {
      setStatus("loading");
      const faceapi = await loadFaceApi();

      setStatus("requesting");
      const stream = await navigator.mediaDevices.getUserMedia({
        // A small frame is plenty for a face box and costs far less to process.
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("error");
        setErrorDetail("The camera preview wasn't ready. Try again.");
        return;
      }

      video.srcObject = stream;
      await video.play().catch(() => {
        /* autoplay policies — the stream is still live */
      });

      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
      setStatus("tracking");

      timerRef.current = setInterval(async () => {
        const element = videoRef.current;
        if (!element || element.readyState < 2) return;

        try {
          const detection = await faceapi
            .detectSingleFace(element, options)
            .withFaceExpressions();

          const expressions = (detection?.expressions ?? {}) as Partial<Record<Expression, number>>;
          let top: Expression | null = null;
          let best = 0;
          for (const [label, value] of Object.entries(expressions)) {
            if (typeof value === "number" && value > best) {
              best = value;
              top = label as Expression;
            }
          }

          setLive({ present: Boolean(detection), top, expressions });

          if (recordingRef.current) {
            const box = detection?.detection.box;
            samplesRef.current.push({
              at: Date.now() - startedAtRef.current,
              present: Boolean(detection),
              expressions: detection ? expressions : undefined,
              // Normalised against the video so the numbers mean the same thing
              // whatever resolution the camera negotiated.
              centre: box
                ? {
                    x: (box.x + box.width / 2) / (element.videoWidth || 320),
                    y: (box.y + box.height / 2) / (element.videoHeight || 240),
                  }
                : undefined,
            });
          }
        } catch {
          // A dropped frame is not worth surfacing; the absence maths reads
          // gaps from timestamps precisely so it survives them.
        }
      }, DETECT_INTERVAL_MS);
    } catch (error) {
      const name = (error as { name?: string })?.name;
      const message = error instanceof Error ? error.message : String(error);

      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied");
      } else {
        setStatus("error");
        // Distinguish what actually failed for anyone debugging this later:
        // "NotFoundError" is no camera present, "NotReadableError" is another
        // app or tab holding the device, and anything else is most likely the
        // face-detection model failing to load — three different problems
        // that a bare "unavailable" status collapses into one dead end.
        setErrorDetail(
          name === "NotFoundError"
            ? "No camera was found on this device."
            : name === "NotReadableError"
              ? "The camera is in use by another app or browser tab."
              : `Couldn't start tracking (${name ?? "unknown error"}): ${message}`,
        );
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [status]);

  /** Begin collecting samples. Tracking can be on without recording. */
  const beginRecording = useCallback(() => {
    samplesRef.current = [];
    startedAtRef.current = Date.now();
    recordingRef.current = true;
    setSummary(null);
  }, []);

  const endRecording = useCallback((): PresenceSummary | null => {
    if (!recordingRef.current) return null;
    recordingRef.current = false;
    const result = summarisePresence(samplesRef.current);
    setSummary(result);
    return result;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef,
    status,
    live,
    summary,
    errorDetail,
    isTracking: status === "tracking",
    start,
    stop,
    beginRecording,
    endRecording,
  };
}
