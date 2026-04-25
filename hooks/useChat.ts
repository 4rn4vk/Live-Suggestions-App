"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, Suggestion, TranscriptChunk } from "@/types";
import { useSettings } from "@/context/SettingsContext";
import { getRecentTranscript } from "@/lib/defaults";
import { uid } from "@/lib/utils";

interface UseChatOptions {
  transcriptChunks: TranscriptChunk[];
  onError: (message: string) => void;
  onNeedApiKey: () => void;
}

export function useChat({ transcriptChunks, onError, onNeedApiKey }: UseChatOptions) {
  const { settings } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const appendToken = useCallback((token: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.id === "__streaming__") {
        return [...prev.slice(0, -1), { ...last, content: last.content + token }];
      }
      return prev;
    });
  }, []);

  const finalizeStream = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === "__streaming__" ? { ...m, id: uid(), timestamp: Date.now() } : m
      )
    );
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!settings.groqApiKey || isStreaming) return;

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: userText,
        timestamp: Date.now(),
      };
      const placeholder: ChatMessage = {
        id: "__streaming__",
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, placeholder]);
      setIsStreaming(true);

      try {
        const recentTranscript = getRecentTranscript(
          transcriptChunks,
          settings.expandedAnswerContextChars
        );
        const contextualContent = `[Transcript context]\n${recentTranscript}\n\n[User question]\n${userText}`;

        // Capture history before the placeholder was appended
        const history = messages
          .filter((m) => m.id !== "__streaming__")
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: settings.llmModel,
            systemPrompt: settings.chatSystemPrompt,
            messages: [...history, { role: "user", content: contextualContent }],
          }),
        });

        if (!res.ok || !res.body) throw new Error(`Chat request failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) appendToken(decoder.decode(value, { stream: !d }));
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : "Chat failed");
        appendToken("\n\n[Error: could not get a response]");
      } finally {
        finalizeStream();
      }
    },
    [settings, isStreaming, transcriptChunks, messages, appendToken, finalizeStream, onError]
  );

  const expandSuggestion = useCallback(
    async (suggestion: Suggestion) => {
      if (!settings.groqApiKey) {
        onNeedApiKey();
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

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: `[${suggestion.kind.replace(/_/g, " ")}] ${suggestion.preview}`,
        timestamp: Date.now(),
      };
      const placeholder: ChatMessage = {
        id: "__streaming__",
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;

      setMessages((prev) => [...prev, userMsg, placeholder]);
      setIsStreaming(true);

      try {
        const res = await fetch("/api/expand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({ model: settings.llmModel, prompt }),
        });

        if (!res.ok || !res.body) throw new Error(`Expand request failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) appendToken(decoder.decode(value, { stream: !d }));
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Clean up the orphaned placeholder and user message
          setMessages((prev) =>
            prev.filter((m) => m.id !== "__streaming__" && m.id !== userMsg.id)
          );
          setIsStreaming(false);
          return;
        }
        onError(err instanceof Error ? err.message : "Could not expand suggestion");
        appendToken("\n\n[Error: could not expand suggestion]");
      } finally {
        finalizeStream();
      }
    },
    [settings, transcriptChunks, appendToken, finalizeStream, onError, onNeedApiKey]
  );

  return { messages, isStreaming, sendMessage, expandSuggestion };
}
