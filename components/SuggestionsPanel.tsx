"use client";

import { useState, useEffect } from "react";
import type { SuggestionBatch, Suggestion, SuggestionKind } from "@/types";

interface SuggestionsPanelProps {
  batches: SuggestionBatch[];
  isLoading: boolean;
  isRecording: boolean;
  refreshIntervalSec: number;
  onRefresh: () => void;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

const KIND_META: Record<SuggestionKind, { label: string; color: string; icon: string }> = {
  question:      { label: "Question to Ask", color: "bg-blue-50 dark:bg-blue-900/60 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300",     icon: "?" },
  talking_point: { label: "Talking Point",   color: "bg-purple-50 dark:bg-purple-900/60 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300", icon: "→" },
  answer:        { label: "Answer",           color: "bg-green-50 dark:bg-green-900/60 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300",   icon: "✓" },
  fact_check:    { label: "Fact Check",       color: "bg-yellow-50 dark:bg-yellow-900/60 border-yellow-200 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300", icon: "!" },
  clarification: { label: "Clarification",   color: "bg-gray-100 dark:bg-gray-800/80 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300",        icon: "ⓘ" },
};

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SuggestionCard({
  suggestion,
  onClick,
}: {
  suggestion: Suggestion;
  onClick: () => void;
}) {
  const meta = KIND_META[suggestion.kind] ?? KIND_META.clarification;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-4 py-3 transition-all hover:brightness-110 active:scale-[0.98] ${meta.color}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-bold text-xs opacity-80">{meta.icon}</span>
        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
          {meta.label}
        </span>
      </div>
      <p className="text-sm leading-snug font-medium">{suggestion.preview}</p>
    </button>
  );
}

export default function SuggestionsPanel({
  batches,
  isLoading,
  isRecording,
  refreshIntervalSec,
  onRefresh,
  onSuggestionClick,
}: SuggestionsPanelProps) {
  const [countdown, setCountdown] = useState(refreshIntervalSec);

  // Reset countdown when a new batch arrives or interval changes
  useEffect(() => {
    setCountdown(refreshIntervalSec);
  }, [batches.length, refreshIntervalSec]);

  // Reset countdown when loading starts (manual refresh)
  useEffect(() => {
    if (isLoading) setCountdown(refreshIntervalSec);
  }, [isLoading, refreshIntervalSec]);

  // Tick down once per second while recording
  useEffect(() => {
    if (!isRecording) { setCountdown(refreshIntervalSec); return; }
    const id = setInterval(() => {
      setCountdown((c) => (c <= 1 ? refreshIntervalSec : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [isRecording, refreshIntervalSec]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Live Suggestions
        </h2>
        <div className="flex items-center gap-2">
          {isRecording && !isLoading && (
            <span className="text-[11px] font-mono tabular-nums text-gray-400 dark:text-gray-500">
              auto refreshing in {countdown}s
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50"
          >
          <svg
            className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {isLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && batches.length === 0 && (
        <div className="space-y-3 mt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && batches.length === 0 && (
        <p className="text-gray-400 dark:text-gray-600 text-sm mt-8 text-center">
          Suggestions will appear once the transcript has content.
        </p>
      )}

      {/* Batches — newest first */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1">
        {batches.map((batch, batchIndex) => (
          <div key={batch.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{formatTime(batch.timestamp)}</span>
              {batchIndex === 0 && (
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300 rounded px-1.5 py-0.5 font-semibold">
                  Latest
                </span>
              )}
            </div>
            <div className="space-y-2">
              {batch.suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onClick={() => onSuggestionClick(s)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
