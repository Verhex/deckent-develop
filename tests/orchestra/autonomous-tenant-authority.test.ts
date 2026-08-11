import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  makeApprovalGate,
  UnknownApprovalRequestError,
} from '../../src/orchestra/autonomous/approval-adapter.js';
import {
  TenantScopeError,
  type VerifiedPrincipal,
} from '../../src/core/principal.js';
import type { AutonomousTrigger } from '../../src/orchestra/autonomous-runtime.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): { pendingPath: string; decisionsPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'approval-tenant-'));
  dirs.push(dir);
  return {
    pendingPath: join(dir, 'pending.json'),
    decisionsPath: join(dir, 'decisions.json'),
  };
}

function principal(tenantId?: string): VerifiedPrincipal {
  return {
    id: tenantId ? `operator-${tenantId}` : 'operator-no-tenant',
    identityClass: 'oidc',
    assurance: 'token-verified',
    provenance: 'api',
    verifiedBy: 'auth-gate',
    ...(tenantId ? { tenantId } : {}),
  };
}

const trigger: AutonomousTrigger = {
  id: 'approval-1',
  source: 'scheduled-flow',
  action: 'deploy',
  requestedBy: 'operator',
};

describe('autonomous approval tenant authority', () => {
  it('keeps solo-mode pending and approval persistence byte-identical', async () => {
    const paths = fixture();
    const gate = makeApprovalGate(paths);

    expect(await gate.request(trigger)).toEqual({
      outcome: 'pending',
      reason: 'awaiting human approval',
    });
    const persisted = JSON.parse(readFileSync(paths.pendingPath, 'utf8')) as Array<Record<string, unknown>>;
    expect(persisted[0]).not.toHaveProperty('tenantId');
    expect(gate.pending()).toHaveLength(1);

    gate.accept(trigger.id);
    expect((await gate.request(trigger)).outcome).toBe('approved');
  });

  it('refuses a foreign tenant exactly like an unknown request and leaks no pending metadata', async () => {
    const paths = fixture();
    const owner = makeApprovalGate({ ...paths, principal: principal('tenant-a'), strictTenantIsolation: true });
    await owner.request(trigger);

    const foreign = makeApprovalGate({ ...paths, principal: principal('tenant-b'), strictTenantIsolation: true });
    expect(foreign.pending()).toEqual([]);
    expect(() => foreign.accept(trigger.id)).toThrowError(UnknownApprovalRequestError);
    expect(() => foreign.reject(trigger.id)).toThrowError(UnknownApprovalRequestError);
    expect(readFileSync(paths.pendingPath, 'utf8')).not.toContain('operator-tenant-a');
  });

  it('does not consume another tenant decision when trigger ids collide', async () => {
    const paths = fixture();
    const tenantA = makeApprovalGate({ ...paths, principal: principal('tenant-a'), strictTenantIsolation: true });
    const tenantB = makeApprovalGate({ ...paths, principal: principal('tenant-b'), strictTenantIsolation: true });
    await tenantA.request(trigger);
    await tenantB.request(trigger);

    tenantA.accept(trigger.id);
    expect((await tenantB.request(trigger)).outcome).toBe('pending');
    expect((await tenantA.request(trigger)).outcome).toBe('approved');
  });

  it('refuses a tenant-less strict principal with the canonical typed error', () => {
    const paths = fixture();
    const gate = makeApprovalGate({ ...paths, principal: principal(), strictTenantIsolation: true });

    expect(() => gate.pending()).toThrowError(TenantScopeError);
    expect(() => gate.accept('unknown')).toThrowError(TenantScopeError);
    expect(() => gate.reject('unknown')).toThrowError(TenantScopeError);
  });
});
