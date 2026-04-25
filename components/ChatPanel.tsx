"use client";

import React, { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/types";
import { formatTime } from "@/lib/utils";

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (text: string) => void;
}

// Inline: **bold**, *italic*, `code`
function renderInline(text: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="bg-gray-200 dark:bg-gray-700 rounded px-1 py-0.5 text-[11px] font-mono">{part.slice(1, -1)}</code>;
    return part;
  });
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "bullet"; items: string[] }
  | { type: "ordered"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; lang: string; lines: string[] }
  | { type: "hr" }
  | { type: "paragraph"; text: string }
  | { type: "blank" };

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", lang, lines: codeLines });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Table — look-ahead: current line starts with |, next non-empty starts with |---|
    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const parseCells = (line: string) =>
        line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const [headerRow, , ...dataRows] = tableLines; // skip separator row
      if (headerRow) {
        blocks.push({
          type: "table",
          headers: parseCells(headerRow),
          rows: dataRows.filter((r) => !/^[\s|:-]+$/.test(r)).map(parseCells),
        });
      }
      continue;
    }

    // Bullet list — collect consecutive bullet lines
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t.startsWith("- ") || t.startsWith("• ") || t.startsWith("* ")) {
          items.push(t.slice(2));
          i++;
        } else break;
      }
      blocks.push({ type: "bullet", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ type: "ordered", items });
      continue;
    }

    if (!trimmed) {
      blocks.push({ type: "blank" });
    } else {
      blocks.push({ type: "paragraph", text: raw });
    }
    i++;
  }
  return blocks;
}

function renderContent(text: string) {
  const blocks = parseBlocks(text);
  return blocks.map((block, i) => {
    switch (block.type) {
      case "heading": {
        const cls = block.level === 1
          ? "text-base font-bold text-gray-900 dark:text-gray-100 mt-3 mb-1"
          : block.level === 2
          ? "text-sm font-bold text-gray-900 dark:text-gray-100 mt-2 mb-0.5"
          : "text-sm font-semibold text-gray-800 dark:text-gray-200 mt-2";
        return <p key={i} className={cls}>{renderInline(block.text)}</p>;
      }
      case "bullet":
        return (
          <ul key={i} className="list-disc ml-4 space-y-0.5 my-1">
            {block.items.map((item, j) => (
              <li key={j} className="text-sm">{renderInline(item)}</li>
            ))}
          </ul>
        );
      case "ordered":
        return (
          <ol key={i} className="list-decimal ml-4 space-y-0.5 my-1">
            {block.items.map((item, j) => (
              <li key={j} className="text-sm">{renderInline(item)}</li>
            ))}
          </ol>
        );
      case "table":
        return (
          <div key={i} className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr>
                  {block.headers.map((h, j) => (
                    <th key={j} className="border border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 px-2 py-1 text-left font-semibold whitespace-nowrap">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, j) => (
                  <tr key={j} className={j % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"}>
                    {row.map((cell, k) => (
                      <td key={k} className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "code":
        return (
          <pre key={i} className="bg-gray-200 dark:bg-gray-700 rounded-lg px-3 py-2 my-1.5 overflow-x-auto text-[11px] font-mono leading-relaxed">
            <code>{block.lines.join("\n")}</code>
          </pre>
        );
      case "hr":
        return <hr key={i} className="border-gray-300 dark:border-gray-600 my-2" />;
      case "blank":
        return <div key={i} className="h-1" />;
      case "paragraph":
      default:
        return (
          <p key={i} className="text-sm leading-relaxed">
            {renderInline((block as { type: "paragraph"; text: string }).text)}
          </p>
        );
    }
  });
}

export default function ChatPanel({
  messages,
  isStreaming,
  onSendMessage,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (isStreaming) {
      // Instant scroll during token streaming so the view always tracks the bottom
      el.scrollTop = el.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-4 pr-1 mb-3">
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

        {/* Dots only while waiting for the first token — once content starts streaming they disappear */}
        {isStreaming && messages[messages.length - 1]?.content === "" && (
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
