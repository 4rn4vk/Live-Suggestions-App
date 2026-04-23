"use client";

import { useEffect, useRef } from "react";
import type { TranscriptChunk } from "@/types";

interface TranscriptPanelProps {
  chunks: TranscriptChunk[];
  isRecording: boolean;
  isTranscribing: boolean;
  onStart: () => void;
  onStop: () => void;
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function TranscriptPanel({
  chunks,
  isRecording,
  isTranscribing,
  onStart,
  onStop,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Transcript</h2>
        <button
          onClick={isRecording ? onStop : onStart}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
            isRecording
              ? "bg-red-600 hover:bg-red-500 text-white animate-pulse"
              : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          {isRecording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-white inline-block" />
              Stop
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-white inline-block" />
              Start Mic
            </>
          )}
        </button>
      </div>

      {/* Status bar */}
      {isTranscribing && (
        <div className="mb-2 text-xs text-indigo-400 animate-pulse">Transcribing…</div>
      )}

      {/* Transcript scroll area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {chunks.length === 0 ? (
          <p className="text-gray-400 dark:text-gray-600 text-sm mt-8 text-center">
            Press &ldquo;Start Mic&rdquo; to begin recording.
          </p>
        ) : (
          chunks.map((chunk) => (
            <div key={chunk.id} className="group">
              <span className="block text-[10px] text-gray-400 dark:text-gray-600 mb-0.5 font-mono">
                {formatTime(chunk.timestamp)}
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{chunk.text}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Recording in-progress pulse indicator — outside scroll area to avoid overflow clipping */}
      {isRecording && (
        <div className="flex items-center gap-2 text-xs text-red-400 mt-2">
          <span className="relative flex w-2 h-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full w-2 h-2 bg-red-500" />
          </span>
          Recording…
        </div>
      )}
    </div>
  );
}
