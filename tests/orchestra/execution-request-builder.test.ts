// Tests for execution-request-builder.ts — actor data-plumbing (Sprint 262 T9)
// Verifies that resolveToTask threads actor from ExecutionRequest onto Task,
// and that absent actor leaves task.actor undefined (backward-safe).

import { describe, it, expect } from 'vitest';
import { buildExecutionRequest, resolveToTask } from '../../src/orchestra/execution-request-builder.js';
import type { ExecutionRequestInput } from '../../src/orchestra/execution-request-builder.js';
import type { ActorContext } from '../../src/core/work-model.js';

// ─── Minimal fixture ─────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ExecutionRequestInput> = {}): ExecutionRequestInput {
  return {
    description: 'test task',
    projectRoot: '/tmp/test-project',
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
