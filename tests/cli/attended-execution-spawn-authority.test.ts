import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const backendSpawn = vi.hoisted(() => vi.fn());
const backendState = vi.hoisted(() => ({
  name: 'subprocess',
  landingCapability: 'unsupported' as 'unsupported' | 'checkpoint-stop',
}));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendError: class SpawnBackendError extends Error {
    constructor(message: string, public readonly backendName: string) {
      super(message);
    }
  },
  SpawnBackendFactory: {
    create: vi.fn(() => ({
      get name() { return backendState.name; },
      liveUsageBudgetSupport: 'measured-stream',
      get executionLandingCapability() { return backendState.landingCapability; },
      spawn: backendSpawn,
      kill: vi.fn(),
      list: vi.fn(() => []),
      isAvailable: vi.fn(async () => true),
    })),
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-utils.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    isAdapterProvider: vi.fn(() => false),
    getProviderAdapterForTask: vi.fn(() => null),
  };
});

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  type ApprovalDecisionIntegrityAuthority,
  type LiveApprovalAuthentication,
  type LiveApprovalAuthenticator,
  type LiveApprovalSessionProof,
} from '../../src/core/approval-decision-ingress.js';
import {
  AttendedExecutionApprovalAuthority,
  attendedExecutionProjectId,
  createAttendedExecutionApprovalBinding,
} from '../../src/core/attended-execution-approval.js';
import { spawnWorkerMultiProvider } from '../../src/cli/commands/spawn.js';
import { createAttendedExecutionProposalDigests } from '../../src/core/attended-execution-proposal.js';

const NOW = new Date('2026-07-24T10:00:00.000Z');
const KEY = Buffer.from('attended-spawn-authority-test-key');
const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function proposalMaterial(taskId: string, model: string) {
  return {
    task: { id: taskId, model },
    prompt: 'bounded prompt',
    scope: { filesRead: [] as string[], filesWrite: [] as string[] },
    acceptance: { goCriteria: 'exact dispatch', noGoCriteria: 'drift' },
  };
}

class TestIntegrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return { keyId: 'test-key', mac: createHmac('sha256', KEY).update(payload).digest('hex') };
  }

  verify(keyId: string, payload: string, mac: string): boolean {
    if (keyId !== 'test-key' || !/^[a-f0-9]{64}$/u.test(mac)) return false;
    const expected = this.sign(payload).mac;
    return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'));
  }
}

class TestAuthenticator implements LiveApprovalAuthenticator {
  readonly identity: LiveApprovalAuthentication = {
    actorId: 'owner-a',
    tenantId: 'tenant-a',
    role: 'owner',
    sessionRef: 'test-session',
    authorityRef: 'test-live-session:v1',
    authenticatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
  };

  async reauthenticate() {
    return this.identity;
  }

  isSessionActive(proof: LiveApprovalSessionProof): boolean {
    return proof.actorId === this.identity.actorId
      && proof.tenantId === this.identity.tenantId
      && proof.authorityRef === this.identity.authorityRef
      && proof.sessionRefHash === createHash('sha256').update(this.identity.sessionRef).digest('hex');
  }
}

afterEach(() => {
  backendSpawn.mockReset();
  backendState.name = 'subprocess';
  backendState.landingCapability = 'unsupported';
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('spawnWorkerMultiProvider attended execution authority', () => {
  it('verifies and consumes the exact live-session receipt immediately before backend.spawn', async () => {
    const base = mkdtempSync(join(tmpdir(), 'attended-spawn-'));
    roots.push(base);
    const root = join(base, 'project');
    mkdirSync(root, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');
    const broker = new ApprovalBroker(root, { storeDir: join(base, 'broker') });
    const authenticator = new TestAuthenticator();
    const integrity = new TestIntegrity();
    const authority = new AttendedExecutionApprovalAuthority(
      root,
      broker,
      new ApprovalDecisionAuthority(integrity, authenticator),
      { receiptStoreDir: join(base, 'receipts'), now: () => NOW },
    );
    const binding = createAttendedExecutionApprovalBinding({
      ...createAttendedExecutionProposalDigests(proposalMaterial('task-a', 'gpt-4.1')),
      tenantId: 'tenant-a',
      projectId: attendedExecutionProjectId(root),
      runId: 'run-a',
      taskId: 'task-a',
      attemptId: '123e4567-e89b-42d3-a456-426614174001',
      provider: 'codex',
      model: 'gpt-4.1',
      backend: 'subprocess',
      budget: { maxTurns: 2 },
      policy: {
        profileRef: 'execution_budget.roles.worker.default',
        policyDigest: 'b'.repeat(64),
        landing: { reserve_ratio: 0.25, attended_unsupported: 'allow-hard-stop' },
      },
      expiresAt: new Date(NOW.getTime() + 120_000).toISOString(),
    });
    const request = authority.submit({
      requester: { role: 'brain', instanceId: 'run-a' },
      userId: 'owner-a',
      summary: 'Approve exact attended subprocess attempt',
      binding,
      createdAt: new Date(NOW.getTime() - 1_000).toISOString(),
    });
    const ingress = new ApprovalDecisionIngress({
      broker,
      authenticator,
      integrity,
      channel: 'terminal',
      now: () => NOW,
    });
    expect((await ingress.decide({
      requestId: request.id,
      action: 'allow',
      idempotencyKey: 'allow-run-a',
    })).kind).toBe('decided');

    await expect(spawnWorkerMultiProvider(
      'task-a',
      'gpt-4.1',
      'regenerated prompt',
      root,
      {
        provider: 'codex',
        spawnBackend: 'subprocess',
        executionBudget: binding.budget,
        executionLandingPolicy: binding.policy.landing,
        executionBudgetProfileRef: binding.policy.profileRef,
        executionBudgetPolicyDigest: binding.policy.policyDigest,
        executionAdmissionMode: 'attended',
        executionApprovalEvidenceRef: request.id,
        executionApprovalProposal: binding,
        executionApprovalMaterial: {
          ...proposalMaterial('task-a', 'gpt-4.1'),
          prompt: 'regenerated prompt',
        },
        attendedExecutionApprovalAuthority: authority,
        executionTenantId: 'tenant-a',
        executionRunId: 'run-a',
      },
    )).rejects.toThrow('promptDigest does not match');
    expect(backendSpawn).not.toHaveBeenCalled();

    await expect(spawnWorkerMultiProvider(
      'task-a',
      'gpt-4.1',
      'bounded prompt',
      root,
      {
        provider: 'codex',
        spawnBackend: 'subprocess',
        executionBudget: binding.budget,
        executionLandingPolicy: binding.policy.landing,
        executionBudgetProfileRef: binding.policy.profileRef,
        executionBudgetPolicyDigest: binding.policy.policyDigest,
        executionAdmissionMode: 'attended',
        executionApprovalEvidenceRef: request.id,
        executionApprovalProposal: binding,
        executionApprovalMaterial: proposalMaterial('task-a', 'gpt-4.1'),
        attendedExecutionApprovalAuthority: authority,
        executionTenantId: 'tenant-a',
        executionRunId: 'run-a',
      },
    )).resolves.toMatchObject({ backend: 'subprocess', provider: 'codex' });
    expect(backendSpawn).toHaveBeenCalledOnce();

    await expect(spawnWorkerMultiProvider(
      'task-a',
      'gpt-4.1',
      'bounded prompt',
      root,
      {
        provider: 'codex',
        spawnBackend: 'subprocess',
        executionBudget: binding.budget,
        executionLandingPolicy: binding.policy.landing,
        executionBudgetProfileRef: binding.policy.profileRef,
        executionBudgetPolicyDigest: binding.policy.policyDigest,
        executionAdmissionMode: 'attended',
        executionApprovalEvidenceRef: request.id,
        executionApprovalProposal: binding,
        executionApprovalMaterial: proposalMaterial('task-a', 'gpt-4.1'),
        attendedExecutionApprovalAuthority: authority,
        executionTenantId: 'tenant-a',
        executionRunId: 'run-a',
      },
    )).rejects.toThrow('already consumed');
    expect(backendSpawn).toHaveBeenCalledOnce();
  });

  it('uses the approved attempt identity for Docker settlement instead of minting a second attempt', async () => {
    backendState.name = 'docker';
    const base = mkdtempSync(join(tmpdir(), 'attended-docker-spawn-'));
    roots.push(base);
    const root = join(base, 'project');
    mkdirSync(root, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');
    const broker = new ApprovalBroker(root, { storeDir: join(base, 'broker') });
    const authenticator = new TestAuthenticator();
    const integrity = new TestIntegrity();
    const authority = new AttendedExecutionApprovalAuthority(
      root,
      broker,
      new ApprovalDecisionAuthority(integrity, authenticator),
      { receiptStoreDir: join(base, 'receipts'), now: () => NOW },
    );
    const attemptId = '123e4567-e89b-42d3-a456-426614174002';
    const binding = createAttendedExecutionApprovalBinding({
      ...createAttendedExecutionProposalDigests(proposalMaterial('task-docker', 'gpt-4.1')),
      tenantId: 'tenant-a',
      projectId: attendedExecutionProjectId(root),
      runId: 'run-docker',
      taskId: 'task-docker',
      attemptId,
      provider: 'codex',
      model: 'gpt-4.1',
      backend: 'docker',
      budget: { maxTurns: 2 },
      policy: {
        profileRef: 'execution_budget.roles.worker.default',
        policyDigest: 'd'.repeat(64),
        landing: { reserve_ratio: 0.25, attended_unsupported: 'allow-hard-stop' },
      },
      expiresAt: new Date(NOW.getTime() + 120_000).toISOString(),
    });
    const request = authority.submit({
      requester: { role: 'brain', instanceId: 'run-docker' },
      userId: 'owner-a',
      summary: 'Approve exact attended Docker attempt',
      binding,
      createdAt: new Date(NOW.getTime() - 1_000).toISOString(),
    });
    const ingress = new ApprovalDecisionIngress({
      broker,
      authenticator,
      integrity,
      channel: 'terminal',
      now: () => NOW,
    });
    await ingress.decide({
      requestId: request.id,
      action: 'allow',
      idempotencyKey: 'allow-run-docker',
    });

    const result = await spawnWorkerMultiProvider(
      'task-docker',
      'gpt-4.1',
      'bounded prompt',
      root,
      {
        provider: 'codex',
        spawnBackend: 'docker',
        executionBudget: binding.budget,
        executionLandingPolicy: binding.policy.landing,
        executionBudgetProfileRef: binding.policy.profileRef,
        executionBudgetPolicyDigest: binding.policy.policyDigest,
        executionAdmissionMode: 'attended',
        executionApprovalEvidenceRef: request.id,
        executionApprovalProposal: binding,
        executionApprovalMaterial: proposalMaterial('task-docker', 'gpt-4.1'),
        attendedExecutionApprovalAuthority: authority,
        executionTenantId: 'tenant-a',
        executionRunId: 'run-docker',
      },
    );

    expect(result.settlementRef?.attemptId).toBe(attemptId);
    expect(backendSpawn).toHaveBeenCalledWith(
      'task-docker',
      'gpt-4.1',
      'bounded prompt',
      expect.objectContaining({
        settlementRef: expect.objectContaining({ attemptId }),
        executionApprovalGrant: expect.any(Object),
      }),
    );
  });
});
