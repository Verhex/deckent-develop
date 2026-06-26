// tests/connectors/connector-bootstrap-identity.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityStore } from '../../src/connectors/identity/identity-store.js';
import { buildIdentityResolver } from '../../src/connectors/connector-bootstrap.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-bi-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('bootstrap identity resolver', () => {
  it('resolves a stored sender to a principal within the bound tenant', () => {
    const store = new IdentityStore(join(dir, 'id.db'));
    store.upsertIdentity({ connector: 'telegram', externalId: '55', tenantId: 'firmax', principalId: 'ali', role: 'operator', verified: true, method: 'otp', updatedAt: '2026-06-26T00:00:00.000Z' });
    const resolve = buildIdentityResolver({
      enabled: true, provider: { kind: 'local' },
      roleMap: { operator: { role: 'operator', permissions: ['order:read', 'order:write'] } },
    }, store, dir);
    const binding = { tenantId: 'firmax', projectPath: dir, mode: 'tenant-locked' as const };
    const p = resolve({ connector: 'telegram', fromUser: '55' }, binding);
    expect(p).toMatchObject({ userId: 'ali', role: 'operator', permissions: ['order:read', 'order:write'], tenantId: 'firmax' });
    store.close();
  });
  it('returns null for an unknown sender on a tenant-locked binding (fail-closed)', () => {
    const store = new IdentityStore(join(dir, 'id.db'));
    const resolve = buildIdentityResolver({ enabled: true, provider: { kind: 'local' } }, store, dir);
    const binding = { tenantId: 'firmax', projectPath: dir, mode: 'tenant-locked' as const };
    expect(resolve({ connector: 'telegram', fromUser: '999' }, binding)).toBeNull();
    store.close();
  });
});
