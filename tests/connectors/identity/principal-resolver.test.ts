// tests/connectors/identity/principal-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePrincipal, refKindFor, type ChannelBinding } from '../../../src/connectors/identity/principal-resolver.js';
import type { IdentityDirectoryProvider, ResolvedPrincipal } from '../../../src/connectors/identity/provider.js';

function fakeProvider(map: Record<string, ResolvedPrincipal>): IdentityDirectoryProvider {
  return { id: 'fake', edition: 'team', resolve: (ref, tenantId) => map[`${ref.externalId}:${tenantId}`] ?? null };
}
const binding: ChannelBinding = { tenantId: 'firmax', projectPath: '/p', mode: 'tenant-locked' };

describe('refKindFor', () => {
  it('maps connectors to their native ref kind', () => {
    expect(refKindFor('telegram')).toBe('telegram-id');
    expect(refKindFor('whatsapp')).toBe('phone');
    expect(refKindFor('slack')).toBe('email');
    expect(refKindFor('discord')).toBe('discord-id');
    expect(refKindFor('email')).toBe('email');
  });
});

describe('resolvePrincipal', () => {
  const ali: ResolvedPrincipal = { userId: 'ali', role: 'operator', permissions: ['order:read'], tenantId: 'firmax', verified: true, source: 'fake' };
  it('resolves a known sender within the binding tenant', () => {
    const p = fakeProvider({ '55:firmax': ali });
    expect(resolvePrincipal({ connector: 'telegram', fromUser: '55' }, binding, p, '/root')).toEqual(ali);
  });
  it('returns null for an unknown sender with no guest role (fail-closed)', () => {
    const p = fakeProvider({});
    expect(resolvePrincipal({ connector: 'telegram', fromUser: '999' }, binding, p, '/root')).toBeNull();
  });
  it('returns a guest principal when binding.guestRole is set', () => {
    const p = fakeProvider({});
    const guestBinding: ChannelBinding = { ...binding, guestRole: 'viewer' };
    const r = resolvePrincipal({ connector: 'telegram', fromUser: '999' }, guestBinding, p, '/root');
    expect(r).toMatchObject({ role: 'viewer', tenantId: 'firmax', verified: false, source: 'guest', permissions: ['*:read'] });
    expect(r?.userId).toContain('guest');
  });
});
