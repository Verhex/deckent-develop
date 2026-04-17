import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatWorkerLog,
  formatScopeLog,
  formatTestLog,
  formatVerifyLog,
  formatDoneLog,
  appendWorkerLog,
} from '../../src/agents/worker-log.js';
import type { WorkerLogAction } from '../../src/agents/worker-log.js';

describe('formatWorkerLog', () => {
  it('formats a basic log line with emoji indicator', () => {
    const line = formatWorkerLog('040-003', 'Starting', 'Planner Provider Decoupling');
    expect(line).toBe('[040-003] ▶ Starting: Planner Provider Decoupling');
  });

  it('formats with plain indicator when noColor is true', () => {
    const line = formatWorkerLog('040-003', 'Starting', 'Planner Provider Decoupling', { noColor: true });
    expect(line).toBe('[040-003] > Starting: Planner Provider Decoupling');
  });

  it('formats all action types with correct emoji indicators', () => {
    const actions: Array<{ action: WorkerLogAction; emoji: string }> = [
      { action: 'Starting', emoji: '▶' },
      { action: 'Scope', emoji: '📂' },
      { action: 'Writing', emoji: '✏' },
      { action: 'Verify', emoji: '🔍' },
      { action: 'Test', emoji: '🧪' },
      { action: 'Fix', emoji: '🔧' },
      { action: 'Retry', emoji: '🔄' },
      { action: 'Done', emoji: '✅' },
      { action: 'Error', emoji: '❌' },
      { action: 'Info', emoji: 'ℹ' },
    ];

    for (const { action, emoji } of actions) {
      const line = formatWorkerLog('001-001', action, 'detail');
      expect(line).toBe(`[001-001] ${emoji} ${action}: detail`);
    }
  });

  it('formats all action types with correct plain indicators', () => {
    const actions: Array<{ action: WorkerLogAction; plain: string }> = [
      { action: 'Starting', plain: '>' },
      { action: 'Scope', plain: '#' },
      { action: 'Writing', plain: '*' },
      { action: 'Verify', plain: '?' },
      { action: 'Test', plain: 'T' },
      { action: 'Fix', plain: 'F' },
      { action: 'Retry', plain: 'R' },
      { action: 'Done', plain: '+' },
      { action: 'Error', plain: '!' },
      { action: 'Info', plain: 'i' },
    ];

    for (const { action, plain } of actions) {
      const line = formatWorkerLog('001-001', action, 'detail', { noColor: true });
      expect(line).toBe(`[001-001] ${plain} ${action}: detail`);
    }
  });

  it('preserves task ID format in brackets', () => {
    const line = formatWorkerLog('041-007', 'Info', 'test');
    expect(line).toMatch(/^\[041-007\]/);
  });

  it('handles empty detail string', () => {
    const line = formatWorkerLog('040-001', 'Info', '');
    expect(line).toBe('[040-001] ℹ Info: ');
  });
});

describe('formatScopeLog', () => {
  it('formats single directory with file count', () => {
    const line = formatScopeLog('040-003', ['src/orchestra/planner.ts'], 1);
    expect(line).toBe('[040-003] 📂 Scope: src/orchestra/planner.ts (1 file)');
  });

  it('formats multiple directories', () => {
    const line = formatScopeLog('040-003', ['src/agents/', 'tests/agents/'], 5);
    expect(line).toBe('[040-003] 📂 Scope: src/agents/, tests/agents/ (5 files)');
  });

  it('uses singular "file" for count 1', () => {
    const line = formatScopeLog('040-003', ['src/'], 1);
    expect(line).toContain('(1 file)');
    expect(line).not.toContain('(1 files)');
  });

  it('uses plural "files" for count > 1', () => {
    const line = formatScopeLog('040-003', ['src/'], 3);
    expect(line).toContain('(3 files)');
  });

  it('works with noColor option', () => {
    const line = formatScopeLog('040-003', ['src/'], 2, { noColor: true });
    expect(line).toBe('[040-003] # Scope: src/ (2 files)');
  });
});

describe('formatTestLog', () => {
  it('formats a passing test result', () => {
    const line = formatTestLog('040-003', true, '');
    expect(line).toBe('[040-003] 🧪 Test: Pass');
  });

  it('formats a failing test result with detail', () => {
    const line = formatTestLog('040-003', false, '2 failures');
    expect(line).toBe('[040-003] 🧪 Test: Fail 2 failures');
  });

  it('includes retry info for attempts > 1', () => {
    const line = formatTestLog('040-003', true, '', 2, 3);
    expect(line).toBe('[040-003] 🧪 Test: Pass (attempt 2/3)');
  });

  it('does not include retry info for first attempt', () => {
    const line = formatTestLog('040-003', true, '', 1, 3);
    expect(line).toBe('[040-003] 🧪 Test: Pass');
  });

  it('works with noColor option', () => {
    const line = formatTestLog('040-003', false, '1 failure', undefined, undefined, { noColor: true });
    expect(line).toBe('[040-003] T Test: Fail 1 failure');
  });
});

describe('formatVerifyLog', () => {
  it('formats a passing verification', () => {
    const line = formatVerifyLog('040-003', true);
    expect(line).toBe('[040-003] 🔍 Verify: tsc --noEmit... Pass');
  });

  it('formats a failing verification with error count', () => {
    const line = formatVerifyLog('040-003', false, 5);
    expect(line).toBe('[040-003] 🔍 Verify: tsc --noEmit... Fail 5 errors');
  });

  it('defaults error count to 0 when not provided', () => {
    const line = formatVerifyLog('040-003', false);
    expect(line).toBe('[040-003] 🔍 Verify: tsc --noEmit... Fail 0 errors');
  });

  it('works with noColor option', () => {
    const line = formatVerifyLog('040-003', true, undefined, { noColor: true });
    expect(line).toBe('[040-003] ? Verify: tsc --noEmit... Pass');
  });
});

describe('formatDoneLog', () => {
  it('formats a DONE result with no retries', () => {
    const line = formatDoneLog('040-003', 'DONE', 0, 4);
    expect(line).toBe('[040-003] ✅ Done: DONE (4 min)');
  });

  it('formats a DONE result with retries', () => {
    const line = formatDoneLog('040-003', 'DONE', 1, 4);
    expect(line).toBe('[040-003] ✅ Done: DONE (1 retry, 4 min)');
  });

  it('formats a GO_WITH_TECH_DEBT result', () => {
    const line = formatDoneLog('040-003', 'GO_WITH_TECH_DEBT', 2, 6);
    expect(line).toBe('[040-003] ✅ Done: GO_WITH_TECH_DEBT (2 retry, 6 min)');
  });

  it('formats a NO_GO result with Error action', () => {
    const line = formatDoneLog('040-003', 'NO_GO', 3, 8);
    expect(line).toBe('[040-003] ❌ Error: NO_GO (3 retry, 8 min)');
  });

  it('works with noColor option', () => {
    const line = formatDoneLog('040-003', 'DONE', 0, 2, { noColor: true });
    expect(line).toBe('[040-003] + Done: DONE (2 min)');
  });
});

describe('appendWorkerLog', () => {
  const tmpRoot = join(process.cwd(), '.test-worker-log-' + process.pid);
  const tasksDir = join(tmpRoot, '.tasks');

  beforeEach(() => {
    mkdirSync(tasksDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpRoot)) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('creates log file and appends formatted line', () => {
    appendWorkerLog(tmpRoot, '040-003', '[040-003] ▶ Starting: Test task');
    const logPath = join(tasksDir, 'task-040-003.log');
    expect(existsSync(logPath)).toBe(true);
    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('[040-003] ▶ Starting: Test task');
  });

  it('appends multiple lines to the same file', () => {
    appendWorkerLog(tmpRoot, '040-003', '[040-003] ▶ Starting: Test');
    appendWorkerLog(tmpRoot, '040-003', '[040-003] ✅ Done: DONE (0 min)');
    const logPath = join(tasksDir, 'task-040-003.log');
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('Starting: Test');
    expect(lines[1]).toContain('Done: DONE');
  });

  it('prepends ISO timestamp to each line', () => {
    appendWorkerLog(tmpRoot, '040-003', '[040-003] ▶ Starting: Test');
    const logPath = join(tasksDir, 'task-040-003.log');
    const content = readFileSync(logPath, 'utf-8');
    // ISO 8601 timestamp pattern
    expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });
});

describe('log format consistency', () => {
  it('all log lines follow [taskId] indicator Action: detail pattern', () => {
    const lines = [
      formatWorkerLog('040-003', 'Starting', 'Planner Provider Decoupling'),
      formatScopeLog('040-003', ['src/'], 3),
      formatTestLog('040-003', true, ''),
      formatVerifyLog('040-003', true),
      formatDoneLog('040-003', 'DONE', 0, 4),
    ];

    for (const line of lines) {
      expect(line).toMatch(/^\[\d{3}-\d{3}\] .+ \w+: .*/);
    }
  });
});
