// Tests for execution-request-builder.ts — actor data-plumbing (Sprint 262 T9)
// Verifies that resolveToTask threads actor from ExecutionRequest onto Task,
// and that absent actor leaves task.actor undefined (backward-safe).

import { describe, it, expect } from 'vitest';
import { buildExecutionRequest, resolveToTask, resolveExecutionModelIdentity } from '../../src/orchestra/execution-request-builder.js';
import type { ExecutionRequestInput } from '../../src/orchestra/execution-request-builder.js';
import type { ActorContext } from '../../src/core/work-model.js';

// ─── Minimal fixture ─────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ExecutionRequestInput> = {}): ExecutionRequestInput {
  return {
    description: 'test task',
    projectRoot: '/tmp/test-project',
    // 453-001: resolveToTask now requires a resolved (canonical) model — a
    // missing model throws rather than silently defaulting to an alias. The
    // actor-threading assertions below never inspect the model, so a valid
    // canonical ID here keeps those cases exercising exactly what they target.
    model: 'claude-sonnet-5',
    ...overrides,
  };
}

// ─── resolveToTask — actor threading ─────────────────────────────────────────

describe('resolveToTask actor threading', () => {
  it('threads actor from ExecutionRequest onto Task when present', () => {
    const actor: ActorContext = { id: 'user-123', role: 'admin', tenantId: 'tenant-abc' };
    const req = buildExecutionRequest(makeInput({ actor }));
    const task = resolveToTask(req, 'run-001');
    expect(task.actor).toEqual(actor);
  });

  it('leaves task.actor undefined when actor is absent (backward-safe)', () => {
    const req = buildExecutionRequest(makeInput());
    const task = resolveToTask(req, 'run-002');
    expect(task.actor).toBeUndefined();
  });

  it('preserves actor with only required id field', () => {
    const actor: ActorContext = { id: 'minimal-user' };
    const req = buildExecutionRequest(makeInput({ actor }));
    const task = resolveToTask(req, 'run-003');
    expect(task.actor).toEqual({ id: 'minimal-user' });
    expect(task.actor?.role).toBeUndefined();
    expect(task.actor?.tenantId).toBeUndefined();
  });

  it('does not affect other Task fields when actor is set', () => {
    const actor: ActorContext = { id: 'user-456' };
    const req = buildExecutionRequest(makeInput({ actor, description: 'actor-test task' }));
    const task = resolveToTask(req, 'run-004');
    expect(task.id).toBe('run-004');
    expect(task.title).toBe('actor-test task');
    expect(task.actor).toEqual(actor);
  });
});

// ─── buildExecutionRequest — actor passthrough ────────────────────────────────

describe('buildExecutionRequest actor passthrough', () => {
  it('forwards actor from input to ExecutionRequest', () => {
    const actor: ActorContext = { id: 'req-user', tenantId: 'req-tenant' };
    const req = buildExecutionRequest(makeInput({ actor }));
    expect(req.actor).toEqual(actor);
  });

  it('leaves req.actor undefined when not supplied', () => {
    const req = buildExecutionRequest(makeInput());
    expect(req.actor).toBeUndefined();
  });
});

describe('ExecutionBudget durable propagation', () => {
  it('preserves maxTokens/maxUsd through ExecutionRequest into Task JSON shape', () => {
    const budget = { maxTokens: 250_000, maxUsd: 12.5 };
    const req = buildExecutionRequest(makeInput({ budget }));
    const task = resolveToTask(req, 'run-budget-001');
    expect(req.budget).toEqual(budget);
    expect(task.budget).toEqual(budget);
  });
});

// ─── resolveExecutionModelIdentity — canonical model boundary (453-001) ───────
// The single validate/resolve boundary the CLI + MCP one-shot entry points share.
// Unique parametric IDs per test avoid within-file registry bleed (registerParametric
// mutates the shared singleton).

describe('resolveExecutionModelIdentity canonical boundary', () => {
  /** Returns the thrown DeckentError code, or a sentinel if it did not throw. */
  function codeOf(fn: () => unknown): string {
    try { fn(); return '<no-throw>'; }
    catch (e) { return (e as { code?: string }).code ?? '<no-code>'; }
  }

  it('accepts a known ID exact and infers its owning provider from the registry', () => {
    expect(resolveExecutionModelIdentity('gpt-5.6-sol')).toEqual({ model: 'gpt-5.6-sol', provider: 'codex' });
    expect(resolveExecutionModelIdentity('claude-sonnet-5')).toEqual({ model: 'claude-sonnet-5', provider: 'claude' });
  });

  it('rejects an unseen cloud ID without pricing evidence even with an explicit provider', () => {
    expect(codeOf(() => resolveExecutionModelIdentity('gpt-5.6-vega-453a', 'codex')))
      .toBe('E_MODEL_PRICING_UNVERIFIED');
  });

  it('rejects a legacy alias (gpt-5 / sonnet) before it can reach a Task', () => {
    expect(codeOf(() => resolveExecutionModelIdentity('gpt-5'))).toBe('E_LEGACY_MODEL_ALIAS');
    expect(codeOf(() => resolveExecutionModelIdentity('sonnet'))).toBe('E_LEGACY_MODEL_ALIAS');
  });

  it('rejects an unknown ID without a provider (never guesses ownership)', () => {
    expect(codeOf(() => resolveExecutionModelIdentity('gpt-5.6-ghost-453b'))).toBe('E_MODEL_PROVIDER_UNVERIFIED');
  });

  it('rejects a provider/model mismatch for a known model', () => {
    expect(codeOf(() => resolveExecutionModelIdentity('claude-opus-4-8', 'codex'))).toBe('E_MODEL_PROVIDER_MISMATCH');
  });

  it('rejects an unknown explicit provider string (no garbage provider on unseen IDs)', () => {
    expect(codeOf(() => resolveExecutionModelIdentity('gpt-5.6-nova-453c', 'not-a-provider'))).toBe('E_PROVIDER_UNKNOWN');
  });
});
