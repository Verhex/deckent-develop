// tests/cli/nervous-command.test.ts
//
// CLI Dashboard — `deckent nervous` command tests.
// Sprint 147 Task 14.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { NervousNotification, ExecutionRecord } from '../../src/core/nervous-types.js';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createTmpRoot(): string {
  const root = join(tmpdir(), `nervous-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(join(root, '.deckent', 'nervous'), { recursive: true });
  return root;
}

function writePending(root: string, notifications: NervousNotification[]): void {
  writeFileSync(join(root, '.deckent', 'nervous', 'nervous-pending.json'), JSON.stringify(notifications), 'utf-8');
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
    id: overrides.id ?? `ns-147-${randomUUID().slice(0, 4)}`,
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

// ─── Mock resolveProjectRoot ────────────────────────────────────────────────

let testRoot: string;

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
  handleCliError: (err: unknown) => { throw err; },
}));

// ─── Import after mocks ────────────────────────────────────────────────────

const { registerNervous } = await import('../../src/cli/commands/nervous.js');
const { Command } = await import('commander');

// ─── Capture stdout ─────────────────────────────────────────────────────────

function captureOutput(fn: () => void): string {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunks.join('');
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;

  try {
    fn();
  } finally {
    process.stderr.write = originalWrite;
  }
  return chunks.join('');
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('deckent nervous CLI', () => {
  beforeEach(() => {
    testRoot = createTmpRoot();
    process.exitCode = undefined;
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch {}
  });

  // Test 1: No pending → "No pending" message
  it('shows "No pending notifications" when none exist', () => {
    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous'], { from: 'node' });
    });

    expect(output).toContain('No pending');
  });

  // Test 2: 3 pending → table format
  it('displays 3 pending notifications in table format', () => {
    const notifications = [
      makeNotification({ id: 'ns-147-0042', severity: 'warning', detectorId: 'stale-worker', message: 'Worker w-147-009 3dk HB atmadı' }),
      makeNotification({ id: 'ns-147-0043', severity: 'critical', detectorId: 'agent-routing', message: 'Agent string; corrupt' }),
      makeNotification({ id: 'ns-147-0044', severity: 'info', detectorId: 'debt-trend', message: 'Debt trending up' }),
    ];
    writePending(testRoot, notifications);

    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous'], { from: 'node' });
    });

    expect(output).toContain('[1]');
    expect(output).toContain('[2]');
    expect(output).toContain('[3]');
    expect(output).toContain('stale-worker');
    expect(output).toContain('agent-routing');
    expect(output).toContain('debt-trend');
  });

  // Test 3: accept → resolves approval
  it('accept with no live executor → dismissed (removed, no execution; APPROVE-007)', () => {
    const notification = makeNotification({ id: 'ns-147-0042' });
    writePending(testRoot, [notification]);

    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous', 'accept', 'ns-147-0042'], { from: 'node' });
    });

    // No nervous executor running → accept falls back to dismiss-only.
    expect(output.toLowerCase()).toContain('no live');

    // Removed from the pending queue.
    const pending = JSON.parse(readFileSync(join(testRoot, '.deckent', 'nervous', 'nervous-pending.json'), 'utf-8'));
    expect(pending).toHaveLength(0);

    // No 'accepted' history record — nothing executed (audit honesty). The live
    // IPC → executor → execute path is covered by tests/cli/nervous-ipc-route.test.ts.
    let hist = '';
    try { hist = readFileSync(join(testRoot, '.deckent', 'nervous', 'nervous-history.jsonl'), 'utf-8'); } catch { /* none */ }
    expect(hist).not.toContain('"decision":"accepted"');
  });

  // Test 4: reject --reason → rejection recorded
  it('rejects a pending notification with reason', () => {
    const notification = makeNotification({ id: 'ns-147-0042' });
    writePending(testRoot, [notification]);

    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous', 'reject', 'ns-147-0042', '--reason', 'later'], { from: 'node' });
    });

    expect(output).toContain('Rejected');
    expect(output).toContain('later');

    // Verify history
    const historyContent = readFileSync(join(testRoot, '.deckent', 'nervous', 'nervous-history.jsonl'), 'utf-8');
    const record = JSON.parse(historyContent.trim()) as ExecutionRecord;
    expect(record.decision).toBe('rejected');
    expect(record.payload).toEqual({ reason: 'later' });
  });

  // Test 5: history --limit 5 → shows 5 lines
  it('shows limited history records', () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ actionId: `ACTION_${i}`, executedAt: new Date(Date.now() - i * 60000).toISOString() })
    );
    writeHistory(testRoot, records);

    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous', 'history', '--limit', '5'], { from: 'node' });
    });

    // Should show 5 records
    const actionMatches = output.match(/ACTION_\d/g) ?? [];
    expect(actionMatches.length).toBe(5);
  });

  // Test 6: history --since 1d → last 24h filter
  it('filters history by since duration', () => {
    const records = [
      makeRecord({ actionId: 'RECENT', executedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString() }), // 30min ago
      makeRecord({ actionId: 'OLD', executedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() }), // 2 days ago
    ];
    writeHistory(testRoot, records);

    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous', 'history', '--since', '1d'], { from: 'node' });
    });

    expect(output).toContain('RECENT');
    expect(output).not.toContain('OLD');
  });

  // Test 7: log --follow → stream mode (just verify it starts without error)
  it('log command starts without error and shows existing content', () => {
    const records = [makeRecord({ actionId: 'LOG_TEST' })];
    writeHistory(testRoot, records);

    const program = new Command();
    registerNervous(program);

    // Without --follow, just show existing logs
    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous', 'log'], { from: 'node' });
    });

    expect(output).toContain('LOG_TEST');
  });

  // Test 8: Unknown subcommand → help printed + exit 1
  it('shows help on unknown subcommand', () => {
    const program = new Command();
    program.exitOverride(); // prevent actual exit
    registerNervous(program);

    let threwError = false;
    const output = captureStderr(() => {
      try {
        program.parse(['node', 'deckent', 'nervous', 'nonexistent'], { from: 'node' });
      } catch {
        threwError = true;
      }
    });

    // commander throws on unknown subcommand with exitOverride
    expect(threwError).toBe(true);
  });

  // Test 9: Pending ID not found → friendly error
  it('shows error when accepting non-existent notification', () => {
    writePending(testRoot, []);

    const program = new Command();
    registerNervous(program);

    const errOutput = captureStderr(() => {
      captureOutput(() => {
        program.parse(['node', 'deckent', 'nervous', 'accept', 'non-existent-id'], { from: 'node' });
      });
    });

    expect(errOutput).toContain('not found');
    expect(process.exitCode).toBe(1);
  });

  // Test 10: Colors use ANSI escape
  it('uses ANSI escape codes for colored output', () => {
    const notifications = [
      makeNotification({ severity: 'warning' }),
    ];
    writePending(testRoot, notifications);

    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous'], { from: 'node' });
    });

    // Check ANSI escape codes present
    expect(output).toMatch(/\x1b\[\d+m/);
  });
});

// ─── Brain inbox — recommendations surface ──────────────────────────────────

function writeRecommendations(root: string, lines: object[]): void {
  const content = lines.map(l => JSON.stringify(l)).join('\n') + '\n';
  writeFileSync(join(root, '.deckent', 'nervous', 'nervous-recommendations.jsonl'), content, 'utf-8');
}

describe('deckent nervous recommendations (Brain inbox)', () => {
  beforeEach(() => {
    testRoot = createTmpRoot();
    process.exitCode = undefined;
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch {}
  });

  it('lists open recommendations with action id + payload summary', () => {
    writeRecommendations(testRoot, [
      { id: 'rec-aaaaaaaaaa11', actionId: 'DEBT_REPRIORITIZE', createdAt: new Date().toISOString(), payload: { debtId: 'D-12', to: 'HIGH' }, status: 'open' },
      { id: 'rec-bbbbbbbbbb22', actionId: 'COMMIT_PUSH', createdAt: new Date().toISOString(), payload: { branch: 'main' }, status: 'dismissed' },
    ]);
    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous', 'recommendations'], { from: 'node' });
    });

    // open shown, dismissed hidden by default
    expect(output).toContain('DEBT_REPRIORITIZE');
    expect(output).toContain('debtId=D-12');
    expect(output).not.toContain('COMMIT_PUSH');
  });

  it('--all includes dismissed recommendations', () => {
    writeRecommendations(testRoot, [
      { id: 'rec-bbbbbbbbbb22', actionId: 'COMMIT_PUSH', createdAt: new Date().toISOString(), payload: {}, status: 'dismissed' },
    ]);
    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous', 'recommendations', '--all'], { from: 'node' });
    });
    expect(output).toContain('COMMIT_PUSH');
  });

  it('--dismiss flips an open recommendation to dismissed (persisted)', () => {
    writeRecommendations(testRoot, [
      { id: 'rec-aaaaaaaaaa11', actionId: 'DEBT_REPRIORITIZE', createdAt: new Date().toISOString(), payload: {}, status: 'open' },
    ]);
    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous', 'recommendations', '--dismiss', 'rec-aaaaaaaaaa11'], { from: 'node' });
    });
    expect(output).toMatch(/dismissed|kapat/i);

    const onDisk = readFileSync(join(testRoot, '.deckent', 'nervous', 'nervous-recommendations.jsonl'), 'utf-8');
    expect(JSON.parse(onDisk.trim()).status).toBe('dismissed');
  });

  it('--dismiss of an unknown id exits 1 with not-found', () => {
    writeRecommendations(testRoot, []);
    const program = new Command();
    registerNervous(program);

    const err = captureStderr(() => {
      program.parse(['node', 'deckent', 'nervous', 'recommendations', '--dismiss', 'rec-nope'], { from: 'node' });
    });
    expect(err).toMatch(/not found|bulunamad/i);
    expect(process.exitCode).toBe(1);
  });

  it('default dashboard surfaces the Brain inbox section when open recs exist', () => {
    writeRecommendations(testRoot, [
      { id: 'rec-cccccccccc33', actionId: 'SKILL_ROUTING_ADJUST', createdAt: new Date().toISOString(), payload: { skill: 'react-specialist' }, status: 'open' },
    ]);
    const program = new Command();
    registerNervous(program);

    const output = captureOutput(() => {
      program.parse(['node', 'deckent', 'nervous'], { from: 'node' });
    });
    expect(output).toContain('SKILL_ROUTING_ADJUST');
  });
});
