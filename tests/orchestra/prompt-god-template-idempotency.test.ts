// ─── Idempotency Key Interpolation Tests (Sprint 182 PQ-1 / F1) ─────────────
// Sub-spec: docs/superpowers/specs/2026-05-21-worker-prompt-quality-fixes.md#f1
//
// Verifies that buildTaskPrompt emits a deterministic idempotency key into the
// "## Idempotency Key" section instead of the literal `${IDEMPOTENCY_KEY}`
// placeholder that previously leaked to workers (Sprint 181 live evidence).
//
// Locked decision: key format = `${sprintId}-${taskId}-${retryCount}` where
// retryCount falls back to 0 (sourced from routingMeta.rerouteCount when
// present). Determinism: same task input → same key. Collision-free:
// different taskIds → different keys.

import { describe, it, expect } from 'vitest';
import {
  buildTaskPrompt,
  computeIdempotencyKey,
  type SprintContext,
} from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Idempotency key test',
    description: 'Verify deterministic idempotency key injection.',
    model: 'sonnet',
    effort: 'low',
    priority: 'NORMAL',
    reason: 'Sprint 182 PQ-1 / F1 verification',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: ['src/foo.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-182',
    provider: 'claude',
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'generic',
    skillPrompts: [],
    allAdrs: [],
    effort: 'low',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('buildTaskPrompt — idempotency key interpolation (F1, Sprint 182 PQ-1)', () => {
  // T1: literal placeholder must NOT survive into the rendered prompt.
  it('does not emit the literal `${IDEMPOTENCY_KEY}` placeholder', () => {
    const artifact = buildTaskPrompt(makeTask(), makeCtx());
    expect(artifact.prompt).not.toContain('${IDEMPOTENCY_KEY}');
  });

  // T2: rendered prompt must contain the computed key `sprint-182-001-001-0`.
  it('embeds the deterministic key `<sprintId>-<taskId>-<retryCount>` under the Idempotency Key header', () => {
    const artifact = buildTaskPrompt(makeTask(), makeCtx());
    expect(artifact.prompt).toContain('## Idempotency Key\nsprint-182-001-001-0\n');
  });

  // T3: rendering the same task twice yields the same key (determinism).
  it('produces the same key when the same task is rendered twice (determinism)', () => {
    const task = makeTask();
    const a = buildTaskPrompt(task, makeCtx());
    const b = buildTaskPrompt(task, makeCtx());
    // Extract the line directly under "## Idempotency Key" header for both.
    const extract = (p: string): string => {
      const lines = p.split('\n');
      const hdrIdx = lines.indexOf('## Idempotency Key');
      expect(hdrIdx).toBeGreaterThanOrEqual(0);
      return lines[hdrIdx + 1] ?? '';
    };
    const keyA = extract(a.prompt);
    const keyB = extract(b.prompt);
    expect(keyA).toBe('sprint-182-001-001-0');
    expect(keyA).toBe(keyB);
  });

  // T4: different taskIds → different keys (no collision).
  it('produces different keys for different taskIds (collision-free)', () => {
    const taskA = makeTask({ id: '001-001' });
    const taskB = makeTask({ id: '001-002' });
    const a = buildTaskPrompt(taskA, makeCtx());
    const b = buildTaskPrompt(taskB, makeCtx());
    expect(a.prompt).toContain('sprint-182-001-001-0');
    expect(a.prompt).not.toContain('sprint-182-001-002-0');
    expect(b.prompt).toContain('sprint-182-001-002-0');
    expect(b.prompt).not.toContain('sprint-182-001-001-0');
  });

  // Bonus: retry-aware key changes when rerouteCount differs.
  it('changes the key when routingMeta.rerouteCount changes (retry safety)', () => {
    const fresh = buildTaskPrompt(makeTask(), makeCtx());
    const retried = buildTaskPrompt(
      makeTask({
        routingMeta: {
          rerouteCount: 2,
        },
      }),
      makeCtx(),
    );
    expect(fresh.prompt).toContain('sprint-182-001-001-0');
    expect(retried.prompt).toContain('sprint-182-001-001-2');
    expect(retried.prompt).not.toContain('sprint-182-001-001-0');
  });
});

describe('computeIdempotencyKey — pure helper (F1, Sprint 182 PQ-1)', () => {
  it('formats key as `${sprintId}-${taskId}-${retryCount}` when rerouteCount is set', () => {
    const key = computeIdempotencyKey(
      makeTask({ id: '042-007', sprintId: 'sprint-200', routingMeta: { rerouteCount: 3 } }),
    );
    expect(key).toBe('sprint-200-042-007-3');
  });

  it('defaults retryCount to 0 when routingMeta is absent', () => {
    const key = computeIdempotencyKey(makeTask({ id: '003-009', sprintId: 'sprint-150' }));
    expect(key).toBe('sprint-150-003-009-0');
  });

  it('uses the `no-sprint` sentinel when sprintId is missing', () => {
    const key = computeIdempotencyKey(makeTask({ id: '003-009', sprintId: undefined }));
    expect(key).toBe('no-sprint-003-009-0');
  });
});
