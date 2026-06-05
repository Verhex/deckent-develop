// src/cli/commands/chat-nervous-bridge.ts
//
// Bridge module: nervous system notifications → REPL terminal visibility.
// Sprint 223 Task 223-007 (222-009 carry).
//
// Exposes pending notifications from .deckent/nervous-pending.json to the
// REPL loop so users can see and respond to nervous suggestions inline.
// The /nervous slash routes accept/reject through the same file store used
// by the `deckent nervous` CLI command (nervous.ts).
//
// ADR-010: Node built-in ANSI only — no external color deps.
// ADR-002: .js extensions on all imports.

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getLanguage, getMessage } from '../helpers/messages.js';
import type { NervousNotification } from '../../core/nervous-types.js';

// ─── ANSI (Node built-in, ADR-010) ──────────────────────────────────────────

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';

// ─── Severity Icon ───────────────────────────────────────────────────────────

function severityPrefix(severity: string): string {
  switch (severity) {
    case 'emergency': return '🚨';
    case 'critical':  return '🔴';
    case 'warning':   return '⚠';
    default:          return 'ℹ';
  }
}

// ─── File I/O Helpers ─────────────────────────────────────────────────────────

function pendingPath(root: string): string {
  return join(root, '.deckent', 'nervous-pending.json');
}

function historyPath(root: string): string {
  return join(root, '.deckent', 'nervous-history.jsonl');
}

function writePendingNervous(root: string, notifications: NervousNotification[]): void {
  const dir = join(root, '.deckent');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(pendingPath(root), JSON.stringify(notifications, null, 2) + '\n', 'utf-8');
}

function appendNervousHistory(
  root: string,
  notification: NervousNotification,
  decision: 'accepted' | 'rejected',
): void {
  const dir = join(root, '.deckent');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const record = {
    id: `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    notificationId: notification.id,
    actionId: notification.actions[0]?.id ?? 'unknown',
    decision,
    decidedBy: 'user',
    executedAt: new Date().toISOString(),
    outcome: decision === 'accepted' ? 'success' : 'pending',
    reversible: false,
  };
  appendFileSync(historyPath(root), JSON.stringify(record) + '\n', 'utf-8');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read pending nervous notifications from .deckent/nervous-pending.json.
 * Returns empty array when the file does not exist or is unreadable.
 */
export function getPendingNervous(root: string): NervousNotification[] {
  const path = pendingPath(root);
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(data) ? (data as NervousNotification[]) : [];
  } catch {
    return [];
  }
}

/**
 * Render a visible nervous notification banner for the REPL (layout-compatible
 * with chat-layout.ts). Returns empty string when there are no pending items.
 *
 * TTY: bold yellow header + dim detail lines.
 * Non-TTY: plain single-line summary.
 */
export function renderNervousPrompt(items: NervousNotification[], tty?: boolean): string {
  if (items.length === 0) return '';
  const isTTY = tty !== undefined ? tty : process.stdout.isTTY === true;

  if (!isTTY) {
    return `[nervous] ${items.length} pending — /nervous to review`;
  }

  const lines: string[] = [];
  lines.push(`${BOLD}${YELLOW}⚡ nervous: ${items.length} pending${RESET}`);
  for (const n of items) {
    lines.push(
      `  ${severityPrefix(n.severity)} ${DIM}${n.id.slice(0, 12)}${RESET} ${n.detectorId}`,
    );
  }
  lines.push(`${DIM}  /nervous accept <id> · /nervous reject <id>${RESET}`);
  return lines.join('\n');
}

/**
 * Handle /nervous slash in the REPL loop.
 *
 * Usage:
 *   /nervous              — list pending
 *   /nervous accept <id> — accept a notification (removes from pending)
 *   /nervous reject <id> — reject a notification (removes from pending)
 *
 * Returns a string result to emit to the REPL output sink.
 */
export function handleNervousSlash(
  args: readonly string[],
  root: string,
  tty?: boolean,
  lang?: string,
): string {
  const isTTY = tty !== undefined ? tty : process.stdout.isTTY === true;
  const lng = getLanguage(lang);
  const sub = args[0] ?? 'list';

  if (sub === 'accept' || sub === 'reject') {
    const id = args[1] ?? '';
    if (!id) {
      return getMessage('nervous.slash_id_required', lng, { sub });
    }
    const pending = getPendingNervous(root);
    const idx = pending.findIndex(n => n.id === id || n.id.startsWith(id));
    if (idx === -1) {
      return getMessage('nervous.slash_not_found', lng, { id });
    }
    const notification = pending[idx]!;
    const decision = sub === 'accept' ? 'accepted' : 'rejected';
    pending.splice(idx, 1);
    writePendingNervous(root, pending);
    appendNervousHistory(root, notification, decision);
    const label = notification.actions[0]?.id ?? notification.id.slice(0, 12);
    if (isTTY) {
      const color = decision === 'accepted' ? GREEN : RED;
      return `${color}${decision === 'accepted' ? '✓' : '✗'} ${decision}: ${label}${RESET}`;
    }
    return `${decision}: ${label}`;
  }

  // Default: list pending
  const pending = getPendingNervous(root);
  if (pending.length === 0) {
    const empty = getMessage('nervous.slash_empty', lng);
    return isTTY ? `${DIM}${empty}${RESET}` : empty;
  }
  const lines = pending.map(
    n => `  ${severityPrefix(n.severity)} ${n.id.slice(0, 12)} — ${n.detectorId} [${n.severity}]`,
  );
  return lines.join('\n');
}
