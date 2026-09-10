// 7113-E-LOCALIZATION — the reference failure must reach the user as a cause,
// not as a raw key.
//
// Real run 2026-09-10T01:28Z printed `[native.reference.unavailable]` with no
// reason: `localizeNativeAgentSignal` prefixed an already-namespaced code and
// looked up `native.native.reference.unavailable`. These tests walk the WHOLE
// chain — session error event → bridge localization → cbs.output — in both
// languages, and pin the unknown-code fallback that must not regress.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeEngine, localizeNativeAgentSignal, applySignalVars } from '../../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../../src/cli/repl/native-tool-registry.js';
import { resolveNativeAgentBudget } from '../../../src/core/execution-budget-policy.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { projectSlug } from '../../../src/core/project-slug.js';
import { resolveScratchRoot } from '../../../src/agent/scratch-checkpoint.js';
import { createSessionToolContentStore } from '../../../src/agent/session-tool-content.js';
import type { ProviderAdapter } from '../../../src/agent/provider-tooluse/types.js';
import type { StructuredTurnInput } from '../../../src/agent/session.js';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function harness(lang: 'en' | 'tr') {
  const cwd = mkdtempSync(join(tmpdir(), 'deckent-7113e-')); roots.push(cwd);
  writeFileSync(join(cwd, 'large.md'), 'Large source line.\n'.repeat(3000));
  const scope = { tenantId: 'test', projectId: 'project', sessionId: `s-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  const layout = resolveScratchRoot({ ...scope, slug: projectSlug(cwd) }); roots.push(layout.sessionRoot);
  const store = createSessionToolContentStore({ dir: layout.root });
  const adapter: ProviderAdapter = {
    name: 'fixture',
    reasoningControl: () => ({ toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'configured' }),
    requestMeasurement: { async measure() { return { inputTokens: 100, provenance: 'fixture' }; } },
    async *send() { yield { type: 'text-delta', text: 'unused' }; yield { type: 'done', stopReason: 'stop' }; },
  };
  const output: string[] = [];
  // largeReference is enabled but NO referenceCapability is supplied, so the
  // session refuses the reference with a typed reason — the exact shape the
  // real failure took, without needing a provider.
  const engine = createNativeEngine({
    adapter, registry: buildNativeToolRegistry({ cwd: () => cwd }), cwd, model: 'fixture', lang,
    confirm: async () => 'y', toolSink: () => {}, t: (key) => getMessage(key, lang),
    nativeBudget: resolveNativeAgentBudget({ policy: { native_agent: { largeReference: { enabled: true } } } }),
    scratch: { ...scope, checkpointProjectRoot: cwd }, contentStore: store, getContextBudgetTokens: () => 32768,
  });
  const turn: StructuredTurnInput = { rawIntent: 'Analyze @large.md', expandedPayload: 'Analyze @large.md', references: [], referenceRequests: ['large.md'] };
  return { engine, output, turn };
}

describe('7113-E reference failure localization (full bridge chain)', () => {
  it.each(['en', 'tr'] as const)('%s: the user reads the cause, never the raw key', async (lang) => {
    const h = harness(lang);
    await h.engine(h.turn.expandedPayload, {
      output: (text) => h.output.push(text),
      onTurnEnd: () => {},
    }, h.turn);
    const printed = h.output.join('');
    // The catalog sentence, with its {reason} replaced by a real sentence.
    const template = getMessage('native.reference.unavailable', lang);
    const head = template.split('{')[0]!.trim();
    expect(printed).toContain(head);
    expect(printed).toContain(getMessage('native.reference.failure.reference_scope_refused', lang));
    // The two shapes that made the real run useless.
    expect(printed).not.toContain('[native.reference.unavailable]');
    expect(printed).not.toContain('REFERENCE_SCOPE_REFUSED');
  });

  it('an already-namespaced code resolves to its own key', () => {
    const t = (key: string): string => getMessage(key, 'en');
    expect(localizeNativeAgentSignal(t, 'native.reference.unavailable', 'native.reference.unavailable'))
      .toBe(getMessage('native.reference.unavailable', 'en'));
  });

  it('a bare code still gets the historical native. prefix', () => {
    const t = (key: string): string => getMessage(key, 'en');
    expect(localizeNativeAgentSignal(t, 'checkpoint.saved', 'fallback')).toBe(getMessage('native.checkpoint.saved', 'en'));
  });

  it('an unknown code still falls back to the caller text (no regression)', () => {
    const t = (key: string): string => getMessage(key, 'en');
    expect(localizeNativeAgentSignal(t, 'native.not.a.real.key', 'plain fallback')).toBe('plain fallback');
    expect(localizeNativeAgentSignal(t, 'also.not.real', 'plain fallback')).toBe('plain fallback');
  });

  it.each(['en', 'tr'] as const)('%s: every typed reference failure becomes a sentence in the signal vars', (lang) => {
    const t = (key: string): string => getMessage(key, lang);
    const rendered = applySignalVars(t, getMessage('native.reference.unavailable', lang), { reason: 'REFERENCE_OUTPUT_INVALID' });
    expect(rendered).toContain(getMessage('native.reference.failure.reference_output_invalid', lang));
    expect(rendered).not.toContain('REFERENCE_OUTPUT_INVALID');
  });
});
