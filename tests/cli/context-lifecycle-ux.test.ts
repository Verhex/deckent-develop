// tests/cli/context-lifecycle-ux.test.ts
// 560-005 (RCA §7) — typed context-lifecycle UX classes, i18n-clean
// (en+tr), each rendering a distinct message.

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import {
  createNativeEngine,
  classifyContextLifecycleEvent,
  localizeContextLifecycleClass,
  type ContextLifecycleClass,
} from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import type { AgentSessionEvent } from '../../src/agent/session.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';

function scripted(scripts: ProviderEvent[][]): ProviderAdapter {
  let turn = 0;
  return { name: 'mock', async *send() { for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } };
}

const ALL_CLASSES: ContextLifecycleClass[] = [
  'INPUT_CONTEXT_OVERFLOW',
  'OUTPUT_CEILING_REACHED',
  'CONTINUATION_EXHAUSTED',
  'EMPTY_VISIBLE_CONTENT_WITH_REASONING',
  'MEASURED_CONTEXT_PRESSURE_REQUIRES_CHECKPOINT',
  'CADENCE_REQUIRES_CHECKPOINT',
];

const SAMPLE_EVENTS: Record<ContextLifecycleClass, AgentSessionEvent> = {
  INPUT_CONTEXT_OVERFLOW: { type: 'error', code: 'native-context.admission-denied', message: 'context admission denied — request needs ~9000 tokens, effective context is 4000' },
  OUTPUT_CEILING_REACHED: { type: 'generation-recovery', classification: 'OUTPUT_LIMIT', continuationIndex: 0, maxContinuations: 2, hiddenReasoningObserved: false, action: 'continue' },
  CONTINUATION_EXHAUSTED: { type: 'error', code: 'native-output.continuation-exhausted', message: 'native-output.continuation-exhausted' },
  EMPTY_VISIBLE_CONTENT_WITH_REASONING: { type: 'generation-recovery', classification: 'EMPTY_VISIBLE_AFTER_REASONING', continuationIndex: 1, maxContinuations: 2, hiddenReasoningObserved: true, action: 'continue' },
  MEASURED_CONTEXT_PRESSURE_REQUIRES_CHECKPOINT: { type: 'budget-checkpoint-request', reason: 'token-pressure', rounds: 3, toolCalls: 1 },
  CADENCE_REQUIRES_CHECKPOINT: { type: 'budget-checkpoint-request', reason: 'cadence-rounds', rounds: 10, toolCalls: 0 },
};

describe('classifyContextLifecycleEvent (unit, pure)', () => {
  for (const cls of ALL_CLASSES) {
    it(`classifies the real wire event for ${cls}`, () => {
      expect(classifyContextLifecycleEvent(SAMPLE_EVENTS[cls])).toBe(cls);
    });
  }

  it('returns undefined for a generation-recovery event with action "hold"', () => {
    const held: AgentSessionEvent = { type: 'generation-recovery', classification: 'OUTPUT_LIMIT', continuationIndex: 2, maxContinuations: 2, hiddenReasoningObserved: false, action: 'hold' };
    expect(classifyContextLifecycleEvent(held)).toBeUndefined();
  });

  it('classifies cadence-toolcalls as CADENCE_REQUIRES_CHECKPOINT', () => {
    expect(classifyContextLifecycleEvent({
      type: 'budget-checkpoint-request', reason: 'cadence-toolcalls', rounds: 5, toolCalls: 50,
    })).toBe('CADENCE_REQUIRES_CHECKPOINT');
  });

  it('returns undefined for no-progress stall checkpoints', () => {
    expect(classifyContextLifecycleEvent({
      type: 'budget-checkpoint-request', reason: 'no-progress', rounds: 8, toolCalls: 2,
    })).toBeUndefined();
  });

  it('never maps token-pressure to a reference-expansion message key', () => {
    const pressure: AgentSessionEvent = { type: 'budget-checkpoint-request', reason: 'token-pressure', rounds: 3, toolCalls: 1 };
    expect(classifyContextLifecycleEvent(pressure)).toBe('MEASURED_CONTEXT_PRESSURE_REQUIRES_CHECKPOINT');
  });

  it('returns undefined for TRANSPORT_EMPTY (empty-response) — a real event, but not one of the formal classes', () => {
    const emptyResponse: AgentSessionEvent = { type: 'error', code: 'empty-response', message: 'model returned an empty response' };
    expect(classifyContextLifecycleEvent(emptyResponse)).toBeUndefined();
  });

  it('returns undefined for an unrelated event type (e.g. text-delta)', () => {
    expect(classifyContextLifecycleEvent({ type: 'text-delta', text: 'hi' })).toBeUndefined();
  });
});

describe('localizeContextLifecycleClass — typed classes, i18n-clean (en+tr), never conflated', () => {
  const identity = (k: string) => k;

  it('the classifier resolves to a distinct, non-empty message key per class', () => {
    const keys = ALL_CLASSES.map((cls) => localizeContextLifecycleClass(identity, cls));
    expect(new Set(keys).size).toBe(ALL_CLASSES.length);
    for (const key of keys) expect(key.length).toBeGreaterThan(0);
  });

  for (const lang of ['en', 'tr'] as const) {
    it(`renders pairwise-distinct real ${lang} messages (no class shows another class's message)`, () => {
      const t = (key: string) => getMessage(key, lang);
      const rendered = ALL_CLASSES.map((cls) => localizeContextLifecycleClass(t, cls));
      for (const [i, cls] of ALL_CLASSES.entries()) {
        const key = localizeContextLifecycleClass(identity, cls);
        expect(rendered[i]).not.toBe(key);
      }
      expect(new Set(rendered).size).toBe(ALL_CLASSES.length);
    });
  }

  it('MEASURED_CONTEXT_PRESSURE uses measured-context-pressure wording (en)', () => {
    const t = (k: string) => getMessage(k, 'en');
    const pressureMsg = localizeContextLifecycleClass(t, 'MEASURED_CONTEXT_PRESSURE_REQUIRES_CHECKPOINT');
    expect(pressureMsg.toLowerCase()).toContain('measured context pressure');
    expect(pressureMsg.toLowerCase()).not.toMatch(/expanded reference material/);
  });

  it('MEASURED_CONTEXT_PRESSURE uses ölçülmüş bağlam baskısı wording (tr)', () => {
    const t = (key: string) => getMessage(key, 'tr');
    const pressureMsg = localizeContextLifecycleClass(t, 'MEASURED_CONTEXT_PRESSURE_REQUIRES_CHECKPOINT');
    expect(pressureMsg).toContain('Ölçülmüş bağlam baskısı');
    expect(pressureMsg).not.toMatch(/Genişletilmiş referans/);
  });

  it('CADENCE uses execution budget checkpoint wording (en)', () => {
    const msg = localizeContextLifecycleClass((k) => getMessage(k, 'en'), 'CADENCE_REQUIRES_CHECKPOINT');
    expect(msg.toLowerCase()).toContain('execution budget checkpoint');
  });

  it('CADENCE uses yürütme bütçesi checkpoint wording (tr)', () => {
    const msg = localizeContextLifecycleClass((k) => getMessage(k, 'tr'), 'CADENCE_REQUIRES_CHECKPOINT');
    expect(msg).toContain('Yürütme bütçesi checkpoint');
  });

  it('ONLY INPUT_CONTEXT_OVERFLOW claims the context window is full — the other classes never do (en)', () => {
    const t = (k: string) => getMessage(k, 'en');
    const overflowMsg = localizeContextLifecycleClass(t, 'INPUT_CONTEXT_OVERFLOW');
    expect(overflowMsg.toLowerCase()).toContain('context window');
    for (const cls of ALL_CLASSES.filter((c) => c !== 'INPUT_CONTEXT_OVERFLOW')) {
      const msg = localizeContextLifecycleClass(t, cls);
      expect(msg.toLowerCase()).not.toContain('context window is full');
      expect(msg.toLowerCase()).not.toMatch(/context window may be full/);
    }
  });
});

describe('createNativeEngine — real end-to-end wiring of typed context-lifecycle classes (RCA §7)', () => {
  it('MEASURED_CONTEXT_PRESSURE + INPUT_CONTEXT_OVERFLOW: overflowed context renders measured-pressure checkpoint and terminal overflow', async () => {
    const adapter = scripted([]);
    const out: string[] = [];
    const nativeBudget = {
      maxModelRounds: 20,
      maxToolCalls: 50,
      maxWallTimeMs: 600_000,
      maxCumulativeTokens: 1_000_000,
      maxNoProgressRounds: 10,
      checkpointEveryRounds: 100_000,
      checkpointEveryToolCalls: 100_000,
      outputReserveTokens: 16,
      contextSafetyReserveTokens: 16,
    };
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      t: (k) => getMessage(k, 'en'),
      nativeBudget,
      getContextBudgetTokens: () => 20_000,
    });
    await engine('x '.repeat(30_000), { output: (t) => out.push(t), onTurnEnd: () => {} });
    const text = out.join('');
    expect(text).toContain(getMessage('native-context.checkpoint_token_pressure', 'en'));
    expect(text).toContain(getMessage('native-context.admission-denied', 'en'));
  });

  it('CADENCE_REQUIRES_CHECKPOINT end-to-end: cadence budget tick renders execution budget checkpoint notice', async () => {
    const adapter = scripted([
      [{ type: 'text-delta', text: 'ok' }, { type: 'done', stopReason: 'stop' }],
    ]);
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      t: (k) => getMessage(k, 'en'),
      nativeBudget: {
        maxModelRounds: 20,
        maxToolCalls: 50,
        maxWallTimeMs: 600_000,
        maxCumulativeTokens: 1_000_000,
        maxNoProgressRounds: 10,
        checkpointEveryRounds: 1,
        checkpointEveryToolCalls: 100_000,
        outputReserveTokens: 16,
        contextSafetyReserveTokens: 16,
      },
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    expect(out.join('')).toContain(getMessage('native-context.checkpoint_cadence', 'en'));
  });
});
