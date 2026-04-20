"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (text: string) => void;
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Inline bold: replace **text** with <strong>text</strong>
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

// Markdown-ish rendering: headers, bullets, bold, line breaks
function renderContent(text: string) {
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim();
    // ### / ## / # headings
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      return (
        <p key={i} className="font-semibold text-gray-900 dark:text-gray-100 mt-2">
          {renderInline(headingMatch[2])}
        </p>
      );
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
      return (
        <li key={i} className="ml-4 list-disc">
          {renderInline(trimmed.slice(2))}
        </li>
      );
    }
    // Numbered list: "1. item"
    if (/^\d+\.\s/.test(trimmed)) {
      return (
        <li key={i} className="ml-4 list-decimal">
          {renderInline(trimmed.replace(/^\d+\.\s/, ""))}
        </li>
      );
    }
    return trimmed ? (
      <p key={i} className="mt-1">
        {renderInline(line)}
      </p>
    ) : (
      <br key={i} />
    );
  });
}

export default function ChatPanel({
  messages,
  isStreaming,
  onSendMessage,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    onSendMessage(text);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Chat</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-3">
        {messages.length === 0 && (
          <p className="text-gray-400 dark:text-gray-600 text-sm mt-8 text-center">
            Click a suggestion or type a question to start chatting.
          </p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`rounded-xl px-4 py-2.5 max-w-[90%] text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="space-y-0.5">{renderContent(msg.content)}</div>
              ) : (
                msg.content
              )}
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5 font-mono">
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}

        {isStreaming && (
          <div className="flex items-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-2.5">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Ask anything about the conversation…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isStreaming}
        />
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
