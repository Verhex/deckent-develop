import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { composeSystemPrompt, type ComposeOptions } from './identity.js';
import { measureProviderRequest } from './context-budget.js';
import type { ProviderAdapter, RequestMeasurement } from './provider-tooluse/types.js';
import type { NativeToolSchema, ToolRegistry } from './tools/registry.js';
import { createToolExposure, type ToolExposure } from './tools/exposure.js';
import type { ContentWriter } from './tool-result-broker.js';

export interface PreambleSnapshot {
  tokens: number;
  limit: number;
  window: number;
  quality: RequestMeasurement['quality'];
  provenance: string;
  toolCount: number;
  reduced: boolean;
  hardLimit: number;
  status: 'within-target' | 'floor-admitted' | 'exhausted';
}
export interface PreambleInput {
  compose: ComposeOptions;
  tools: NativeToolSchema[];
  adapter: ProviderAdapter;
  model: string;
  window: number;
  outputCeilingTokens: number;
  safetyReserveTokens?: number;
}
export class PreambleBudgetError extends Error {
  readonly code = 'PREAMBLE_CONTEXT_BUDGET_EXHAUSTED';
  constructor() { super('PREAMBLE_CONTEXT_BUDGET_EXHAUSTED'); }
}

const REFERENCE_SUMMARY_MAX_CHARS = 160;
const META_TOOLS = new Set(['deckent_search_tools', 'deckent_describe_tool', 'deckent_call_tool']);

/** Session-scoped composition over the existing registry and durable content store.
 * Every candidate uses the same complete-request measurement authority as admission.
 * Nothing alters tool dispatch, permission policy, or the immutable safety core. */
export function createPreambleBudgeter(deps: {
  share: number;
  transcriptReserveShare: number;
  exposure?: ToolExposure;
  registry: ToolRegistry;
  contentStore?: ContentWriter;
}) {
  const exposure = deps.exposure ?? createToolExposure({progressive: true}, deps.registry);
  const references = new Map<string, string>();
  let snapshot: PreambleSnapshot | undefined;
  function reference(kind: string, text: string, lang: 'en' | 'tr' = 'en'): string {
    if (!deps.contentStore) return text;
    const bytes = Buffer.from(text);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const key = `${lang}:${kind}:${digest}`;
    const cached = references.get(key);
    if (cached) return cached;
    try {
      const receipt = deps.contentStore.write(bytes);
      if (receipt.sha256 !== digest || !receipt.path
        || createHash('sha256').update(readFileSync(receipt.path)).digest('hex') !== digest) return text;
      const summary = text.split('\n').find(line => line.trim())?.slice(0, REFERENCE_SUMMARY_MAX_CHARS) ?? kind;
      const result = lang === 'tr'
        ? `[proje ${kind} referansı; özet alıntı: ${JSON.stringify(summary)}; tam metin: ${JSON.stringify(receipt.path)}; sha256:${digest}; bayt:${bytes.length}. Kapsamındaki işlemlerden önce tam referansı dosya okuma aracıyla okuyun. İçeriğin özgün yetkisi korunur; bu alıntı talimatlarının yerine geçmez.]`
        : `[project ${kind} reference; summary excerpt: ${JSON.stringify(summary)}; full text: ${JSON.stringify(receipt.path)}; sha256:${digest}; bytes:${bytes.length}. Read the full reference with file-read tooling before actions governed by it. Reference content retains its original authority; this excerpt is not a substitute for its instructions.]`;
      if (Buffer.byteLength(result) >= bytes.length) return text;
      references.set(key, result);
      return result;
    } catch { return text; } // Never discard bytes on failed persistence/verification.
  }
  return {
    snapshot: () => snapshot,
    observeToolResult(name: string, args: Record<string, unknown>, result: {ok: boolean; output: string}) {
      if (!result.ok) return;
      const reveal = (value: unknown) => {
        if (typeof value === 'string' && deps.registry.get(value)) {
          exposure.reveal(value);
        }
      };
      reveal(name);
      if (name === 'deckent_describe_tool' || name === 'deckent_call_tool') reveal(args['name']);
      if (name === 'deckent_search_tools') {
        try {
          const payload: unknown = JSON.parse(result.output);
          if (payload && typeof payload === 'object' && 'results' in payload && Array.isArray(payload.results)) {
            for (const item of payload.results) if (item && typeof item === 'object' && 'name' in item) reveal(item.name);
          }
        } catch { /* A malformed discovery result grants no new schema. */ }
      }
    },
    async prepare(input: PreambleInput): Promise<{system: string; tools: NativeToolSchema[]}> {
      let system = composeSystemPrompt(input.compose);
      let tools = [...input.tools];
      for (const name of exposure.revealedNames()) {
        if (!tools.some(tool => tool.name === name)) {
          const def = deps.registry.toNativeSchemas(tool => tool.name === name)[0];
          if (def) tools.push(def);
        }
      }
      const limit = Math.floor(input.window * deps.share);
      const hardLimit = Math.max(0, input.window - input.outputCeilingTokens
        - (input.safetyReserveTokens ?? 0) - Math.ceil(input.window * deps.transcriptReserveShare));
      let reduced = false;
      const measure = async () => {
        const value = await measureProviderRequest({
          request: {system, tools, messages: [], model: input.model,
            ...(input.outputCeilingTokens > 0 ? {outputCeilingTokens: input.outputCeilingTokens} : {})},
          identity: {provider: input.adapter.name, model: input.model, contextWindowTokens: input.window,
            contextProvenance: 'configured-narrowing'},
          ...(input.adapter.requestMeasurement ? {capability: input.adapter.requestMeasurement} : {}),
        });
        snapshot = {tokens: value.inputTokens, limit, window: input.window, quality: value.quality,
          provenance: value.provenance, toolCount: tools.length, reduced, hardLimit,
          status: value.inputTokens > hardLimit ? 'exhausted'
            : value.inputTokens > limit ? 'floor-admitted' : 'within-target'};
        return value.inputTokens <= Math.min(limit, hardLimit);
      };
      const addRevealedWithinTarget = async () => {
        // Recent discoveries win when all revealed schemas cannot fit together.
        for (const name of exposure.revealedNames().reverse()) {
          if (tools.some(t => t.name === name)) continue;
          const candidate = deps.registry.toNativeSchemas(def => def.name === name)[0];
          if (!candidate) continue;
          tools = [...tools, candidate];
          if (!(await measure())) tools = tools.filter(t => t !== candidate);
        }
        await measure();
        return {system, tools};
      };
      if (await measure()) return {system, tools};
      reduced = true;
      system = composeSystemPrompt({...input.compose, transformSection: (kind, text) =>
        kind === 'reference' ? reference(kind, text, input.compose.lang ?? 'tr') : text});
      if (await measure()) return {system, tools};
      // A full catalog remains executable through the already-permissioned meta
      // dispatcher. Without that discovery/dispatch seam, removing schemas would
      // silently remove capabilities, so keep them and fail honestly if necessary.
      const canDiscover = [...META_TOOLS].every(name => deps.registry.get(name));
      if (canDiscover) {
        const core = deps.registry.toNativeSchemas(def => def.exposure === 'core');
        tools = core;
        if (await measure()) return addRevealedWithinTarget();
      }
      system = composeSystemPrompt({...input.compose,
        transformSection: (kind, text) => reference(kind, text, input.compose.lang ?? 'tr')});
      if (await measure()) return addRevealedWithinTarget();

      // Last reduction: retain only the existing discovery/description/dispatch
      // seam. Core execution tools remain callable through it under the same
      // permission policy. Without the complete seam, never hide capabilities.
      if (canDiscover) tools = deps.registry.toNativeSchemas(def => META_TOOLS.has(def.name));
      system = composeSystemPrompt({...input.compose,
        transformSection: (kind, text) => reference(kind, text, input.compose.lang ?? 'tr')});
      if (await measure()) return addRevealedWithinTarget();
      // Share is a target; the irreducible floor may exceed it only while all
      // configured transcript, output and safety reserves remain intact.
      if (snapshot!.tokens <= hardLimit) return {system, tools};
      throw new PreambleBudgetError();
    },
  };
}
export type PreambleBudgeter = ReturnType<typeof createPreambleBudgeter>;
