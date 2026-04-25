"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { AppSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/lib/defaults";

const STORAGE_KEY = "live_suggestions_settings";

/** Sync the API key into the server-side HTTP-only cookie. Fire-and-forget. */
function syncApiKeyCookie(apiKey: string) {
  if (!apiKey) {
    fetch("/api/set-key", { method: "DELETE" }).catch(() => undefined);
  } else {
    fetch("/api/set-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    }).catch(() => undefined);
  }
}

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetToDefaults: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Hydrate from sessionStorage once on mount.
  // sessionStorage keeps the key for the current tab/session only (safer than localStorage).
  // We also re-sync the HTTP-only cookie in case the page was refreshed.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AppSettings>;
        setSettings((prev) => ({ ...prev, ...parsed }));
        if (parsed.groqApiKey) syncApiKeyCookie(parsed.groqApiKey);
      }
    } catch {
      // sessionStorage unavailable or corrupt — use defaults
    }
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      // Keep the HTTP-only cookie in sync whenever the API key changes
      if ("groqApiKey" in patch) syncApiKeyCookie(next.groqApiKey);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    syncApiKeyCookie(""); // clear the cookie
  }, []); 

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetToDefaults }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
