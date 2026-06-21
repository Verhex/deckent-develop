export interface StreamThrottleOptions {
  edit: (text: string) => Promise<void>;
  intervalMs?: number;
  now?: () => number;
}
export interface StreamThrottle {
  push(text: string): void;
  flush(): Promise<void>;
}

/**
 * Coalesce rapid streaming updates into rate-limited edits. `push` triggers an
 * `edit` at most once per intervalMs (Telegram editMessageText is ~1/sec/chat);
 * `flush` forces a final edit with the latest text. Identical consecutive text is
 * skipped; edit errors are swallowed (best-effort — the final flush still tries).
 */
export function makeStreamThrottle(opts: StreamThrottleOptions): StreamThrottle {
  const intervalMs = opts.intervalMs ?? 900;
  const now = opts.now ?? ((): number => Date.now());
  let latest = '';
  let lastEdited = '';
  let lastAt = -Infinity;

  async function tryEdit(): Promise<void> {
    if (latest === lastEdited) return;
    const text = latest;
    lastEdited = text;
    lastAt = now();
    try { await opts.edit(text); } catch { /* best-effort (rate limit / transient) */ }
  }

  return {
    push(text: string): void {
      latest = text;
      if (now() - lastAt >= intervalMs) void tryEdit();
    },
    async flush(): Promise<void> { await tryEdit(); },
  };
}
