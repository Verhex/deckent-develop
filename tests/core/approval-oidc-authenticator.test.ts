import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import { ApprovalLiveSessionStore } from '../../src/core/approval-live-session.js';
import {
  OidcLiveApprovalAuthenticator,
  createPinnedApprovalOidcVerifier,
  type ApprovalOidcPolicy,
} from '../../src/core/approval-oidc-authenticator.js';
import { signHs256Jwt } from '../helpers/approval-authority-fixture.js';

const roots: string[] = [];
const secret = 'approval-oidc-secret-fixture';
const now = new Date('2026-07-25T00:10:00.000Z');
const nowSeconds = Math.floor(now.getTime() / 1000);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixture(): { projectRoot: string; stateDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-approval-oidc-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const stateDir = join(base, 'state');
  mkdirSync(projectRoot, { recursive: true });
  return { projectRoot, stateDir };
}

function request(): ApprovalRequest {
  return {
    version: '1.0',
    id: 'approval-oidc-request',
    requester: { role: 'brain', instanceId: 'brain-oidc' },
    summary: 'Approve exact execution',
    details: {},
    scopeId: 'project-id',
    scope: 'lifecycle',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'tenant-a',
    userId: 'actor-a',
    createdAt: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-07-25T00:30:00.000Z',
    maskedArgs: null,
    rawArgsRef: null,
  };
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
      audience: policy().audience as string,
      algorithms: ['HS256'],
      hs256Secret: secret,
    },
  });
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: policy().issuer,
    aud: 'deckent-api',
    sub: 'actor-a',
    tenant_id: 'tenant-a',
    role: 'owner',
    auth_time: nowSeconds - 60,
    iat: nowSeconds - 60,
    exp: nowSeconds + 1_200,
    acr: 'urn:mfa',
    amr: ['pwd', 'mfa'],
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('OidcLiveApprovalAuthenticator', () => {
  it('verifies a fresh step-up assertion and persists a bounded exact-context lease', async () => {
    const { projectRoot, stateDir } = fixture();
    const sessions = new ApprovalLiveSessionStore({
      projectRoot,
      stateDir,
      now: () => now,
      randomBytesFactory: () => Buffer.from('ef'.repeat(32), 'hex'),
    });
    const authenticator = new OidcLiveApprovalAuthenticator({
      token: signHs256Jwt(claims(), secret),
      policy: policy(),
      verifier: verifier(),
      sessions,
      now: () => now,
    });
    const requestDigest = sha256('oidc-request');
    const context = {
      request: request(),
      requestDigest,
      action: 'allow' as const,
      channel: 'api-oidc',
    };
    const live = await authenticator.reauthenticate(context);

    expect(live).toMatchObject({
      actorId: 'actor-a',
      tenantId: 'tenant-a',
      role: 'owner',
      authorityRef: policy().authorityRef,
      authenticatedAt: new Date((nowSeconds - 60) * 1000).toISOString(),
      // maxSessionSeconds=120 is shorter than token/request/auth-age expiry.
      expiresAt: new Date(now.getTime() + 120_000).toISOString(),
    });
    expect(live?.sessionRef).toBeTruthy();
    expect(authenticator.isSessionActive({
      actorId: live!.actorId,
      tenantId: live!.tenantId,
      role: live!.role ?? null,
      sessionRefHash: sha256(live!.sessionRef),
      authorityRef: live!.authorityRef,
      authenticatedAt: live!.authenticatedAt,
      expiresAt: live!.expiresAt,
    }, context, now)).toBe(true);
  });

  it.each([
    ['static opaque token', 'static-owner-token', claims()],
    ['stale auth_time', null, claims({ auth_time: nowSeconds - 301 })],
    ['future auth_time', null, claims({ auth_time: nowSeconds + 1 })],
    ['wrong tenant', null, claims({ tenant_id: 'tenant-b' })],
    ['missing mfa', null, claims({ amr: ['pwd'] })],
    ['wrong acr', null, claims({ acr: 'urn:pwd' })],
    ['wrong audience', null, claims({ aud: 'other-api' })],
    ['missing expiry', null, claims({ exp: undefined })],
  ])('rejects %s before a live session is issued', async (_label, literalToken, tokenClaims) => {
    const { projectRoot, stateDir } = fixture();
    const sessions = new ApprovalLiveSessionStore({
      projectRoot,
      stateDir,
      now: () => now,
    });
    const authenticator = new OidcLiveApprovalAuthenticator({
      token: literalToken ?? signHs256Jwt(tokenClaims, secret),
      policy: policy(),
      verifier: verifier(),
      sessions,
      now: () => now,
    });

    await expect(authenticator.reauthenticate({
      request: request(),
      requestDigest: sha256('reject-request'),
      action: 'allow',
      channel: 'api-oidc',
    })).resolves.toBeNull();
  });

  it('rejects a verifier whose authority does not match the configured policy', () => {
    const { projectRoot, stateDir } = fixture();
    const sessions = new ApprovalLiveSessionStore({ projectRoot, stateDir });
    const mismatched = createPinnedApprovalOidcVerifier({
      authorityRef: 'oidc:https://other.example:deckent-api',
      verifyOptions: {
        issuer: policy().issuer,
        audience: 'deckent-api',
        algorithms: ['HS256'],
        hs256Secret: secret,
      },
    });

    expect(() => new OidcLiveApprovalAuthenticator({
      token: signHs256Jwt(claims(), secret),
      policy: policy(),
      verifier: mismatched,
      sessions,
    })).toThrowError(/verifier authority/u);
  });
});
