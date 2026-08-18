// tests/cli/context-lifecycle-ux.test.ts
// 560-005 (RCA §7) — five typed context-lifecycle UX classes, i18n-clean
// (en+tr), each rendering a distinct message. NO_GO condition under test: one
// class must never show another class's message — most importantly, terminal
// OUTPUT exhaustion (OUTPUT_CEILING_REACHED / CONTINUATION_EXHAUSTED /
// EMPTY_VISIBLE_CONTENT_WITH_REASONING) must never read like a genuine
// INPUT_CONTEXT_OVERFLOW, and vice versa (today's "context window may be
// full" mislabel on a plain output-exhaustion event).

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
  'REFERENCE_EXPANSION_REQUIRES_CHECKPOINT',
];

// One representative wire event per class, built directly from the real
// AgentSessionEvent shapes loop.ts/session.ts actually emit (RCA §7 mapping).
const SAMPLE_EVENTS: Record<ContextLifecycleClass, AgentSessionEvent> = {
  INPUT_CONTEXT_OVERFLOW: { type: 'error', code: 'native-context.admission-denied', message: 'context admission denied — request needs ~9000 tokens, effective context is 4000' },
  OUTPUT_CEILING_REACHED: { type: 'generation-recovery', classification: 'OUTPUT_LIMIT', continuationIndex: 0, maxContinuations: 2, hiddenReasoningObserved: false, action: 'continue' },
  CONTINUATION_EXHAUSTED: { type: 'error', code: 'native-output.continuation-exhausted', message: 'native-output.continuation-exhausted' },
  EMPTY_VISIBLE_CONTENT_WITH_REASONING: { type: 'generation-recovery', classification: 'EMPTY_VISIBLE_AFTER_REASONING', continuationIndex: 1, maxContinuations: 2, hiddenReasoningObserved: true, action: 'continue' },
  REFERENCE_EXPANSION_REQUIRES_CHECKPOINT: { type: 'budget-checkpoint-request', reason: 'token-pressure', rounds: 3, toolCalls: 1 },
};

describe('classifyContextLifecycleEvent (unit, pure)', () => {
  for (const cls of ALL_CLASSES) {
    it(`classifies the real wire event for ${cls}`, () => {
      expect(classifyContextLifecycleEvent(SAMPLE_EVENTS[cls])).toBe(cls);
    });
  }

  it('returns undefined for a generation-recovery event with action "hold" (the paired error carries the terminal state instead)', () => {
    const held: AgentSessionEvent = { type: 'generation-recovery', classification: 'OUTPUT_LIMIT', continuationIndex: 2, maxContinuations: 2, hiddenReasoningObserved: false, action: 'hold' };
    expect(classifyContextLifecycleEvent(held)).toBeUndefined();
  });

  it('returns undefined for a non-token-pressure checkpoint-request reason', () => {
    const cadence: AgentSessionEvent = { type: 'budget-checkpoint-request', reason: 'cadence-rounds', rounds: 10, toolCalls: 0 };
    expect(classifyContextLifecycleEvent(cadence)).toBeUndefined();
  });

  it('returns undefined for TRANSPORT_EMPTY (empty-response) — a real event, but not one of the five formal classes', () => {
    const emptyResponse: AgentSessionEvent = { type: 'error', code: 'empty-response', message: 'model returned an empty response' };
    expect(classifyContextLifecycleEvent(emptyResponse)).toBeUndefined();
  });

  it('returns undefined for an unrelated event type (e.g. text-delta)', () => {
    expect(classifyContextLifecycleEvent({ type: 'text-delta', text: 'hi' })).toBeUndefined();
  });
});

describe('localizeContextLifecycleClass — five classes, i18n-clean (en+tr), never conflated', () => {
  const identity = (k: string) => k;

  it('the classifier resolves to a distinct, non-empty message key per class', () => {
    const keys = ALL_CLASSES.map((cls) => localizeContextLifecycleClass(identity, cls));
    expect(new Set(keys).size).toBe(ALL_CLASSES.length);
    for (const key of keys) expect(key.length).toBeGreaterThan(0);
  });

  for (const lang of ['en', 'tr'] as const) {
    it(`renders five pairwise-distinct real ${lang} messages (no class shows another class's message)`, () => {
      const t = (key: string) => getMessage(key, lang);
      const rendered = ALL_CLASSES.map((cls) => localizeContextLifecycleClass(t, cls));
      // Every message actually resolved to a real translation, not a raw key fallback.
      for (const [i, cls] of ALL_CLASSES.entries()) {
        const key = localizeContextLifecycleClass(identity, cls);
        expect(rendered[i]).not.toBe(key);
      }
      expect(new Set(rendered).size).toBe(ALL_CLASSES.length);
    });
  }

  it('en and tr texts differ for every class (actually translated, not copy-pasted)', () => {
    for (const cls of ALL_CLASSES) {
      const en = localizeContextLifecycleClass((k) => getMessage(k, 'en'), cls);
      const tr = localizeContextLifecycleClass((k) => getMessage(k, 'tr'), cls);
      expect(en).not.toBe(tr);
    }
  });

  it('ONLY INPUT_CONTEXT_OVERFLOW claims the context window is full — the other four never do (en)', () => {
    const t = (k: string) => getMessage(k, 'en');
    const overflowMsg = localizeContextLifecycleClass(t, 'INPUT_CONTEXT_OVERFLOW');
    expect(overflowMsg.toLowerCase()).toContain('context window');
    for (const cls of ALL_CLASSES.filter((c) => c !== 'INPUT_CONTEXT_OVERFLOW')) {
      const msg = localizeContextLifecycleClass(t, cls);
      expect(msg.toLowerCase()).not.toContain('context window is full');
      expect(msg.toLowerCase()).not.toMatch(/context window may be full/);
    }
  });

  it('ONLY INPUT_CONTEXT_OVERFLOW claims the context window is full — the other four never do (tr)', () => {
    const t = (k: string) => getMessage(k, 'tr');
    const overflowMsg = localizeContextLifecycleClass(t, 'INPUT_CONTEXT_OVERFLOW');
    expect(overflowMsg).toContain('bağlam penceresi');
    for (const cls of ALL_CLASSES.filter((c) => c !== 'INPUT_CONTEXT_OVERFLOW')) {
      const msg = localizeContextLifecycleClass(t, cls);
      expect(msg).not.toMatch(/bağlam penceresi.*dolu/);
    }
  });

  it('fixes the historical "empty-response" mislabel: no longer claims the context window may be full, in either language', () => {
    expect(getMessage('native.empty-response', 'en').toLowerCase()).not.toContain('context window may be full');
    expect(getMessage('native.empty-response', 'tr')).not.toMatch(/context penceresi dolmuş olabilir/);
  });
});

describe('createNativeEngine — real end-to-end wiring of the five typed classes (RCA §7)', () => {
  it('OUTPUT_CEILING_REACHED: a length-cut segment with visible text renders the ceiling-reached notice and recovers the full answer', async () => {
    const adapter = scripted([
      [{ type: 'text-delta', text: 'partial' }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: ' rest' }, { type: 'done', stopReason: 'stop' }],
    ]);
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      t: (k) => getMessage(k, 'en'),
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    const text = out.join('');
    expect(text).toContain(getMessage('native.output-ceiling-reached', 'en'));
    expect(text).toContain('partial');
    expect(text).toContain('rest');
    // Never conflated with the context-overflow or continuation-exhausted wording.
    expect(text).not.toContain(getMessage('native-context.admission-denied', 'en'));
    expect(text).not.toContain(getMessage('native-output.continuation-exhausted', 'en'));
  });

  it('EMPTY_VISIBLE_CONTENT_WITH_REASONING: hidden reasoning with no visible text renders the reasoning-recovery notice, distinct from a plain empty response', async () => {
    const adapter = scripted([
      [{ type: 'reasoning-activity', chars: 400 }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: 'ok' }, { type: 'done', stopReason: 'stop' }],
    ]);
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'tr',
      confirm: async () => 'y', toolSink: () => {},
      t: (k) => getMessage(k, 'tr'),
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    const text = out.join('');
    expect(text).toContain(getMessage('native.empty-visible-with-reasoning', 'tr'));
    expect(text).toContain('ok');
    expect(text).not.toContain(getMessage('native-context.admission-denied', 'tr'));
    expect(text).not.toContain(getMessage('native.empty-response', 'tr'));
  });

  it('CONTINUATION_EXHAUSTED: repeated length-cuts past the continuation cap render the exhaustion notice, not an ongoing "ceiling reached" message', async () => {
    const adapter = scripted([
      [{ type: 'text-delta', text: 'a' }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: 'b' }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: 'c' }, { type: 'done', stopReason: 'length' }],
    ]);
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      t: (k) => getMessage(k, 'en'),
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    const text = out.join('');
    expect(text).toContain(getMessage('native-output.continuation-exhausted', 'en'));
    expect(text).not.toContain(getMessage('native-context.admission-denied', 'en'));
  });

  it('INPUT_CONTEXT_OVERFLOW + REFERENCE_EXPANSION_REQUIRES_CHECKPOINT: a genuinely overflowed context (no scratch store) renders both the checkpoint attempt and the terminal overflow notice, never the output-exhaustion wording', async () => {
    const adapter = scripted([]); // the turn aborts before any provider call — admission fails client-side
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
      getContextBudgetTokens: () => 5,
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    const text = out.join('');
    expect(text).toContain(getMessage('native.reference-expansion-checkpoint', 'en'));
    expect(text).toContain(getMessage('native-context.admission-denied', 'en'));
    expect(text).not.toContain(getMessage('native-output.continuation-exhausted', 'en'));
    expect(text).not.toContain(getMessage('native.output-ceiling-reached', 'en'));
    expect(text).not.toContain(getMessage('native.empty-visible-with-reasoning', 'en'));
  });
});
