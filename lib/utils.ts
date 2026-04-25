/** Format an epoch-ms timestamp as a locale time string.
 *  @param includeSeconds - include seconds (e.g. TranscriptPanel); default false */
export function formatTime(epochMs: number, includeSeconds = false): string {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (includeSeconds) opts.second = "2-digit";
  return new Date(epochMs).toLocaleTimeString([], opts);
}
