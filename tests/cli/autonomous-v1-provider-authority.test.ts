import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BacklogEntry } from '../../src/orchestra/autonomous/backlog-types.js';
import { useSandboxHome } from '../helpers/sandbox-home.js';

const {
  bootstrapProvidersSpy,
  buildEngineRuntimeSpy,
  runAutonomousLoopSpy,
  openProviderAuthoritySpy,
  closeProviderAuthoritySpy,
  providerAuthorityHold,
  runTaskModeSpy,
  runSprintSpy,
  createExactExecutorSpy,
  exactExecuteSpy,
  state,
} = vi.hoisted(() => ({
  bootstrapProvidersSpy: vi.fn().mockResolvedValue({ registered: [], skipped: [] }),
  buildEngineRuntimeSpy: vi.fn(() => ({ deps: {}, approvalGate: {} })),
  runAutonomousLoopSpy: vi.fn().mockResolvedValue({ iterations: 1, reason: 'max-iterations' }),
  openProviderAuthoritySpy: vi.fn(),
  closeProviderAuthoritySpy: vi.fn(),
  providerAuthorityHold: {
    state: 'hold' as const,
    reasonCode: 'keyring_unavailable',
    authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
    retryable: false,
    close: vi.fn(),
  },
  runTaskModeSpy: vi.fn().mockResolvedValue({
    taskId: 'threaded-task',
    backend: 'docker',
    provider: 'claude',
    projectRoot: '/fixture',
  }),
  runSprintSpy: vi.fn().mockResolvedValue({}),
  createExactExecutorSpy: vi.fn(),
  exactExecuteSpy: vi.fn(),
  state: {
    configured: true,
    root: '',
  },
}));

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config.js')>();
  return {
    ...actual,
    loadConfig: vi.fn(async () => ({
      projectRoot: state.root,
      mode: 'balanced',
      modes: {
        balanced: {
          brain_model: 'claude-fable-5',
          default_model: 'claude-fable-5',
        },
      },
      spawn_backend: 'docker',
      autonomous: {
        enabled: true,
        engine: 'v1',
        interval_ms: 1,
      },
      ...(state.configured
        ? {
            provider_limit_authority: {
              parent: {
                scope: 'global',
                config: {},
              },
              project: null,
            },
          }
        : {}),
    })),
  };
});

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  return {
    ...actual,
    bootstrapProviders: bootstrapProvidersSpy,
  };
});

vi.mock('../../src/providers/provider-authority-runtime-bootstrap.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/providers/provider-authority-runtime-bootstrap.js')
  >();
  return {
    ...actual,
    openLocalProviderAuthorityRuntimeIfConfigured: (...args: unknown[]) => {
      openProviderAuthoritySpy(...args);
      if (!state.configured) return undefined;
      return {
        ...providerAuthorityHold,
        close: closeProviderAuthoritySpy,
      };
    },
  };
});

vi.mock('../../src/core/approval-authority-bootstrap.js', () => ({
  bootstrapApprovalAuthority: () => ({
    state: 'hold',
    reasonCode: 'approval_authority_not_configured',
    authorityEvidenceRef: 'approval-authority:test',
    retryable: false,
  }),
}));

vi.mock('../../src/orchestra/task-mode-runner.js', () => ({
  runTaskMode: (...args: unknown[]) => runTaskModeSpy(...args),
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  runSprint: (...args: unknown[]) => runSprintSpy(...args),
}));

// The v1 sprint path no longer hands buildEngineRuntime a bare `runSprint(root)`
// callback — it composes `executeSprint` from the canonical exact-sprint
// executor (createCanonicalExactSprintExecutor), whose `executeInProcess`
// closure is where the shared providerAuthority is threaded into the sprint
// lifecycle. Capture its deps so the test can drive executeInProcess directly.
vi.mock('../../src/orchestra/exact-plan-start-service.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/orchestra/exact-plan-start-service.js')
  >();
  return {
    ...actual,
    createCanonicalExactSprintExecutor: (deps: unknown) => {
      createExactExecutorSpy(deps);
      return { execute: exactExecuteSpy };
    },
  };
});

vi.mock('../../src/orchestra/autonomous/runtime-loop.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/orchestra/autonomous/runtime-loop.js')
  >();
  return {
    ...actual,
    buildEngineRuntime: buildEngineRuntimeSpy,
    runAutonomousLoop: runAutonomousLoopSpy,
  };
});

import { handleStart } from '../../src/cli/commands/autonomous.js';

const entry: BacklogEntry = {
  id: 'auto-v1-task',
  title: 'Bounded task',
  kind: 'task',
  spec: { description: 'inspect bounded scope', scopeDir: 'src/' },
  policy: 'auto',
  provider: 'claude',
  model: 'claude-fable-5',
  trigger: { type: 'one-off' },
  status: 'pending',
  lastRun: null,
  lastResult: null,
};

describe('autonomous-v1 provider authority process composition', () => {
  let root: string;
  const { beforeEach: sandboxBefore, afterEach: sandboxAfter } = useSandboxHome();

  beforeEach(sandboxBefore);
  afterEach(sandboxAfter);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'autonomous-v1-provider-authority-'));
    state.root = root;
    state.configured = true;
    bootstrapProvidersSpy.mockClear();
    buildEngineRuntimeSpy.mockClear();
    runAutonomousLoopSpy.mockClear();
    openProviderAuthoritySpy.mockClear();
    closeProviderAuthoritySpy.mockClear();
    runTaskModeSpy.mockClear();
    runSprintSpy.mockClear();
    createExactExecutorSpy.mockClear();
    exactExecuteSpy.mockClear();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('opens once, skips provider bootstrap, injects HOLD admission, and closes once', async () => {
    await handleStart({ root, lang: 'en', intervalMs: '1', maxIterations: '1' });

    expect(openProviderAuthoritySpy).toHaveBeenCalledOnce();
    expect(bootstrapProvidersSpy).not.toHaveBeenCalled();
    expect(closeProviderAuthoritySpy).toHaveBeenCalledOnce();

    const runtimeOptions = buildEngineRuntimeSpy.mock.calls[0]?.[0] as {
      admitProviderExecution?: (candidate: BacklogEntry) => unknown;
      runTask: (ctx: Record<string, unknown>) => Promise<unknown>;
      executeSprint: unknown;
    };
    // buildEngineRuntime now receives the canonical exact-sprint executor's
    // `execute` as `executeSprint` (the bare `runSprint(root)` option is gone).
    expect(runtimeOptions.executeSprint).toBe(exactExecuteSpy);
    expect(runtimeOptions.admitProviderExecution).toBeTypeOf('function');
    expect(runtimeOptions.admitProviderExecution?.(entry)).toMatchObject({
      decision: 'hold',
      hold: {
        schemaVersion: 1,
        executionId: entry.id,
        tenantId: 'local',
        projectId: null,
        reasonCode: 'keyring_unavailable',
        authorityEvidenceRefs: [
          `provider-authority:${'a'.repeat(64)}`,
          expect.stringMatching(/^provider-execution-ingress:/),
        ],
      },
    });

    await runtimeOptions.runTask({
      description: 'thread authority',
      projectRoot: root,
    });
    // Drive the sprint side through the executor deps the CLI composed: its
    // `executeInProcess` closure is where providerAuthority reaches the real
    // sprint lifecycle (the mocked sprint-controller runSprint).
    const executorDeps = createExactExecutorSpy.mock.calls[0]?.[0] as {
      executeInProcess: (context: Record<string, unknown>) => Promise<unknown>;
    };
    await executorDeps.executeInProcess({
      projectRoot: root,
      config: { mode: 'balanced' },
      sprint: { id: 'sprint-fixture' },
      exactRef: { schemaVersion: 1, flowId: 'flow-fixture', revision: 1, planDigest: 'digest-fixture' },
      snapshot: {},
      onExactPlanMaterialize: () => {},
      onExecutionAdmitted: () => {},
    });
    const taskAuthority = (runTaskModeSpy.mock.calls[0]?.[0] as {
      providerAuthority?: unknown;
    }).providerAuthority;
    const sprintAuthority = (runSprintSpy.mock.calls[0]?.[2] as {
      providerAuthority?: unknown;
    }).providerAuthority;
    expect(taskAuthority).toBe(sprintAuthority);
    expect(taskAuthority).toMatchObject({
      state: 'hold',
      reasonCode: 'keyring_unavailable',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
    });
  });

  it('preserves prior v1 bootstrap behavior when no owner-authored authority is configured', async () => {
    state.configured = false;

    await handleStart({ root, lang: 'en', intervalMs: '1', maxIterations: '1' });

    expect(openProviderAuthoritySpy).toHaveBeenCalledOnce();
    expect(bootstrapProvidersSpy).toHaveBeenCalledOnce();
    expect(closeProviderAuthoritySpy).not.toHaveBeenCalled();
    expect(buildEngineRuntimeSpy.mock.calls[0]?.[0]).not.toHaveProperty('admitProviderExecution');
  });
});
