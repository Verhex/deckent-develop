// tests/core/capability-authority-resolution.test.ts
// CAPABILITY-001 / MASTER-PLAN row 4040 — the acceptance is "principal, tenant,
// operation, resource and environment resolve one scoped capability decision".
// These pins cover the three the task names: a fully-resolved request produces the
// scoped decision, a missing input fails closed typed, and the advisory path's
// observable behaviour stays byte-identical (no enforcement default is flipped).
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Partial-mock `debugLog` so the advisory surface never appends to the real
// .brain/ERRORS.md (hermetic) — same shape as capability-runtime.test.ts.
vi.mock('../../src/core/utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/utils.js')>()),
  debugLog: vi.fn(),
}));
import {
  createAuditedCapabilityRegistry,
  resolveCapabilityEnforcement,
  resolveCapabilityDecision,
  resolveScopedCapabilityInvocation,
  _resetCapabilityEnforcementAdvisoryForTests,
  type CapabilityDecisionInput,
  type CapabilityDecisionRequest,
} from '../../src/core/capability-runtime.js';
import { Op } from '../../src/core/operation-catalog/index.js';
import type { VerifiedPrincipal } from '../../src/core/principal.js';

/** The production posture: no `enforce_least_privilege`, no denial audit. */
const ADVISORY = resolveCapabilityEnforcement(undefined, undefined);
/** The owner-gated posture: `enforce_least_privilege` explicitly armed. */
const ENFORCED = resolveCapabilityEnforcement(undefined, { enforce_least_privilege: true });

function principal(over: Partial<VerifiedPrincipal> = {}): VerifiedPrincipal {
  return {
    id: 'u-1',
    identityClass: 'local',
    assurance: 'os-user',
    provenance: 'cli',
    verifiedBy: 'os.userInfo',
    role: 'viewer',
    ...over,
  };
}

/** A request with all five inputs resolved: viewer reading a file it owns. */
function request(over: Partial<CapabilityDecisionRequest> = {}): CapabilityDecisionRequest {
  return {
    principal: principal(),
    tenant: 't-1',
    operation: Op.FsRead,
    resource: { id: 'docs/readme.md', ownerTenant: 't-1' },
    environment: { authorityMode: 'balanced' },
    ...over,
  };
}

beforeEach(() => {
  _resetCapabilityEnforcementAdvisoryForTests();
});

describe('resolveCapabilityDecision — fully-resolved request → one scoped decision', () => {
  it('allows and reports every part of the scope in a single decision', () => {
    const decision = resolveCapabilityDecision(request(), ENFORCED);
    expect(decision.outcome).toBe('allow');
    expect(decision.reasonCode).toBe('ALLOWED_WITHIN_GRANT');
    // operation (op.fs.read) → requiredCapabilities + gate, from the catalog.
    expect(decision.requiredCapabilities).toEqual(['fs-read']);
    expect(decision.gate).toBe('G0');
    // principal.role → grantedCapabilities, from the canonical role map.
    expect(decision.grantedCapabilities).toEqual(['fs-read', 'mcp-tool']);
    expect(decision.unresolvedInputs).toEqual([]);
    expect(decision.audited).toBe(false);
  });

  it('reports denial-audit wiring on the decision when it is armed', () => {
    const audited = resolveCapabilityEnforcement(
      { denialAudit: { projectRoot: '/tmp/nonexistent-project' } },
      { enforce_least_privilege: true },
    );
    expect(resolveCapabilityDecision(request(), audited).audited).toBe(true);
  });

  it('denies cross-tenant: the resource is owned by another tenant', () => {
    const decision = resolveCapabilityDecision(
      request({ resource: { id: 'docs/readme.md', ownerTenant: 't-2' } }),
      ENFORCED,
    );
    expect(decision.outcome).toBe('deny');
    expect(decision.reasonCode).toBe('DENIED_CROSS_TENANT');
  });

  it('denies when the operation needs a capability the role does not grant', () => {
    // viewer grants fs-read + mcp-tool; op.fs.write requires fs-write.
    const decision = resolveCapabilityDecision(request({ operation: Op.FsWrite }), ENFORCED);
    expect(decision.outcome).toBe('deny');
    expect(decision.reasonCode).toBe('DENIED_UNGRANTED_CAPABILITY');
    expect(decision.requiredCapabilities).toEqual(['fs-write']);
  });

  it('denies an operation id that is not in the catalog (no decision from a guess)', () => {
    const decision = resolveCapabilityDecision(request({ operation: 'op.not.a.real.one' }), ENFORCED);
    expect(decision.outcome).toBe('deny');
    expect(decision.reasonCode).toBe('DENIED_UNKNOWN_OPERATION');
    expect(decision.requiredCapabilities).toEqual([]);
    expect(decision.gate).toBeNull();
  });

  it('denies an unknown role (safe-deny, never permissive)', () => {
    const decision = resolveCapabilityDecision(
      request({ principal: principal({ role: 'wizard' }) }),
      ENFORCED,
    );
    expect(decision.outcome).toBe('deny');
    expect(decision.reasonCode).toBe('DENIED_UNGRANTED_CAPABILITY');
    expect(decision.grantedCapabilities).toEqual([]);
  });

  it('escalates a high-risk operation from an unverified principal, and denies it under strict', () => {
    // op.fs.delete is HIGH risk and needs fs-write — operator grants it.
    const base = request({
      principal: principal({ role: 'operator', assurance: 'unverified' }),
      operation: Op.FsDelete,
    });
    const escalated = resolveCapabilityDecision(base, ENFORCED);
    expect(escalated.outcome).toBe('needs_approval');
    expect(escalated.reasonCode).toBe('NEEDS_APPROVAL_LOW_ASSURANCE');
    expect(escalated.gate).toBe('G3');

    const strict = resolveCapabilityDecision(
      { ...base, environment: { authorityMode: 'strict' } },
      ENFORCED,
    );
    expect(strict.outcome).toBe('deny');
    expect(strict.reasonCode).toBe('DENIED_LOW_ASSURANCE_STRICT');
  });
});

describe('resolveCapabilityDecision — a missing input fails closed, typed', () => {
  const holes: ReadonlyArray<[CapabilityDecisionInput, Partial<CapabilityDecisionRequest>]> = [
    ['principal', { principal: undefined as unknown as VerifiedPrincipal }],
    ['principal', { principal: principal({ role: undefined }) }],
    ['tenant', { tenant: '' }],
    ['operation', { operation: '  ' }],
    ['resource', { resource: undefined as unknown as CapabilityDecisionRequest['resource'] }],
    ['resource', { resource: { id: 'x', ownerTenant: '' } }],
    ['environment', {
      environment: { authorityMode: 'yolo' } as unknown as CapabilityDecisionRequest['environment'],
    }],
  ];

  for (const [input, hole] of holes) {
    it(`denies with DENIED_UNRESOLVED_INPUT naming '${input}' (${JSON.stringify(hole)})`, () => {
      const decision = resolveCapabilityDecision(request(hole), ENFORCED);
      expect(decision.outcome).toBe('deny');
      expect(decision.reasonCode).toBe('DENIED_UNRESOLVED_INPUT');
      expect(decision.unresolvedInputs).toContain(input);
      // No partial-input decision: nothing is derived from the surviving inputs.
      expect(decision.requiredCapabilities).toEqual([]);
      expect(decision.grantedCapabilities).toEqual([]);
      expect(decision.gate).toBeNull();
    });
  }

  it('names every input when the request itself is absent', () => {
    const decision = resolveCapabilityDecision(
      undefined as unknown as CapabilityDecisionRequest,
      ENFORCED,
    );
    expect(decision.reasonCode).toBe('DENIED_UNRESOLVED_INPUT');
    expect(decision.unresolvedInputs).toEqual([
      'principal', 'tenant', 'operation', 'resource', 'environment',
    ]);
  });

  it('projects an unresolved request to an EMPTY grant set under enforcement', () => {
    const scoped = resolveScopedCapabilityInvocation(request({ tenant: '' }), ENFORCED);
    expect(scoped.decision.reasonCode).toBe('DENIED_UNRESOLVED_INPUT');
    expect(scoped.context.grantedCapabilities).toEqual([]);
    expect(scoped.enforcementApplied).toBe(true);
  });
});

describe('resolveScopedCapabilityInvocation — projection onto the EXISTING broker gate', () => {
  it('carries the decision grants and the resolved principal/tenant into the broker context', () => {
    const scoped = resolveScopedCapabilityInvocation(request(), ENFORCED, {
      projectRoot: '/tmp/p',
      correlationId: 'c-1',
      causationId: 'c-0',
    });
    expect(scoped.enforcementApplied).toBe(true);
    expect(scoped.context.grantedCapabilities).toEqual(['fs-read', 'mcp-tool']);
    expect(scoped.context.actor).toMatchObject({
      id: 'u-1',
      role: 'viewer',
      tenantId: 't-1',
      identityClass: 'local',
      assurance: 'os-user',
      provenance: 'cli',
    });
    expect(scoped.context.projectRoot).toBe('/tmp/p');
    expect(scoped.context.correlationId).toBe('c-1');
    expect(scoped.context.causationId).toBe('c-0');
  });

  it('a needs_approval decision is not an allow: the projected grant set is empty', () => {
    const scoped = resolveScopedCapabilityInvocation(
      request({
        principal: principal({ role: 'operator', assurance: 'unverified' }),
        operation: Op.FsDelete,
      }),
      ENFORCED,
    );
    expect(scoped.decision.outcome).toBe('needs_approval');
    expect(scoped.context.grantedCapabilities).toEqual([]);
  });

  it('the armed registry enforces the decision through its own existing gate', async () => {
    const registry = createAuditedCapabilityRegistry(undefined, {}, { enforce_least_privilege: true });

    const allowed = resolveScopedCapabilityInvocation(request(), ENFORCED);
    const ok = await registry.invoke({ capability: 'echo', args: { a: 1 } }, allowed.context);
    expect(ok.ok).toBe(true);

    const denied = resolveScopedCapabilityInvocation(request({ operation: Op.FsWrite }), ENFORCED);
    const blocked = await registry.invoke({ capability: 'echo', args: { a: 1 } }, denied.context);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('CAPABILITY_DENIED');
  });
});

describe('advisory posture — observable behaviour stays byte-identical', () => {
  it('leaves grantedCapabilities unset, so invoke takes the same permissive branch', () => {
    const scoped = resolveScopedCapabilityInvocation(request(), ADVISORY);
    expect(scoped.enforcementApplied).toBe(false);
    expect(scoped.context.grantedCapabilities).toBeUndefined();
    expect('grantedCapabilities' in scoped.context).toBe(false);
    // The decision still resolves — it is evidence, not a gate.
    expect(scoped.decision.outcome).toBe('allow');
  });

  it('produces an identical CapabilityResult to the pre-existing plain-context call', async () => {
    const registry = createAuditedCapabilityRegistry();
    const before = await registry.invoke({ capability: 'echo', args: { a: 1 } }, {});
    const scoped = resolveScopedCapabilityInvocation(request(), ADVISORY);
    const after = await registry.invoke({ capability: 'echo', args: { a: 1 } }, scoped.context);
    expect(after).toEqual(before);
  });

  it('does NOT block even when the decision denies (no default flip)', async () => {
    const registry = createAuditedCapabilityRegistry();
    const scoped = resolveScopedCapabilityInvocation(request({ operation: Op.FsWrite }), ADVISORY);
    expect(scoped.decision.outcome).toBe('deny');
    const result = await registry.invoke({ capability: 'echo', args: { a: 1 } }, scoped.context);
    expect(result).toEqual(await registry.invoke({ capability: 'echo', args: { a: 1 } }, {}));
    expect(result.ok).toBe(true);
  });

  it('keeps the registry itself unarmed — the flip stays owner-gated', () => {
    expect(createAuditedCapabilityRegistry().leastPrivilegeEnabled).toBe(false);
    expect(ADVISORY.reasonCode).toBe('ADVISORY_GATE_DISABLED');
    expect(ADVISORY.enforced).toBe(false);
  });
});
