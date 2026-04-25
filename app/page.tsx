"use client";

import { useState, useCallback, useEffect } from "react";
import type { SessionExport } from "@/types";
import { useSettings } from "@/context/SettingsContext";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useTranscript } from "@/hooks/useTranscript";
import { useSuggestions } from "@/hooks/useSuggestions";
import { useChat } from "@/hooks/useChat";
import TranscriptPanel from "@/components/TranscriptPanel";
import SuggestionsPanel from "@/components/SuggestionsPanel";
import ChatPanel from "@/components/ChatPanel";
import SettingsModal from "@/components/SettingsModal";
import ExportButton from "@/components/ExportButton";
import Toast from "@/components/Toast";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function Home() {
  const { settings } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const onError = useCallback((msg: string) => setErrorMessage(msg), []);

  // ── Theme ──────────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("ls_theme");
    if (saved === "light") setIsDark(false);

    // Open settings modal on first visit (no stored key in sessionStorage)
    try {
      const stored = sessionStorage.getItem("live_suggestions_settings");
      const parsed = stored ? (JSON.parse(stored) as { groqApiKey?: string }) : null;
      if (!parsed?.groqApiKey) setSettingsOpen(true);
    } catch {
      setSettingsOpen(true);
    }
  }, []);
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("ls_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("ls_theme", "light");
    }
  }, [isDark]);

  // ── Audio + transcript ─────────────────────────────────────────────────────
  const { chunks: transcriptChunks, isTranscribing, handleAudioChunk } = useTranscript({ onError });
  const { state: recorderState, start: startRecording, stop: stopRecording, flushChunk } =
    useAudioRecorder({
      chunkIntervalMs: (settings.refreshIntervalSec ?? 30) * 1000,
      onChunk: handleAudioChunk,
      onError,
    });

  // ── Suggestions ────────────────────────────────────────────────────────────
  const { batches: suggestionBatches, isLoading: isFetchingSuggestions, rateLimitBackoffUntil, handleRefresh } =
    useSuggestions({ transcriptChunks, isTranscribing, recorderState, flushChunk, onError });

  // ── Chat ───────────────────────────────────────────────────────────────────
  const { messages: chatMessages, isStreaming, sendMessage: streamChat, expandSuggestion: handleSuggestionClick } =
    useChat({ transcriptChunks, onError, onNeedApiKey: () => setSettingsOpen(true) });

  // ── Export ─────────────────────────────────────────────────────────────────
  const getExportData = useCallback(
    (): SessionExport => ({
      exportedAt: new Date().toISOString(),
      transcript: transcriptChunks,
      suggestionBatches,
      chat: chatMessages.filter((m) => m.id !== "__streaming__"),
    }),
    [transcriptChunks, suggestionBatches, chatMessages]
  );

  const missingKey = !settings.groqApiKey;

  return (
    <div className="flex flex-col min-h-screen md:h-screen md:overflow-hidden">
      {/* ── Error toast ──────────────────────────────────────────────────────── */}
      <Toast message={errorMessage} onDismiss={() => setErrorMessage(null)} />
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
          <span className="font-bold text-sm tracking-tight">Live Suggestions</span>
          <span className="hidden sm:inline text-gray-400 dark:text-gray-500 text-xs">AI Meeting Copilot</span>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton getExportData={getExportData} />
          <button
            onClick={() => setIsDark((d) => !d)}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </button>
        </div>
      </header>

      {/* ── Missing API key banner ──────────────────────────────────────────── */}
      {missingKey && (
        <div className="bg-amber-50 dark:bg-amber-900/60 border-b border-amber-200 dark:border-amber-700 px-6 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <span>⚠</span>
          <span>
            No Groq API key set.{" "}
            <button
              className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-200"
              onClick={() => setSettingsOpen(true)}
            >
              Open Settings
            </button>{" "}
            to add one.
          </span>
        </div>
      )}

      {/* ── Three-column layout ─────────────────────────────────────────────── */}
      <main className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-y-hidden md:overflow-x-auto divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800">
        {/* Transcript */}
        <section className="flex flex-col w-full md:w-[28%] md:min-w-60 px-4 md:px-5 py-4 md:py-5 min-h-90 md:min-h-0 overflow-hidden">
          <TranscriptPanel
            chunks={transcriptChunks}
            isRecording={recorderState === "recording"}
            isTranscribing={isTranscribing}
            onStart={startRecording}
            onStop={stopRecording}
          />
        </section>

        {/* Live Suggestions */}
        <section className="flex flex-col w-full md:w-[34%] md:min-w-70 px-4 md:px-5 py-4 md:py-5 min-h-100 md:min-h-0 overflow-hidden">
          <ErrorBoundary>
            <SuggestionsPanel
              batches={suggestionBatches}
              isLoading={isFetchingSuggestions}
              isRecording={recorderState === "recording"}
              refreshIntervalSec={settings.refreshIntervalSec ?? 30}
              rateLimitBackoffUntil={rateLimitBackoffUntil}
              onRefresh={handleRefresh}
              onSuggestionClick={handleSuggestionClick}
            />
          </ErrorBoundary>
        </section>

        {/* Chat */}
        <section className="flex flex-col flex-1 w-full md:min-w-70 px-4 md:px-5 py-4 md:py-5 min-h-100 md:min-h-0 overflow-hidden">
          <ErrorBoundary>
            <ChatPanel
              messages={chatMessages}
              isStreaming={isStreaming}
              onSendMessage={streamChat}
            />
          </ErrorBoundary>
        </section>
      </main>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} required={missingKey} />
    </div>
  );
}
