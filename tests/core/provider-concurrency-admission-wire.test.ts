import { describe, expect, it, vi } from 'vitest';

import { admitRoleInvocation } from '../../src/core/provider-limit-admission.js';
import type { ProviderLimitReservation } from '../../src/core/provider-limit-truth.js';
import type { ProviderLimitStore } from '../../src/core/provider-limit-store.js';
import type { RoleInvocationRequest, RoleInvocationSelected } from '../../src/core/role-invocation-resolver.js';
import type { ProviderConcurrencyCapabilityRequest } from '../../src/core/provider-concurrency-capability.js';
// Sprint 230 Task 230-002 — models.dev native wire
// Asserts that PROVIDER_MODEL_MAP, type guards, and provider adapters read
// from the live `modelRegistry` rather than a module-load snapshot, so that
// `bootstrapFromCatalog()` (models.dev) can introduce non-builtin models
// without a process restart.
import { afterEach } from "vitest";
import { PROVIDER_MODEL_MAP, isClaudeModel, isGeminiModel, isOpenAIModel, getProviderForModel, isValidModel } from "../../src/core/task-types.js";
import type { ModelDefinition } from "../../src/core/model-registry.js";
import { modelRegistry } from "../../src/core/model-registry.js";

const PROVIDER = 'claude' as const;
const MODEL = 'claude-opus-4-8';
const ACCOUNT_REF = 'a'.repeat(64);
const ENDPOINT_REF = 'b'.repeat(64);
const EVALUATED_AT = '2026-07-31T12:01:00.000Z';
const FRESHNESS = {
  observedAt: '2026-07-31T12:00:00.000Z',
  expiresAt: '2026-07-31T12:05:00.000Z',
};
const SCOPE = {
  tenantRef: 'tenant:admission-wire',
  principalRef: 'principal:admission-wire',
  authModeClass: 'auth:subscription',
};

function capability(
  provider: ProviderConcurrencyCapabilityRequest['provider'],
): ProviderConcurrencyCapabilityRequest {
  return {
    evaluatedAt: EVALUATED_AT,
    configured: { scope: SCOPE, ceiling: 8, evidenceRefs: ['configured:admission-wire'] },
    provider,
    host: { scope: SCOPE, ceiling: 5, evidenceRefs: ['host:admission-wire'] },
  };
}

function invocation(): RoleInvocationRequest {
  return {
    role: 'worker',
    primaryProvider: PROVIDER,
    model: MODEL,
    fallbackProviders: [],
    evidence: {
      [PROVIDER]: {
        reachability: {
          state: 'known', reachable: true, evidenceRef: 'reachability:admission-wire',
        },
        limits: { state: 'known', limited: false, evidenceRefs: ['limit:admission-wire'] },
      },
    },
  };
}

function candidateScopes() {
  return {
    [PROVIDER]: {
      provider: PROVIDER,
      model: MODEL,
      accountRefHash: ACCOUNT_REF,
      quotaScopeRefHash: 'quota:admission-wire',
      authMode: 'subscription' as const,
      backend: {
        transport: 'cli' as const,
        executionBackend: 'local' as const,
        endpointRefHash: null,
      },
      reachabilityEvidenceRef: 'reachability:admission-wire',
    },
  };
}

function reservation(selected: RoleInvocationSelected) {
  return {
    tenantId: 'tenant-a',
    projectId: 'project-a',
    provider: selected.provider,
    model: selected.model,
    accountRefHash: ACCOUNT_REF,
    quotaScopeRefHash: 'quota:admission-wire',
    authMode: 'subscription',
    backend: { transport: 'cli', executionBackend: 'local', endpointRefHash: null },
    reservationId: 'reservation:admission-wire',
    idempotencyKey: 'idempotency:admission-wire',
    runId: 'run-a',
    taskId: 'task-a',
    callId: 'call-a',
    attemptId: 'attempt-a',
    fenceTokenHash: 'c'.repeat(64),
    receiptRef: 'receipt:admission-wire',
    reachabilityEvidenceRef: 'reachability:admission-wire',
    estimates: [],
    estimateEvidenceRefs: ['estimate:admission-wire'],
    requestedAt: EVALUATED_AT,
    leaseExpiresAt: '2026-07-31T12:04:00.000Z',
  } as never;
}

function admittedReservation(): ProviderLimitReservation {
  return {
    decision: 'allow',
    reservationId: 'reservation:admission-wire',
    provider: PROVIDER,
    model: MODEL,
    snapshotEvidenceRef: 'snapshot:admission-wire',
  } as ProviderLimitReservation;
}

describe('provider concurrency admission wiring', () => {
  it('uses the resolver intersection before creating the existing provider-limit reservation', () => {
    const reserveWithStatus = vi.fn(() => ({ reservation: admittedReservation(), created: true }));
    const buildReservation = vi.fn(reservation);

    const result = admitRoleInvocation(
      { reserveWithStatus } as unknown as ProviderLimitStore,
      {
        invocation: invocation(),
        candidateScopes: candidateScopes(),
        concurrencyCapabilities: {
          [PROVIDER]: capability({
            state: 'known',
            scope: SCOPE,
            ceiling: 3,
            freshness: FRESHNESS,
            evidenceRefs: ['provider:admission-wire'],
          }),
        },
        buildReservation,
      },
    );

    expect(result).toMatchObject({
      decision: 'allow',
      attempts: [{
        concurrency: {
          decision: 'DEGRADED',
          effectiveAdmittedCeiling: 3,
          reasonCodes: ['provider_capacity_limited'],
        },
      }],
    });
    expect(buildReservation).toHaveBeenCalledOnce();
    expect(reserveWithStatus).toHaveBeenCalledOnce();
  });

  it.each([
    ['unknown', capability({
      state: 'unknown',
      scope: SCOPE,
      freshness: FRESHNESS,
      evidenceRefs: ['provider:unknown'],
    }), 'provider_capacity_unknown'],
    ['expired', capability({
      state: 'known',
      scope: SCOPE,
      ceiling: 3,
      freshness: { ...FRESHNESS, expiresAt: '2026-07-31T12:00:30.000Z' },
      evidenceRefs: ['provider:expired'],
    }), 'provider_capacity_expired'],
  ] as const)('holds %s provider authority without creating a reservation', (_state, concurrency, reasonCode) => {
    const reserveWithStatus = vi.fn();
    const buildReservation = vi.fn(reservation);

    const result = admitRoleInvocation(
      { reserveWithStatus } as unknown as ProviderLimitStore,
      {
        invocation: invocation(),
        candidateScopes: candidateScopes(),
        concurrencyCapabilities: { [PROVIDER]: concurrency },
        buildReservation,
      },
    );

    expect(result).toMatchObject({
      decision: 'hold',
      reasonCode: 'fallback_exhausted',
      attempts: [{
        reservation: null,
        concurrency: { decision: 'HOLD', reasonCodes: [reasonCode], effectiveAdmittedCeiling: 'unknown' },
      }],
    });
    expect(buildReservation).not.toHaveBeenCalled();
    expect(reserveWithStatus).not.toHaveBeenCalled();
  });
});

// WIRE-025: physically merged from tests/core/models-dev-wire.test.ts.
{
// ─── Test fixtures ──────────────────────────────────────────────────────────
const NON_BUILTIN_CODEX_ID = 'gpt-5.5-models-dev-test';

const NON_BUILTIN_GEMINI_ID = 'gemini-3.5-flash-models-dev-test';

const NON_BUILTIN_CLAUDE_ID = 'claude-opus-5-models-dev-test';

function makeDef(id: string, provider: 'claude' | 'codex' | 'gemini'): ModelDefinition {
    return {
        id,
        apiId: id,
        provider,
        tier: 'standard',
        contextWindow: 200000,
        costPerMillion: { input: 1, output: 4 },
        capabilities: {
            streaming: true,
            toolUse: true,
            vision: false,
            codeExecution: false,
            reasoning: false,
        },
        status: 'ga',
    };
}

// Cleanup: unregister test-injected models after every test to keep the
// shared registry hermetic across the suite.
const registeredTestIds: string[] = [];

afterEach(() => {
    while (registeredTestIds.length > 0) {
        const id = registeredTestIds.pop()!;
        modelRegistry.unregister(id);
    }
});

function registerTestModel(def: ModelDefinition): void {
    modelRegistry.register(def);
    registeredTestIds.push(def.id);
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('models.dev wire — type guards loosened to registry lookup', () => {
    it('isOpenAIModel accepts a non-builtin codex model registered at runtime', () => {
        expect(isOpenAIModel(NON_BUILTIN_CODEX_ID)).toBe(false);
        registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
        expect(isOpenAIModel(NON_BUILTIN_CODEX_ID)).toBe(true);
    });
    it('isGeminiModel accepts a non-builtin gemini model registered at runtime', () => {
        expect(isGeminiModel(NON_BUILTIN_GEMINI_ID)).toBe(false);
        registerTestModel(makeDef(NON_BUILTIN_GEMINI_ID, 'gemini'));
        expect(isGeminiModel(NON_BUILTIN_GEMINI_ID)).toBe(true);
    });
    it('isClaudeModel accepts a non-builtin claude model registered at runtime', () => {
        expect(isClaudeModel(NON_BUILTIN_CLAUDE_ID)).toBe(false);
        registerTestModel(makeDef(NON_BUILTIN_CLAUDE_ID, 'claude'));
        expect(isClaudeModel(NON_BUILTIN_CLAUDE_ID)).toBe(true);
    });
    it('builtin models still resolve to the correct provider after the change', () => {
        expect(isClaudeModel('claude-opus-4-8')).toBe(true);
        expect(isOpenAIModel('gpt-4.1')).toBe(true);
        expect(isGeminiModel('gemini-2.5-pro')).toBe(true);
        expect(isClaudeModel('gpt-4.1')).toBe(false);
        expect(isOpenAIModel('claude-opus-4-8')).toBe(false);
        expect(isGeminiModel('claude-opus-4-8')).toBe(false);
    });
});

describe('models.dev wire — getProviderForModel maps non-builtin entries', () => {
    it('routes a non-builtin codex model to the codex provider', () => {
        registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
        expect(getProviderForModel(NON_BUILTIN_CODEX_ID)).toBe('codex');
    });
    it('routes a non-builtin gemini model to the gemini provider', () => {
        registerTestModel(makeDef(NON_BUILTIN_GEMINI_ID, 'gemini'));
        expect(getProviderForModel(NON_BUILTIN_GEMINI_ID)).toBe('gemini');
    });
    it('isValidModel returns true for a registered non-builtin model and false before', () => {
        expect(isValidModel(NON_BUILTIN_CODEX_ID)).toBe(false);
        registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
        expect(isValidModel(NON_BUILTIN_CODEX_ID)).toBe(true);
    });
});

describe('models.dev wire — PROVIDER_MODEL_MAP reads live registry', () => {
    it('exposes a freshly registered codex model on PROVIDER_MODEL_MAP.codex', () => {
        const before = [...PROVIDER_MODEL_MAP.codex];
        expect(before).not.toContain(NON_BUILTIN_CODEX_ID);
        registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
        const after = [...PROVIDER_MODEL_MAP.codex];
        expect(after).toContain(NON_BUILTIN_CODEX_ID);
        // Live readers should not return the stale `before` snapshot.
        expect(after.length).toBe(before.length + 1);
    });
    it('exposes a freshly registered gemini model on PROVIDER_MODEL_MAP.gemini', () => {
        expect(PROVIDER_MODEL_MAP.gemini).not.toContain(NON_BUILTIN_GEMINI_ID);
        registerTestModel(makeDef(NON_BUILTIN_GEMINI_ID, 'gemini'));
        expect(PROVIDER_MODEL_MAP.gemini).toContain(NON_BUILTIN_GEMINI_ID);
    });
    it('removes an unregistered model from PROVIDER_MODEL_MAP on next access (live read)', () => {
        registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
        expect(PROVIDER_MODEL_MAP.codex).toContain(NON_BUILTIN_CODEX_ID);
        modelRegistry.unregister(NON_BUILTIN_CODEX_ID);
        // Pull the id out of the cleanup queue since we already unregistered it.
        const idx = registeredTestIds.indexOf(NON_BUILTIN_CODEX_ID);
        if (idx >= 0)
            registeredTestIds.splice(idx, 1);
        expect(PROVIDER_MODEL_MAP.codex).not.toContain(NON_BUILTIN_CODEX_ID);
    });
    it('preserves builtin model coverage when no extras are registered', () => {
        // Builtin baseline — these must always be present in the live view.
        expect(PROVIDER_MODEL_MAP.claude).toEqual(expect.arrayContaining(['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']));
        expect(PROVIDER_MODEL_MAP.codex).toEqual(expect.arrayContaining(['gpt-5.6-sol', 'gpt-4.1', 'o3']));
        expect(PROVIDER_MODEL_MAP.gemini).toEqual(expect.arrayContaining(['gemini-2.5-pro', 'gemini-2.5-flash']));
    });
});

describe('models.dev wire — provider adapter supportedModels is live', () => {
    it('ClaudeAdapter.supportedModels reflects a runtime-registered claude model', async () => {
        const { ClaudeAdapter } = await import("../../src/providers/claude.js");
        const adapter = new ClaudeAdapter('/tmp/deckent-models-dev-wire-test');
        expect(adapter.supportedModels).not.toContain(NON_BUILTIN_CLAUDE_ID);
        registerTestModel(makeDef(NON_BUILTIN_CLAUDE_ID, 'claude'));
        expect(adapter.supportedModels).toContain(NON_BUILTIN_CLAUDE_ID);
    });
    it('CodexAdapter.supportedModels reflects a runtime-registered codex model', async () => {
        const { CodexAdapter } = await import("../../src/providers/codex.js");
        const adapter = new CodexAdapter('/tmp/deckent-models-dev-wire-test');
        expect(adapter.supportedModels).not.toContain(NON_BUILTIN_CODEX_ID);
        registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
        expect(adapter.supportedModels).toContain(NON_BUILTIN_CODEX_ID);
    });
    it('GeminiAdapter.supportedModels reflects a runtime-registered gemini model', async () => {
        const { GeminiAdapter } = await import("../../src/providers/gemini.js");
        const adapter = new GeminiAdapter('/tmp/deckent-models-dev-wire-test');
        expect(adapter.supportedModels).not.toContain(NON_BUILTIN_GEMINI_ID);
        registerTestModel(makeDef(NON_BUILTIN_GEMINI_ID, 'gemini'));
        expect(adapter.supportedModels).toContain(NON_BUILTIN_GEMINI_ID);
    });
});
}
