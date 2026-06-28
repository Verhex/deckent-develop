import { describe, it, expect } from 'vitest';
import type {
  IdentityProviderConfig,
  LocalIdentityProviderConfig,
  ScimIdentityProviderConfig,
  OidcClaimsIdentityProviderConfig,
  DeckentConfig,
} from '../../src/core/config-types.js';

// ─── Faz-1b: identity provider discriminated union structural tests ───────────
// Validates ADR-092 Faz-1b shape: 3-kind union, backward compat, no connectors import.
// Tests are type-level + runtime discriminant checks — no I/O, no DB, hermetic.

describe('IdentityProviderConfig — 3-kind discriminated union (ADR-092 Faz-1b)', () => {
  describe('kind: local (backward compatibility)', () => {
    it('accepts minimal local provider config', () => {
      const provider: IdentityProviderConfig = { kind: 'local' };
      expect(provider.kind).toBe('local');
    });

    it('satisfies LocalIdentityProviderConfig', () => {
      const provider: LocalIdentityProviderConfig = { kind: 'local' };
      expect(provider.kind).toBe('local');
    });

    it('is the default kind used in existing DeckentConfig consumers', () => {
      const cfg: DeckentConfig = {
        mode: 'balanced',
        modes: {},
        identity: {
          enabled: true,
          provider: { kind: 'local' },
        },
      };
      expect(cfg.identity?.provider?.kind).toBe('local');
    });
  });

  describe('kind: scim', () => {
    it('accepts full SCIM provider config', () => {
      const provider: IdentityProviderConfig = {
        kind: 'scim',
        scim: {
          baseUrl: 'https://scim.example.com/v2',
          token: '$DECK:SCIM_TOKEN',
          userFilter: 'userName sw "a"',
        },
      };
      expect(provider.kind).toBe('scim');
      if (provider.kind === 'scim') {
        expect(provider.scim.baseUrl).toBe('https://scim.example.com/v2');
        expect(provider.scim.token).toBe('$DECK:SCIM_TOKEN');
        expect(provider.scim.userFilter).toBe('userName sw "a"');
      }
    });

    it('accepts SCIM config without optional userFilter', () => {
      const provider: ScimIdentityProviderConfig = {
        kind: 'scim',
        scim: {
          baseUrl: 'https://scim.example.com/v2',
          token: 'secret',
        },
      };
      expect(provider.scim.userFilter).toBeUndefined();
    });

    it('is assignable as DeckentConfig identity.provider', () => {
      const cfg: DeckentConfig = {
        mode: 'balanced',
        modes: {},
        identity: {
          enabled: true,
          provider: {
            kind: 'scim',
            scim: { baseUrl: 'https://scim.example.com/v2', token: '$DECK:SCIM_TOKEN' },
          },
        },
      };
      expect(cfg.identity?.provider?.kind).toBe('scim');
    });
  });

  describe('kind: oidc-claims', () => {
    it('accepts full OIDC-claims provider config', () => {
      const provider: IdentityProviderConfig = {
        kind: 'oidc-claims',
        oidc: {
          issuer: 'https://auth.example.com',
          audience: 'deckent-api',
          groupsClaim: 'groups',
          roleClaim: 'https://example.com/role',
        },
      };
      expect(provider.kind).toBe('oidc-claims');
      if (provider.kind === 'oidc-claims') {
        expect(provider.oidc.issuer).toBe('https://auth.example.com');
        expect(provider.oidc.audience).toBe('deckent-api');
        expect(provider.oidc.groupsClaim).toBe('groups');
        expect(provider.oidc.roleClaim).toBe('https://example.com/role');
      }
    });

    it('accepts OIDC-claims config with only required issuer', () => {
      const provider: OidcClaimsIdentityProviderConfig = {
        kind: 'oidc-claims',
        oidc: { issuer: 'https://auth.example.com' },
      };
      expect(provider.oidc.audience).toBeUndefined();
      expect(provider.oidc.groupsClaim).toBeUndefined();
      expect(provider.oidc.roleClaim).toBeUndefined();
    });

    it('is assignable as DeckentConfig identity.provider', () => {
      const cfg: DeckentConfig = {
        mode: 'balanced',
        modes: {},
        identity: {
          enabled: true,
          provider: {
            kind: 'oidc-claims',
            oidc: { issuer: 'https://auth.example.com' },
          },
        },
      };
      expect(cfg.identity?.provider?.kind).toBe('oidc-claims');
    });
  });

  describe('discriminant narrowing', () => {
    it('narrows to correct type via switch on kind', () => {
      const providers: IdentityProviderConfig[] = [
        { kind: 'local' },
        { kind: 'scim', scim: { baseUrl: 'https://scim.example.com/v2', token: 'tok' } },
        { kind: 'oidc-claims', oidc: { issuer: 'https://auth.example.com' } },
      ];

      const results: string[] = [];
      for (const p of providers) {
        switch (p.kind) {
          case 'local':
            results.push('local');
            break;
          case 'scim':
            results.push(`scim:${p.scim.baseUrl}`);
            break;
          case 'oidc-claims':
            results.push(`oidc:${p.oidc.issuer}`);
            break;
        }
      }

      expect(results).toEqual([
        'local',
        'scim:https://scim.example.com/v2',
        'oidc:https://auth.example.com',
      ]);
    });
  });

  describe('additive contract — existing identity fields unaffected', () => {
    it('identity block with no provider is still valid', () => {
      const cfg: DeckentConfig = {
        mode: 'balanced',
        modes: {},
        identity: {
          enabled: false,
        },
      };
      expect(cfg.identity?.provider).toBeUndefined();
    });

    it('identity block preserves all existing optional fields alongside new provider', () => {
      const cfg: DeckentConfig = {
        mode: 'balanced',
        modes: {},
        identity: {
          enabled: true,
          provider: { kind: 'local' },
          owner: { connector: 'telegram', externalId: '123456', tenantId: 'tenant-1' },
          roleMap: { '123456': { role: 'admin' } },
          channels: {
            'ch-1': { tenantId: 'tenant-1', projectPath: '/workspace', mode: 'per-user' },
          },
          verify: { ttlSeconds: 300, maxAttempts: 3 },
          enforcement: 'strict',
        },
      };
      expect(cfg.identity?.owner?.connector).toBe('telegram');
      expect(cfg.identity?.roleMap?.['123456']?.role).toBe('admin');
      expect(cfg.identity?.enforcement).toBe('strict');
    });
  });
});
