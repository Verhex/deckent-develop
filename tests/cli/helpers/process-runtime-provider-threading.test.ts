import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {
  capturedControllerDeps,
  capturedExecutorDeps,
  providerAuthority,
  runTaskMode,
  runSprint,
} = vi.hoisted(() => ({
  capturedControllerDeps: { current: null as Record<string, unknown> | null },
  capturedExecutorDeps: { current: null as Record<string, unknown> | null },
  providerAuthority: {
    state: 'hold' as const,
    reasonCode: 'keyring_unavailable',
    authorityEvidenceRef: `provider-authority:${'b'.repeat(64)}`,
    retryable: false,
    close: vi.fn(),
  },
  runTaskMode: vi.fn().mockResolvedValue({
    taskId: 'process-task',
    backend: 'docker',
    provider: 'claude',
    projectRoot: '/fixture',
  }),
  runSprint: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    deckent_style: 'process',
    autonomous: { backlog_path: '.deckent/autonomous/backlog.json' },
  }),
}));

vi.mock('../../../src/providers/provider-authority-runtime-bootstrap.js', () => ({
  openLocalProviderAuthorityRuntime: vi.fn(() => providerAuthority),
}));

vi.mock('../../../src/core/approval-authority-bootstrap.js', () => ({
  bootstrapApprovalAuthority: vi.fn(() => ({
    state: 'hold',
    reasonCode: 'approval_authority_not_configured',
    authorityEvidenceRef: 'approval-authority:test',
  })),
}));

vi.mock('../../../src/core/capability-runtime.js', () => ({
  createAuditedCapabilityRegistry: vi.fn(() => ({ invoke: vi.fn() })),
}));

vi.mock('../../../src/core/erp/index.js', () => ({
  buildErpConnectorFromConfig: vi.fn(() => undefined),
}));

vi.mock('../../../src/core/audit-writer.js', () => ({
  writeAuditEvent: vi.fn(),
}));

vi.mock('../../../src/orchestra/task-mode-runner.js', () => ({
  runTaskMode: (...args: unknown[]) => runTaskMode(...args),
}));

vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  runSprint: (...args: unknown[]) => runSprint(...args),
}));

vi.mock('../../../src/cli/commands/run.js', () => ({
  waitForRunResult: vi.fn(),
}));

vi.mock('../../../src/orchestra/process-controller.js', () => ({
  makeProcessController: vi.fn((deps: Record<string, unknown>) => {
    capturedControllerDeps.current = deps;
    return { close: deps.close };
  }),
}));

// The sprint side is now wired through the canonical exact-sprint executor
// (executeSprint), not a direct runSprint dep — capture the executor deps so
// the test can drive its in-process runtime seam directly.
vi.mock('../../../src/orchestra/exact-plan-start-service.js', () => ({
  createCanonicalExactSprintExecutor: vi.fn((deps: Record<string, unknown>) => {
    capturedExecutorDeps.current = deps;
    return { execute: vi.fn() };
  }),
}));

vi.mock('../../../src/orchestra/run-diff-service.js', () => ({
  captureGitBase: vi.fn().mockResolvedValue(undefined),
}));

import { buildProcessController } from '../../../src/cli/helpers/process-runtime.js';

describe('buildProcessController provider-authority runner threading', () => {
  let root: string | undefined;

  afterEach(() => {
    vi.clearAllMocks();
    capturedControllerDeps.current = null;
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('passes the exact process-scoped authority to task and sprint runners', async () => {
    root = mkdtempSync(join(tmpdir(), 'process-provider-threading-'));
    const controller = await buildProcessController(root);
    const deps = capturedControllerDeps.current as {
      runTask: (ctx: Record<string, unknown>) => Promise<unknown>;
      executeSprint: unknown;
    };

    await deps.runTask({ description: 'thread task', projectRoot: root });

    expect(runTaskMode.mock.calls[0]?.[0]).toMatchObject({
      providerAuthority,
    });

    // Sprint side: the controller wires the canonical exact-sprint executor;
    // its in-process runtime must thread the SAME process-scoped authority
    // into the sprint lifecycle's third (options) argument.
    expect(deps.executeSprint).toBeDefined();
    const executorDeps = capturedExecutorDeps.current as {
      executeInProcess: (context: Record<string, unknown>) => Promise<unknown>;
    };
    await executorDeps.executeInProcess({
      projectRoot: root,
      config: {},
      exactRef: { schemaVersion: 1, flowId: 'flow-thread', revision: 1, planDigest: 'a'.repeat(64) },
      snapshot: {},
      sprint: { id: 'sprint-thread' },
      onExactPlanMaterialize: () => ({}),
      onExecutionAdmitted: () => {},
    });
    expect(runSprint.mock.calls[0]?.[2]).toMatchObject({
      providerAuthority,
    });

    (controller.close as () => void)();
    expect(providerAuthority.close).toHaveBeenCalledOnce();
  });
});
