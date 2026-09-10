// 7113 D — the bridge turns host progress into ONE localized Workline fact,
// repaints at the reasoning indicator's cadence, always paints a terminal
// phase, clears at turn end, and audits phase transitions with counts only.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeEngine, type NativeReferenceActivityEvent } from '../../../src/cli/repl/native-agent-bridge.js';
import { runNativeTurnLoop } from '../../../src/cli/repl/app.js';
import { buildNativeToolRegistry } from '../../../src/cli/repl/native-tool-registry.js';
import { openScopedReferenceSnapshot } from '../../../src/cli/repl/run.js';
import { expandAtRefs } from '../../../src/cli/repl/at-ref.js';
import { createSessionToolContentStore } from '../../../src/agent/session-tool-content.js';
import { resolveScratchRoot } from '../../../src/agent/scratch-checkpoint.js';
import { projectSlug } from '../../../src/core/project-slug.js';
import { resolveNativeAgentBudget } from '../../../src/core/execution-budget-policy.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import type { ProviderAdapter, ProviderRequest } from '../../../src/agent/provider-tooluse/types.js';
import type { StructuredTurnInput } from '../../../src/agent/session.js';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function harness(lang: 'en' | 'tr', options: { enabled?: boolean } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'deckent-7113d-')); roots.push(cwd);
  writeFileSync(join(cwd, 'large.md'), 'Large source line.\n'.repeat(3000));
  const scope = { tenantId: 'test', projectId: 'project', sessionId: `s-${Date.now()}`, slug: projectSlug(cwd) };
  const layout = resolveScratchRoot(scope); roots.push(layout.sessionRoot);
  const store = createSessionToolContentStore({ dir: layout.root });
  const requests: ProviderRequest[] = [];
  const adapter: ProviderAdapter = {
    name: 'fixture-bridge',
    reasoningControl: () => ({ toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'configured' }),
    structuredOutputControl: () => ({ toggle: { kind: 'openai.response_format.json_schema' as const }, provenance: 'configured' as const }),
    requestMeasurement: { async measure() { return { inputTokens: 100, provenance: 'fixture' }; } },
    async *send(req) {
      requests.push(req);
      if (req.purpose) {
        const data = JSON.parse(req.messages[0]!.content).data;
        const coverage = data.sections ?? data.children.flatMap((c: { coverage: unknown[] }) => c.coverage);
        yield { type: 'text-delta', text: JSON.stringify({ claims: [{ text: 'Fact', citations: [coverage[0]] }], decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: ['May omit detail.'] }) };
      } else yield { type: 'text-delta', text: 'Final answer' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 30 };
      yield { type: 'done', stopReason: 'stop' };
    },
  };
  const engine = createNativeEngine({
    adapter, registry: buildNativeToolRegistry({ cwd: () => cwd }), cwd, model: 'fixture-bridge', lang,
    confirm: async () => 'y', toolSink: () => {}, t: (key) => getMessage(key, lang),
    nativeBudget: resolveNativeAgentBudget({ policy: { native_agent: { largeReference: { enabled: options.enabled !== false } } } }),
    scratch: { ...scope, checkpointProjectRoot: cwd }, contentStore: store, getContextBudgetTokens: () => 32768,
    referenceCapability: {
      snapshot: (path, snapshotScope, signal, authorizeRead) => openScopedReferenceSnapshot({ resolveCwd: () => cwd, path, scope: snapshotScope, signal, authorizeRead, store, maxBytes: 1_000_000, maxWallTimeMs: 10_000 }),
      inline: (raw, contents) => { const expansion = expandAtRefs(raw, p => contents.get(p) ?? null); return { prompt: expansion.prompt, references: expansion.refs.map(r => ({ path: r.path, digest: r.digest, bytes: r.bytes, excerpt: '', ok: r.ok, truncated: r.truncated })) }; },
    },
  });
  const activity: NativeReferenceActivityEvent[] = [];
  const turn: StructuredTurnInput = { rawIntent: 'Analyze @large.md', expandedPayload: 'Analyze @large.md', references: [], referenceRequests: ['large.md'] };
  return { cwd, engine, activity, requests, turn, scope };
}

describe('7113 D bridge → Workline', () => {
  it.each(['en', 'tr'] as const)('%s: emits one localized progress line and clears it when the turn ends', async (lang) => {
    const h = harness(lang);
    await h.engine(h.turn.expandedPayload, {
      output: () => {}, onTurnEnd: () => {},
      onReferenceActivity: (event) => h.activity.push(event),
    }, h.turn);
    const painted = h.activity.filter(e => e.kind === 'progress');
    expect(painted.length).toBeGreaterThan(0);
    for (const event of painted) {
      expect(event.label.split('\n')).toHaveLength(1);
      expect(event.compactLabel.split('\n')).toHaveLength(1);
      expect(event.label).toContain('large.md');
    }
    // The last painted line is the terminal one and is never throttled away.
    const last = painted.at(-1)!;
    expect(last.terminal).toBe(true);
    expect(last.label).toContain(getMessage('native.reference.phase.complete', lang));
    expect(h.activity.at(-1)).toEqual({ kind: 'clear' });
  });

  it('repaints at the indicator cadence but never withholds a terminal phase', async () => {
    const h = harness('en');
    await h.engine(h.turn.expandedPayload, {
      output: () => {}, onTurnEnd: () => {},
      onReferenceActivity: (event) => h.activity.push(event),
    }, h.turn);
    const painted = h.activity.filter(e => e.kind === 'progress');
    // The program publishes far more transitions than this (per source chunk,
    // per request, per node); the view sees a small, calm number of repaints.
    expect(painted.length).toBeLessThan(12);
    expect(painted.filter(e => e.terminal).length).toBeGreaterThan(0);
  });

  it('records every phase transition in the privacy-safe audit with counts only', async () => {
    const h = harness('en');
    await h.engine(h.turn.expandedPayload, { output: () => {}, onTurnEnd: () => {} }, h.turn);
    const eventsFile = join(h.cwd, '.deckent', 'recently-works', 'repl-events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const rows = readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as { payload?: { action?: string; metadata?: Record<string, unknown> } })
      .map(row => row.payload!)
      .filter(payload => typeof payload?.action === 'string' && payload.action.startsWith('reference-digest.'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map(r => r.action)).toContain('reference-digest.complete');
    for (const row of rows) {
      expect(row.metadata!['sourceBytes']).toBeTypeOf('number');
      expect(JSON.stringify(row.metadata)).not.toContain('Large source line');
    }
    // One audit row per phase transition — not one per publish.
    expect(new Set(rows.map(r => r.action)).size).toBe(rows.length);
  });

  it('emits nothing when large references are disabled', async () => {
    const h = harness('en', { enabled: false });
    await h.engine(h.turn.expandedPayload, {
      output: () => {}, onTurnEnd: () => {},
      onReferenceActivity: (event) => h.activity.push(event),
    }, h.turn);
    expect(h.activity).toEqual([]);
  });
});

describe('7113 D turn loop forwarding', () => {
  it('scopes the activity to its own turn and always clears at the end', async () => {
    const events: Array<{ event: NativeReferenceActivityEvent; turnId: number }> = [];
    const engine = Object.assign(
      async (_input: string, cbs: Parameters<typeof runNativeTurnLoop>[1] extends never ? never : any) => {
        cbs.onReferenceActivity?.({ kind: 'progress', label: 'l', compactLabel: 'c', terminal: false });
      },
      {},
    );
    await runNativeTurnLoop((async function* () { yield 'one'; yield 'two'; })(), engine as never, {
      output: () => {}, onTurnError: () => {},
      onReferenceActivity: (event, turnId) => events.push({ event, turnId }),
    });
    expect(events.map(e => `${e.turnId}:${e.event.kind}`)).toEqual(['1:progress', '1:clear', '2:progress', '2:clear']);
  });
});
