"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  TranscriptChunk,
  SuggestionBatch,
  Suggestion,
  ChatMessage,
  SessionExport,
} from "@/types";
import { useSettings } from "@/context/SettingsContext";
import { getRecentTranscript } from "@/lib/defaults";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import TranscriptPanel from "@/components/TranscriptPanel";
import SuggestionsPanel from "@/components/SuggestionsPanel";
import ChatPanel from "@/components/ChatPanel";
import SettingsModal from "@/components/SettingsModal";
import ExportButton from "@/components/ExportButton";
import Toast from "@/components/Toast";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Home() {
  const { settings } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(!settings.groqApiKey);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Theme ──────────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("ls_theme");
    if (saved === "light") setIsDark(false);
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

  // ── Transcript ─────────────────────────────────────────────────────────────
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const handleAudioChunk = useCallback(
    async (blob: Blob) => {
      if (!settings.groqApiKey || blob.size < 15000) return; // skip blobs that are just container overhead

      setIsTranscribing(true);
      try {
        const fd = new FormData();
        fd.append("apiKey", settings.groqApiKey);
        fd.append("audio", blob, "audio.webm");

        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text.slice(0, 200) || `Transcription failed (${res.status})`);
        }
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        if (json.text?.trim()) {
          setTranscriptChunks((prev) => [
            ...prev,
            { id: uid(), text: json.text.trim(), timestamp: Date.now() },
          ]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // Silently skip Whisper's "too short" rejection — happens on near-empty chunks
        if (!msg.toLowerCase().includes("too short")) {
          setErrorMessage(msg || "Transcription failed");
        }
      } finally {
        setIsTranscribing(false);
      }
    },
    [settings.groqApiKey]
  );

  const { state: recorderState, start: startRecording, stop: stopRecording, flushChunk } =
    useAudioRecorder({
      chunkIntervalMs: (settings.refreshIntervalSec ?? 30) * 1000,
      onChunk: handleAudioChunk,
    });

  // ── Live Suggestions ───────────────────────────────────────────────────────
  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  // Set to true after a manual flush; cleared once transcription completes
  const pendingRefreshRef = useRef(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!settings.groqApiKey || transcriptChunks.length === 0) return;
    if (isFetchingSuggestions) return;

    const recentText = getRecentTranscript(transcriptChunks, settings.suggestionContextChars);
    const prompt = settings.suggestionsPrompt.replace("{transcript}", recentText);

    setIsFetchingSuggestions(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.groqApiKey,
          model: settings.llmModel,
          prompt,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
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
        setSuggestionBatches((prev) => [batch, ...prev]);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to get suggestions");
    } finally {
      setIsFetchingSuggestions(false);
    }
  }, [settings, transcriptChunks, isFetchingSuggestions]);

  // Always-fresh ref so intervals and effects never capture stale closures
  const fetchSuggestionsRef = useRef(fetchSuggestions);
  useEffect(() => { fetchSuggestionsRef.current = fetchSuggestions; });

  // Auto-refresh every N seconds while recording
  useEffect(() => {
    if (recorderState === "recording") {
      autoRefreshRef.current = setInterval(
        () => fetchSuggestionsRef.current(),
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

  // Spec: trigger the very first suggestion batch as soon as the first chunk arrives
  const prevChunkCountRef = useRef(0);
  useEffect(() => {
    if (transcriptChunks.length === 1 && prevChunkCountRef.current === 0) {
      fetchSuggestionsRef.current();
    }
    prevChunkCountRef.current = transcriptChunks.length;
  }, [transcriptChunks.length]);

  // Spec: manual refresh flushes audio first, then fetches suggestions once transcription finishes
  useEffect(() => {
    if (!isTranscribing && pendingRefreshRef.current && transcriptChunks.length > 0) {
      pendingRefreshRef.current = false;
      fetchSuggestionsRef.current();
    }
  }, [isTranscribing, transcriptChunks.length]);

  const handleRefresh = useCallback(() => {
    if (recorderState === "recording") {
      // Flush buffered audio → triggers transcription → effect above fires suggestions
      pendingRefreshRef.current = true;
      flushChunk();
    } else {
      fetchSuggestionsRef.current();
    }
  }, [recorderState, flushChunk]);

  // ── Chat ───────────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const appendAssistantToken = useCallback((token: string) => {
    setChatMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.id === "__streaming__") {
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + token },
        ];
      }
      return prev;
    });
  }, []);

  const streamChat = useCallback(
    async (userText: string) => {
      if (!settings.groqApiKey || isStreaming) return;

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: userText,
        timestamp: Date.now(),
      };

      const streamingPlaceholder: ChatMessage = {
        id: "__streaming__",
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      setChatMessages((prev) => [...prev, userMsg, streamingPlaceholder]);
      setIsStreaming(true);

      try {
        const recentTranscript = getRecentTranscript(
          transcriptChunks,
          settings.expandedAnswerContextChars
        );

        // Attach transcript context to the user message sent to the model
        const contextualUserContent = `[Transcript context]\n${recentTranscript}\n\n[User question]\n${userText}`;

        const history = chatMessages
          .filter((m) => m.id !== "__streaming__")
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: settings.groqApiKey,
            model: settings.llmModel,
            systemPrompt: settings.chatSystemPrompt,
            messages: [...history, { role: "user", content: contextualUserContent }],
          }),
        });

        if (!res.ok || !res.body) throw new Error(`Chat request failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) appendAssistantToken(decoder.decode(value, { stream: !d }));
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Chat failed");
        appendAssistantToken("\n\n[Error: could not get a response]");
      } finally {
        // Finalise the streaming message (fix its id and timestamp)
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === "__streaming__" ? { ...m, id: uid(), timestamp: Date.now() } : m
          )
        );
        setIsStreaming(false);
      }
    },
    [settings, isStreaming, transcriptChunks, chatMessages, appendAssistantToken]
  );

  // Clicking a suggestion: get expanded detail then add to chat
  const handleSuggestionClick = useCallback(
    async (suggestion: Suggestion) => {
      if (!settings.groqApiKey) {
        setSettingsOpen(true);
        return;
      }

      const recentTranscript = getRecentTranscript(
        transcriptChunks,
        settings.expandedAnswerContextChars
      );

      const prompt = settings.expandedAnswerPrompt
        .replace("{kind}", suggestion.kind)
        .replace("{preview}", suggestion.preview)
        .replace("{transcript}", recentTranscript);

      // Show the suggestion as the user turn
      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: `[${suggestion.kind.replace(/_/g, " ")}] ${suggestion.preview}`,
        timestamp: Date.now(),
      };

      const streamingPlaceholder: ChatMessage = {
        id: "__streaming__",
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      setChatMessages((prev) => [...prev, userMsg, streamingPlaceholder]);
      setIsStreaming(true);

      try {
        const res = await fetch("/api/expand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: settings.groqApiKey,
            model: settings.llmModel,
            prompt,
          }),
        });

        if (!res.ok || !res.body) throw new Error(`Expand request failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) appendAssistantToken(decoder.decode(value, { stream: !d }));
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Could not expand suggestion");
        appendAssistantToken("\n\n[Error: could not expand suggestion]");
      } finally {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === "__streaming__" ? { ...m, id: uid(), timestamp: Date.now() } : m
          )
        );
        setIsStreaming(false);
      }
    },
    [settings, transcriptChunks, appendAssistantToken]
  );

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
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Error toast ──────────────────────────────────────────────────────── */}
      <Toast message={errorMessage} onDismiss={() => setErrorMessage(null)} />
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
          <span className="font-bold text-sm tracking-tight">Live Suggestions</span>
          <span className="text-gray-400 dark:text-gray-500 text-xs">AI Meeting Copilot</span>
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
      <main className="flex flex-1 overflow-hidden divide-x divide-gray-200 dark:divide-gray-800">
        {/* Transcript */}
        <section className="flex flex-col w-[28%] min-w-60 px-5 py-5 overflow-hidden">
          <TranscriptPanel
            chunks={transcriptChunks}
            isRecording={recorderState === "recording"}
            isTranscribing={isTranscribing}
            onStart={startRecording}
            onStop={stopRecording}
          />
        </section>

        {/* Live Suggestions */}
        <section className="flex flex-col w-[34%] min-w-70 px-5 py-5 overflow-hidden">
          <SuggestionsPanel
            batches={suggestionBatches}
            isLoading={isFetchingSuggestions}
            isRecording={recorderState === "recording"}
            refreshIntervalSec={settings.refreshIntervalSec ?? 30}
            onRefresh={handleRefresh}
            onSuggestionClick={handleSuggestionClick}
          />
        </section>

        {/* Chat */}
        <section className="flex flex-col flex-1 min-w-70 px-5 py-5 overflow-hidden">
          <ChatPanel
            messages={chatMessages}
            isStreaming={isStreaming}
            onSendMessage={streamChat}
          />
        </section>
      </main>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
