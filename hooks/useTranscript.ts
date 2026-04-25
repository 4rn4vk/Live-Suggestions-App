"use client";

import { useState, useCallback } from "react";
import type { TranscriptChunk } from "@/types";
import { useSettings } from "@/context/SettingsContext";
import { uid } from "@/lib/utils";

interface UseTranscriptOptions {
  onError: (message: string) => void;
}

export function useTranscript({ onError }: UseTranscriptOptions) {
  const { settings } = useSettings();
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const handleAudioChunk = useCallback(
    async (blob: Blob) => {
      if (!settings.groqApiKey || blob.size < 15000) return;

      setIsTranscribing(true);
      try {
        const fd = new FormData();
        fd.append("audio", blob, "audio.webm");

        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text.slice(0, 200) || `Transcription failed (${res.status})`);
        }
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        if (json.text?.trim()) {
          setChunks((prev) => [
            ...prev,
            { id: uid(), text: json.text.trim(), timestamp: Date.now() },
          ]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // Silently skip Whisper's "too short" rejection — happens on near-empty chunks
        if (!msg.toLowerCase().includes("too short")) {
          onError(msg || "Transcription failed");
        }
      } finally {
        setIsTranscribing(false);
      }
    },
    [settings.groqApiKey, onError]
  );

  return { chunks, isTranscribing, handleAudioChunk };
}
