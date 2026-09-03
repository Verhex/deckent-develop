// src/cli/repl/native-transport.ts
// ═══ Native transport resolution (SP-1 M3, §3) ══════════════════════════════
// Turns detectTransport's kind into a concrete provider adapter + a model id, or
// an honest error string. Model id is API-pinned (determinism, §3): an explicit
// DECKENT_NATIVE_MODEL env wins, else a per-transport default. No network here.
//
// Also exports the stream-segmenter primitives as the canonical streaming seam:
// consumers of the native transport layer use createStreamOutputHandler() to
// safely feed and flush streamed tokens, even in the presence of unclosed fences
// or mid-stream flush() calls (the "queue/flush" race guard).

import { detectTransport, type TransportConfig } from '../../agent/provider-detect.js';
import { createAnthropicAdapter } from '../../agent/provider-tooluse/anthropic.js';
import { createOpenAIAdapter } from '../../agent/provider-tooluse/openai.js';
import { createOllamaAdapter } from '../../agent/provider-tooluse/ollama.js';
import type {
  ProviderAdapter,
  ProviderContextIdentity,
  ProviderRequest,
  ProviderRequestMeasurementCapability,
} from '../../agent/provider-tooluse/types.js';
import {
  getLegacyModelMigration,
  inferProviderFromId,
  modelRegistry,
  OLLAMA_BUILTIN_MODELS,
} from '../../core/model-registry.js';
import { OPENAI_COMPAT_PRESET_META } from '../../providers/openai-compatible.js';
import type { ModelDefinition, RegistryProviderName } from '../../core/model-registry-types.js';
import { getMessage } from '../helpers/messages.js';
import { createStreamSegmenter, type Segment } from './stream-segmenter.js';
import {
  decideProviderAdmission,
  deriveEffectiveContext,
  measureProviderRequest,
  type EffectiveContextResult,
} from '../../agent/context-budget.js';

export interface NativeEndpointHealth {
  endpoint: string;
  healthy: boolean;
  detail?: string;
}

export interface ResolvedProvider {
  adapter: ProviderAdapter;
  model: string;
  /** Selection-level provider name ('claude' | 'openai' | 'ollama' | 'deepseek'
   *  | 'qwen' | 'glm' | 'mock') — what the status bar shows and what a runtime
   *  /provider switch round-trips through. */
  providerName: string;
  endpointHealth?: () => Promise<NativeEndpointHealth>;
  /** Exact model-identity validation against the live endpoint (endpoints that
   *  publish /models — local-llm today). Absent for hosted providers whose
   *  registry is the identity authority. */
  modelIdentity?: () => Promise<NativeModelIdentityVerdict>;
  contextStatus?: () => Promise<EffectiveContextResult | null>;
  configuredContextSize?: number;
}

export class InputContextOverflowError extends Error {
  readonly code = 'INPUT_CONTEXT_OVERFLOW' as const;
  constructor(readonly decision: Extract<ReturnType<typeof decideProviderAdmission>, { admitted: false }>) {
    super(`INPUT_CONTEXT_OVERFLOW: measured=${decision.measurement.inputTokens} available=${decision.availableTokens}`);
    this.name = 'InputContextOverflowError';
  }
}

export class ContextAuthorityUnavailableError extends Error {
  readonly code = 'INPUT_CONTEXT_AUTHORITY_UNAVAILABLE' as const;
  constructor(provider: string, model: string) {
    super(`INPUT_CONTEXT_AUTHORITY_UNAVAILABLE: provider=${provider} model=${model}`);
    this.name = 'ContextAuthorityUnavailableError';
  }
}

function registryContextTokens(model: string): number | null {
  const definition = modelRegistry.get(model);
  return definition && Number.isSafeInteger(definition.contextWindow) && definition.contextWindow > 0
    ? definition.contextWindow
    : null;
}

function requestMeasurementCapability(input: {
  kind: 'llama.cpp' | 'anthropic';
  endpoint: string;
  fetchFn: typeof globalThis.fetch;
  headers?: Record<string, string>;
}): ProviderRequestMeasurementCapability {
  return {
    async measure(req, signal) {
      if (input.kind === 'anthropic') {
        const response = await input.fetchFn(new URL('messages/count_tokens', `${input.endpoint.replace(/\/$/, '')}/`).toString(), {
          method: 'POST', signal, headers: { 'content-type': 'application/json', ...input.headers },
          body: JSON.stringify({ model: req.model, system: req.system, messages: req.messages, tools: req.tools }),
        });
        if (!response.ok) return null;
        const body = await response.json() as { input_tokens?: unknown };
        return typeof body.input_tokens === 'number'
          ? { inputTokens: body.input_tokens, provenance: 'anthropic-count-tokens' }
          : null;
      }
      const templated = await input.fetchFn(new URL('apply-template', `${input.endpoint.replace(/\/$/, '')}/`).toString(), {
        method: 'POST', signal, headers: { 'content-type': 'application/json', ...input.headers },
        body: JSON.stringify({ model: req.model, system: req.system, messages: req.messages, tools: req.tools }),
      });
      if (!templated.ok) return null;
      const templateBody = await templated.json() as { prompt?: unknown };
      if (typeof templateBody.prompt !== 'string') return null;
      const tokenized = await input.fetchFn(new URL('tokenize', `${input.endpoint.replace(/\/$/, '')}/`).toString(), {
        method: 'POST', signal, headers: { 'content-type': 'application/json', ...input.headers },
        body: JSON.stringify({ content: templateBody.prompt, add_special: true }),
      });
      if (!tokenized.ok) return null;
      const tokenBody = await tokenized.json() as { tokens?: unknown[]; count?: unknown };
      const count = typeof tokenBody.count === 'number'
        ? tokenBody.count
        : Array.isArray(tokenBody.tokens) ? tokenBody.tokens.length : null;
      return count === null ? null : { inputTokens: count, provenance: 'llama.cpp-apply-template-tokenize' };
    },
  };
}

/** Wrap the real native adapter at its single dispatch seam. Measurement and
 * admission finish before the underlying async iterator is even constructed. */
export function withMeasuredAdmission(input: {
  adapter: ProviderAdapter;
  identity: ProviderContextIdentity | (() => Promise<ProviderContextIdentity>);
  capability?: ProviderRequestMeasurementCapability;
  outputReserveTokens?: number;
  contextSafetyReserveTokens?: number;
}): ProviderAdapter {
  return {
    name: input.adapter.name,
    requestMeasurement: input.capability,
    async *send(req: ProviderRequest) {
      const identity = typeof input.identity === 'function' ? await input.identity() : input.identity;
      const measurement = await measureProviderRequest({
        request: req,
        identity,
        ...(input.capability ? { capability: input.capability } : {}),
      });
      const decision = decideProviderAdmission(
        measurement,
        input.outputReserveTokens ?? req.outputCeilingTokens ?? 0,
        input.contextSafetyReserveTokens ?? 0,
      );
      if (!decision.admitted) throw new InputContextOverflowError(decision);
      yield* input.adapter.send(req);
    },
  };
}

function registryIdentity(provider: string, model: string): ProviderContextIdentity {
  const contextWindowTokens = registryContextTokens(model);
  if (contextWindowTokens === null) throw new ContextAuthorityUnavailableError(provider, model);
  return { provider, model, contextWindowTokens, contextProvenance: 'model-registry' };
}

function measuredResolved(input: {
  adapter: ProviderAdapter;
  providerName: string;
  model: string;
  capability?: ProviderRequestMeasurementCapability;
  identity?: () => Promise<ProviderContextIdentity>;
}): Pick<ResolvedProvider, 'adapter' | 'model' | 'providerName'> {
  return {
    adapter: withMeasuredAdmission({
      adapter: input.adapter,
      identity: input.identity ?? (() => Promise.resolve(registryIdentity(input.providerName, input.model))),
      ...(input.capability ? { capability: input.capability } : {}),
    }),
    model: input.model,
    providerName: input.providerName,
  };
}
export interface ProviderError {
  error: string;
  /** Stable id for the failure class so the view can localize:
   *  'missing-api-key' | 'missing-ollama-host' | 'unsupported-native-provider' |
   *  'legacy-model-alias' | 'unknown-model' | 'no-transport'. */
  errorCode?: string;
  /** Machine detail for the message (e.g. the key/env var name(s) to set). */
  detail?: string;
  /** The provider the failed selection asked for (message interpolation). */
  provider?: string;
}

function requireNativeDefault(provider: 'claude' | 'codex' | 'ollama'): string {
  const definition = provider === 'ollama'
    ? OLLAMA_BUILTIN_MODELS.find(model => model.tier === 'standard' && model.status === 'ga')
    : modelRegistry.getByProviderAndTier(provider, 'standard');
  if (!definition) throw new Error(`E_NATIVE_DEFAULT_MODEL_UNAVAILABLE: provider=${provider}`);
  return definition.id;
}

const DEFAULT_MODEL: Record<'anthropic-api' | 'openai-compatible' | 'ollama', string> = {
  'anthropic-api': requireNativeDefault('claude'),
  'openai-compatible': requireNativeDefault('codex'),
  ollama: requireNativeDefault('ollama'),
};

/** Config surface the native transport reads (all optional). */
export type NativeTransportConfig = TransportConfig & {
  /** Pin the native provider from settings ('claude' | 'openai' | 'ollama' | 'deepseek' | 'qwen' | 'glm'). */
  native_provider?: string;
  /** Exact registered provider API model ID for the native transport. */
  native_model?: string;
  /** Prompt-side context budget override (estimated tokens). */
  native_context_tokens?: number;
  /** Canonical grouped provider registry plus legacy keyed definitions. */
  providers?: {
    registry?: Array<{ name: string; baseUrl?: string; endpoint?: string }>;
    [provider: string]: unknown;
  };
  /** Resolved direct llama.cpp lifecycle authority shared with the CLI command. */
  local_llm?: { endpoint?: string; contextSize?: number };
};

/** What a /model — /provider switch (or the settings pin) asks for. */
export interface NativeSelectionInput {
  provider: string;
  /** null → provider default (config.native_model when compatible, else built-in). */
  model: string | null;
}

export interface NativeResolveContext {
  env: Record<string, string | undefined>;
  config: NativeTransportConfig;
  /** .deck secrets (ADR-G-005) — its documented contract is precedence OVER env. */
  secrets?: Record<string, string>;
  fetchFn?: typeof globalThis.fetch;
}

/** Providers whose native tool_use transport exists. codex/gemini are
 *  subscription-CLI providers (orchestrator-side) — honestly unsupported here.
 *  TERMINAL-PROVIDER-VOCAB-001: the array lives in core (config validation
 *  shares it); re-exported here for the REPL's existing import sites. */
import { NATIVE_PROVIDER_NAMES } from '../../core/native-provider-names.js';
export { NATIVE_PROVIDER_NAMES };

// ─── TERMINAL-PICKER-002 — candidate listing for the interactive picker ──────
//
// The registry owner of a native transport (the activation policy and the
// catalog key models by REGISTRY provider: OpenAI-API models are owned by the
// `codex` registry provider). Compat presets (deepseek/qwen/glm) have no
// registry owner — their models come from OPENAI_COMPAT_PRESET_META.
const NATIVE_TO_REGISTRY_PROVIDER: Readonly<Record<string, RegistryProviderName>> = {
  claude: 'claude',
  openai: 'codex',
  ollama: 'ollama',
  'local-llm': 'local-llm',
};

export function registryProviderFor(nativeProvider: string): RegistryProviderName | null {
  return NATIVE_TO_REGISTRY_PROVIDER[nativeProvider] ?? null;
}

export interface NativeModelCandidate {
  readonly provider: string;
  readonly id: string;
  /** Registry metadata when the model is catalogued; null for preset/discovered ids. */
  readonly definition: ModelDefinition | null;
}

/**
 * Every model a native transport could serve for `provider` — registry pool
 * for claude/openai, the Ollama builtins, the compat preset lists, and the
 * endpoint's discovered ids for local-llm (the caller passes what the boot
 * discovery published). Pure listing: availability/policy are judged by the
 * spec builder, and executability by resolveNativeSelection on commit.
 */
export function listNativeModelCandidates(
  provider: string,
  config: NativeTransportConfig,
  discovered: readonly string[] = [],
): NativeModelCandidate[] {
  void config;
  if (provider === 'ollama') return OLLAMA_BUILTIN_MODELS.map((m) => ({ provider, id: m.id, definition: m }));
  if (provider === 'local-llm') return discovered.map((id) => ({ provider, id, definition: null }));
  const preset = (OPENAI_COMPAT_PRESET_META as Record<string, { models?: readonly string[] } | undefined>)[provider];
  if (preset?.models) return preset.models.map((id) => ({ provider, id, definition: null }));
  const registryProvider = registryProviderFor(provider);
  if (registryProvider === null) return [];
  return modelRegistry.getByProvider(registryProvider).map((m) => ({ provider, id: m.id, definition: m }));
}

export async function probeNativeEndpointHealth(
  endpoint: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<NativeEndpointHealth> {
  const healthUrl = new URL('/health', endpoint).toString();
  try {
    const response = await fetchFn(healthUrl);
    return {
      endpoint,
      healthy: response.ok,
      ...(!response.ok ? { detail: `HTTP ${response.status}` } : {}),
    };
  } catch (error) {
    return {
      endpoint,
      healthy: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Published model identity discovery (LOCAL-LLM-MODEL-IDENTITY-001): the
 *  OpenAI-compatible router's GET /models is the ONLY authority on which model
 *  IDs are servable. Tolerant and bounded — unreachable/malformed responses are
 *  typed data, never a throw. */
export async function discoverNativeEndpointModels(
  endpoint: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ ok: true; ids: string[] } | { ok: false; detail: string }> {
  try {
    const response = await fetchFn(new URL('models', endpoint.endsWith('/') ? endpoint : `${endpoint}/`).toString());
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
    const body = await response.json() as { data?: Array<{ id?: unknown }> };
    const ids = Array.isArray(body?.data)
      ? body.data.map((entry) => entry?.id).filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      : [];
    return { ok: true, ids };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export type NativeModelIdentityVerdict =
  | { state: 'valid'; model: string }
  | { state: 'unknown-model'; model: string; published: string[] }
  | { state: 'unreachable'; model: string; detail: string };

/** Exact model-identity validation against the live endpoint's published IDs.
 *  'unreachable' is the honest cold-start verdict — never a silent pass, never
 *  a silent fallback to a different model. */
export async function validateNativeModelIdentity(
  model: string,
  endpoint: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<NativeModelIdentityVerdict> {
  const discovery = await discoverNativeEndpointModels(endpoint, fetchFn);
  if (!discovery.ok) return { state: 'unreachable', model, detail: discovery.detail };
  return discovery.ids.includes(model)
    ? { state: 'valid', model }
    : { state: 'unknown-model', model, published: discovery.ids };
}

export async function formatNativeProviderStatus(
  resolved: ResolvedProvider,
  lang: string,
): Promise<string> {
  const health = await resolved.endpointHealth?.();
  const statusLine = getMessage('native.provider_status', lang, {
    provider: resolved.providerName,
    model: resolved.model,
    health: health
      ? getMessage(health.healthy ? 'native.endpoint_health.healthy' : 'native.endpoint_health.unhealthy', lang)
      : getMessage('native.endpoint_health.unknown', lang),
  });
  // Model-identity verdict (LOCAL-LLM-MODEL-IDENTITY-001): surfaced at session
  // start so a config/router mismatch is visible BEFORE the first failing turn.
  const lines = [statusLine];
  const identity = await resolved.modelIdentity?.();
  if (identity && identity.state === 'unknown-model') {
    lines.push(getMessage('native.model_identity.unknown', lang, {
      model: identity.model,
      published: identity.published.length > 0 ? identity.published.join(', ') : '—',
    }));
  }
  if (identity && identity.state === 'unreachable') {
    lines.push(getMessage('native.model_identity.unreachable', lang, {
      model: identity.model,
      detail: identity.detail,
    }));
  }
  if (resolved.providerName !== 'local-llm' || resolved.configuredContextSize === undefined) return lines.join('\n');
  if (!health?.healthy) {
    lines.push(getMessage('native.context.unavailable', lang, {
      configured: String(resolved.configuredContextSize),
    }));
    return lines.join('\n');
  }
  const context = await resolved.contextStatus?.();
  if (context === null || context === undefined) {
    lines.push(getMessage('native.context.unavailable', lang, {
      configured: String(resolved.configuredContextSize),
    }));
    return lines.join('\n');
  }
  const mismatch = context.effectiveContextSize !== resolved.configuredContextSize;
  lines.push(getMessage(mismatch ? 'native.context.restart_required' : 'native.context.effective', lang, {
    configured: String(resolved.configuredContextSize),
    effective: String(context.effectiveContextSize),
    budgetSource: getMessage('native.context.budget_source.effective', lang),
  }));
  return lines.join('\n');
}

async function probeNativeContext(
  endpoint: string,
  configuredContextSize: number | null,
  modelAdvertisedContext: number | null,
  fetchFn: typeof globalThis.fetch,
  model?: string | null,
): Promise<EffectiveContextResult | null> {
  // llama.cpp serves /props and /v1/models at the SERVER ROOT while the
  // OpenAI-compatible endpoint is conventionally .../v1 — strip a trailing
  // /v1 so a `local_llm.endpoint` of http://host:8080/v1 probes
  // http://host:8080/props, not the nonexistent /v1/props (the 404 chain
  // behind the model=unresolved INPUT_CONTEXT_AUTHORITY_UNAVAILABLE class).
  const rootEndpoint = endpoint.replace(/\/v1\/?$/u, '');
  const base = rootEndpoint.endsWith('/') ? rootEndpoint : `${rootEndpoint}/`;
  const positiveCtx = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  // Reachability is tracked separately from the reported value: an
  // unreachable server yields null (probe failed — caller keeps its own
  // authority chain), while a reachable-but-silent server falls through to
  // the derive step so an authored config value can stand alone.
  let reachable = false;
  const propsCtx = async (url: string): Promise<number | null> => {
    const response = await fetchFn(url);
    if (!response.ok) return null;
    reachable = true;
    const body = await response.json() as { default_generation_settings?: { n_ctx?: unknown }; n_ctx?: unknown };
    return positiveCtx(body.default_generation_settings?.n_ctx ?? body.n_ctx);
  };
  try {
    // Router-aware probe order (7086-residual, owner delivery 2026-08-18):
    // a llama.cpp ROUTER reports n_ctx=0 on the bare /props, so the
    // model-scoped query is the primary source; the bare endpoint keeps
    // single-model servers working; the /v1/models `--ctx-size` arg is the
    // last honest server-side witness before giving up (null → the caller's
    // typed refusal path, never an optimistic literal).
    let reported: number | null = null;
    if (model) {
      reported = await propsCtx(new URL(`props?model=${encodeURIComponent(model)}`, base).toString()).catch(() => null);
    }
    if (reported === null) {
      reported = await propsCtx(new URL('props', base).toString()).catch(() => null);
    }
    if (reported === null && model) {
      reported = await (async () => {
        const response = await fetchFn(new URL('v1/models', base).toString());
        if (!response.ok) return null;
        reachable = true;
        const body = await response.json() as { data?: Array<{ id?: string; status?: { args?: unknown[] } }> };
        const entry = body.data?.find((m) => m.id === model);
        const args = Array.isArray(entry?.status?.args) ? entry.status.args : [];
        for (let i = 0; i < args.length - 1; i++) {
          if (args[i] === '--ctx-size' || args[i] === '-c') {
            const parsed = Number.parseInt(String(args[i + 1]), 10);
            return positiveCtx(parsed);
          }
        }
        return null;
      })().catch(() => null);
    }
    if (!reachable) return null;
    return deriveEffectiveContext({
      configuredContextSize,
      serverReportedContext: reported,
      modelAdvertisedContext,
    });
  } catch {
    return null;
  }
}

/** NT-07 — the CONFIGURED local-llm context ceiling: the narrowest of the
 *  llama.cpp slot size (`local_llm.contextSize`) and the prompt-side override
 *  (`native_context_tokens`). Undefined when neither knob is authored, so the
 *  boot-time probe (and the status line) stay off exactly as before. */
function resolveConfiguredContextTokens(config: NativeTransportConfig): number | undefined {
  const candidates = [config.local_llm?.contextSize, config.native_context_tokens]
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .map((v) => Math.floor(v));
  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

/** Confidently infer the native provider a bare `/model <id>` implies, or null.
 *  Only canonical, unambiguous shapes count — `claude-*` → claude,
 *  `name:tag` → ollama, `gpt-*`/o-series → openai. Legacy aliases return null
 *  and are rejected at the shared selection seam. Anything else returns null and the switch stays on
 *  the current provider (no inferProviderFromId here: its unknown-id fallback is
 *  'claude', which would silently re-route vendor models like `deepseek-chat`). */
export function inferNativeProviderForModel(model: string): string | null {
  const lid = model.toLowerCase().trim();
  if (getLegacyModelMigration(lid)) return null;
  if (/^claude-/.test(lid)) return 'claude';
  if (lid.includes(':')) return 'ollama';
  if (/^(gpt|o\d)/.test(lid)) return 'openai';
  return null;
}

/** Result of resolving a claude wire model: either an API-pinned id, or a signal
 *  that the requested id is not a resolvable claude model (so the switch must be
 *  refused instead of shipped at the Anthropic transport). */
type ClaudeWireResult = { apiId: string } | { unresolved: string };

/** Resolve a registry-known Claude model to its exact provider API ID.
 *  Unknown shaped IDs remain unavailable until catalog registration. Everything else — a
 *  registry-known FOREIGN model (`deepseek-chat`, whose provider is 'deepseek')
 *  or an unknown non-claude-shaped id (`mistral-large`) — is REFUSED. Both used
 *  to slip through: `modelRegistry.resolve` happily returns a deepseek model's
 *  apiId, and `inferProviderFromId`'s 'claude' fallback treated any unknown id as
 *  claude — so `/model deepseek-chat` reported a false 'switched' and then
 *  shipped straight at the Anthropic API (the 2026-07-07 incident class,
 *  REPL-575 K6). */
function resolveClaudeWireModel(model: string | null): ClaudeWireResult {
  const candidate = model ?? DEFAULT_MODEL['anthropic-api'];
  const known = modelRegistry.get(candidate);
  if (known) {
    return known.provider === 'claude' ? { apiId: known.apiId } : { unresolved: candidate };
  }
  // Shape inference is diagnostic only. A future Claude API ID becomes usable
  // after catalog registration; an unknown shaped string is not execution
  // authority and must remain unresolved.
  return { unresolved: candidate };
}

/**
 * Resolve a provider+model selection into a live native adapter.
 *
 * The single seam BOTH boot (settings pin / transport detection) and the
 * runtime /model — /provider switch resolve through, so their behavior can
 * never diverge. Credential sourcing for claude follows ADR-G-005:
 * `.deck` DECKENT_CLAUDE_API_KEY > env DECKENT_CLAUDE_API_KEY > env
 * ANTHROPIC_API_KEY. Failures return an errorCode (never a silent fallback).
 */
export function resolveNativeSelection(
  sel: NativeSelectionInput,
  ctx: NativeResolveContext,
): ResolvedProvider | ProviderError {
  const provider = sel.provider.toLowerCase().trim();
  const { env, config } = ctx;
  const secrets = ctx.secrets ?? {};
  const requestedModel = sel.model?.trim() ?? null;

  // Runtime authoring never consumes compatibility metadata. Reject before
  // credential lookup or adapter construction so an alias cannot change the
  // provider, leak auth-state differences, or silently become another model.
  if (requestedModel && getLegacyModelMigration(requestedModel)) {
    return {
      error: `legacy model alias "${requestedModel}" is not executable; use an exact provider API model ID`,
      errorCode: 'legacy-model-alias',
      detail: requestedModel,
      provider,
    };
  }

  if (provider === 'claude') {
    const apiKey = secrets['DECKENT_CLAUDE_API_KEY'] || env['DECKENT_CLAUDE_API_KEY'] || env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      return {
        error: 'claude native transport needs an API key — set DECKENT_CLAUDE_API_KEY in .deck (or ANTHROPIC_API_KEY in the environment)',
        errorCode: 'missing-api-key',
        detail: 'DECKENT_CLAUDE_API_KEY (.deck) / ANTHROPIC_API_KEY',
        provider: 'claude',
      };
    }
    const configModel = config.native_model && inferProviderFromId(config.native_model) === 'claude' ? config.native_model : null;
    const wire = resolveClaudeWireModel(requestedModel ?? configModel);
    if ('unresolved' in wire) {
      // REPL-575 K6 — refuse an unrecognized non-claude model instead of
      // shipping it at the Anthropic transport with a false 'switched' report.
      return {
        error: `unknown model "${wire.unresolved}" — not a registered Claude API model ID (run deckent models or switch provider first)`,
        errorCode: 'unknown-model',
        detail: wire.unresolved,
        provider: 'claude',
      };
    }
    const endpoint = 'https://api.anthropic.com/v1';
    return measuredResolved({
      adapter: createAnthropicAdapter({ apiKey, baseUrl: endpoint }),
      model: wire.apiId,
      providerName: 'claude',
      capability: requestMeasurementCapability({
        kind: 'anthropic', endpoint, fetchFn: ctx.fetchFn ?? globalThis.fetch,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      }),
    });
  }

  if (provider === 'openai') {
    const baseUrl = config.openai_base_url ?? 'https://api.openai.com/v1';
    const apiKey = secrets['DECKENT_OPENAI_API_KEY'] || env['DECKENT_OPENAI_API_KEY'] || env['OPENAI_API_KEY'];
    // A custom base URL (vLLM/OpenRouter/self-hosted) may be keyless; the
    // hosted openai.com endpoint never is.
    if (!apiKey && !config.openai_base_url) {
      return {
        error: 'openai native transport needs an API key — set DECKENT_OPENAI_API_KEY in .deck (or OPENAI_API_KEY), or point openai_base_url at a self-hosted endpoint',
        errorCode: 'missing-api-key',
        detail: 'DECKENT_OPENAI_API_KEY (.deck) / OPENAI_API_KEY',
        provider: 'openai',
      };
    }
    const configModel = config.native_model && inferProviderFromId(config.native_model) !== 'claude' ? config.native_model : null;
    const opts: Parameters<typeof createOpenAIAdapter>[0] = { baseUrl };
    if (apiKey) opts.apiKey = apiKey;
    const model = requestedModel ?? configModel ?? DEFAULT_MODEL['openai-compatible'];
    return measuredResolved({
      adapter: createOpenAIAdapter(opts), model, providerName: 'openai',
      capability: requestMeasurementCapability({
        kind: 'llama.cpp', endpoint: baseUrl, fetchFn: ctx.fetchFn ?? globalThis.fetch,
        ...(apiKey ? { headers: { authorization: `Bearer ${apiKey}` } } : {}),
      }),
    });
  }

  if (provider === 'local-llm') {
    const legacyDefinition = config.providers?.['local-llm'] as { baseUrl?: string; endpoint?: string } | undefined;
    const registryDefinition = config.providers?.registry?.find((entry) => entry.name === 'local-llm');
    const endpoint = config.local_llm?.endpoint
      ?? registryDefinition?.baseUrl
      ?? registryDefinition?.endpoint
      ?? legacyDefinition?.baseUrl
      ?? legacyDefinition?.endpoint;
    if (!endpoint) {
      return {
        error: 'local-llm native transport needs a configured endpoint',
        errorCode: 'missing-local-llm-endpoint',
        detail: 'local_llm.endpoint / providers.registry[name=local-llm].baseUrl',
        provider: 'local-llm',
      };
    }
    // 0-hardcode (LOCAL-LLM-MODEL-IDENTITY-001): there is NO literal fallback
    // model — the servable IDs are whatever the router publishes on /models.
    // A missing selection is a typed error telling the user exactly which
    // config key to set, never a silently-guessed identity.
    const selectedModel = requestedModel ?? config.native_model ?? null;
    if (!selectedModel) {
      return {
        error: 'local-llm native transport needs an exact model ID — set native_model (deckent config set native_model <id>) to one of the endpoint\'s published /models IDs',
        errorCode: 'missing-native-model',
        detail: 'native_model',
        provider: 'local-llm',
      };
    }
    // NT-07 — boot-time effective context resolution lives HERE, at the
    // local-llm resolution: the configured ceiling (narrowest authored knob) is
    // probed against the server-reported n_ctx and reduced by
    // deriveEffectiveContext's min rule with typed provenance. A server that
    // does not report leaves the configured value standing (honest config-only
    // fallback); a server that DOES report can only narrow it.
    const configuredContextTokens = resolveConfiguredContextTokens(config);
    const advertisedContext = registryContextTokens(selectedModel);
    const fetchFn = ctx.fetchFn ?? globalThis.fetch;
    const identity = async (): Promise<ProviderContextIdentity> => {
      const status = await probeNativeContext(endpoint, configuredContextTokens ?? null, advertisedContext, fetchFn, selectedModel);
      if (!status) throw new ContextAuthorityUnavailableError('local-llm', selectedModel);
      const server = status.provenance.find((entry) => entry.source === 'server-reported' && entry.counted);
      const configured = status.provenance.find((entry) => entry.source === 'configured' && entry.counted);
      return {
        provider: 'local-llm', model: selectedModel,
        contextWindowTokens: status.effectiveContextSize,
        contextProvenance: server ? 'server-reported' : configured ? 'configured-narrowing' : 'model-registry',
      };
    };
    return {
      ...measuredResolved({
        adapter: createOpenAIAdapter({ baseUrl: endpoint, name: 'local-llm' }),
        model: selectedModel,
        providerName: 'local-llm',
        capability: requestMeasurementCapability({ kind: 'llama.cpp', endpoint, fetchFn }),
        identity,
      }),
      endpointHealth: () => probeNativeEndpointHealth(endpoint, ctx.fetchFn),
      modelIdentity: () => validateNativeModelIdentity(selectedModel, endpoint, ctx.fetchFn ?? globalThis.fetch),
      // 7086-residual (owner delivery 2026-08-18): the boot probe is
      // UNCONDITIONAL — the server's real window must be discoverable even
      // with no authored config knob; a config value composes as the
      // narrowest ceiling when present. The config-gated attachment was the
      // wiring gap behind the spurious INPUT_CONTEXT_AUTHORITY_UNAVAILABLE
      // class on unconfigured local-llm sessions.
      ...(configuredContextTokens !== undefined
        ? { configuredContextSize: configuredContextTokens }
        : {}),
      contextStatus: () => probeNativeContext(
        endpoint,
        configuredContextTokens ?? null,
        advertisedContext,
        ctx.fetchFn ?? globalThis.fetch,
        selectedModel,
      ),
    };
  }

  if (provider === 'deepseek' || provider === 'qwen' || provider === 'glm') {
    const meta = OPENAI_COMPAT_PRESET_META[provider];
    // born-548: `.deck` DECKENT_<apiKeyEnv> > env DECKENT_<apiKeyEnv> > env
    // <apiKeyEnv> — same deck-key convention as core/provider.ts's
    // applyDeckSecretsToEnv (DECKENT_DEEPSEEK_API_KEY, DECKENT_DASHSCOPE_API_KEY,
    // DECKENT_ZHIPU_API_KEY), and the same precedence the claude/openai
    // branches above already use. `detail` stays the bare env var name
    // (pinned by tests/cli/native-transport-selection.test.ts).
    const deckKey = `DECKENT_${meta.apiKeyEnv}`;
    const apiKey = secrets[deckKey] || env[deckKey] || env[meta.apiKeyEnv];
    if (!apiKey) {
      return {
        error: `${provider} native transport needs an API key — set ${deckKey} in .deck (or ${meta.apiKeyEnv} in the environment)`,
        errorCode: 'missing-api-key',
        detail: meta.apiKeyEnv,
        provider,
      };
    }
    const model = requestedModel ?? meta.models[0]!;
    return measuredResolved({
      adapter: createOpenAIAdapter({ baseUrl: meta.baseURL, apiKey, name: meta.name }), model, providerName: provider,
      capability: requestMeasurementCapability({
        kind: 'llama.cpp', endpoint: meta.baseURL, fetchFn: ctx.fetchFn ?? globalThis.fetch,
        headers: { authorization: `Bearer ${apiKey}` },
      }),
    });
  }

  if (provider === 'ollama') {
    if (!config.ollama_host) {
      return {
        error: 'ollama native transport needs a host — set ollama_host in .deckent/config.json (e.g. http://127.0.0.1:11434)',
        errorCode: 'missing-ollama-host',
        detail: 'ollama_host',
        provider: 'ollama',
      };
    }
    const configModel = config.native_model && inferProviderFromId(config.native_model) === 'ollama' ? config.native_model : null;
    const model = requestedModel ?? configModel ?? DEFAULT_MODEL.ollama;
    return measuredResolved({
      adapter: createOllamaAdapter({ host: config.ollama_host }), model, providerName: 'ollama',
      capability: requestMeasurementCapability({
        kind: 'llama.cpp', endpoint: config.ollama_host, fetchFn: ctx.fetchFn ?? globalThis.fetch,
      }),
    });
  }

  return {
    error: `provider "${provider}" has no native tool-use transport (subscription CLIs stay orchestrator-side) — valid: ${NATIVE_PROVIDER_NAMES.join(', ')}`,
    errorCode: 'unsupported-native-provider',
    detail: provider,
    provider,
  };
}

/** Prompt-side context budget for a provider selection.
 *  Authority order (owner directive 2026-08-18 — "use the model's full
 *  context; config only narrows"): the usable window is the minimum of the
 *  KNOWN ceilings — a boot-resolved effective context (server-reported,
 *  local-llm) and the registry's model-advertised window — and explicit
 *  `native_context_tokens` config may NARROW below that but never widen past
 *  it (NT-07: a widened window is exactly the doomed request the loop's
 *  admission gate then has to deny). Generation headroom is NOT subtracted
 *  here — derivePromptBudget's output/safety reserves own that arithmetic.
 *  Unknown authority is rejected: a literal ceiling can be larger than the
 *  real model window and therefore cannot authorize a dispatch. */
export function resolveContextBudgetTokens(
  providerName: string,
  config: { native_context_tokens?: unknown; local_llm?: { contextSize?: unknown } },
  effectiveContextTokens?: number | null,
  modelAdvertisedContextTokens?: number | null,
): number {
  const positive = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
  // Both authored knobs are configured authority — the same pair
  // resolveConfiguredContextTokens composes for the boot probe. Omitting
  // local_llm.contextSize here left an authored slot size invisible to the
  // per-turn resolver (model=unresolved refusal with a fully configured server).
  const authoredKnobs = [
    positive(config.native_context_tokens),
    providerName === 'local-llm' ? positive(config.local_llm?.contextSize) : undefined,
  ].filter((v): v is number => v !== undefined);
  const configured = authoredKnobs.length > 0 ? Math.min(...authoredKnobs) : undefined;
  const effective = providerName === 'local-llm' ? positive(effectiveContextTokens) : undefined;
  const advertised = positive(modelAdvertisedContextTokens);
  const ceilings = [effective, advertised].filter((v): v is number => v !== undefined);
  const ceiling = ceilings.length > 0 ? Math.min(...ceilings) : undefined;
  if (configured !== undefined) return ceiling !== undefined ? Math.min(configured, ceiling) : configured;
  if (ceiling !== undefined) return ceiling;
  throw new ContextAuthorityUnavailableError(providerName, 'unresolved');
}

export function resolveNativeProvider(
  env: Record<string, string | undefined>,
  config: NativeTransportConfig,
  secrets?: Record<string, string>,
): ResolvedProvider | ProviderError {
  const mock = env['DECKENT_NATIVE_MOCK'];
  if (mock) {
    let scripts: import('../../agent/provider-tooluse/types.js').ProviderEvent[][] = [];
    try { scripts = JSON.parse(mock); } catch { scripts = []; }
    let turn = 0;
    return {
      adapter: { name: 'mock', async *send() { for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } },
      model: env['DECKENT_NATIVE_MODEL'] ?? 'mock-model',
      providerName: 'mock',
    };
  }

  const explicitModel = env['DECKENT_NATIVE_MODEL'] ?? null;

  // Settings pin (native_provider) — the "bind from settings" path. An explicit
  // pin that cannot resolve is an honest error, NOT a silent fall-through to
  // whatever transport detection would have picked.
  if (config.native_provider) {
    return resolveNativeSelection(
      { provider: config.native_provider, model: explicitModel },
      { env, config, ...(secrets ? { secrets } : {}) },
    );
  }

  const detected = detectTransport(env, config);
  if (detected.kind === 'none') return { error: detected.reason, errorCode: 'no-transport' };

  const kindToProvider: Record<Exclude<typeof detected.kind, 'none'>, string> = {
    'anthropic-api': 'claude',
    'openai-compatible': 'openai',
    ollama: 'ollama',
  };
  return resolveNativeSelection(
    { provider: kindToProvider[detected.kind], model: explicitModel },
    { env, config, ...(secrets ? { secrets } : {}) },
  );
}

// ═══ Stream output handler — fence-safe, flush-race-guarded ══════════════════
// Canonical streaming seam for native-transport consumers. The Ink REPL feeds
// provider tokens via feed(); when a turn ends (or a tool call interrupts the
// stream), flush() drains any accumulated segment — including an unclosed code
// fence — so reply text is never silently swallowed (the "queue/flush" race).
//
// Race scenario: a streaming reply opens a ``` fence block but the turn ends
// (or is interrupted by a tool call) before the closing fence arrives.
// flush() handles this by emitting the buffered fence block immediately, so the
// content reaches the caller rather than being discarded. The segmenter resets
// to prose mode, keeping subsequent chunks correctly classified.

export type { Segment } from './stream-segmenter.js';
export { createStreamSegmenter } from './stream-segmenter.js';

/**
 * A flush-safe streaming output handler for the native transport layer.
 * Wraps `createStreamSegmenter` and documents the fence/segment contract.
 */
export interface StreamOutputHandler {
  /** Feed a streamed text chunk; may emit completed segments via the callback. */
  feed(chunk: string): void;
  /**
   * Flush pending content at turn-end or on interruption.
   * Emits the trailing partial line and any open fence/table block — guards
   * against the unclosed-fence flush race so no content is lost.
   */
  flush(): void;
  /** Current in-progress partial line (no newline yet), for live preview. */
  partial(): string;
}

/**
 * Create a flush-safe stream output handler.
 * @param emit — called once per completed prose line or finished fence/table block
 */
export function createStreamOutputHandler(emit: (seg: Segment) => void): StreamOutputHandler {
  const segmenter = createStreamSegmenter(emit);
  return {
    feed: (chunk) => segmenter.feed(chunk),
    flush: () => segmenter.flush(),
    partial: () => segmenter.partial(),
  };
}
