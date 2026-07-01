// ─── TERM-LIVE — Live Run-Status Footer (Sprint 353, Task 353-007) ─────────
//
// Answers 5 questions at a glance while a sprint/task runs: what's running,
// how long it's been running, provider health, auth state, what's next.
// Pure render module — buildLiveFooter() does NO file/network I/O. The
// caller (REPL-wiring, follow-up task) reads heartbeat/dashboard-state and
// assembles the LiveFooterState seam below.
//
// String-free mechanism (CLAUDE.md i18n-first + this task's goNogo, which
// forbids adding new i18n keys here): labels are injected via `options.labels`
// with English defaults exported as DEFAULT_LIVE_FOOTER_LABELS. Wiring en/tr
// through messages.ts is deferred to Task 16.

import { theme } from './theme.js';

// ─── Types (state-feed seam) ───────────────────────────────────────────────

export interface LiveFooterProviderState {
  name: string;
  healthy: boolean | 'unknown';
}

export type LiveFooterAuthState = 'logged-in' | 'logged-out' | 'unknown';

export interface LiveFooterState {
  /** Q1 — ne çalışıyor: what's currently running (task id / phase / action label). */
  running?: string;
  /** Q2 — ne kadar oldu: ISO timestamp the current run started; elapsed computed vs `options.now`. */
  startedAt?: string;
  /** Q3 — provider-health. */
  provider?: LiveFooterProviderState;
  /** Q4 — auth-state. */
  auth?: LiveFooterAuthState;
  /** Q5 — sıradaki-ne: what's next. */
  next?: string;
}

export interface LiveFooterLabels {
  idle: string;
  running: string;
  elapsed: string;
  provider: string;
  auth: string;
  next: string;
  healthy: string;
  degraded: string;
  unknown: string;
  loggedIn: string;
  loggedOut: string;
}

export const DEFAULT_LIVE_FOOTER_LABELS: LiveFooterLabels = {
  idle: 'idle',
  running: 'Running',
  elapsed: 'Elapsed',
  provider: 'Provider',
  auth: 'Auth',
  next: 'Next',
  healthy: 'healthy',
  degraded: 'degraded',
  unknown: 'unknown',
  loggedIn: 'logged-in',
  loggedOut: 'logged-out',
};

export interface LiveFooterOptions {
  /** Override terminal width for truncation. Defaults to process.stdout.columns ?? 80. */
  width?: number;
  /** Injected clock for deterministic elapsed-time computation in tests. */
  now?: Date;
  /** String-free seam — caller injects translated labels; see file header. */
  labels?: Partial<LiveFooterLabels>;
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatElapsed(startedAt: string, now: Date, unknownLabel: string): string {
  const startMs = new Date(startedAt).getTime();
  if (Number.isNaN(startMs)) return unknownLabel;
  const ms = now.getTime() - startMs;
  if (ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${totalSeconds}s`;
}

function truncate(text: string, width: number): string {
  const safeWidth = Math.max(1, width);
  if (text.length <= safeWidth) return text;
  if (safeWidth === 1) return text.slice(0, 1);
  return `${text.slice(0, safeWidth - 1)}…`;
}

interface FooterLine {
  text: string;
  colorize?: (s: string) => string;
}

function providerLine(provider: LiveFooterProviderState, labels: LiveFooterLabels): FooterLine {
  if (provider.healthy === true) {
    return { text: `${labels.provider}: ${provider.name} (${labels.healthy})`, colorize: (s) => theme.success(s) };
  }
  if (provider.healthy === false) {
    return { text: `${labels.provider}: ${provider.name} (${labels.degraded})`, colorize: (s) => theme.error(s) };
  }
  return { text: `${labels.provider}: ${provider.name} (${labels.unknown})`, colorize: (s) => theme.muted(s) };
}

function authLine(auth: LiveFooterAuthState, labels: LiveFooterLabels): FooterLine {
  if (auth === 'logged-in') {
    return { text: `${labels.auth}: ${labels.loggedIn}`, colorize: (s) => theme.success(s) };
  }
  if (auth === 'logged-out') {
    return { text: `${labels.auth}: ${labels.loggedOut}`, colorize: (s) => theme.warning(s) };
  }
  return { text: `${labels.auth}: ${labels.unknown}`, colorize: (s) => theme.muted(s) };
}

// ─── Public: buildLiveFooter ────────────────────────────────────────────────

/**
 * Pure render function — 1 to 5 lines answering: what's running, how long it's
 * been running, provider health, auth state, what's next. Each question renders
 * as its own line only when the caller supplied that piece of state; an
 * entirely empty state honestly collapses to a single "idle" line rather than
 * fabricating data.
 */
export function buildLiveFooter(state: LiveFooterState, options: LiveFooterOptions = {}): string[] {
  const labels: LiveFooterLabels = { ...DEFAULT_LIVE_FOOTER_LABELS, ...options.labels };
  const width = options.width ?? process.stdout.columns ?? 80;
  const now = options.now ?? new Date();

  const lines: FooterLine[] = [];

  if (state.running !== undefined && state.running.length > 0) {
    lines.push({ text: `${labels.running}: ${state.running}` });
  }
  if (state.startedAt !== undefined) {
    lines.push({ text: `${labels.elapsed}: ${formatElapsed(state.startedAt, now, labels.unknown)}` });
  }
  if (state.provider !== undefined) {
    lines.push(providerLine(state.provider, labels));
  }
  if (state.auth !== undefined) {
    lines.push(authLine(state.auth, labels));
  }
  if (state.next !== undefined && state.next.length > 0) {
    lines.push({ text: `${labels.next}: ${state.next}` });
  }

  if (lines.length === 0) {
    return [truncate(labels.idle, width)];
  }

  return lines.map(({ text, colorize }) => {
    const truncated = truncate(text, width);
    return colorize ? colorize(truncated) : truncated;
  });
}
