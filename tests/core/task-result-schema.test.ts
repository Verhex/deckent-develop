// ─── Worker Output Contract — Result spine tests (Sprint 326 326-001) ────────
// Faithful behavior tests for the versioned, Zod-validated result contract
// (spec §1.2): the schema's required/defaulted shape, the non-throwing
// validateTaskResult() discriminated result, and reachability via ./types.js.
import { describe, it, expect } from 'vitest';
import {
  taskResultSchema,
  TASK_RESULT_SCHEMA_VERSION_V2,
  createProductionTaskResultV2,
  taskResultV2Digest,
  validateProductionTaskResultV2,
  validateTaskResult,
  getRequiredTaskResultFields,
  TASK_RESULT_SCHEMA_VERSION,
  type TaskResultV1,
} from '../../src/core/task-result-schema.js';
import type {
  CanonicalJsonBounds,
  TaskAttemptCustodyIdentityV2,
} from '../../src/core/task-attempt-custody-store.js';
import { TASK_ATTEMPT_CUSTODY_MAX_LINEAGE_DEPTH } from '../../src/core/task-attempt-custody-store.js';
import { createTaskAttemptEffectLandingBindingV2 } from '../../src/core/execution-effect-persistence-contract.js';
// Reachability of the single-source re-export (the wipe that prompted this xfix
// removed exactly this surface from types.ts — guard it with a real import).
import {
  validateTaskResult as validateViaTypes,
  TASK_RESULT_SCHEMA_VERSION as VERSION_VIA_TYPES,
} from '../../src/core/types.js';

/** A minimal result carrying every REQUIRED field (defaulted fields omitted). */
function validResult(): Record<string, unknown> {
  return {
    taskId: '326-001',
    workerId: 'w-326-001',
    provider: 'claude',
    model: 'opus',
    filesChanged: [
      { path: 'src/core/task-result-schema.ts', status: 'added', linesAdded: 212, linesRemoved: 0 },
    ],
    totalLinesAdded: 212,
    totalLinesRemoved: 0,
    tokenUsage: {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      source: 'provider-adapter',
    },
    cost: { usd: 0.42, pricingSource: 'model-registry' },
    tests: { passed: 7, failed: 0, total: 7 },
    tsc: { clean: true, errors: 0 },
    selfAssessment: 'DONE',
  };
}

describe('task-result-schema (Worker Output Contract spine)', () => {
  it('derives the documented top-level required fields from the executable schema', () => {
    expect(getRequiredTaskResultFields()).toEqual([
      'cost', 'filesChanged', 'model', 'provider', 'selfAssessment', 'taskId',
      'tests', 'tokenUsage', 'totalLinesAdded', 'totalLinesRemoved', 'tsc', 'workerId',
    ]);
  });

  it('rejects an empty object and lists every required field as missing', () => {
    const res = validateTaskResult({});
    expect(res.ok).toBe(false);
    if (res.ok) return; // narrow for TS
    for (const field of [
      'taskId',
      'workerId',
      'provider',
      'model',
      'filesChanged',
      'totalLinesAdded',
      'totalLinesRemoved',
      'tokenUsage',
      'cost',
      'tests',
      'tsc',
      'selfAssessment',
    ]) {
      expect(res.missingFields).toContain(field);
    }
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('accepts a full valid result and stamps schemaVersion + downstream defaults', () => {
    const res = validateTaskResult(validResult());
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.errors.join('; '));
    const value: TaskResultV1 = res.value;
    expect(value.schemaVersion).toBe('1.0');
    // defaulted-downstream fields are populated so a fresh result validates pre-evaluation
    expect(value.goCriteria).toEqual([]);
    expect(value.skills).toEqual([]);
    expect(value.tests.applicability).toBe('REQUIRED');
    expect(value.tests.outcome).toBe('PASSED');
    expect(value.honestGate).toEqual({ flagged: false, violation: null });
    expect(value.brainEvaluation).toBeNull();
    expect(value.auditorValidation).toBeNull();
    expect(value.diskVerified).toBe(false);
    expect(value.boundaryViolations).toEqual([]);
    // tokenUsage cache fields default to 0
    expect(value.tokenUsage.cacheReadTokens).toBe(0);
    expect(value.tokenUsage.cacheCreationTokens).toBe(0);
    // cost currency/isLocal defaults
    expect(value.cost.currency).toBe('USD');
    expect(value.cost.isLocal).toBe(false);
  });

  it('preserves explicit NOT_APPLICABLE and actual non-execution independently', () => {
    const res = validateTaskResult({
      ...validResult(),
      tests: { passed: 0, failed: 0, total: 0, applicability: 'NOT_APPLICABLE', outcome: 'NOT_EXECUTED' },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.tests).toMatchObject({ applicability: 'NOT_APPLICABLE', outcome: 'NOT_EXECUTED' });
  });

  it('defaults schemaVersion to 1.0 when omitted', () => {
    const res = taskResultSchema.safeParse(validResult());
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.schemaVersion).toBe(TASK_RESULT_SCHEMA_VERSION);
    expect(TASK_RESULT_SCHEMA_VERSION).toBe('1.0');
  });

  it('preserves host-authored claim-time work attribution evidence', () => {
    const workAttribution = {
      state: 'VERIFIED',
      attemptId: '11111111-1111-4111-8111-111111111111',
      baselineRef: `task-result-work-attribution-baseline:sha256:${'a'.repeat(64)}`,
      baselineSha256: 'a'.repeat(64),
      scopeDigest: 'b'.repeat(64),
    };
    const res = validateTaskResult({ ...validResult(), workAttribution });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.errors.join('; '));
    expect(res.value.workAttribution).toEqual(workAttribution);
  });

  it('preserves HOLD attribution details and rejects malformed attribution digests', () => {
    const workAttribution = {
      state: 'HOLD',
      attemptId: '22222222-2222-4222-8222-222222222222',
      baselineRef: 'task-result-work-attribution-baseline:sha256:pending',
      scopeDigest: 'c'.repeat(64),
      reasonCode: 'SCOPE_MISMATCH',
      claimedOutsideScope: ['src/unowned.ts'],
    };
    const accepted = validateTaskResult({ ...validResult(), workAttribution });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error(accepted.errors.join('; '));
    expect(accepted.value.workAttribution).toEqual(workAttribution);

    const rejected = validateTaskResult({
      ...validResult(),
      workAttribution: { ...workAttribution, scopeDigest: 'not-a-sha256' },
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.missingFields).not.toContain('workAttribution.scopeDigest');
    expect(rejected.errors.some((error) => error.startsWith('workAttribution.scopeDigest:'))).toBe(true);
  });

  it('preserves provider-native cross-verify evidence through canonical validation', () => {
    const crossVerify = {
      outcome: 'confirmed',
      verifier: 'codex',
      verifierModel: 'gpt-4.1',
      verdict: 'confirmed',
      reason: 'independent checks passed',
      execution: {
        outcome: 'completed',
        initialAttemptId: '11111111-1111-4111-8111-111111111111',
        terminalAttemptId: '11111111-1111-4111-8111-111111111111',
        cumulativeUsage: {
          turns: 2,
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 50,
          cacheCreationTokens: 10,
          totalTokens: 180,
          maxContextTokens: 120,
        },
      },
      eligibility: {
        reachabilityRef: 'provider-reachability:codex-live',
        limitEvidenceRefs: ['provider-limit:codex-live'],
        accountRefHash: null,
        authMode: 'subscription',
        transport: 'cli',
        executionBackend: 'docker',
        executionProfileRef: 'execution-profile:codex-xverify',
      },
      invocationReceiptRef: {
        schemaVersion: 1,
        tenantId: 'tenant-a',
        projectId: 'project-a',
        invocationId: 'invocation-xverify-a',
      },
      assurance: 'typed-host-adjudicated',
      adjudicationReceiptRef: `cross-verify-verdict:sha256:${'a'.repeat(64)}`,
    };
    const res = validateTaskResult({ ...validResult(), crossVerify });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.crossVerify).toEqual(crossVerify);
  });

  it('preserves unavailable cross-verify evidence without fabricating a verifier', () => {
    const crossVerify = {
      outcome: 'unavailable',
      reason: 'no-second-provider',
      authorityEvidenceRef: 'xverify-authority:hold-0001',
      invocationReceiptRef: {
        schemaVersion: 1,
        tenantId: 'tenant-a',
        projectId: 'project-a',
        invocationId: 'invocation-xverify-hold',
      },
    };
    const res = validateTaskResult({ ...validResult(), crossVerify });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.crossVerify).toEqual(crossVerify);
  });

  it('rejects an unknown selfAssessment verdict (enum-guarded)', () => {
    const res = validateTaskResult({ ...validResult(), selfAssessment: 'MAYBE' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // a bad enum value is an INVALID value, not a MISSING field
    expect(res.missingFields).not.toContain('selfAssessment');
    expect(res.errors.some((e) => e.startsWith('selfAssessment:'))).toBe(true);
  });

  it('treats a malformed nested value as an error, never as a missing field', () => {
    const bad = validResult();
    (bad.tokenUsage as Record<string, unknown>).inputTokens = -5; // nonnegative violated
    const res = validateTaskResult(bad);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.missingFields).not.toContain('tokenUsage.inputTokens');
    expect(res.errors.some((e) => e.startsWith('tokenUsage.inputTokens:'))).toBe(true);
  });

  it('flags a missing required sub-field with its dotted path', () => {
    const bad = validResult();
    delete (bad.tokenUsage as Record<string, unknown>).source;
    const res = validateTaskResult(bad);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.missingFields).toContain('tokenUsage.source');
  });

  it('is reachable as the single-source re-export from ./types.js', () => {
    expect(VERSION_VIA_TYPES).toBe('1.0');
    const res = validateViaTypes(validResult());
    expect(res.ok).toBe(true);
  });
});

const V2_JSON_BOUNDS: CanonicalJsonBounds = Object.freeze({
  maxDepth: 30,
  maxNodes: 20_000,
  maxStringBytes: 16 * 1024,
  maxArrayLength: 2_000,
  maxObjectKeys: 256,
  maxCanonicalBytes: 512 * 1024,
});

const V2_IDENTITY: TaskAttemptCustodyIdentityV2 = Object.freeze({
  schemaVersion: 2,
  backend: 'docker',
  projectRootSha256: 'a'.repeat(64),
  projectId: 'project-schema-v2',
  taskId: '326-001',
  attemptId: '123e4567-e89b-42d3-a456-426614174000',
  generation: 7,
});

function canonicalV1Result(): Record<string, unknown> {
  const parsed = validateTaskResult({ ...validResult(), attempt: 3 });
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.value as unknown as Record<string, unknown>;
}

function custodyBinding() {
  return {
    version: 2 as const,
    identity: V2_IDENTITY,
    policyDigest: `sha256:${'b'.repeat(64)}` as const,
    admissionReceiptDigest: `sha256:${'c'.repeat(64)}` as const,
    sourceResult: {
      artifactClass: 'worker-result' as const,
      artifactKey: 'primary',
      artifactReceiptDigest: `sha256:${'d'.repeat(64)}` as const,
      artifactSha256: `sha256:${'e'.repeat(64)}` as const,
      byteLength: 512,
    },
    hostWorkAttribution: {
      artifactClass: 'host-work-attribution' as const,
      artifactKey: `host-work-${V2_IDENTITY.attemptId}`,
      artifactReceiptDigest: `sha256:${'6'.repeat(64)}` as const,
      artifactSha256: `sha256:${'7'.repeat(64)}` as const,
      byteLength: 256,
    },
    effectLanding: createTaskAttemptEffectLandingBindingV2({
      identity: {
        projectId: V2_IDENTITY.projectId,
        taskId: V2_IDENTITY.taskId,
        attemptId: V2_IDENTITY.attemptId,
        generation: V2_IDENTITY.generation,
      },
      admissionReceiptDigest: `sha256:${'c'.repeat(64)}`,
      custodyPolicyDigest: `sha256:${'b'.repeat(64)}`,
      landingArtifactKey: 'primary-landing',
      landingArtifactReceiptDigest: `sha256:${'1'.repeat(64)}`,
      landingReceiptDigest: `sha256:${'2'.repeat(64)}`,
      effectLandingChainDigest: `sha256:${'3'.repeat(64)}`,
      readyLifecycleAuthorityDigest: `sha256:${'8'.repeat(64)}`,
      disposition: 'COMMITTED',
      effectDecisionDigest: `sha256:${'4'.repeat(64)}`,
      transactionDigest: `sha256:${'5'.repeat(64)}`,
    }),
  };
}

describe('task-result-schema V2 exact attempt custody', () => {
  it('creates a strict host-bound V2 result without changing V1 behavior', () => {
    const result = createProductionTaskResultV2({
      result: canonicalV1Result(),
      attemptCustody: custodyBinding(),
      jsonBounds: V2_JSON_BOUNDS,
    });
    expect(result.schemaVersion).toBe(TASK_RESULT_SCHEMA_VERSION_V2);
    expect(result.attempt).toBe(3);
    expect(result.attemptCustody.identity.generation).toBe(7);
    expect(result.taskId).toBe(result.attemptCustody.identity.taskId);
    expect(result.attemptCustody.hostPromotion).toMatchObject({
      version: 2,
      kind: 'task-result-host-promotion',
      authority: 'host-canonical-ingress-assembler',
    });

    const v1 = validateTaskResult(validResult());
    expect(v1.ok && v1.value.schemaVersion).toBe('1.0');
  });

  it('allows legacy attempt projection to differ from custody generation', () => {
    const result = createProductionTaskResultV2({
      result: canonicalV1Result(),
      attemptCustody: custodyBinding(),
      jsonBounds: V2_JSON_BOUNDS,
    });
    expect(result.attempt).toBe(3);
    expect(result.attemptCustody.identity.generation).toBe(7);
  });

  it('produces a key-order-stable domain-separated digest', () => {
    const result = createProductionTaskResultV2({
      result: canonicalV1Result(),
      attemptCustody: custodyBinding(),
      jsonBounds: V2_JSON_BOUNDS,
    });
    const reordered = Object.fromEntries(Object.entries(result).reverse());
    const parsed = validateProductionTaskResultV2(reordered, V2_JSON_BOUNDS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(taskResultV2Digest(parsed.value, V2_JSON_BOUNDS)).toBe(
      taskResultV2Digest(result, V2_JSON_BOUNDS),
    );
  });

  it('rejects missing V2 identity, binding, or explicit attempt', () => {
    const result = createProductionTaskResultV2({
      result: canonicalV1Result(),
      attemptCustody: custodyBinding(),
      jsonBounds: V2_JSON_BOUNDS,
    }) as unknown as Record<string, unknown>;
    const withoutBinding = { ...result };
    delete withoutBinding.attemptCustody;
    expect(validateProductionTaskResultV2(withoutBinding, V2_JSON_BOUNDS).ok).toBe(false);
    const withoutAttempt = { ...result };
    delete withoutAttempt.attempt;
    expect(validateProductionTaskResultV2(withoutAttempt, V2_JSON_BOUNDS).ok).toBe(false);
    const malformedIdentity = {
      ...result,
      attemptCustody: { ...custodyBinding(), identity: { ...V2_IDENTITY, generation: 0 } },
    };
    expect(validateProductionTaskResultV2(malformedIdentity, V2_JSON_BOUNDS).ok).toBe(false);
    const withoutHostWorkAttribution = {
      ...result,
      attemptCustody: { ...custodyBinding(), hostWorkAttribution: undefined },
    };
    expect(validateProductionTaskResultV2(
      withoutHostWorkAttribution,
      V2_JSON_BOUNDS,
    ).ok).toBe(false);
  });

  it('rejects task/sibling identity mismatch and malformed digests', () => {
    const source = canonicalV1Result();
    expect(() => createProductionTaskResultV2({
      result: source,
      attemptCustody: {
        ...custodyBinding(),
        identity: { ...V2_IDENTITY, taskId: 'sibling-task' },
      },
      jsonBounds: V2_JSON_BOUNDS,
    })).toThrow(/custody identity mismatch/u);
    expect(() => createProductionTaskResultV2({
      result: source,
      attemptCustody: { ...custodyBinding(), admissionReceiptDigest: 'sha256:not-valid' },
      jsonBounds: V2_JSON_BOUNDS,
    })).toThrow(/validation failed/u);
    const binding = custodyBinding();
    const {
      version: _version,
      kind: _kind,
      bindingDigest: _bindingDigest,
      ...effectLandingBody
    } = binding.effectLanding;
    const foreignEffectLanding = createTaskAttemptEffectLandingBindingV2({
      ...effectLandingBody,
      identity: { ...effectLandingBody.identity, generation: 8 },
    });
    expect(() => createProductionTaskResultV2({
      result: source,
      attemptCustody: { ...binding, effectLanding: foreignEffectLanding },
      jsonBounds: V2_JSON_BOUNDS,
    })).toThrow(/exact attempt authority mismatch/u);
  });

  it('uses the custody parser byte, UUID and lineage bounds without a weaker schema copy', () => {
    const result = createProductionTaskResultV2({
      result: canonicalV1Result(),
      attemptCustody: custodyBinding(),
      jsonBounds: V2_JSON_BOUNDS,
    });
    const invalidIdentities: TaskAttemptCustodyIdentityV2[] = [
      { ...V2_IDENTITY, attemptId: V2_IDENTITY.attemptId.toUpperCase() },
      { ...V2_IDENTITY, projectId: 'ğ'.repeat(257) },
      { ...V2_IDENTITY, taskId: 'ğ'.repeat(257) },
      { ...V2_IDENTITY, generation: TASK_ATTEMPT_CUSTODY_MAX_LINEAGE_DEPTH + 1 },
    ];
    for (const identity of invalidIdentities) {
      const candidate = {
        ...result,
        taskId: identity.taskId,
        attemptCustody: { ...custodyBinding(), identity },
      };
      expect(validateProductionTaskResultV2(candidate, V2_JSON_BOUNDS).ok).toBe(false);
    }
    expect(() => createProductionTaskResultV2({
      result: canonicalV1Result(),
      attemptCustody: {
        ...custodyBinding(),
        sourceResult: {
          ...custodyBinding().sourceResult,
          byteLength: Number.MAX_SAFE_INTEGER + 1,
        },
      },
      jsonBounds: V2_JSON_BOUNDS,
    })).toThrow(/source custody binding validation failed/u);
  });

  it('recomputes the host-assembled V1 promotion digest instead of trusting a supplied marker', () => {
    const result = createProductionTaskResultV2({
      result: canonicalV1Result(),
      attemptCustody: custodyBinding(),
      jsonBounds: V2_JSON_BOUNDS,
    });
    const tampered = {
      ...result,
      attemptCustody: {
        ...result.attemptCustody,
        hostPromotion: {
          ...result.attemptCustody.hostPromotion,
          assembledV1Digest: `sha256:${'0'.repeat(64)}`,
        },
      },
    };
    const validation = validateProductionTaskResultV2(tampered, V2_JSON_BOUNDS);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.errors.join(' ')).toMatch(/assembled V1 digest mismatch/u);
    }
  });

  it('rejects nested unknown fields instead of silently stripping them', () => {
    const result = createProductionTaskResultV2({
      result: canonicalV1Result(),
      attemptCustody: custodyBinding(),
      jsonBounds: V2_JSON_BOUNDS,
    });
    const withNestedUnknown = {
      ...result,
      tokenUsage: { ...result.tokenUsage, forgedAuthority: true },
    };
    const validated = validateProductionTaskResultV2(withNestedUnknown, V2_JSON_BOUNDS);
    expect(validated.ok).toBe(false);
    if (!validated.ok) expect(validated.errors.join(' ')).toMatch(/non-canonical|repaired/u);
  });

  it('refuses a worker-supplied custody binding or non-canonical V1 source', () => {
    expect(() => createProductionTaskResultV2({
      result: { ...canonicalV1Result(), attemptCustody: custodyBinding() },
      attemptCustody: custodyBinding(),
      jsonBounds: V2_JSON_BOUNDS,
    })).toThrow(/supplied by the host/u);
    const source = canonicalV1Result();
    delete source.attempt;
    expect(() => createProductionTaskResultV2({
      result: source,
      attemptCustody: custodyBinding(),
      jsonBounds: V2_JSON_BOUNDS,
    })).toThrow(/explicit canonical V1/u);

    const accessorSource = canonicalV1Result();
    Object.defineProperty(accessorSource, 'notes', {
      enumerable: true,
      configurable: true,
      get: () => 'forged-through-accessor',
    });
    expect(() => createProductionTaskResultV2({
      result: accessorSource,
      attemptCustody: custodyBinding(),
      jsonBounds: V2_JSON_BOUNDS,
    })).toThrow(/canonical data/u);
  });
});
