import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  openApprovalAuthorityRuntime,
} from '../../src/core/approval-authority-runtime.js';
import {
  attendedExecutionProjectId,
  createAttendedExecutionApprovalBinding,
} from '../../src/core/attended-execution-approval.js';
import {
  createPinnedApprovalOidcVerifier,
  type ApprovalOidcPolicy,
} from '../../src/core/approval-oidc-authenticator.js';
import { createAttendedExecutionProposalDigests } from '../../src/core/attended-execution-proposal.js';
import {
  signHs256Jwt,
  writeApprovalAuthorityFixtureRevision,
} from '../helpers/approval-authority-fixture.js';

const roots: string[] = [];
const now = new Date('2026-07-25T00:10:00.000Z');
const nowSeconds = Math.floor(now.getTime() / 1000);
const oidcSecret = 'approval-runtime-oidc-secret';

function fixture(): { base: string; projectRoot: string; hostRoot: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-approval-runtime-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const hostRoot = join(base, 'host');
  mkdirSync(projectRoot, { recursive: true });
  return { base, projectRoot, hostRoot };
}

function provision(hostRoot: string): void {
  writeApprovalAuthorityFixtureRevision({
    dataDir: hostRoot,
    revision: 1,
    previousRevisionHash: null,
    activeKeyId: 'approval-key-0001',
    keys: [{
      keyId: 'approval-key-0001',
      status: 'active',
      createdAt: '2026-07-25T00:00:00.000Z',
      retiredAt: null,
      keyMaterialHex: '88'.repeat(32),
    }],
  });
}

function policy(): ApprovalOidcPolicy {
  return {
    authorityRef: 'oidc:https://issuer.example:deckent-api',
    issuer: 'https://issuer.example',
    audience: 'deckent-api',
    tenantClaim: 'tenant_id',
    roleClaim: 'role',
    maxAuthAgeSeconds: 300,
    maxSessionSeconds: 120,
    requiredAcr: ['urn:mfa'],
    requiredAmr: ['pwd', 'mfa'],
  };
}

function verifier() {
  return createPinnedApprovalOidcVerifier({
    authorityRef: policy().authorityRef,
    verifyOptions: {
      issuer: policy().issuer,
      audience: 'deckent-api',
      algorithms: ['HS256'],
      hs256Secret: oidcSecret,
    },
  });
}

function token(overrides: Record<string, unknown> = {}): string {
  return signHs256Jwt({
    iss: policy().issuer,
    aud: 'deckent-api',
    sub: 'owner-a',
    tenant_id: 'tenant-a',
    role: 'owner',
    auth_time: nowSeconds - 30,
    iat: nowSeconds - 30,
    exp: nowSeconds + 600,
    acr: 'urn:mfa',
    amr: ['pwd', 'mfa'],
    ...overrides,
  }, oidcSecret);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ApprovalAuthorityRuntimeService', () => {
  it('reopens one durable OIDC decision and validates the exact attended dispatch after restart', async () => {
    const { projectRoot, hostRoot } = fixture();
    provision(hostRoot);
    const env = { DECKENT_HOME: hostRoot };
    const opened = openApprovalAuthorityRuntime({
      projectRoot,
      tenantId: 'tenant-a',
      platform: 'linux',
      env,
      now: () => now,
    });
    expect(opened.state).toBe('ready');
    if (opened.state !== 'ready') throw new Error(opened.reasonCode);
    const expectedBase = {
      tenantId: 'tenant-a',
      projectId: attendedExecutionProjectId(projectRoot),
      runId: 'run-a',
      taskId: 'task-a',
      provider: 'claude',
      model: 'claude-fable-5',
      backend: 'subprocess',
      budget: { maxCacheReadTokens: 100_000, maxTurns: 4 },
      policy: {
        profileRef: 'execution_budget.roles.worker.default',
        policyDigest: 'a'.repeat(64),
        landing: {
          reserve_ratio: 0.25,
          attended_unsupported: 'allow-hard-stop' as const,
        },
      },
    };
    const proposalDigests = createAttendedExecutionProposalDigests({
      task: { id: 'task-a', model: 'claude-fable-5' },
      prompt: 'bounded prompt',
      scope: { filesRead: [], filesWrite: [] },
      acceptance: { goCriteria: 'exact dispatch', noGoCriteria: 'drift' },
    });
    const binding = createAttendedExecutionApprovalBinding({
      ...expectedBase,
      ...proposalDigests,
      attemptId: '123e4567-e89b-42d3-a456-426614174111',
      expiresAt: '2026-07-25T00:30:00.000Z',
    });
    const expected = {
      ...expectedBase,
      ...proposalDigests,
      proposalDigest: binding.proposalDigest,
    };
    const request = opened.service.attendedExecutionApprovalAuthority.submit({
      requester: { role: 'brain', instanceId: 'brain-runtime-a' },
      userId: 'owner-a',
      summary: 'Approve exact attended hard-stop dispatch',
      binding,
      createdAt: '2026-07-25T00:00:00.000Z',
    });

    await expect(opened.service.decideOidc({
      token: token(),
      policy: policy(),
      verifier: verifier(),
      channel: 'api-oidc',
    }, {
      requestId: request.id,
      action: 'allow',
      idempotencyKey: 'decision-runtime-a',
    })).resolves.toMatchObject({ kind: 'decided' });
    opened.service.close();

    const reopened = openApprovalAuthorityRuntime({
      projectRoot,
      tenantId: 'tenant-a',
      platform: 'linux',
      env,
      now: () => now,
    });
    expect(reopened.state).toBe('ready');
    if (reopened.state !== 'ready') throw new Error(reopened.reasonCode);
    const grant = reopened.service.attendedExecutionApprovalAuthority.verifyAndClaim(
      request.id,
      expected,
    );

    expect(grant.receipt).toMatchObject({
      requestId: request.id,
      binding: {
        attemptId: binding.attemptId,
        provider: 'claude',
        model: 'claude-fable-5',
        backend: 'subprocess',
      },
    });
    expect(reopened.authorityEvidenceRef).toContain('approval-keyring-fixture-v1');
    expect(() => reopened.service.attendedExecutionApprovalAuthority.verifyAndClaim(
      request.id,
      expected,
    )).toThrowError(expect.objectContaining({ code: 'APPROVAL_ALREADY_CONSUMED' }));
  });

  it('keeps another tenant, revoked session and stale identity fail-closed', async () => {
    const { projectRoot, hostRoot } = fixture();
    provision(hostRoot);
    const env = { DECKENT_HOME: hostRoot };
    const opened = openApprovalAuthorityRuntime({
      projectRoot,
      tenantId: 'tenant-a',
      platform: 'wsl',
      env,
      now: () => now,
    });
    if (opened.state !== 'ready') throw new Error(opened.reasonCode);
    const binding = createAttendedExecutionApprovalBinding({
      ...createAttendedExecutionProposalDigests({
        task: { id: 'task-revoke', model: 'claude-fable-5' },
        prompt: 'bounded prompt',
        scope: { filesRead: [], filesWrite: [] },
        acceptance: { goCriteria: 'exact dispatch', noGoCriteria: 'drift' },
      }),
      tenantId: 'tenant-a',
      projectId: attendedExecutionProjectId(projectRoot),
      runId: 'run-revoke',
      taskId: 'task-revoke',
      attemptId: '123e4567-e89b-42d3-a456-426614174222',
      provider: 'claude',
      model: 'claude-fable-5',
      backend: 'subprocess',
      budget: { maxTurns: 2 },
      policy: {
        profileRef: 'execution_budget.roles.worker.default',
        policyDigest: 'b'.repeat(64),
        landing: {
          reserve_ratio: 0.25,
          attended_unsupported: 'allow-hard-stop',
        },
      },
      expiresAt: '2026-07-25T00:30:00.000Z',
    });
    const request = opened.service.attendedExecutionApprovalAuthority.submit({
      requester: { role: 'worker', instanceId: 'worker-revoke' },
      userId: 'owner-a',
      summary: 'Approve revocation test',
      binding,
      createdAt: '2026-07-25T00:00:00.000Z',
    });
    await opened.service.decideOidc({
      token: token(),
      policy: policy(),
      verifier: verifier(),
      channel: 'api-oidc',
    }, {
      requestId: request.id,
      action: 'allow',
      idempotencyKey: 'decision-revoke',
    });
    const decision = opened.service.broker.getDecision(request.id);
    expect(decision?.authorization).toBeDefined();
    opened.service.sessions.revoke(
      decision!.authorization!.sessionRefHash,
      'owner-revoked',
    );

    expect(() => opened.service.attendedExecutionApprovalAuthority.verifyAndClaim(
      request.id,
      {
        proposalDigest: binding.proposalDigest,
        taskDigest: binding.taskDigest,
        promptDigest: binding.promptDigest,
        scopeDigest: binding.scopeDigest,
        acceptanceDigest: binding.acceptanceDigest,
        tenantId: binding.tenantId,
        projectId: binding.projectId,
        runId: binding.runId,
        taskId: binding.taskId,
        provider: binding.provider,
        model: binding.model,
        backend: binding.backend,
        budget: binding.budget,
        policy: binding.policy,
      },
    )).toThrowError(expect.objectContaining({ code: 'DECISION_UNTRUSTED' }));

    await expect(opened.service.decideOidc({
      token: token({ tenant_id: 'tenant-b' }),
      policy: policy(),
      verifier: verifier(),
      channel: 'api-oidc',
    }, {
      requestId: request.id,
      action: 'allow',
      idempotencyKey: 'decision-other-tenant',
    })).resolves.toMatchObject({ kind: 'rejected' });
  });

  it('returns typed HOLD for missing custody and native Windows without provisioning anything', () => {
    const missing = fixture();
    expect(openApprovalAuthorityRuntime({
      projectRoot: missing.projectRoot,
      tenantId: 'tenant-a',
      platform: 'linux',
      env: { DECKENT_HOME: missing.hostRoot },
      now: () => now,
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'approval_authority_key_not_provisioned',
      detailCode: 'APPROVAL_KEYRING_NOT_PROVISIONED',
    });

    const windows = fixture();
    expect(openApprovalAuthorityRuntime({
      projectRoot: windows.projectRoot,
      tenantId: 'tenant-a',
      platform: 'win32',
      env: { DECKENT_HOME: 'C:\\deckent-host' },
      now: () => now,
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'approval_authority_custody_unsupported',
      detailCode: 'APPROVAL_KEYRING_ACL_UNSUPPORTED',
    });
  });
});
