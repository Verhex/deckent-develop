// tests/providers/cursor-provider-evidence-sources.test.ts
// 7091 FAZ-1 (565-008 hand-completion) — cursor evidence sources are honest
// TYPED stubs: hold/unavailable/unsupported with opaque refs, registered on
// BOTH execution backends (host-subprocess + docker) for the same dual-scope
// reason as codex (xverify verifier runs in docker, authoring probes on host).
import { describe, expect, it } from 'vitest';
import {
  createCursorHostSubscriptionEvidenceSourceRegistrations,
  CursorAccountIdentityUnavailableAuthority,
  CursorLimitUnavailableEvidenceSource,
  CursorReachabilityUnavailableEvidenceSource,
} from '../../src/providers/cursor-provider-evidence-sources.js';
import { createLocalProviderEvidenceSourceRegistrations } from '../../src/providers/provider-authority-runtime-bootstrap.js';

describe('cursor evidence sources (7091 FAZ-1 typed stubs)', () => {
  it('registers the subscription CLI scope on BOTH backends', () => {
    const regs = createCursorHostSubscriptionEvidenceSourceRegistrations();
    expect(regs.map((r) => [r.provider, r.authMode, r.transport, r.executionBackend])).toEqual([
      ['cursor', 'subscription', 'cli', 'host-subprocess'],
      ['cursor', 'subscription', 'cli', 'docker'],
    ]);
  });

  it('account identity is a typed hold with an opaque cursor-account ref (never fabricated)', async () => {
    const authority = new CursorAccountIdentityUnavailableAuthority();
    const result = await authority.resolve({
      provider: 'cursor',
      authMode: 'subscription',
    } as never);
    expect(result.state).toBe('hold');
    expect((result as { evidenceRef: string }).evidenceRef).toMatch(/^cursor-account-scope:[0-9a-f]{64}$/);
  });

  it('limit observation is typed unavailable — zero windows, advisory, no invented reset clock', async () => {
    const source = new CursorLimitUnavailableEvidenceSource({ now: () => new Date('2026-08-19T00:00:00.000Z') });
    expect(source.authority).toBe('advisory');
    const obs = await source.observe({
      tenantId: 't', projectId: 'p', provider: 'cursor', model: 'm',
      authMode: 'subscription', accountRefHash: null, accountEvidence: null,
      backend: { transport: 'cli', executionBackend: 'host-subprocess' } as never,
    });
    expect(obs.state).toBe('unavailable');
    expect(obs.windows).toEqual([]);
    expect(obs.requiredWindowIds).toEqual([]);
    expect(obs.source.fetchedAt).toBe('2026-08-19T00:00:00.000Z');
    expect(obs.source.evidenceRef).toMatch(/^cursor-limit-unavailable:[0-9a-f]{64}$/);
  });

  it('reachability is typed unsupported — no fake reachable verdict on either backend', async () => {
    const source = new CursorReachabilityUnavailableEvidenceSource();
    const obs = await source.probe({
      provider: 'cursor', model: 'm',
      auth: { mode: 'subscription' },
      backend: { transport: 'cli', executionBackend: 'docker', executionProfileRef: 'ref' },
      admission: { budget: { projection: null } },
    } as never);
    expect(obs.outcome).toBe('unsupported');
    expect(obs.calledProvider).toBeNull();
    expect(obs.evidenceRefs?.[0]).toMatch(/^cursor-reachability-scope:[0-9a-f]{64}$/);
  });

  it('the runtime bootstrap registration set includes the cursor dual-backend scope', () => {
    const regs = createLocalProviderEvidenceSourceRegistrations('/tmp/x');
    const cursor = regs.filter((r) => r.provider === 'cursor');
    expect(cursor.map((r) => r.executionBackend).sort()).toEqual(['docker', 'host-subprocess']);
  });
});
