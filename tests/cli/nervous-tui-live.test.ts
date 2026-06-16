// tests/cli/nervous-tui-live.test.ts
//
// Integration test for `deckent nervous` TUI rendering.
// Sprint 148 Task 12 — live TUI validation (5 tests).
//
// Separate from nervous-command.test.ts (action tests).
// Focus: rendering quality, section presence, count accuracy, ANSI formatting.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { NervousNotification, ExecutionRecord } from '../../src/core/nervous-types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createTmpRoot(): string {
  const root = join(tmpdir(), `nervous-tui-${randomUUID().slice(0, 8)}`);
  mkdirSync(join(root, '.deckent', 'nervous'), { recursive: true });
  return root;
}

function writePending(root: string, notifications: NervousNotification[]): void {
  writeFileSync(
    join(root, '.deckent', 'nervous', 'nervous-pending.json'),
    JSON.stringify(notifications),
    'utf-8',
  );
}

function writeHistory(root: string, records: ExecutionRecord[]): void {
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(join(root, '.deckent', 'nervous', 'nervous-history.jsonl'), content, 'utf-8');
}

function writeConfig(root: string, config: Record<string, unknown>): void {
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify(config), 'utf-8');
}

function makeNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: overrides.id ?? `ns-148-${randomUUID().slice(0, 4)}`,
    type: 'test',
    title: 'Test Notification',
    message: 'Test message',
    severity: 'warning',
    createdAt: new Date().toISOString(),
    detectorId: 'stale-worker',
    actions: [{
      id: 'WORKER_RESPAWN',
      label: 'Re-spawn worker',
      policy: 'suggest-30m',
      risk: 'medium',
      isSafetyFloor: false,
    }],
    timeoutMs: 1800000,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: randomUUID(),
    notificationId: randomUUID(),
    actionId: 'ORPHAN_TASK_ARCHIVE',
    decision: 'autonomous',
    decidedBy: 'system',
    executedAt: new Date().toISOString(),
    outcome: 'success',
    reversible: false,
    payload: {},
    ...overrides,
  };
}

// ─── ANSI Stripper ──────────────────────────────────────────────────────────

function stripAnsi(str: string): string {
  // Strip all ANSI escape sequences
  return str.replace(/\x1b\[[0-9;]*[mGKHF]/g, '');
}

// ─── Output Capture ──────────────────────────────────────────────────────────

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join('');
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;
  try {
    fn();
  } finally {
    process.stderr.write = orig;
  }
  return chunks.join('');
}

// ─── Mock resolveProjectRoot ─────────────────────────────────────────────────

let testRoot: string;

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
  handleCliError: (err: unknown) => { throw err; },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

const { registerNervous } = await import('../../src/cli/commands/nervous.js');
const { Command } = await import('commander');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deckent nervous TUI — integration rendering tests', () => {
  beforeEach(() => {
    testRoot = createTmpRoot();
    process.exitCode = undefined;

    // Write balanced config so smoke-script section check passes
    writeConfig(testRoot, {
      nervous_system: {
        enabled: true,
        mode: 'balanced',
        actionOverrides: {},
        quietHours: { start: '22:00', end: '08:00' },
        throttleWindowMs: 300000,
      },
    });
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch {}
  });

  // ── Test 1: All TUI sections present ────────────────────────────────────────
  it('renders all required TUI sections: header, Pending, Config', () => {
    const program = new Command();
    registerNervous(program);

    const raw = captureStdout(() => {
      program.parse(['node', 'deckent', 'nervous'], { from: 'node' });
    });

    const output = stripAnsi(raw);

    // Section 1: Header
    expect(output).toContain('Deckent Nervous System');

    // Section 2: Pending (no pending scenario → "No pending")
    expect(output).toMatch(/Pending:|No pending/);

    // Section 3: Config line with mode
    expect(output).toContain('Config:');
    expect(output).toContain('mode=balanced');
  });

  // ── Test 2: Pending count matches event fixture ──────────────────────────────
  it('pending count in output matches number of written notifications', () => {
    const count = 4;
    const notifications = Array.from({ length: count }, (_, i) =>
      makeNotification({
        id: `ns-148-count-${i}`,
        severity: i % 2 === 0 ? 'warning' : 'critical',
        detectorId: i % 3 === 0 ? 'stale-worker' : 'scope-collision',
        message: `Notification ${i} message`,
      }),
    );
    writePending(testRoot, notifications);

    const program = new Command();
    registerNervous(program);

    const raw = captureStdout(() => {
      program.parse(['node', 'deckent', 'nervous'], { from: 'node' });
    });

    const output = stripAnsi(raw);

    // All 4 pending notifications should appear by index [1]-[4]
    for (let i = 1; i <= count; i++) {
      expect(output).toContain(`[${i}]`);
    }

    // Pending header shown (not "No pending")
    expect(output).toContain('Pending:');
  });

  // ── Test 3: history --limit 5 shows exactly 5 records from 10 ──────────────
  it('history --limit 5 shows exactly 5 records when 10 exist', () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({
        actionId: `TUI_ACTION_${String(i).padStart(2, '0')}`,
        executedAt: new Date(Date.now() - i * 60000).toISOString(),
      }),
    );
    writeHistory(testRoot, records);

    const program = new Command();
    registerNervous(program);

    const raw = captureStdout(() => {
      program.parse(['node', 'deckent', 'nervous', 'history', '--limit', '5'], { from: 'node' });
    });

    const output = stripAnsi(raw);

    // Count TUI_ACTION_XX matches — should be exactly 5
    const matches = output.match(/TUI_ACTION_\d{2}/g) ?? [];
    expect(matches).toHaveLength(5);

    // History header present
    expect(output).toContain('Nervous System History');
  });

  // ── Test 4: ANSI escapes present, stripped content valid ──────────────────
  it('output contains ANSI escape codes and stripped content is valid structure', () => {
    const notifications = [
      makeNotification({ severity: 'emergency', detectorId: 'directives-protection' }),
      makeNotification({ severity: 'warning', detectorId: 'debt-trend' }),
    ];
    writePending(testRoot, notifications);

    const program = new Command();
    registerNervous(program);

    const raw = captureStdout(() => {
      program.parse(['node', 'deckent', 'nervous'], { from: 'node' });
    });

    // Raw output MUST contain ANSI escape sequences
    expect(raw).toMatch(/\x1b\[\d+m/);

    // Stripped output must contain all structural elements
    const clean = stripAnsi(raw);
    expect(clean).toContain('Deckent Nervous System');
    expect(clean).toContain('Pending:');
    expect(clean).toContain('[1]');
    expect(clean).toContain('[2]');
    expect(clean).toContain('directives-protection');
    expect(clean).toContain('debt-trend');
    expect(clean).toContain('Config:');
  });

  // ── Test 5: Invalid subcommand → exits with error ─────────────────────────
  it('invalid subcommand causes exit error (commander exitOverride)', () => {
    const program = new Command();
    program.exitOverride(); // prevent actual process.exit, throw CommanderError instead
    registerNervous(program);

    let threwError = false;
    captureStderr(() => {
      try {
        program.parse(['node', 'deckent', 'nervous', 'invalid-subcommand-xyz'], { from: 'node' });
      } catch {
        threwError = true;
      }
    });

    // commander should throw on unknown subcommand when exitOverride is set
    expect(threwError).toBe(true);
  });
});
