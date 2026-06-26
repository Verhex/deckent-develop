// tests/connectors/identity/factory-faz3.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityStore } from '../../../src/connectors/identity/identity-store.js';
import { createIdentityProvider } from '../../../src/connectors/identity/index.js';

let dir: string;
let store: IdentityStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deckent-factory-faz3-'));
  store = new IdentityStore(join(dir, 'identity.db'));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('createIdentityProvider — Faz-3 factory wiring', () => {
  it('creates a ScimIdentityProvider for kind="scim"', () => {
    const p = createIdentityProvider({
      kind: 'scim',
      store,
      scim: {
        endpoint: 'https://idp.example.com/scim/v2',
        token: 'tok-test',
        connector: 'email',
        tenantId: 'acme',
      },
    });
    expect(p.id).toBe('scim');
    expect(p.edition).toBe('enterprise');
  });

  it('creates an OidcClaimsIdentityProvider for kind="oidc-claims"', () => {
    const p = createIdentityProvider({
      kind: 'oidc-claims',
      store,
      oidcClaims: {
        connector: 'email',
      },
    });
    expect(p.id).toBe('oidc-claims');
    expect(p.edition).toBe('enterprise');
  });

  it('local path remains backward-compatible', () => {
    const p = createIdentityProvider({
      kind: 'local',
      store,
      local: { edition: 'solo' },
    });
    expect(p.id).toBe('local');
    expect(p.edition).toBe('solo');
  });

  it('throws E_UNKNOWN_IDENTITY_PROVIDER for unknown kind (csv = Faz-2)', () => {
    expect(() =>
      createIdentityProvider({ kind: 'csv' } as unknown as Parameters<typeof createIdentityProvider>[0]),
    ).toThrow(/E_UNKNOWN_IDENTITY_PROVIDER/);
  });

  it('scim provider resolve() is fail-closed for unknown sender (no network)', () => {
    const p = createIdentityProvider({
      kind: 'scim',
      store,
      scim: {
        endpoint: 'https://idp.example.com/scim/v2',
        token: 'tok-test',
        connector: 'email',
        tenantId: 'acme',
      },
    });
    expect(p.resolve({ connector: 'email', externalId: 'nobody@acme.io', kind: 'email' }, 'acme')).toBeNull();
  });

  it('oidc-claims provider resolve() is fail-closed for unknown sender', () => {
    const p = createIdentityProvider({
      kind: 'oidc-claims',
      store,
      oidcClaims: { connector: 'email' },
    });
    expect(p.resolve({ connector: 'email', externalId: 'nobody@acme.io', kind: 'email' }, 'acme')).toBeNull();
  });
});
