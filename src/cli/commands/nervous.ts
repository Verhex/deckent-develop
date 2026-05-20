// src/cli/commands/nervous.ts
//
// CLI Dashboard — `deckent nervous` — Nervous System interaction layer.
// Sprint 147 Task 14.
// ADR-012: register<Name>(program) pattern.
// ADR-010: no external deps beyond commander.js — ANSI escape codes for colors.

import { Command } from 'commander';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, watchFile, unwatchFile } from 'node:fs';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import type {
  NervousNotification,
  ExecutionRecord,
  NervousSystemConfig,
  Severity,
} from '../../core/nervous-types.js';
import { getActiveDirectivesProtection } from '../../nervous/observer.js';

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
  return join(root, '.deckent', 'nervous-history.jsonl');
}

function getPendingPath(root: string): string {
  return join(root, '.deckent', 'nervous-pending.json');
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

function readNervousConfig(root: string): NervousSystemConfig {
  const defaults: NervousSystemConfig = {
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
  const dir = join(root, '.deckent');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(notifications, null, 2), 'utf-8');
}

function appendHistoryRecord(root: string, record: ExecutionRecord): void {
  const path = getHistoryPath(root);
  const dir = join(root, '.deckent');
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

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes}dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}sa önce`;
  const days = Math.floor(hours / 24);
  return `${days}g önce`;
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

// ─── Dashboard Action ───────────────────────────────────────────────────────

function showDashboard(root: string): void {
  const pending = readPendingNotifications(root);
  const history = readHistoryRecords(root);
  const config = readNervousConfig(root);

  print('');
  print(colorize('  🧠 Deckent Nervous System', BOLD));
  print('');

  // Pending notifications
  if (pending.length === 0) {
    print(colorize('  No pending notifications.', DIM));
  } else {
    print(colorize('  Pending:', BOLD));
    for (let i = 0; i < pending.length; i++) {
      const n = pending[i]!;
      print(`    [${i + 1}] ${severityIcon(n.severity)} — ${n.detectorId}  ${DIM}(${n.id.slice(0, 12)})${RESET}`);
      print(`        ${n.message}`);
      print(`        Actions: ${colorize('accept', GREEN)}, ${colorize('reject', RED)}, edit, ignore`);
    }
  }

  print('');

  // Recent history (last 5)
  const recent = history.slice(-5).reverse();
  if (recent.length > 0) {
    print(colorize(`  Recent (last ${recent.length}):`, BOLD));
    for (const r of recent) {
      const icon = outcomeIcon(r.decision, r.outcome);
      const policyLabel = r.decision === 'autonomous'
        ? DIM + '(autonomous)' + RESET
        : r.decision === 'accepted'
          ? '(accepted)'
          : r.decision === 'rejected'
            ? colorize('(rejected by user)', RED)
            : `(${r.decision})`;
      print(`    ${icon} ${r.actionId} ${policyLabel} — ${DIM}${timeAgo(r.executedAt)}${RESET}`);
    }
  }

  print('');

  // Config summary
  const overrideCount = Object.keys(config.actionOverrides ?? {}).length;
  const quietStr = config.quietHours
    ? `${config.quietHours.start}-${config.quietHours.end} TRT`
    : 'off';
  print(`  Config: mode=${colorize(config.mode, MAGENTA)} · overrides=${overrideCount} · quiet=${quietStr}`);
  print('');
}

// ─── Accept Action ──────────────────────────────────────────────────────────

function handleAccept(root: string, id: string): void {
  const pending = readPendingNotifications(root);
  const idx = pending.findIndex(n => n.id === id || n.id.startsWith(id));

  if (idx === -1) {
    printError(`Pending notification not found: ${id}`);
    process.exitCode = 1;
    return;
  }

  const notification = pending[idx]!;
  const record = generateRecordForDecision(notification, 'accepted');
  appendHistoryRecord(root, record);

  // Remove from pending
  pending.splice(idx, 1);
  writePendingNotifications(root, pending);

  print(colorize(`  ✓ Accepted: ${notification.actions[0]?.id ?? notification.id}`, GREEN));
}

// ─── Reject Action ──────────────────────────────────────────────────────────

function handleReject(root: string, id: string, reason?: string): void {
  const pending = readPendingNotifications(root);
  const idx = pending.findIndex(n => n.id === id || n.id.startsWith(id));

  if (idx === -1) {
    printError(`Pending notification not found: ${id}`);
    process.exitCode = 1;
    return;
  }

  const notification = pending[idx]!;
  const record = generateRecordForDecision(notification, 'rejected', reason);
  appendHistoryRecord(root, record);

  // Remove from pending
  pending.splice(idx, 1);
  writePendingNotifications(root, pending);

  const reasonStr = reason ? ` (reason: ${reason})` : '';
  print(colorize(`  ✗ Rejected: ${notification.actions[0]?.id ?? notification.id}${reasonStr}`, RED));
}

// ─── Edit Action ────────────────────────────────────────────────────────────

function handleEdit(root: string, id: string): void {
  const pending = readPendingNotifications(root);
  const idx = pending.findIndex(n => n.id === id || n.id.startsWith(id));

  if (idx === -1) {
    printError(`Pending notification not found: ${id}`);
    process.exitCode = 1;
    return;
  }

  // Edit is essentially accept with modified payload
  const notification = pending[idx]!;
  const record: ExecutionRecord = {
    ...generateRecordForDecision(notification, 'accepted'),
    payload: { modified: true },
  };
  appendHistoryRecord(root, record);

  pending.splice(idx, 1);
  writePendingNotifications(root, pending);

  print(colorize(`  ✎ Edited & accepted: ${notification.actions[0]?.id ?? notification.id}`, CYAN));
}

// ─── Undo Action ────────────────────────────────────────────────────────────

function handleUndo(root: string, actionId: string): void {
  const history = readHistoryRecords(root);
  const reversible = history
    .filter(r => r.reversible && r.outcome === 'success')
    .reverse();

  const target = reversible.find(r => r.id === actionId || r.actionId === actionId || r.id.startsWith(actionId));

  if (!target) {
    printError(`No reversible action found: ${actionId}`);
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
  print(colorize(`  ↩ Undone: ${target.actionId} (${target.id.slice(0, 8)})`, YELLOW));
}

// ─── History Action ─────────────────────────────────────────────────────────

function showHistory(root: string, limit: number, since?: string): void {
  let records = readHistoryRecords(root);

  if (since) {
    const cutoffMs = Date.now() - parseSinceDuration(since);
    records = records.filter(r => new Date(r.executedAt).getTime() >= cutoffMs);
  }

  records = records.slice(-limit).reverse();

  if (records.length === 0) {
    print(colorize('  No history records found.', DIM));
    return;
  }

  print('');
  print(colorize('  Nervous System History:', BOLD));
  print('');
  for (const r of records) {
    const icon = outcomeIcon(r.decision, r.outcome);
    const timeStr = colorize(timeAgo(r.executedAt), DIM);
    print(`  ${icon} ${r.actionId} [${r.decision}] — ${timeStr}`);
  }
  print('');
}

// ─── Log Follow Action ──────────────────────────────────────────────────────

function showLog(root: string, follow: boolean): void {
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

  print(colorize('  --- watching for new entries (Ctrl+C to exit) ---', DIM));

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

export function registerNervous(program: Command): void {
  const nervousCmd = program
    .command('nervous')
    .description('Nervous System dashboard — monitor, accept, reject proactive suggestions');

  // Default action: show dashboard
  nervousCmd.action(() => {
    const root = resolveProjectRoot();
    showDashboard(root);
  });

  // deckent nervous accept <id>
  nervousCmd
    .command('accept <id>')
    .description('Accept a pending nervous system suggestion')
    .action((id: string) => {
      const root = resolveProjectRoot();
      handleAccept(root, id);
    });

  // deckent nervous reject <id>
  nervousCmd
    .command('reject <id>')
    .description('Reject a pending nervous system suggestion')
    .option('--reason <text>', 'Rejection reason')
    .action((id: string, opts: { reason?: string }) => {
      const root = resolveProjectRoot();
      handleReject(root, id, opts.reason);
    });

  // deckent nervous edit <id>
  nervousCmd
    .command('edit <id>')
    .description('Modify and accept a pending suggestion')
    .action((id: string) => {
      const root = resolveProjectRoot();
      handleEdit(root, id);
    });

  // deckent nervous undo <action-id>
  nervousCmd
    .command('undo <action-id>')
    .description('Undo a recent reversible action')
    .action((actionId: string) => {
      const root = resolveProjectRoot();
      handleUndo(root, actionId);
    });

  // deckent nervous history
  nervousCmd
    .command('history')
    .description('View nervous system action history')
    .option('--limit <n>', 'Number of records to show', '20')
    .option('--since <duration>', 'Show records since (e.g. 1d, 2h, 30m)')
    .action((opts: { limit: string; since?: string }) => {
      const root = resolveProjectRoot();
      showHistory(root, parseInt(opts.limit, 10) || 20, opts.since);
    });

  // deckent nervous log
  nervousCmd
    .command('log')
    .description('View raw nervous system log')
    .option('--follow', 'Watch for new entries (live tail)')
    .action((opts: { follow?: boolean }) => {
      const root = resolveProjectRoot();
      showLog(root, opts.follow === true);
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
