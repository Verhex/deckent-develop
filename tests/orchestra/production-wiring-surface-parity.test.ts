import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeProcessController } from '../../src/orchestra/process-controller.js';
import { buildEngineRuntime } from '../../src/orchestra/autonomous/runtime-loop.js';
import type { CanonicalExactSprintExecutionOutcome } from '../../src/orchestra/exact-plan-start-service.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-wiring-parity-'));
  roots.push(value);
  return value;
}

function config(): ResolvedConfig {
  return {
    projectName: 'parity',
    maxWorkers: 1,
    enforce_rbac: false,
    risk_gate_enabled: false,
  } as ResolvedConfig;
}

function blocked(): CanonicalExactSprintExecutionOutcome {
  return {
    status: 'settled',
    exactRef: { schemaVersion: 1, flowId: 'flow-parity', revision: 1, planDigest: 'digest' },
    attempt: { settlement: { state: 'BLOCKED', code: 'STAGED_CLOSURE_BLOCKED', settledAt: '2026-07-31T00:00:00.000Z' } },
    handle: { kind: 'pid', pid: 42 },
    settlement: { state: 'BLOCKED', code: 'STAGED_CLOSURE_BLOCKED', settledAt: '2026-07-31T00:00:00.000Z' },
  } as CanonicalExactSprintExecutionOutcome;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('production wiring settlement surface parity', () => {
  it('Process/Do preserves the canonical outer-barrier BLOCKED outcome as held', async () => {
    const projectRoot = root();
    const executeSprint = vi.fn(async () => blocked());
    const controller = makeProcessController({
      projectRoot,
      config: config(),
      backlogPath: join(projectRoot, 'backlog.json'),
      idGen: () => 'process-parity',
      executeSprint,
      runTask: vi.fn(),
      waitForResult: vi.fn(),
    });

    const result = await controller.submit({
      description: 'run exact governed work',
      kind: 'sprint',
      origin: 'api',
      correlationId: 'correlation-parity',
    });

    expect(executeSprint).toHaveBeenCalledOnce();
    expect(result).toEqual({
      executionId: 'process-parity',
      status: 'held',
      reason: 'STAGED_CLOSURE_BLOCKED',
    });
    expect(controller.status('process-parity')).toMatchObject({
      status: 'parked',
      lastResult: { ok: false, reason: 'STAGED_CLOSURE_BLOCKED' },
    });
  });

  it('Autonomous preserves the canonical outer-barrier BLOCKED outcome as parked', async () => {
    const projectRoot = root();
    const backlogPath = join(projectRoot, 'backlog.json');
    const executeSprint = vi.fn(async () => blocked());
    const entry = {
      id: 'autonomous-parity',
      title: 'governed work',
      kind: 'sprint' as const,
      spec: { intent: 'run exact governed work' },
      policy: 'auto' as const,
      trigger: { type: 'one-off' as const },
      status: 'pending' as const,
      origin: 'autonomous' as const,
      correlationId: 'autonomous-correlation',
      lastRun: null,
      lastResult: null,
    };
    writeFileSync(backlogPath, JSON.stringify({ _version: '1', entries: [entry] }));
    const runtime = buildEngineRuntime({
      projectRoot,
      config: config(),
      backlogPath,
      flows: [],
      policy: { enabled: true, allowedTriggers: ['manual'] },
      executeSprint,
      runTask: vi.fn(),
      waitForResult: vi.fn(),
    });

    const action = await runtime.deps.executor.execute({
      id: 'trigger-parity',
      source: 'backlog',
      action: 'autonomous.execute',
      requestedBy: 'system',
      payload: { entry },
    });

    expect(executeSprint).toHaveBeenCalledOnce();
    expect(action).toMatchObject({ ok: false, error: 'STAGED_CLOSURE_BLOCKED' });
  });
});
