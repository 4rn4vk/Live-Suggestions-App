"use client";

import { useRef, useState, useCallback } from "react";

export type RecorderState = "idle" | "recording" | "processing";

interface UseAudioRecorderOptions {
  chunkIntervalMs: number; // how often to emit a recorded chunk (e.g. 30_000)
  onChunk: (blob: Blob) => void; // called with each audio chunk
  onError?: (message: string) => void; // called when mic access is denied or fails
}

export function useAudioRecorder({ chunkIntervalMs, onChunk, onError }: UseAudioRecorderOptions) {
  const [state, setState] = useState<RecorderState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  // Keep onChunk in a ref so the cycle callback never goes stale
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  /**
   * Create a fresh MediaRecorder on the existing stream and start it.
   * Each recorder produces a self-contained WebM file (header included),
   * which is required for Whisper to accept the blob.
   */
  const spawnRecorder = useCallback((stream: MediaStream, mimeType: string): MediaRecorder => {
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        onChunkRef.current(new Blob([e.data], { type: mimeType }));
      }
    };
    recorder.start();
    return recorder;
  }, []);

  /**
   * Cycle: stop the current recorder (fires ondataavailable with a complete,
   * valid blob) and immediately start a fresh one on the same stream.
   */
  const cycleRecorder = useCallback(() => {
    if (!streamRef.current) return;
    const mimeType = mimeTypeRef.current;
    const old = mediaRecorderRef.current;

    // Start new recorder first to minimise the gap
    mediaRecorderRef.current = spawnRecorder(streamRef.current, mimeType);

    // Stop old recorder — triggers ondataavailable asynchronously
    if (old && old.state !== "inactive") old.stop();
  }, [spawnRecorder]);

  const flushChunk = useCallback(() => {
    cycleRecorder();
  }, [cycleRecorder]);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";
      mimeTypeRef.current = mimeType;

      mediaRecorderRef.current = spawnRecorder(stream, mimeType);
      setState("recording");

      intervalRef.current = setInterval(cycleRecorder, chunkIntervalMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      onError?.("Microphone access denied: " + msg + ". Please allow microphone permission and try again.");
      setState("idle");
    }
  }, [state, chunkIntervalMs, spawnRecorder, cycleRecorder]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop(); // fires final ondataavailable
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setState("idle");
  }, []);

  return { state, start, stop, flushChunk };
}
