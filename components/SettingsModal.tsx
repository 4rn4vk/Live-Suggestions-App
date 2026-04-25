"use client";

import { useState, useEffect } from "react";
import type { AppSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { useSettings } from "@/context/SettingsContext";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When true the modal cannot be closed until a Groq API key is saved */
  required?: boolean;
}

const FIELD_LABELS: Array<{
  key: keyof AppSettings;
  label: string;
  type: "text" | "textarea" | "number" | "password";
  rows?: number;
  placeholder?: string;
}> = [
  { key: "groqApiKey", label: "Groq API Key", type: "password", placeholder: "gsk_..." },
  { key: "llmModel", label: "LLM Model ID", type: "text", placeholder: DEFAULT_SETTINGS.llmModel },
  { key: "refreshIntervalSec", label: "Auto-refresh interval (seconds)", type: "number" },
  { key: "suggestionContextChars", label: "Suggestion context window (chars)", type: "number" },
  { key: "expandedAnswerContextChars", label: "Expanded-answer context window (chars)", type: "number" },
  { key: "suggestionsPrompt", label: "Live Suggestions Prompt", type: "textarea", rows: 12 },
  { key: "expandedAnswerPrompt", label: "Expanded Answer Prompt (on click)", type: "textarea", rows: 10 },
  { key: "chatSystemPrompt", label: "Chat System Prompt", type: "textarea", rows: 8 },
];

export default function SettingsModal({ isOpen, onClose, required }: SettingsModalProps) {
  const { settings, updateSettings, resetToDefaults } = useSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);

  // Sync draft when modal opens
  useEffect(() => {
    if (isOpen) setDraft(settings);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const hasKey = draft.groqApiKey.trim().length > 0;

  function handleSave() {
    if (required && !hasKey) return;
    updateSettings(draft);
    onClose();
  }

  function handleReset() {
    if (confirm("Reset all settings to defaults?")) {
      resetToDefaults();
      setDraft(DEFAULT_SETTINGS);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex flex-col w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
            {required && (
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">
                Enter your Groq API key to get started
              </p>
            )}
          </div>
          {!required && (
            <button
              onClick={onClose}
              className="text-gray-400 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors text-xl leading-none"
              aria-label="Close settings"
            >
              ✕
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {FIELD_LABELS.map(({ key, label, type, rows, placeholder }) => (
            <div key={key} className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                {label}
              </label>
              {type === "textarea" ? (
                <textarea
                  rows={rows ?? 4}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={String(draft[key])}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                />
              ) : (
                <input
                  type={type}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={String(draft[key])}
                  placeholder={placeholder}
                  onChange={(e) => {
                    if (type === "number") {
                      const num = Number(e.target.value);
                      if (isNaN(num) || num <= 0) return;
                      setDraft((d) => ({ ...d, [key]: num }));
                    } else {
                      setDraft((d) => ({ ...d, [key]: e.target.value }));
                    }
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 gap-3">
          <button
            onClick={handleReset}
            className="text-sm text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            {!required && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasKey}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
