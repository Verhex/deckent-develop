// src/cli/commands/nervous.ts
//
// CLI Dashboard — `deckent nervous` — Nervous System interaction layer.
// Sprint 147 Task 14.
// ADR-012: register<Name>(program) pattern.
// ADR-010: no external deps beyond commander.js — ANSI escape codes for colors.

import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, watchFile, unwatchFile, readdirSync } from 'node:fs';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import type {
  NervousNotification,
  ExecutionRecord,
  NervousSystemConfigV1,
  Severity,
} from '../../core/nervous-types.js';
import { getActiveDirectivesProtection } from '../../nervous/observer.js';
import { handleEnableNervous } from './config-nervous.js';
import { NervousIpcQueue, isNervousPollerAlive } from '../../nervous/ipc-queue.js';
import {
  readRecommendations,
  dismissRecommendation,
} from '../../nervous/recommendation-log.js';
import { NERVOUS_HISTORY_FILE, NERVOUS_PENDING_FILE, PANIC_IPC_DIR } from '../../core/constants.js';

// ─── ANSI Color Helpers ─────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function colorize(text: string, ...codes: string[]): string {
  return codes.join('') + text + RESET;
}

function severityIcon(severity: Severity): string {
  switch (severity) {
    case 'emergency': return colorize('🚨 EMERGENCY', RED, BOLD);
    case 'critical': return colorize('🔴 CRITICAL', RED);
    case 'warning': return colorize('⚠ WARNING', YELLOW);
    case 'info': return colorize('ℹ INFO', CYAN);
  }
}

function outcomeIcon(decision: string, outcome: string): string {
  if (outcome === 'success') return colorize('✓', GREEN);
  if (decision === 'rejected') return colorize('✗', RED);
  return colorize('◌', DIM);
}

// ─── File Paths ─────────────────────────────────────────────────────────────

function getHistoryPath(root: string): string {
  return join(root, NERVOUS_HISTORY_FILE);
}

function getPendingPath(root: string): string {
  return join(root, NERVOUS_PENDING_FILE);
}

function getConfigPath(root: string): string {
  return join(root, '.deckent', 'config.json');
}

// ─── Data Readers ───────────────────────────────────────────────────────────

function readHistoryRecords(root: string): ExecutionRecord[] {
  const path = getHistoryPath(root);
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as ExecutionRecord);
  } catch {
    return [];
  }
}

function readPendingNotifications(root: string): NervousNotification[] {
  const path = getPendingPath(root);
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, 'utf-8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data as NervousNotification[] : [];
  } catch {
    return [];
  }
}

function readNervousConfig(root: string): NervousSystemConfigV1 {
  const defaults: NervousSystemConfigV1 = {
    mode: 'balanced',
    enabled: false,
    actionOverrides: {},
    quietHours: { start: '22:00', end: '08:00' },
    throttleWindowMs: 300000,
  };

  const cfgPath = getConfigPath(root);
  if (!existsSync(cfgPath)) return defaults;

  try {
    const raw = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    const ns = raw?.nervous_system;
    if (!ns) return defaults;
    return {
      mode: ns.mode ?? defaults.mode,
      enabled: ns.enabled ?? defaults.enabled,
      actionOverrides: ns.actionOverrides ?? defaults.actionOverrides,
      quietHours: ns.quiet_hours ?? ns.quietHours ?? defaults.quietHours,
      throttleWindowMs: ns.throttle_ms ?? ns.throttleWindowMs ?? defaults.throttleWindowMs,
    };
  } catch {
    return defaults;
  }
}

// ─── Acceptance / Rejection Persistence ─────────────────────────────────────

function writePendingNotifications(root: string, notifications: NervousNotification[]): void {
  const path = getPendingPath(root);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(notifications, null, 2), 'utf-8');
}

function appendHistoryRecord(root: string, record: ExecutionRecord): void {
  const path = getHistoryPath(root);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(record) + '\n', 'utf-8');
}

function generateRecordForDecision(
  notification: NervousNotification,
  decision: 'accepted' | 'rejected',
  reason?: string,
): ExecutionRecord {
  const action = notification.actions[0];
  return {
    id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    notificationId: notification.id,
    actionId: action?.id ?? 'unknown',
    decision,
    decidedBy: 'user',
    executedAt: new Date().toISOString(),
    outcome: decision === 'accepted' ? 'success' : 'pending',
    reversible: false,
    payload: reason ? { reason } : {},
  };
}

// ─── Time Formatting ────────────────────────────────────────────────────────

function timeAgo(isoString: string, lang: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return getMessage('nervous.time_just_now', lang);
  if (minutes < 60) return getMessage('nervous.time_minutes', lang, { n: String(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return getMessage('nervous.time_hours', lang, { n: String(hours) });
  const days = Math.floor(hours / 24);
  return getMessage('nervous.time_days', lang, { n: String(days) });
}

function parseSinceDuration(since: string): number {
  const match = since.match(/^(\d+)([mhd])$/);
  if (!match || !match[1] || !match[2]) return 24 * 60 * 60 * 1000; // default 1d
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

// ─── Recommendation Formatting ──────────────────────────────────────────────

/** One-line, length-bounded summary of a recommendation payload (key=value …). */
function formatRecPayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (v === null || typeof v === 'object') continue; // skip nested/null — keep it scannable
    parts.push(`${k}=${String(v)}`);
    if (parts.length >= 3) break;
  }
  const joined = parts.join(' ');
  return joined.length > 80 ? joined.slice(0, 77) + '…' : joined;
}

// ─── Recommendations Action ─────────────────────────────────────────────────

function showRecommendations(root: string, limit: number, all: boolean, lang: string): void {
  const recs = readRecommendations(root).filter(r => all || r.status === 'open');
  if (recs.length === 0) {
    print(colorize('  ' + getMessage('nervous.no_recommendations', lang), DIM));
    return;
  }
  print('');
  print(colorize('  ' + getMessage('nervous.recommendations_header', lang, { count: String(recs.length) }), BOLD));
  print('');
  for (const rec of recs.slice(-limit).reverse()) {
    const statusMark = rec.status === 'dismissed' ? colorize('✓', DIM) : colorize('▸', MAGENTA);
    const summary = formatRecPayload(rec.payload);
    const summaryStr = summary ? `  ${DIM}${summary}${RESET}` : '';
    print(`  ${statusMark} ${rec.actionId}${summaryStr}`);
    print(`      ${DIM}${rec.id}  ·  ${timeAgo(rec.createdAt, lang)}${RESET}`);
  }
  print('');
}

function handleDismissRecommendation(root: string, id: string, lang: string): void {
  if (dismissRecommendation(root, id)) {
    print(colorize('  ' + getMessage('nervous.rec_dismissed', lang, { id }), GREEN));
  } else {
    printError(getMessage('nervous.rec_not_found', lang, { id }));
    process.exitCode = 1;
  }
}

// ─── Dashboard Action ───────────────────────────────────────────────────────

function showDashboard(root: string, lang: string): void {
  const pending = readPendingNotifications(root);
  const history = readHistoryRecords(root);
  const config = readNervousConfig(root);

  print('');
  print(colorize('  ' + getMessage('nervous.dashboard_title', lang), BOLD));
  print('');

  // Pending notifications
  if (pending.length === 0) {
    print(colorize('  ' + getMessage('nervous.no_pending', lang), DIM));
  } else {
    print(colorize('  ' + getMessage('nervous.pending_header', lang), BOLD));
    for (let i = 0; i < pending.length; i++) {
      const n = pending[i]!;
      print(`    [${i + 1}] ${severityIcon(n.severity)} — ${n.detectorId}  ${DIM}(${n.id.slice(0, 12)})${RESET}`);
      print(`        ${n.message}`);
      print(`        ${getMessage('nervous.actions_label', lang)} ${colorize('accept', GREEN)}, ${colorize('reject', RED)}, edit, ignore`);
    }
  }

  print('');

  // Brain inbox — open recommendations (ADR-037: nervous proposes, Brain disposes)
  const openRecs = readRecommendations(root).filter(r => r.status === 'open');
  if (openRecs.length > 0) {
    print(colorize('  ' + getMessage('nervous.recommendations_header', lang, { count: String(openRecs.length) }), BOLD));
    for (const rec of openRecs.slice(-5).reverse()) {
      const summary = formatRecPayload(rec.payload);
      const summaryStr = summary ? `  ${DIM}${summary}${RESET}` : '';
      print(`    ${colorize('▸', MAGENTA)} ${rec.actionId}${summaryStr} — ${DIM}${timeAgo(rec.createdAt, lang)} (${rec.id.slice(0, 14)})${RESET}`);
    }
    print(colorize('    ' + getMessage('nervous.recommendations_hint', lang), DIM));
    print('');
  }

  // Recent history (last 5)
  const recent = history.slice(-5).reverse();
  if (recent.length > 0) {
    print(colorize('  ' + getMessage('nervous.recent_header', lang, { count: String(recent.length) }), BOLD));
    for (const r of recent) {
      const icon = outcomeIcon(r.decision, r.outcome);
      const policyLabel = r.decision === 'autonomous'
        ? DIM + getMessage('nervous.label_autonomous', lang) + RESET
        : r.decision === 'accepted'
          ? getMessage('nervous.label_accepted', lang)
          : r.decision === 'rejected'
            ? colorize(getMessage('nervous.label_rejected', lang), RED)
            : `(${r.decision})`;
      print(`    ${icon} ${r.actionId} ${policyLabel} — ${DIM}${timeAgo(r.executedAt, lang)}${RESET}`);
    }
  }

  print('');

  // Config summary
  const overrideCount = Object.keys(config.actionOverrides ?? {}).length;
  const quietStr = config.quietHours
    ? `${config.quietHours.start}-${config.quietHours.end}`
    : 'off';
  print('  ' + getMessage('nervous.config_summary', lang, {
    mode: colorize(config.mode, MAGENTA),
    overrides: String(overrideCount),
    quiet: quietStr,
  }));
  print('');
}

// ─── Accept Action ──────────────────────────────────────────────────────────

async function handleAccept(root: string, id: string, lang: string): Promise<void> {
  const pending = readPendingNotifications(root);
  const idx = pending.findIndex(n => n.id === id || n.id.startsWith(id) || n.shortCode === id.toLowerCase());

  if (idx === -1) {
    printError(getMessage('nervous.not_found_pending', lang, { id }));
    process.exitCode = 1;
    return;
  }

  const notification = pending[idx]!;
  const action = notification.actions[0]?.id ?? notification.id;

  // APPROVE-007 (§4G): when a nervous executor is live, route the decision
  // through the IPC queue — the executor executes the action AND owns the
  // pending-queue + history (single writer; no two-writer race). The CLI must
  // NOT mutate pending/history here.
  if (isNervousPollerAlive(root)) {
    await new NervousIpcQueue(root).writeApproval({ notificationId: notification.id, decision: 'accepted' });
    print(colorize('  ' + getMessage('nervous.sent_to_executor', lang, { action }), GREEN));
    return;
  }

  // Dismiss-only fallback: no live executor → the action CANNOT run. Remove it
  // from the queue but do NOT write an 'accepted' history record (that would be
  // an audit lie — nothing executed). Warn the operator.
  pending.splice(idx, 1);
  writePendingNotifications(root, pending);
  print(colorize('  ' + getMessage('nervous.dismissed_no_executor', lang, { action }), YELLOW));
}

// ─── Reject Action ──────────────────────────────────────────────────────────

async function handleReject(root: string, id: string, lang: string, reason?: string): Promise<void> {
  const pending = readPendingNotifications(root);
  const idx = pending.findIndex(n => n.id === id || n.id.startsWith(id) || n.shortCode === id.toLowerCase());

  if (idx === -1) {
    printError(getMessage('nervous.not_found_pending', lang, { id }));
    process.exitCode = 1;
    return;
  }

  const notification = pending[idx]!;
  const action = notification.actions[0]?.id ?? notification.id;

  // APPROVE-007: route to the live executor so its parked approval promise
  // actually resolves (else it hangs). The executor records the rejection.
  if (isNervousPollerAlive(root)) {
    await new NervousIpcQueue(root).writeApproval({ notificationId: notification.id, decision: 'rejected', reason });
    print(colorize('  ' + getMessage('nervous.sent_to_executor', lang, { action }), GREEN));
    return;
  }

  // Fallback: reject does not execute anything, so recording 'rejected' + removing
  // from the queue is the complete, honest outcome even without a live executor.
  const record = generateRecordForDecision(notification, 'rejected', reason);
  appendHistoryRecord(root, record);
  pending.splice(idx, 1);
  writePendingNotifications(root, pending);

  const reasonStr = reason ? getMessage('nervous.reject_reason', lang, { reason }) : '';
  print(colorize('  ' + getMessage('nervous.rejected', lang, {
    action,
    reason: reasonStr,
  }), RED));
}

// ─── Edit Action ────────────────────────────────────────────────────────────

async function handleEdit(root: string, id: string, lang: string): Promise<void> {
  const pending = readPendingNotifications(root);
  const idx = pending.findIndex(n => n.id === id || n.id.startsWith(id) || n.shortCode === id.toLowerCase());

  if (idx === -1) {
    printError(getMessage('nervous.not_found_pending', lang, { id }));
    process.exitCode = 1;
    return;
  }

  const notification = pending[idx]!;
  const action = notification.actions[0]?.id ?? notification.id;

  // APPROVE-007 (§4G): when a nervous executor is live, route the edit through
  // the IPC queue — the executor owns pending + history (single writer; no
  // two-writer race). modifiedPayload carries { modified: true } so the executor
  // can distinguish a plain accept from an edited accept. The CLI must NOT write
  // pending/history directly in this path.
  if (isNervousPollerAlive(root)) {
    await new NervousIpcQueue(root).writeApproval({
      notificationId: notification.id,
      decision: 'accepted',
      modifiedPayload: { modified: true },
    });
    print(colorize('  ' + getMessage('nervous.sent_to_executor', lang, { action }), CYAN));
    return;
  }

  // Fallback: no live executor — write directly (no race risk, single writer).
  const record: ExecutionRecord = {
    ...generateRecordForDecision(notification, 'accepted'),
    payload: { modified: true },
  };
  appendHistoryRecord(root, record);

  pending.splice(idx, 1);
  writePendingNotifications(root, pending);

  print(colorize('  ' + getMessage('nervous.edited', lang, {
    action,
  }), CYAN));
}

// ─── Undo Action ────────────────────────────────────────────────────────────

function handleUndo(root: string, actionId: string, lang: string): void {
  const history = readHistoryRecords(root);
  const reversible = history
    .filter(r => r.reversible && r.outcome === 'success')
    .reverse();

  const target = reversible.find(r => r.id === actionId || r.actionId === actionId || r.id.startsWith(actionId));

  if (!target) {
    printError(getMessage('nervous.not_found_reversible', lang, { id: actionId }));
    process.exitCode = 1;
    return;
  }

  const undoRecord: ExecutionRecord = {
    id: `undo-${target.id}`,
    notificationId: target.notificationId,
    actionId: target.actionId,
    decision: 'rejected',
    decidedBy: 'user',
    executedAt: new Date().toISOString(),
    outcome: 'success',
    reversible: false,
    payload: { undoOf: target.id },
  };

  appendHistoryRecord(root, undoRecord);
  print(colorize('  ' + getMessage('nervous.undone', lang, {
    action: target.actionId,
    id: target.id.slice(0, 8),
  }), YELLOW));
}

// ─── History Action ─────────────────────────────────────────────────────────

function showHistory(root: string, limit: number, lang: string, since?: string): void {
  let records = readHistoryRecords(root);

  if (since) {
    const cutoffMs = Date.now() - parseSinceDuration(since);
    records = records.filter(r => new Date(r.executedAt).getTime() >= cutoffMs);
  }

  records = records.slice(-limit).reverse();

  if (records.length === 0) {
    print(colorize('  ' + getMessage('nervous.history_empty', lang), DIM));
    return;
  }

  print('');
  print(colorize('  ' + getMessage('nervous.history_header', lang), BOLD));
  print('');
  for (const r of records) {
    const icon = outcomeIcon(r.decision, r.outcome);
    const timeStr = colorize(timeAgo(r.executedAt, lang), DIM);
    print(`  ${icon} ${r.actionId} [${r.decision}] — ${timeStr}`);
  }
  print('');
}

// ─── Log Follow Action ──────────────────────────────────────────────────────

function showLog(root: string, follow: boolean, lang: string): void {
  const historyPath = getHistoryPath(root);

  // Show existing content
  if (existsSync(historyPath)) {
    const content = readFileSync(historyPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean).slice(-20);
    for (const line of lines) {
      try {
        const r = JSON.parse(line) as ExecutionRecord;
        print(`${r.executedAt} ${r.actionId} [${r.decision}] → ${r.outcome}`);
      } catch {
        print(line);
      }
    }
  }

  if (!follow) return;

  print(colorize('  ' + getMessage('nervous.log_watching', lang), DIM));

  let lastSize = existsSync(historyPath)
    ? readFileSync(historyPath, 'utf-8').length
    : 0;

  const onFileChange = (): void => {
    if (!existsSync(historyPath)) return;
    const content = readFileSync(historyPath, 'utf-8');
    const newContent = content.slice(lastSize);
    lastSize = content.length;

    const newLines = newContent.split('\n').filter(Boolean);
    for (const line of newLines) {
      try {
        const r = JSON.parse(line) as ExecutionRecord;
        print(`${r.executedAt} ${r.actionId} [${r.decision}] → ${r.outcome}`);
      } catch {
        print(line);
      }
    }
  };

  watchFile(historyPath, { interval: 1000 }, onFileChange);

  // Handle SIGINT gracefully
  const cleanup = (): void => {
    unwatchFile(historyPath, onFileChange);
    print('');
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
}

// ─── Panic Guard Approval (Sprint 180 W4-2) ─────────────────────────────────
//
// Sprint 179 dogfood keşfi: PanicGuard "kill blocked — user approval required"
// uyarısı veriyordu ama hiçbir kanaldan onay UI yoktu. Bu helper file-based
// IPC marker yazar — W2-2 IPC queue ile uyumlu format:
//
//   .deckent/panic-ipc/pending/<taskId>-<ts>.json   ← onay isteği
//   .deckent/panic-ipc/resolved/<taskId>.json       ← onay tüketildi (Executor yazar)
//
// Marker payload: { taskId, acceptedAt, acceptedBy, reason? }
// acceptedBy: 'user-cli' | 'user-mcp' — onay kanalı için audit-trail.

export interface PanicAcceptMarker {
  taskId: string;
  acceptedAt: string;
  acceptedBy: 'user-cli' | 'user-mcp';
  reason?: string;
}

export interface PanicGuardPendingEvent {
  channel: 'PANIC_GUARD_KILL_PENDING';
  taskId: string;
  workerId: string;
  sprintId: string;
  reason: string;
  timestamp: string;
}

function getPanicIpcDir(root: string): string {
  return join(root, PANIC_IPC_DIR);
}

/**
 * Write a panic approval IPC marker. Idempotent: re-running for the same task
 * overwrites the marker with a fresh timestamp (latest approval wins).
 *
 * Used by CLI `deckent nervous accept-panic` and MCP `deckent_nervous_accept`
 * panic: prefix path.
 */
export function acceptPanicGuard(
  root: string,
  taskId: string,
  acceptedBy: 'user-cli' | 'user-mcp',
  reason?: string,
): { markerPath: string; marker: PanicAcceptMarker } {
  const pendingDir = join(getPanicIpcDir(root), 'pending');
  if (!existsSync(pendingDir)) mkdirSync(pendingDir, { recursive: true });

  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const acceptedAt = new Date().toISOString();
  const safeTs = acceptedAt.replace(/[:.]/g, '-');
  const markerPath = join(pendingDir, `${safeTaskId}-${safeTs}.json`);

  const marker: PanicAcceptMarker = { taskId, acceptedAt, acceptedBy, ...(reason ? { reason } : {}) };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n', 'utf-8');
  return { markerPath, marker };
}

/**
 * List PanicGuard events that are still awaiting user approval.
 *
 * Source files: `.deckent/<sprintId>-panic-<timestamp>.json` (written by
 * `src/core/panic-guard.ts`). An event is "pending" when:
 *   - blocked === true (PanicGuard returned BLOCK)
 *   - no `.deckent/panic-ipc/resolved/<taskId>.json` marker exists yet
 *
 * Returned as `PANIC_GUARD_KILL_PENDING` events for the MCP subscribe stream.
 */
export function listPendingPanicEvents(root: string): PanicGuardPendingEvent[] {
  const deckentDir = join(root, '.deckent');
  if (!existsSync(deckentDir)) return [];

  const resolvedDir = join(getPanicIpcDir(root), 'resolved');
  const resolvedTaskIds = new Set<string>();
  if (existsSync(resolvedDir)) {
    for (const f of readdirSync(resolvedDir)) {
      if (f.endsWith('.json')) {
        resolvedTaskIds.add(f.slice(0, -'.json'.length));
      }
    }
  }

  const out: PanicGuardPendingEvent[] = [];
  let files: string[] = [];
  try { files = readdirSync(deckentDir); } catch { return out; }

  for (const file of files) {
    // Match: <sprintId>-panic-<timestamp>.json
    if (!file.includes('-panic-') || !file.endsWith('.json')) continue;
    try {
      const raw = readFileSync(join(deckentDir, file), 'utf-8');
      const ev = JSON.parse(raw) as {
        taskId?: string;
        workerId?: string;
        sprintId?: string;
        reason?: string;
        timestamp?: string;
        blocked?: boolean;
      };
      if (!ev.taskId || !ev.workerId || !ev.sprintId || !ev.timestamp) continue;
      if (ev.blocked === false) continue;
      if (resolvedTaskIds.has(ev.taskId)) continue;
      out.push({
        channel: 'PANIC_GUARD_KILL_PENDING',
        taskId: ev.taskId,
        workerId: ev.workerId,
        sprintId: ev.sprintId,
        reason: ev.reason ?? 'unknown',
        timestamp: ev.timestamp,
      });
    } catch {
      // Skip unreadable / malformed panic event files.
    }
  }
  return out;
}

function handleAcceptPanic(root: string, taskId: string, reason?: string): void {
  if (!taskId || taskId.trim() === '') {
    printError('task-id is required');
    process.exitCode = 1;
    return;
  }
  const { markerPath } = acceptPanicGuard(root, taskId, 'user-cli', reason);
  print(colorize(`  ✓ Panic approval queued for task ${taskId}`, GREEN));
  print(colorize(`    marker: ${markerPath}`, DIM));
}

// ─── Baseline Refresh ────────────────────────────────────────────────────────

/**
 * Refresh the directives_protection baseline to the current DIRECTIVES.md content.
 *
 * Used by `deckent nervous baseline-refresh` CLI subcommand.
 * Sprint 177 fix: called manually after kill+cleanup to prevent stale restore.
 */
export async function nervousBaselineRefresh(opts: { root: string }): Promise<void> {
  const det = getActiveDirectivesProtection();
  if (!det) {
    printError('[deckent] No active directives_protection detector — run `deckent nervous` after starting a sprint');
    process.exitCode = 1;
    return;
  }
  const directivesPath = join(opts.root, 'DIRECTIVES.md');
  if (!existsSync(directivesPath)) {
    printError(`[deckent] DIRECTIVES.md not found at: ${directivesPath}`);
    process.exitCode = 1;
    return;
  }
  det.updateBaseline();
  print('[deckent] directives_protection baseline refreshed');
}

// ─── Register Command ───────────────────────────────────────────────────────

/**
 * Resolve --lang from a command, tolerating commander attaching the flag to the
 * parent `nervous` command rather than the invoked subcommand.
 */
function langOf(cmd: Command): string {
  const own = (cmd.opts() as { lang?: string }).lang;
  const parent = (cmd.parent?.opts() as { lang?: string } | undefined)?.lang;
  return getLanguage(own ?? parent);
}

export function registerNervous(program: Command): void {
  const nervousCmd = program
    .command('nervous')
    .description('Nervous System dashboard — monitor, accept, reject proactive suggestions')
    .option('--lang <code>', 'Language override (en|tr)');

  // Default action: show dashboard
  nervousCmd.action((_opts: unknown, cmd: Command) => {
    const root = resolveProjectRoot();
    showDashboard(root, langOf(cmd));
  });

  // deckent nervous enable [--mode <preset>]
  nervousCmd
    .command('enable')
    .description('Enable the Nervous System (one command; default stays OFF, human-approval preserved)')
    .option('--mode <preset>', 'Authority preset (strict|balanced|autopilot|full-auto)')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { mode?: string }, cmd: Command) => {
      const root = resolveProjectRoot();
      handleEnableNervous(root, langOf(cmd), opts.mode);
    });

  // deckent nervous accept <id>
  nervousCmd
    .command('accept <id>')
    .description('Accept a pending nervous system suggestion')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const root = resolveProjectRoot();
      await handleAccept(root, id, langOf(cmd));
    });

  // deckent nervous reject <id>
  nervousCmd
    .command('reject <id>')
    .description('Reject a pending nervous system suggestion')
    .option('--reason <text>', 'Rejection reason')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (id: string, opts: { reason?: string }, cmd: Command) => {
      const root = resolveProjectRoot();
      await handleReject(root, id, langOf(cmd), opts.reason);
    });

  // deckent nervous edit <id>
  nervousCmd
    .command('edit <id>')
    .description('Modify and accept a pending suggestion')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const root = resolveProjectRoot();
      await handleEdit(root, id, langOf(cmd));
    });

  // deckent nervous undo <action-id>
  nervousCmd
    .command('undo <action-id>')
    .description('Undo a recent reversible action')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((actionId: string, _opts: unknown, cmd: Command) => {
      const root = resolveProjectRoot();
      handleUndo(root, actionId, langOf(cmd));
    });

  // deckent nervous history
  nervousCmd
    .command('history')
    .description('View nervous system action history')
    .option('--limit <n>', 'Number of records to show', '20')
    .option('--since <duration>', 'Show records since (e.g. 1d, 2h, 30m)')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { limit: string; since?: string }, cmd: Command) => {
      const root = resolveProjectRoot();
      showHistory(root, parseInt(opts.limit, 10) || 20, langOf(cmd), opts.since);
    });

  // deckent nervous recommendations [--all] [--limit <n>] [--dismiss <id>]
  nervousCmd
    .command('recommendations')
    .alias('recs')
    .description('View the Brain inbox — nervous proposals awaiting disposition (ADR-037)')
    .option('--all', 'Include dismissed recommendations (default: open only)')
    .option('--limit <n>', 'Number of records to show', '20')
    .option('--dismiss <id>', 'Dismiss an open recommendation by id (or unique rec- prefix)')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { all?: boolean; limit: string; dismiss?: string }, cmd: Command) => {
      const root = resolveProjectRoot();
      const lang = langOf(cmd);
      if (opts.dismiss) {
        handleDismissRecommendation(root, opts.dismiss, lang);
        return;
      }
      showRecommendations(root, parseInt(opts.limit, 10) || 20, opts.all === true, lang);
    });

  // deckent nervous log
  nervousCmd
    .command('log')
    .description('View raw nervous system log')
    .option('--follow', 'Watch for new entries (live tail)')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { follow?: boolean }, cmd: Command) => {
      const root = resolveProjectRoot();
      showLog(root, opts.follow === true, langOf(cmd));
    });

  // deckent nervous accept-panic <task-id> (Sprint 180 W4-2)
  nervousCmd
    .command('accept-panic <task-id>')
    .description('Approve a PanicGuard-blocked worker kill (writes IPC marker)')
    .option('--reason <text>', 'Optional reason for the approval')
    .action((taskId: string, opts: { reason?: string }) => {
      const root = resolveProjectRoot();
      handleAcceptPanic(root, taskId, opts.reason);
    });

  // deckent nervous baseline-refresh (Sprint 177 Task 5)
  nervousCmd
    .command('baseline-refresh')
    .description('Refresh directives_protection baseline to current DIRECTIVES.md content')
    .action(() => {
      const root = resolveProjectRoot();
      nervousBaselineRefresh({ root }).catch((err: unknown) => {
        printError(`[deckent] baseline-refresh failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      });
    });
}
