// tests/orchestra/autonomous/composition.test.ts
// Unit tests for buildEngineRuntime (Task 7 — composition root).
// Hermetic: no I/O, injectable mocks only.
import { describe, it, expect, vi } from 'vitest';
import { buildEngineRuntime } from '../../../src/orchestra/autonomous/runtime-loop.js';

describe('engine composition root', () => {
  const baseOpts = {
    projectRoot: '/p',
    config: { deckent_style: 'sprint' } as never,
    backlogPath: '/p/.deckent/autonomous/backlog.json',
    flows: [],
    policy: { id: 'p', trigger: 'scheduled', action: 'noop', disabled: true, guard: { requiresApproval: true } } as never,
    runTask: vi.fn(),
    runSprint: vi.fn(),
  };

  it('builds a runtime with the execute action wired + a policy gate + a trigger source', () => {
    const bundle = buildEngineRuntime(baseOpts);
    expect(bundle.deps.policyGate).toBeDefined();
    expect(typeof bundle.deps.triggerSource.next).toBe('function');
  });

  it('returns an approvalGate adapter on the bundle', () => {
    const bundle = buildEngineRuntime(baseOpts);
    expect(bundle.approvalGate).toBeDefined();
    expect(typeof bundle.approvalGate.accept).toBe('function');
    expect(typeof bundle.approvalGate.reject).toBe('function');
    expect(typeof bundle.approvalGate.pending).toBe('function');
  });

  it('policy gate returns auto for a non-backlog trigger (no entry payload)', () => {
    const bundle = buildEngineRuntime(baseOpts);
    const d = bundle.deps.policyGate!.decide({
      id: 't',
      source: 'scheduled-flow',
      action: 'x',
      requestedBy: 'system',
    });
    expect(d.decision).toBe('auto');
    expect(d.reason).toMatch(/authority-only/);
  });

  it('policy gate returns auto for a backlog entry with policy=auto', () => {
    const bundle = buildEngineRuntime(baseOpts);
    const trigger = {
      id: 'backlog-e1',
      source: 'backlog',
      action: 'autonomous.execute',
      requestedBy: 'system',
      payload: {
        entry: {
          id: 'e1', title: 'T', kind: 'task', spec: {}, policy: 'auto',
          trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null,
        },
      },
    };
    const d = bundle.deps.policyGate!.decide(trigger);
    expect(d.decision).toBe('auto');
  });

  it('policy gate returns park for a backlog entry with policy=approval-required', () => {
    const bundle = buildEngineRuntime(baseOpts);
    const trigger = {
      id: 'backlog-e2',
      source: 'backlog',
      action: 'autonomous.execute',
      requestedBy: 'system',
      payload: {
        entry: {
          id: 'e2', title: 'T', kind: 'task', spec: {}, policy: 'approval-required',
          trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null,
        },
      },
    };
    const d = bundle.deps.policyGate!.decide(trigger);
    expect(d.decision).toBe('park');
  });

  it('accepts an optional reactiveSource and includes it in the hybrid source', async () => {
    let called = false;
    const reactiveSource = {
      next: vi.fn(async () => {
        called = true;
        return null;
      }),
    };
    const bundle = buildEngineRuntime({ ...baseOpts, reactiveSource });
    // Calling next() on the hybrid source should call through to our reactive source
    // (backlog returns null for empty backlog; scheduled-flow also null; reactive is last).
    await bundle.deps.triggerSource.next();
    expect(called).toBe(true);
  });
});
