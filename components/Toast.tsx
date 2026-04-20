"use client";

import { useEffect } from "react";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
}

export default function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-red-900/90 border border-red-700 text-red-200 text-sm shadow-xl max-w-lg">
      <span className="shrink-0">✕</span>
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 text-red-400 hover:text-red-200 transition-colors font-bold leading-none"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
