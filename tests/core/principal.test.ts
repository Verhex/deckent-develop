// ═══ PRINCIPAL-001 P1a — VerifiedPrincipal contract tests ══════════════════
import { describe, it, expect } from 'vitest';
import { userInfo, hostname } from 'node:os';
import {
  resolveLocalOsPrincipal,
  principalToActor,
  assessActorAssurance,
  recordActorAssurance,
} from '../../src/core/principal.js';

describe('resolveLocalOsPrincipal — real OS identity, never synthetic', () => {
  it('resolves the actual os user + host with os-user assurance', () => {
    const p = resolveLocalOsPrincipal('cli');
    expect(p.id).toBe(`${userInfo().username}@${hostname()}`);
    expect(p.identityClass).toBe('local');
    expect(p.assurance).toBe('os-user');
    expect(p.provenance).toBe('cli');
    expect(p.verifiedBy).toBe('os.userInfo');
  });

  it('never produces the retired synthetic literals', () => {
    for (const origin of ['cli', 'mcp'] as const) {
      const p = resolveLocalOsPrincipal(origin);
      expect(['cli-operator', 'mcp-operator', 'repl-user']).not.toContain(p.id);
    }
  });
});

describe('principalToActor — provenance rides into ActorContext', () => {
  it('carries identityClass/assurance/provenance onto the actor', () => {
    const actor = principalToActor(resolveLocalOsPrincipal('mcp'));
    expect(actor.identityClass).toBe('local');
    expect(actor.assurance).toBe('os-user');
    expect(actor.provenance).toBe('mcp');
  });
});

describe('assessActorAssurance — the advisory authorization seam', () => {
  it('flags a pre-PRINCIPAL-001 bare actor (no assurance fields)', () => {
    const finding = assessActorAssurance({ id: 'legacy-actor' });
    expect(finding.ok).toBe(false);
    expect(finding.code).toBe('ACTOR_ASSURANCE_MISSING');
  });

  it('flags explicit unverified assurance (api-static class)', () => {
    const finding = assessActorAssurance({
      id: 'api-static',
      identityClass: 'service',
      assurance: 'unverified',
      provenance: 'api',
    });
    expect(finding.ok).toBe(false);
    expect(finding.code).toBe('ACTOR_UNVERIFIED');
  });

  it('accepts os-user and token-verified assurance', () => {
    expect(assessActorAssurance(principalToActor(resolveLocalOsPrincipal('cli'))).ok).toBe(true);
    expect(
      assessActorAssurance({
        id: 'sub-123', identityClass: 'oidc', assurance: 'token-verified', provenance: 'api',
      }).ok,
    ).toBe(true);
  });

  it('recordActorAssurance never throws and returns the finding (P1a contract)', () => {
    const finding = recordActorAssurance({ id: 'legacy' }, 'test-site');
    expect(finding.code).toBe('ACTOR_ASSURANCE_MISSING');
  });
});
