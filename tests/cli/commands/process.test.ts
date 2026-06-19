// tests/cli/commands/process.test.ts
//
// Hermetic tests for the `deckent process` CLI command handlers.
//
// Uses makeProcessController with injected deps (real controller logic, tmpdir IO)
// — ADR-087 (async I/O & test hermeticity), no spawnSync, no gitignored state.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeProcessController } from '../../../src/orchestra/process-controller.js';
import type { ResolvedConfig } from '../../../src/core/config-types.js';
import type { TaskResult } from '../../../src/core/types.js';
import {
  handleProcessSubmit,
  handleProcessStatus,
  handleProcessResult,
  type ProcessControllerFactory,
} from '../../../src/cli/commands/process.js';

// ─── Tmpdir fixture ───────────────────────────────────────────────────────────

const dirs: string[] = [];
function makeTmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'process-cli-'));
  dirs.push(d);
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

// ─── Real controller factory (hermetic) ────────────────────────────────────────

function makeFactory(root: string): ProcessControllerFactory {
  return async (_root: string) => {
    const bl = join(root, '.deckent', 'autonomous', 'backlog.json');
    return makeProcessController({
      projectRoot: root,
      config: { deckent_style: 'process' } as unknown as ResolvedConfig,
      backlogPath: bl,
      runTask: async () => ({ taskId: 'task-1' }),
      runSprint: async () => undefined,
      waitForResult: async () => ({ selfAssessment: 'DONE' } as unknown as TaskResult),
      capabilityRegistry: {
        invoke: async (target: { capability: string }) => ({
          ok: target.capability === 'erp.read',
          capability: target.capability,
          handler: 'mock',
          code: 'ERR',
          error: 'write denied by mock',
        }),
      } as unknown as Parameters<typeof makeProcessController>[0]['capabilityRegistry'],
      evaluate: (() => ({ decision: 'DONE', quality: 100 })) as unknown as Parameters<typeof makeProcessController>[0]['evaluate'],
      audit: (async () => ({ boundary: 'clean', adr: 'ok', functional: 'pass' })) as unknown as Parameters<typeof makeProcessController>[0]['audit'],
      crossVerify: (async () => ({ ran: false })) as unknown as Parameters<typeof makeProcessController>[0]['crossVerify'],
      idGen: (() => { let n = 0; return () => `proc-test-${++n}`; })(),
    });
  };
}

// ─── Output capture helper ───────────────────────────────────────────────────

function captureOutput(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(
    (chunk: string | Uint8Array, ...args: unknown[]) => {
      if (typeof chunk === 'string') lines.push(chunk);
      return orig(chunk, ...(args as Parameters<typeof orig>).slice(1));
    },
  );
  return {
    lines,
    restore: () => spy.mockRestore(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleProcessSubmit', () => {
  it('submit → prints executionId in output', async () => {
    const root = makeTmpDir();
    const factory = makeFactory(root);
    const cap = captureOutput();
    try {
      await handleProcessSubmit('summarize the changelog', { root, kind: 'task', scopeDir: 'docs/' }, factory);
    } finally {
      cap.restore();
    }
    const combined = cap.lines.join('');
    expect(combined).toContain('executionId:');
    expect(combined).toContain('proc-test-1');
  });

  it('submit parks an ambiguous task (no scope) and prints pending-approval status', async () => {
    const root = makeTmpDir();
    const factory = makeFactory(root);
    const cap = captureOutput();
    try {
      // A task with no scopeDir falls into the fail-safe critical-irreversible bucket
      // and parks for human approval (policy-gate ADR-071 safe-by-default).
      await handleProcessSubmit('do something ambiguous with no scope', { root, kind: 'task' }, factory);
    } finally {
      cap.restore();
    }
    const combined = cap.lines.join('');
    expect(combined).toContain('pending-approval');
  });

  it('throws a friendly error when description is empty', async () => {
    const root = makeTmpDir();
    const factory = makeFactory(root);
    await expect(
      handleProcessSubmit('', { root }, factory),
    ).rejects.toThrow(/Description is required/i);
  });
});

describe('handleProcessStatus', () => {
  it('status → prints entry status after submit', async () => {
    const root = makeTmpDir();
    const factory = makeFactory(root);
    // Submit first to create the entry (use read-only scope so it completes)
    await handleProcessSubmit('read sales orders', { root, kind: 'task', scopeDir: 'docs/' }, factory);

    const cap = captureOutput();
    try {
      await handleProcessStatus('proc-test-1', { root }, factory);
    } finally {
      cap.restore();
    }
    const combined = cap.lines.join('');
    expect(combined).toContain('proc-test-1');
    expect(combined).toContain('status:');
  });

  it('status with missing executionId → prints not_found message', async () => {
    const root = makeTmpDir();
    const factory = makeFactory(root);
    const cap = captureOutput();
    try {
      await handleProcessStatus('nonexistent-id', { root }, factory);
    } finally {
      cap.restore();
    }
    const combined = cap.lines.join('');
    expect(combined).toContain('nonexistent-id');
  });

  it('status with empty executionId → throws friendly error', async () => {
    const root = makeTmpDir();
    const factory = makeFactory(root);
    await expect(
      handleProcessStatus('', { root }, factory),
    ).rejects.toThrow(/executionId is required/i);
  });
});

describe('handleProcessResult', () => {
  it('result → prints entry result after submit', async () => {
    const root = makeTmpDir();
    const factory = makeFactory(root);
    await handleProcessSubmit('read sales orders', { root, kind: 'task', scopeDir: 'docs/' }, factory);

    const cap = captureOutput();
    try {
      await handleProcessResult('proc-test-1', { root }, factory);
    } finally {
      cap.restore();
    }
    const combined = cap.lines.join('');
    expect(combined).toContain('proc-test-1');
    expect(combined).toContain('result:');
  });

  it('result with invalid executionId → prints not_found message', async () => {
    const root = makeTmpDir();
    const factory = makeFactory(root);
    const cap = captureOutput();
    try {
      await handleProcessResult('invalid-id-xyz', { root }, factory);
    } finally {
      cap.restore();
    }
    const combined = cap.lines.join('');
    expect(combined).toContain('invalid-id-xyz');
  });

  it('result with empty executionId → throws friendly error', async () => {
    const root = makeTmpDir();
    const factory = makeFactory(root);
    await expect(
      handleProcessResult('', { root }, factory),
    ).rejects.toThrow(/executionId is required/i);
  });
});
