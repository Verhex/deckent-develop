import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Task, TaskResult } from '../../src/core/types.js';
import {
  deriveScopedSelfAuditManifest,
  runSelfAuditGate,
} from '../../src/orchestra/sprint-finalizer.js';

function task(id: string, filesWrite: string[]): Task {
  return {
    id,
    scope: { directories: [], filesRead: [], filesWrite },
  } as unknown as Task;
}

function result(id: string, filesChanged: string[] = []): TaskResult {
  return {
    taskId: id,
    workerId: `w-${id}`,
    filesChanged,
    linesAdded: 1,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 100,
    selfAssessment: 'DONE',
    notes: 'done',
  };
}

describe('scoped finalizer self-audit policy', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function root(): string {
    const value = mkdtempSync(join(tmpdir(), 'deckent-scoped-audit-'));
    roots.push(value);
    mkdirSync(join(value, '.tasks'), { recursive: true });
    mkdirSync(join(value, '.deckent'), { recursive: true });
    return value;
  }

  it('derives a deterministic shell-free manifest from task scope and attributed paths', () => {
    expect(deriveScopedSelfAuditManifest([
      task('a', ['src/a.ts', 'tests/a.test.ts', '../escape.test.ts']),
      task('b', ['tests\\b.spec.ts']),
    ], [result('a', ['src/a.ts', '/absolute.test.ts'])])).toEqual({
      testFiles: ['tests/a.test.ts', 'tests/b.spec.ts'],
      requiresTests: true,
      requiresTypeScript: true,
      evidenceRefs: ['task-scope:a', 'task-scope:b'],
    });
  });

  it('executes only the exact manifest and persists parseable execution evidence', async () => {
    const projectRoot = root();
    const commands: Array<{ command: string; args: readonly string[] }> = [];
    const audit = await runSelfAuditGate('sprint-486', projectRoot, {
      scopedManifest: {
        testFiles: ['tests/a.test.ts', 'tests/b.spec.ts'],
        requiresTests: true,
        requiresTypeScript: true,
        evidenceRefs: ['task-scope:a'],
      },
      runTsc: () => ({ status: 0, stdout: '', stderr: '' }),
      runScopedCommand: async (command, args) => {
        commands.push({ command, args });
        return {
          status: 0,
          stdout: 'Tests  4 passed (4)\nTest Files  2 passed (2)\n',
          stderr: '',
          timedOut: false,
        };
      },
      honestyResults: [],
    });

    expect(commands).toEqual([{
      command: 'npx',
      args: ['vitest', 'run', 'tests/a.test.ts', 'tests/b.spec.ts'],
    }]);
    expect(audit.vitest).toMatchObject({
      status: 'PASS',
      delta: { files: 2, pass: 4, fail: 0, skipped: 0 },
      execution: {
        mode: 'scoped',
        executed: true,
        timedOut: false,
        exitCode: 0,
      },
    });
  });

  it('fails closed when executable source changed but no test manifest exists', async () => {
    const audit = await runSelfAuditGate('sprint-486', root(), {
      scopedManifest: deriveScopedSelfAuditManifest([task('a', ['src/a.ts'])], [result('a')]),
      runTsc: () => ({ status: 0, stdout: '', stderr: '' }),
      honestyResults: [],
    });

    expect(audit.overallGate).toBe('GATE_FAILURE');
    expect(audit.vitest.execution?.reasonCode).toBe('REQUIRED_TEST_MANIFEST_EMPTY');
  });

  it('does not launch a suite for documentation-only work', async () => {
    const runner = vi.fn();
    const audit = await runSelfAuditGate('sprint-486', root(), {
      scopedManifest: deriveScopedSelfAuditManifest(
        [task('docs', ['docs/guide.md'])],
        [result('docs', ['docs/guide.md'])],
      ),
      runScopedCommand: runner,
      honestyResults: [],
    });

    expect(runner).not.toHaveBeenCalled();
    expect(audit.vitest.execution?.reasonCode).toBe('NO_TEST_REQUIRED');
    expect(audit.overallGate).toBe('PASS');
  });

  it('fails closed on timeout and never accepts exit zero without executed-count evidence', async () => {
    const manifest = {
      testFiles: ['tests/a.test.ts'],
      requiresTests: true,
      requiresTypeScript: false,
      evidenceRefs: ['task-scope:a'],
    } as const;
    const timedOut = await runSelfAuditGate('sprint-486', root(), {
      scopedManifest: manifest,
      runScopedCommand: async () => ({
        status: null, stdout: '', stderr: '', timedOut: true,
      }),
      honestyResults: [],
    });
    const emptySuccess = await runSelfAuditGate('sprint-486', root(), {
      scopedManifest: manifest,
      runScopedCommand: async () => ({
        status: 0, stdout: '', stderr: '', timedOut: false,
      }),
      honestyResults: [],
    });

    expect(timedOut.vitest).toMatchObject({ status: 'FAIL', execution: { timedOut: true } });
    expect(emptySuccess.vitest).toMatchObject({
      status: 'FAIL',
      execution: { executed: false, reasonCode: 'EXECUTION_EVIDENCE_UNPARSEABLE' },
    });
  });

  it('honesty inspection never launches a hidden second suite in scoped mode', async () => {
    const projectRoot = root();
    writeFileSync(join(projectRoot, '.tasks', 'task-a.result'), JSON.stringify({
      taskId: 'a',
      notes: 'These tests were already failing before my task.',
    }));
    const runner = vi.fn(async () => ({
      status: 0,
      stdout: 'Tests  1 passed (1)\nTest Files  1 passed (1)\n',
      stderr: '',
      timedOut: false,
    }));

    const audit = await runSelfAuditGate('sprint-486', projectRoot, {
      scopedManifest: {
        testFiles: ['tests/a.test.ts'],
        requiresTests: true,
        requiresTypeScript: false,
        evidenceRefs: ['task-scope:a'],
      },
      runScopedCommand: runner,
    });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(audit.honesty.flaggedTasks).toEqual(['a']);
    expect(audit.overallGate).toBe('GATE_FAILURE');
  });
});
