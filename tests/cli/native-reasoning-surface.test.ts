// tests/cli/native-reasoning-surface.test.ts
// ═══ 7108 — terminal surface: EN/TR catalog rows, vars interpolation, the
// bridge's collapsed thinking indicator (string-free + injected label), the
// localized exhaustion notice / typed transport failure, and the checkpoint's
// structured (reasoning-off) request. Hermetic: scripted adapters, tmpdirs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';
import {
  applySignalVars,
  createNativeEngine,
  localizeNativeAgentSignal,
  type NativeReasoningActivityEvent,
} from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import { createAgentSession, type AgentSessionEvent } from '../../src/agent/session.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { DEFAULT_NATIVE_AGENT_BUDGET, resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import { ProviderTransportError, classifyTransportFailure } from '../../src/agent/provider-tooluse/transport-errors.js';
import { resolveNativeSelection } from '../../src/cli/repl/native-transport.js';
import { NATIVE_ERROR_CODES, localizeNativeError } from '../../src/cli/repl/run.js';
import type { ReasoningControlDescriptor } from '../../src/core/model-registry-types.js';

const NEW_KEYS = [
  'native.reasoning_exhausted_output_ceiling',
  'native.reasoning_recovery.retry-reasoning-off',
  'native.reasoning_recovery.retry-raised-ceiling',
  'native.reasoning_exhausted',
  'native.transport-failure',
  'native.transport-failure.no-retry',
  'native.transport-failure.permanent',
  'native.transport-failure.not-authorized',
  'native.reasoning_exhausted.retry-unadmissible',
  'tui.native_reasoning_active',
  'native.switch.invalid-reasoning-control',
  'native.boot.invalid-reasoning-control',
] as const;

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const cwd = (): string => { const root = mkdtempSync(join(tmpdir(), 'reasoning-surface-')); roots.push(root); return root; };

const TOGGLEABLE: ReasoningControlDescriptor = {
  toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'server-reported',
};

function scripted(scripts: ProviderEvent[][], descriptor?: ReasoningControlDescriptor): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  return { requests, adapter: {
    name: 'mock',
    ...(descriptor ? { reasoningControl: () => descriptor } : {}),
    async *send(req) { requests.push(req); for (const e of scripts[requests.length - 1] ?? [{ type: 'done' }]) yield e; },
  } };
}

describe('catalog', () => {
  it.each(NEW_KEYS)('%s exists in en and tr, distinct, non-empty', (key) => {
    expect(getMessageLanguages(key)).toEqual(expect.arrayContaining(['en', 'tr']));
    const en = getMessage(key, 'en'); const tr = getMessage(key, 'tr');
    expect(en).not.toBe(key); expect(tr).not.toBe(key);
    expect(en.length).toBeGreaterThan(0); expect(tr.length).toBeGreaterThan(0);
    expect(en).not.toBe(tr);
  });

  it('applySignalVars interpolates plain vars and localizes the recovery action through the catalog', () => {
    const t = (key: string) => getMessage(key, 'tr');
    const text = applySignalVars(t, 'x {code} y {retries} — {action}', { code: 'ECONNRESET', retries: '1', action: 'retry-reasoning-off' });
    expect(text).toBe(`x ECONNRESET y 1 — ${getMessage('native.reasoning_recovery.retry-reasoning-off', 'tr')}`);
    expect(applySignalVars(t, 'plain', undefined)).toBe('plain');
  });

  it.each(['native.reasoning_exhausted_output_ceiling', 'native.reasoning_exhausted', 'native.reasoning_exhausted.retry-unadmissible',
    'native.transport-failure', 'native.transport-failure.no-retry', 'native.transport-failure.permanent', 'native.transport-failure.not-authorized'])(
    '%s is a recognized native-agent signal in both languages', (code) => {
      for (const lang of ['en', 'tr'] as const) {
        expect(localizeNativeAgentSignal((k) => getMessage(k, lang), code, 'raw')).not.toBe('raw');
      }
    });

  it('the new native error code is part of the boot/switch contract and localizes in both phases', () => {
    expect(NATIVE_ERROR_CODES).toContain('invalid-reasoning-control');
    for (const lang of ['en', 'tr'] as const) {
      for (const phase of ['boot', 'switch'] as const) {
        const line = localizeNativeError({ error: 'raw', errorCode: 'invalid-reasoning-control', detail: 'local_llm.reasoningControl', provider: 'local-llm' }, lang, phase);
        expect(line).not.toBe('raw');
        expect(line).toContain('local_llm.reasoningControl');
      }
    }
  });
});

describe('bridge — collapsed thinking indicator', () => {
  it('emits a string-free thinking event with the injected label and approx tokens, cleared when visible text arrives', async () => {
    const { adapter } = scripted([[
      { type: 'reasoning-activity', chars: 4_000 }, { type: 'reasoning-activity', chars: 4_000 },
      { type: 'text-delta', text: 'answer' }, { type: 'done', stopReason: 'stop' },
    ]]);
    const events: Array<NativeReasoningActivityEvent | 'text'> = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: cwd(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {}, t: (k) => getMessage(k, 'en'), nativeBudget: DEFAULT_NATIVE_AGENT_BUDGET,
    });
    await engine('go', {
      output: (text) => { if (text === 'answer') events.push('text'); },
      onTurnEnd: () => {},
      onReasoningActivity: (event) => events.push(event),
    });
    expect(events[0]).toEqual({ kind: 'thinking', approxTokens: 1_000, label: getMessage('tui.native_reasoning_active', 'en') });
    // Throttled: the second delta within the render interval does not re-emit.
    expect(events.filter((e) => e !== 'text' && e.kind === 'thinking')).toHaveLength(1);
    const clearIndex = events.findIndex((e) => e !== 'text' && e.kind === 'clear');
    expect(clearIndex).toBeGreaterThan(0);
    expect(clearIndex).toBeLessThan(events.indexOf('text'));
    expect(JSON.stringify(events)).not.toContain('reasoning_content');
  });

  it('without a consumer the indicator is inert (no throw, no output)', async () => {
    const { adapter } = scripted([[{ type: 'reasoning-activity', chars: 10 }, { type: 'text-delta', text: 'ok' }, { type: 'done' }]]);
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: cwd(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {}, t: (k) => getMessage(k, 'en'),
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    expect(out.join('')).toBe('ok');
  });
});

describe('bridge — localized exhaustion notice and transport failure', () => {
  it.each(['en', 'tr'] as const)('%s: renders the exhaustion notice with tokens, ceiling and the localized recovery action', async (lang) => {
    const { adapter, requests } = scripted([
      [{ type: 'reasoning-activity', chars: 16_384 }, { type: 'usage', inputTokens: 10, outputTokens: 4_096 }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: 'ok' }, { type: 'done', stopReason: 'stop' }],
    ], TOGGLEABLE);
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: cwd(), model: 'm', lang,
      confirm: async () => 'y', toolSink: () => {}, t: (k) => getMessage(k, lang), nativeBudget: DEFAULT_NATIVE_AGENT_BUDGET,
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    const text = out.join('');
    const expected = getMessage('native.reasoning_exhausted_output_ceiling', lang, {
      ceiling: String(DEFAULT_NATIVE_AGENT_BUDGET.outputReserveTokens + DEFAULT_NATIVE_AGENT_BUDGET.reasoning.budgetTokens),
      reasoningTokens: '4096',
      action: getMessage('native.reasoning_recovery.retry-reasoning-off', lang),
    });
    expect(text).toContain(expected);
    expect(text).not.toContain('{action}');
    expect(text).toContain('ok');
    expect(requests[1]?.reasoning).toEqual({ mode: 'off' });
  });

  it.each(['en', 'tr'] as const)('%s: a typed transport failure names the real code and the retry count', async (lang) => {
    const adapter: ProviderAdapter = { name: 'drop', async *send() {
      throw new ProviderTransportError('openai-compatible', 'connect',
        classifyTransportFailure(new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) }), 'connect'), 2, 1);
    } };
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: cwd(), model: 'm', lang,
      confirm: async () => 'y', toolSink: () => {}, t: (k) => getMessage(k, lang), nativeBudget: DEFAULT_NATIVE_AGENT_BUDGET,
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    const text = out.join('');
    expect(text).toContain(getMessage('native.transport-failure', lang, { code: 'ECONNRESET', retries: '1', configured: '1' }));
    expect(text).not.toContain('{configured}');
    expect(text).not.toContain('{code}');
    expect(text).not.toContain('fetch failed');
  });
});

describe('session checkpoint is a structured request', () => {
  it('sends reasoning off + the config-resolved transport retry, ceiling = visible reserve', async () => {
    const checkpoint = JSON.stringify({ schemaVersion: 1, objective: 'o', findings: [], evidenceRefs: [], decisions: [], unresolved: [],
      nextActions: [], inspectedAreas: [], toolResultDigests: [], cumulativeCounters: {}, createdAt: '2026-09-09T00:00:00.000Z' });
    const requests: ProviderRequest[] = [];
    const adapter: ProviderAdapter = { name: 'ckpt', reasoningControl: () => TOGGLEABLE, async *send(req) {
      requests.push(req);
      yield { type: 'text-delta', text: checkpoint }; yield { type: 'done' };
    } };
    const nativeBudget = { ...resolveNativeAgentBudget({}), outputReserveTokens: 100, contextSafetyReserveTokens: 100 };
    const session = createAgentSession({
      adapter, cwd: cwd(), model: 'm', registry: new ToolRegistry(), policy: SAFE_DEFAULT_POLICY,
      ruleStore: { grant() {}, revoke() {}, activeRules: () => [], activeDenies: () => [] },
      nativeBudget, getContextBudgetTokens: () => 131_072,
      scratch: { tenantId: 't', projectId: 'p', sessionId: 's', checkpointInstruction: 'checkpoint-fixture' },
    });
    try {
      const events: AgentSessionEvent[] = [];
      for await (const e of session.compactContext()) events.push(e);
      const ckpt = requests.find((r) => r.system === 'checkpoint-fixture');
      expect(ckpt?.reasoning).toEqual({ mode: 'off' });
      expect(ckpt?.transportRetry).toEqual({ attempts: nativeBudget.transportRetry, backoffMs: nativeBudget.transportRetryBackoffMs });
      expect(ckpt?.outputCeilingTokens).toBe(100);
      expect(session.latestCheckpoint().status).toBe('ok');
    } finally { session.close(); }
  });
});

describe('native-transport — local-llm reasoning-control authority', () => {
  it('exposes a descriptor capability that resolves from live /props evidence and rides through the admission wrapper', async () => {
    const projectRoot = cwd();
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/props?model=served-id')) return new Response(JSON.stringify({ default_generation_settings: { n_ctx: 8192 }, chat_template: '{% if enable_thinking %}' }), { status: 200 });
      if (u.includes('/models')) return new Response(JSON.stringify({ data: [{ id: 'served-id' }] }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    const resolved = resolveNativeSelection({ provider: 'local-llm', model: 'served-id' },
      { projectRoot, env: {}, config: { local_llm: { endpoint: 'http://127.0.0.1:8080/v1' } }, fetchFn });
    expect(resolved).not.toHaveProperty('error');
    if ('error' in resolved) return;
    expect(await resolved.adapter.reasoningControl?.('served-id')).toEqual({
      toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'server-reported',
    });
  });

  it('owner config outranks the probe; invalid config is a typed selection refusal', async () => {
    const projectRoot = cwd();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const configured = resolveNativeSelection({ provider: 'local-llm', model: 'served-id' }, {
      projectRoot, env: {}, fetchFn,
      config: { local_llm: { endpoint: 'http://127.0.0.1:8080/v1', reasoningControl: { toggle: 'none', sharesCompletionBudget: false } } },
    });
    expect(configured).not.toHaveProperty('error');
    if (!('error' in configured)) {
      expect(await configured.adapter.reasoningControl?.('served-id')).toEqual({ toggle: { kind: 'none' }, sharesCompletionBudget: false, provenance: 'configured' });
      expect(fetchFn).not.toHaveBeenCalled();
    }
    const invalid = resolveNativeSelection({ provider: 'local-llm', model: 'served-id' }, {
      projectRoot, env: {}, fetchFn,
      config: { local_llm: { endpoint: 'http://127.0.0.1:8080/v1', reasoningControl: { toggle: 'thinking', sharesCompletionBudget: true } as never } },
    });
    expect(invalid).toMatchObject({ errorCode: 'invalid-reasoning-control', detail: 'local_llm.reasoningControl', provider: 'local-llm' });
  });
});
