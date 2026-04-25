"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { SuggestionBatch, TranscriptChunk } from "@/types";
import type { RecorderState } from "@/hooks/useAudioRecorder";
import { useSettings } from "@/context/SettingsContext";
import { getRecentTranscript } from "@/lib/defaults";
import { uid } from "@/lib/utils";

interface UseSuggestionsOptions {
  transcriptChunks: TranscriptChunk[];
  isTranscribing: boolean;
  recorderState: RecorderState;
  flushChunk: () => void;
  onError: (message: string) => void;
}

export function useSuggestions({
  transcriptChunks,
  isTranscribing,
  recorderState,
  flushChunk,
  onError,
}: UseSuggestionsOptions) {
  const { settings } = useSettings();
  const [batches, setBatches] = useState<SuggestionBatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimitBackoffUntil, setRateLimitBackoffUntil] = useState(0);

  const pendingRefreshRef = useRef(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rateLimitBackoffUntilRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const latestBatchRef = useRef<SuggestionBatch | undefined>(undefined);

  // Keep latestBatchRef fresh so fetchSuggestions never captures a stale batch
  useEffect(() => { latestBatchRef.current = batches[0]; }, [batches]);

  const fetchSuggestions = useCallback(async () => {
    if (!settings.groqApiKey || transcriptChunks.length === 0) return;
    if (isLoading) return;
    if (Date.now() < rateLimitBackoffUntilRef.current) return;

    const recentText = getRecentTranscript(transcriptChunks, settings.suggestionContextChars);
    if (recentText.trim().length < 20) return;
    const previousSuggestions = latestBatchRef.current
      ? latestBatchRef.current.suggestions.map((s) => `• [${s.kind}] ${s.preview}`).join("\n")
      : "None";
    const prompt = settings.suggestionsPrompt
      .replace("{transcript}", recentText)
      .replace("{previous_suggestions}", previousSuggestions);

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setIsLoading(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({ model: settings.llmModel, prompt }),
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) {
          const match = text.match(/try again in (\d+(?:\.\d+)?)s/i);
          const retryMs = match ? Math.ceil(parseFloat(match[1])) * 1000 : 60_000;
          rateLimitBackoffUntilRef.current = Date.now() + retryMs;
          setRateLimitBackoffUntil(Date.now() + retryMs);
          onError(`Rate limit reached — suggestions paused for ${Math.ceil(retryMs / 1000)}s`);
          return;
        }
        throw new Error(text.slice(0, 200) || `Suggestions failed (${res.status})`);
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (json.suggestions?.length) {
        const batch: SuggestionBatch = {
          id: uid(),
          timestamp: Date.now(),
          suggestions: json.suggestions,
          transcriptSnapshot: recentText,
        };
        setBatches((prev) => {
          const latest = prev[0];
          if (latest && batch.suggestions.every((s, i) => s.preview === latest.suggestions[i]?.preview)) {
            return prev;
          }
          return [batch, ...prev];
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      onError(err instanceof Error ? err.message : "Failed to get suggestions");
    } finally {
      setIsLoading(false);
    }
  }, [settings, transcriptChunks, isLoading, onError]);

  // Always-fresh ref so intervals never capture a stale closure
  const fetchRef = useRef(fetchSuggestions);
  useEffect(() => { fetchRef.current = fetchSuggestions; });

  // Auto-refresh interval while recording
  useEffect(() => {
    if (recorderState === "recording") {
      autoRefreshRef.current = setInterval(
        () => fetchRef.current(),
        (settings.refreshIntervalSec ?? 30) * 1000
      );
    } else {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [recorderState, settings.refreshIntervalSec]);

  // Fire on the first chunk arriving
  const prevChunkCountRef = useRef(0);
  useEffect(() => {
    if (transcriptChunks.length === 1 && prevChunkCountRef.current === 0) {
      fetchRef.current();
    }
    prevChunkCountRef.current = transcriptChunks.length;
  }, [transcriptChunks.length]);

  // Manual refresh: wait for in-progress transcription to finish then fetch
  useEffect(() => {
    if (!isTranscribing && pendingRefreshRef.current && transcriptChunks.length > 0) {
      pendingRefreshRef.current = false;
      fetchRef.current();
    }
  }, [isTranscribing, transcriptChunks.length]);

  const handleRefresh = useCallback(() => {
    if (recorderState === "recording") {
      pendingRefreshRef.current = true;
      flushChunk();
    } else {
      fetchRef.current();
    }
  }, [recorderState, flushChunk]);

  return { batches, isLoading, rateLimitBackoffUntil, handleRefresh };
}
