/** Lightweight unique id — safe for React keys and message IDs within a session. */
export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Format an epoch-ms timestamp as a locale time string.
 *  @param includeSeconds - include seconds (e.g. TranscriptPanel); default false */
export function formatTime(epochMs: number, includeSeconds = false): string {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (includeSeconds) opts.second = "2-digit";
  return new Date(epochMs).toLocaleTimeString([], opts);
}
