import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  openApprovalAuthorityRuntime,
  type ApprovalAuthorityRuntimeService,
} from '../../src/core/approval-authority-runtime.js';
import { attendedExecutionProjectId } from '../../src/core/attended-execution-approval.js';
import { createPinnedApprovalOidcVerifier } from '../../src/core/approval-oidc-authenticator.js';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';
import {
  signHs256Jwt,
  writeApprovalAuthorityFixtureRevision,
} from '../helpers/approval-authority-fixture.js';

const SECRET = 'api-attended-approval-oidc-secret';
const NOW = new Date();
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const CREATED_AT = new Date(NOW.getTime() - 60_000).toISOString();
const EXPIRES_AT = new Date(NOW.getTime() + 600_000).toISOString();
const roots: string[] = [];
let handle: TestServerHandle | null = null;

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = null;
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('attended approval API OIDC composition', () => {
  it('decides only through the shared verified runtime and survives exact restart use', async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), 'deckent-api-approval-host-'));
    roots.push(hostRoot);
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
        keyMaterialHex: Buffer.from('approval-api-integrity-key-00001').toString('hex'),
      }],
    });
    const policy = {
      authorityRef: 'oidc:test-idp:deckent-api',
      issuer: 'https://idp.example.test',
      audience: 'deckent-api',
      tenantClaim: 'tenant_id',
      roleClaim: 'role',
      maxAuthAgeSeconds: 300,
      maxSessionSeconds: 120,
      requiredAcr: ['urn:deckent:mfa'],
      requiredAmr: ['mfa'],
    } as const;
    const verifier = createPinnedApprovalOidcVerifier({
      authorityRef: policy.authorityRef,
      verifyOptions: {
        issuer: policy.issuer,
        audience: policy.audience,
        algorithms: ['HS256'],
        hs256Secret: SECRET,
      },
    });
    let runtime: ApprovalAuthorityRuntimeService | undefined;
    handle = await startTestServer({
      oidc: {
        issuer: policy.issuer,
        audience: policy.audience,
        algorithm: 'HS256',
        key: SECRET,
      },
      seed: { config: { approval: { api_decide: true } } },
      approvalAuthorityFactory(projectRoot) {
        const opened = openApprovalAuthorityRuntime({
          projectRoot,
          tenantId: 'tenant-a',
          platform: 'linux',
          env: { DECKENT_HOME: hostRoot },
          now: () => NOW,
        });
        if (opened.state !== 'ready') throw new Error(opened.reasonCode);
        runtime = opened.service;
        return { runtime: opened.service, policy, verifier };
      },
    });
    if (!runtime) throw new Error('approval runtime was not composed');
    const material = {
      task: { id: 'task-api-a', model: 'gpt-5.6-sol' },
      prompt: 'provider-free callback',
      scope: { filesRead: [], filesWrite: [] },
      acceptance: { goCriteria: 'one callback', noGoCriteria: 'duplicate callback' },
    };
    const prepared = runtime.prepareAttendedExecutionApproval({
      requester: { role: 'brain', instanceId: 'api-run-a' },
      userId: 'owner-a',
      summary: 'Approve exact provider-free attended dispatch',
      material,
      dispatch: {
        tenantId: 'tenant-a',
        projectId: attendedExecutionProjectId(handle.projectRoot),
        runId: 'api-run-a',
        taskId: 'task-api-a',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        backend: 'subprocess',
        budget: { maxTurns: 2 },
        policy: {
          profileRef: 'execution_budget.roles.worker.default',
          policyDigest: 'd'.repeat(64),
          landing: {
            reserve_ratio: 0.25,
            attended_unsupported: 'allow-hard-stop',
          },
        },
      },
      attemptId: '123e4567-e89b-42d3-a456-426614174333',
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    });
    const token = signHs256Jwt({
      iss: policy.issuer,
      aud: policy.audience,
      sub: 'owner-a',
      tenant_id: 'tenant-a',
      role: 'owner',
      auth_time: NOW_SECONDS - 30,
      exp: NOW_SECONDS + 300,
      acr: 'urn:deckent:mfa',
      amr: ['pwd', 'mfa'],
    }, SECRET);

    const response = await call(
      handle,
      `/api/approvals/${prepared.request.id}/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': 'api-attended-allow-a',
        },
        body: JSON.stringify({ decision: 'allow', reason: 'reviewed exact proposal' }),
      },
    );

    expect(response.status, response.text).toBe(200);
    expect(response.json<{
      success: boolean;
      decision: { channel: string; decidedBy: string; authorization?: unknown };
    }>()).toMatchObject({
      success: true,
      decision: {
        channel: 'api-oidc',
        decidedBy: 'owner-a',
      },
    });
    expect(runtime.attendedExecutionApprovalAuthority.verifyAndClaim(
      prepared.request.id,
      prepared.expectedDispatch,
    ).receipt.binding.attemptId).toBe(prepared.attemptId);
    expect(() => runtime.attendedExecutionApprovalAuthority.verifyAndClaim(
      prepared.request.id,
      prepared.expectedDispatch,
    )).toThrowError(expect.objectContaining({ code: 'APPROVAL_ALREADY_CONSUMED' }));
  });
});
