import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SelfAuditAdapterRegistry } from '../../src/core/self-audit-adapter.js';
import type { SelfAuditAdapter } from '../../src/core/self-audit-adapter.js';
import { VitestSelfAuditAdapter } from '../../src/core/self-audit-vitest-adapter.js';
import {
  createDefaultSelfAuditRegistry,
  resolveSelfAuditEcosystem,
  runSelfAuditGate,
} from '../../src/orchestra/sprint-finalizer.js';
import type {
  ScopedSelfAuditManifest,
  SelfAuditGateOptions,
} from '../../src/orchestra/sprint-finalizer.js';

const MANIFEST: ScopedSelfAuditManifest = {
  testFiles: ['tests/a.test.ts', 'tests/b.spec.ts'],
  requiresTests: true,
  requiresTypeScript: false,
  evidenceRefs: ['task-scope:a'],
};

function vitestRegistry(available = true): SelfAuditAdapterRegistry {
  const registry = new SelfAuditAdapterRegistry();
  registry.register(new VitestSelfAuditAdapter(() => available));
  return registry;
}

function scopedRun(
  projectRoot: string,
  options: Partial<SelfAuditGateOptions>,
): ReturnType<typeof runSelfAuditGate> {
  return runSelfAuditGate('sprint-487', projectRoot, {
    scopedManifest: MANIFEST,
    selfAuditEcosystem: 'vitest',
    selfAuditRegistry: vitestRegistry(),
    runTsc: () => ({ status: 0, stdout: '', stderr: '' }),
    honestyResults: [],
    ...options,
  });
}

describe('finalizer self-audit adapter consumer', () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function root(): string {
    const value = mkdtempSync(join(tmpdir(), 'deckent-audit-wire-'));
    roots.push(value);
    mkdirSync(join(value, '.tasks'), { recursive: true });
    return value;
  }

  it('executes the scoped surface through the registry adapter invocation verbatim', async () => {
    const projectRoot = root();
    const calls: Array<{ command: string; args: readonly string[]; cwd: string; timeoutMs: number }> = [];

    const audit = await scopedRun(projectRoot, {
      runScopedCommand: async (command, args, cwd, timeoutMs) => {
        calls.push({ command, args, cwd, timeoutMs });
        return {
          status: 0,
          stdout: 'Test Files  2 passed (2)\nTests  5 passed | 1 skipped (6)\n',
          stderr: '',
          timedOut: false,
        };
      },
    });

    // The adapter — not the finalizer — owns the argv.
    expect(calls).toEqual([{
      command: 'npx',
      args: ['vitest', 'run', 'tests/a.test.ts', 'tests/b.spec.ts'],
      cwd: projectRoot,
      timeoutMs: 120_000,
    }]);
    expect(audit.vitest.status).toBe('PASS');
    expect(audit.vitest.delta).toEqual({ files: 2, pass: 5, fail: 0, skipped: 1 });
    expect(audit.vitest.execution).toMatchObject({
      mode: 'scoped',
      command: ['npx', 'vitest', 'run', 'tests/a.test.ts', 'tests/b.spec.ts'],
      testFiles: MANIFEST.testFiles,
      executed: true,
      timedOut: false,
      exitCode: 0,
      adapterId: 'vitest',
    });
    expect(audit.vitest.execution?.outputDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(audit.overallGate).toBe('PASS');
  });

  it('propagates a failing adapter outcome as a gate failure with executed evidence', async () => {
    const audit = await scopedRun(root(), {
      runScopedCommand: async () => ({
        status: 1,
        stdout: 'Test Files  1 failed | 1 passed (2)\nTests  1 failed | 3 passed (4)\n',
        stderr: '',
        timedOut: false,
      }),
    });

    expect(audit.vitest.status).toBe('FAIL');
    expect(audit.vitest.delta).toEqual({ files: 2, pass: 3, fail: 1, skipped: 0 });
    expect(audit.vitest.execution).toMatchObject({ executed: true, exitCode: 1, adapterId: 'vitest' });
    expect(audit.overallGate).toBe('GATE_FAILURE');
  });

  it('holds — never greens — a project type no registered adapter supports', async () => {
    const runner = vi.fn();
    const audit = await scopedRun(root(), {
      selfAuditEcosystem: 'pytest',
      runScopedCommand: runner,
    });

    expect(runner).not.toHaveBeenCalled();
    expect(audit.vitest.status).toBe('FAIL');
    expect(audit.vitest.execution).toMatchObject({
      executed: false,
      exitCode: null,
      reasonCode: 'ECOSYSTEM_UNSUPPORTED',
    });
    expect(audit.vitest.execution?.holdDetail).toContain('pytest');
    expect(audit.overallGate).toBe('GATE_FAILURE');
  });

  it('holds when the supporting adapter is unavailable on this host', async () => {
    const runner = vi.fn();
    const audit = await scopedRun(root(), {
      selfAuditRegistry: vitestRegistry(false),
      runScopedCommand: runner,
    });

    expect(runner).not.toHaveBeenCalled();
    expect(audit.vitest.execution).toMatchObject({
      executed: false,
      reasonCode: 'ADAPTER_HOLD',
      adapterId: 'vitest',
    });
    expect(audit.vitest.execution?.holdDetail).toContain('adapter-unavailable');
    expect(audit.overallGate).toBe('GATE_FAILURE');
  });

  it('keeps timeout and missing-evidence holds typed and fail-closed', async () => {
    const timedOut = await scopedRun(root(), {
      runScopedCommand: async () => ({ status: null, stdout: '', stderr: '', timedOut: true }),
    });
    const emptySuccess = await scopedRun(root(), {
      runScopedCommand: async () => ({ status: 0, stdout: '', stderr: '', timedOut: false }),
    });

    expect(timedOut.vitest).toMatchObject({
      status: 'FAIL',
      execution: { timedOut: true, executed: false, reasonCode: 'ADAPTER_HOLD' },
    });
    expect(emptySuccess.vitest).toMatchObject({
      status: 'FAIL',
      execution: { executed: false, reasonCode: 'EXECUTION_EVIDENCE_UNPARSEABLE' },
    });
  });

  it('leaves the explicit full-authority audit surface off the scoped registry path', async () => {
    const registry = vitestRegistry();
    const registryRun = vi.spyOn(registry, 'run');

    const audit = await runSelfAuditGate('sprint-487', root(), {
      selfAuditRegistry: registry,
      runTsc: () => ({ status: 0, stdout: '', stderr: '' }),
      runVitest: () => ({
        status: 0,
        stdout: 'Test Files  10 passed (10)\nTests  40 passed (40)\n',
        stderr: '',
      }),
      honestyResults: [],
    });

    expect(registryRun).not.toHaveBeenCalled();
    expect(audit.vitest.status).toBe('PASS');
    expect(audit.vitest.execution).toBeUndefined();
    expect(audit.overallGate).toBe('PASS');
  });

  it('resolves an undetectable stack to an ecosystem the shipped registry refuses', () => {
    const ecosystem = resolveSelfAuditEcosystem(root());

    expect(ecosystem).toBe('unknown');
    expect(createDefaultSelfAuditRegistry().resolve(ecosystem)).toBeUndefined();
  });

  it('ships a default registry that resolves the vitest ecosystem', () => {
    const adapter: SelfAuditAdapter | undefined = createDefaultSelfAuditRegistry().resolve('vitest');

    expect(adapter?.id).toBe('vitest');
  });
});
