import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  authorityClose,
  openAuthority,
  runSprint,
  runTask,
  waitForResult,
  capabilityInvoke,
  providerBootstrap,
} = vi.hoisted(() => ({
  authorityClose: vi.fn(),
  openAuthority: vi.fn(),
  runSprint: vi.fn(),
  runTask: vi.fn(),
  waitForResult: vi.fn(),
  capabilityInvoke: vi.fn(),
  providerBootstrap: vi.fn(),
}));

vi.mock('../../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/provider.js')>();
  return {
    ...actual,
    bootstrapProviders: providerBootstrap,
  };
});

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    deckent_style: 'process',
    autonomous: { backlog_path: '.deckent/autonomous/backlog.json' },
  }),
}));

vi.mock('../../../src/providers/provider-authority-runtime-bootstrap.js', () => ({
  openLocalProviderAuthorityRuntime: openAuthority,
}));

vi.mock('../../../src/core/approval-authority-bootstrap.js', () => ({
  bootstrapApprovalAuthority: vi.fn().mockReturnValue({
    state: 'hold',
    reasonCode: 'policy_unavailable',
    authorityEvidenceRef: 'approval-authority:hold',
  }),
}));

vi.mock('../../../src/core/capability-runtime.js', () => ({
  createAuditedCapabilityRegistry: vi.fn().mockReturnValue({
    invoke: capabilityInvoke,
  }),
}));

vi.mock('../../../src/core/erp/index.js', () => ({
  buildErpConnectorFromConfig: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../../src/core/audit-writer.js', () => ({
  writeAuditEvent: vi.fn(),
}));

vi.mock('../../../src/orchestra/task-mode-runner.js', () => ({
  runTaskMode: runTask,
}));

vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  runSprint,
}));

vi.mock('../../../src/cli/commands/run.js', () => ({
  waitForRunResult: waitForResult,
}));

import { buildProcessController } from '../../../src/cli/helpers/process-runtime.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'process-provider-authority-'));
  roots.push(value);
  return value;
}

afterEach(() => {
  vi.clearAllMocks();
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('buildProcessController provider authority', () => {
  it('persists a typed HOLD before task/sprint/provider bootstrap side effects', async () => {
    openAuthority.mockReturnValue({
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      close: authorityClose,
    });
    const projectRoot = root();
    const controller = await buildProcessController(projectRoot);

    const result = await controller.submit({
      description: 'summarize docs',
      kind: 'task',
      scopeDir: 'docs/',
      tenant: 'tenant-a',
    });

    expect(result).toMatchObject({
      status: 'held',
      providerAuthorityHold: {
        executionId: result.executionId,
        tenantId: 'tenant-a',
        projectId: null,
        reasonCode: 'policy_authority_unavailable',
        authorityEvidenceRefs: [`provider-authority:${'a'.repeat(64)}`],
      },
    });
    expect(runTask).not.toHaveBeenCalled();
    expect(runSprint).not.toHaveBeenCalled();
    expect(providerBootstrap).not.toHaveBeenCalled();
    const backlog = JSON.parse(readFileSync(
      join(projectRoot, '.deckent', 'autonomous', 'backlog.json'),
      'utf8',
    )) as {
      entries: Array<{
        status: string;
        lastResult: { providerAuthorityHold?: { executionId: string } };
      }>;
    };
    expect(backlog.entries[0]).toMatchObject({
      status: 'parked',
      lastResult: {
        providerAuthorityHold: {
          executionId: result.executionId,
        },
      },
    });

    controller.close();
    expect(authorityClose).toHaveBeenCalledOnce();
  });

  it('keeps provider-free capability execution available', async () => {
    openAuthority.mockReturnValue({
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      authorityEvidenceRef: `provider-authority:${'b'.repeat(64)}`,
      close: authorityClose,
    });
    capabilityInvoke.mockResolvedValue({
      ok: true,
      capability: 'erp.read',
      handler: 'fixture',
      value: [],
    });
    const controller = await buildProcessController(root());

    const result = await controller.submit({
      description: 'read orders',
      kind: 'capability',
      capabilityTarget: { capability: 'erp.read' },
    });

    expect(result.status).toBe('completed');
    expect(capabilityInvoke).toHaveBeenCalledOnce();
    expect(runTask).not.toHaveBeenCalled();
    expect(runSprint).not.toHaveBeenCalled();
    controller.close();
  });

  it('does not treat a ready runtime without an exact candidate as an execution permit', async () => {
    openAuthority.mockReturnValue({
      state: 'ready',
      projectId: 'project-ready',
      authorityEvidenceRef: `provider-authority:${'c'.repeat(64)}`,
      service: {},
      close: authorityClose,
    });
    const controller = await buildProcessController(root());

    const result = await controller.submit({
      description: 'summarize docs',
      kind: 'task',
      scopeDir: 'docs/',
    });

    expect(result).toMatchObject({
      status: 'held',
      providerAuthorityHold: {
        projectId: 'project-ready',
        reasonCode: 'candidate_authority_unavailable',
        authorityEvidenceRefs: [`provider-authority:${'c'.repeat(64)}`],
      },
    });
    expect(runTask).not.toHaveBeenCalled();
    expect(runSprint).not.toHaveBeenCalled();
    expect(providerBootstrap).not.toHaveBeenCalled();
    controller.close();
  });
});
