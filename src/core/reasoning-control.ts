// src/core/reasoning-control.ts
// ═══ Reasoning control — descriptor authority (7108 TERMINAL-REASONING-CONTROL-001) ═══
// The single place that turns EVIDENCE (owner config, a live server's chat
// template, a catalog entry) into a typed `ReasoningControlDescriptor`. The
// descriptor is data on the model-registry entry; this module never branches on
// a model NAME (KANUN 10 / ADR-G-036) — it branches on what the server or the
// owner actually said. Absent evidence resolves to the honest `unknown`
// descriptor, which puts nothing on the wire and never inflates a ceiling.

import { DeckentError } from './errors.js';
import { modelRegistry, type ModelRegistry } from './model-registry.js';
import type {
  ReasoningControlDescriptor,
  ReasoningToggleDescriptor,
} from './model-registry-types.js';

/** The honest default: no toggle evidence, unknown budget sharing. */
export const UNKNOWN_REASONING_CONTROL: ReasoningControlDescriptor = Object.freeze({
  toggle: Object.freeze({ kind: 'unknown' as const }),
  sharesCompletionBudget: 'unknown' as const,
  provenance: 'unknown' as const,
});

/** True when the descriptor carries ANY evidence (toggle or budget sharing). */
export function isKnownReasoningControl(descriptor: ReasoningControlDescriptor | undefined): boolean {
  return descriptor !== undefined
    && (descriptor.toggle.kind !== 'unknown' || descriptor.sharesCompletionBudget !== 'unknown');
}

/** True when the descriptor names a wire mechanism that can actually switch
 *  hidden reasoning off for one request. */
export function isReasoningToggleable(descriptor: ReasoningControlDescriptor | undefined): boolean {
  const kind = descriptor?.toggle.kind;
  return kind === 'chat_template_kwargs.enable_thinking' || kind === 'reasoning_effort';
}

// ─── Owner config → descriptor ───────────────────────────────────────────────

/** Owner-authored shape (config-types `ReasoningControlConfig`). Validated
 *  loudly here so a typo can never silently become `unknown`. */
export interface ReasoningControlConfigShape {
  readonly toggle:
    | 'chat_template_kwargs.enable_thinking'
    | 'none'
    | { readonly kind: 'reasoning_effort'; readonly on: string; readonly off: string };
  readonly sharesCompletionBudget: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new DeckentError('E_REASONING_CONTROL_CONFIG_INVALID', `${path}.${key} is not a recognized key`);
    }
  }
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    throw new DeckentError('E_REASONING_CONTROL_CONFIG_INVALID', `${path} must be a non-empty trimmed string`);
  }
  return value;
}

/**
 * Validate an owner-authored reasoning-control block and turn it into a
 * descriptor with `configured` provenance. Throws a typed
 * `E_REASONING_CONTROL_CONFIG_INVALID` on any shape violation.
 */
export function validateReasoningControlConfig(value: unknown, path: string): ReasoningControlDescriptor {
  if (!isPlainObject(value)) {
    throw new DeckentError('E_REASONING_CONTROL_CONFIG_INVALID', `${path} must be an object`);
  }
  assertKnownKeys(value, ['toggle', 'sharesCompletionBudget'], path);
  const shares = value['sharesCompletionBudget'];
  if (typeof shares !== 'boolean') {
    throw new DeckentError('E_REASONING_CONTROL_CONFIG_INVALID', `${path}.sharesCompletionBudget must be a boolean`);
  }
  const rawToggle = value['toggle'];
  let toggle: ReasoningToggleDescriptor;
  if (rawToggle === 'chat_template_kwargs.enable_thinking' || rawToggle === 'none') {
    toggle = { kind: rawToggle };
  } else if (isPlainObject(rawToggle)) {
    assertKnownKeys(rawToggle, ['kind', 'on', 'off'], `${path}.toggle`);
    if (rawToggle['kind'] !== 'reasoning_effort') {
      throw new DeckentError('E_REASONING_CONTROL_CONFIG_INVALID', `${path}.toggle.kind must be 'reasoning_effort' when an object`);
    }
    const on = nonEmptyString(rawToggle['on'], `${path}.toggle.on`);
    const off = nonEmptyString(rawToggle['off'], `${path}.toggle.off`);
    if (on === off) {
      throw new DeckentError('E_REASONING_CONTROL_CONFIG_INVALID', `${path}.toggle.on and .off must differ`);
    }
    toggle = { kind: 'reasoning_effort', on, off };
  } else {
    throw new DeckentError(
      'E_REASONING_CONTROL_CONFIG_INVALID',
      `${path}.toggle must be 'chat_template_kwargs.enable_thinking', 'none' or { kind: 'reasoning_effort', on, off }`,
    );
  }
  return Object.freeze({ toggle: Object.freeze(toggle), sharesCompletionBudget: shares, provenance: 'configured' as const });
}

/** Validate an owner-authored block and hand back the SAME raw shape, typed —
 *  for config resolvers that persist the authored value rather than the
 *  derived descriptor. */
export function assertReasoningControlConfig(value: unknown, path: string): ReasoningControlConfigShape {
  validateReasoningControlConfig(value, path);
  return value as ReasoningControlConfigShape;
}

// ─── Live server evidence → descriptor ───────────────────────────────────────

export interface ReasoningControlProbeInput {
  /** OpenAI-compatible endpoint (`…/v1`) or the server root. */
  endpoint: string;
  model: string;
  fetchFn?: typeof globalThis.fetch;
  /** The caller's (turn) abort signal — a cancelled turn cancels the probe. */
  signal?: AbortSignal;
  /** Overall probe deadline (both `/props` requests together). Config-resolved
   *  (`execution_budget.native_agent.reasoningProbeTimeoutMs`); absent → the
   *  same bounded default the request-measurement capability uses. */
  timeoutMs?: number;
}

/** Default overall deadline for the live probe (mirrors the measurement
 *  capability's 2 s bound in agent/context-budget.ts). */
export const DEFAULT_REASONING_PROBE_TIMEOUT_MS = 2_000;

/** Typed no-evidence outcomes of a probe that did not finish (7108-b): never
 *  cached, never anything but `unknown` for planning purposes. */
export const PROBE_TIMEOUT_REASONING_CONTROL: ReasoningControlDescriptor = Object.freeze({
  toggle: Object.freeze({ kind: 'unknown' as const }),
  sharesCompletionBudget: 'unknown' as const,
  provenance: 'probe-timeout' as const,
});
export const PROBE_ABORTED_REASONING_CONTROL: ReasoningControlDescriptor = Object.freeze({
  toggle: Object.freeze({ kind: 'unknown' as const }),
  sharesCompletionBudget: 'unknown' as const,
  provenance: 'probe-aborted' as const,
});

/** Compose the caller's signal with an overall deadline. Every fetch the probe
 *  makes carries the composed signal, so an omitted caller signal still yields
 *  a bounded request (never an unbounded hang on the first descriptor await). */
function withProbeDeadline(signal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal; timedOut: () => boolean; release: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = (): void => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(0, timeoutMs));
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    release: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); },
  };
}

/** The template token whose presence proves the server-side switch exists. */
const ENABLE_THINKING_TEMPLATE_TOKEN = 'enable_thinking';

/**
 * Probe a llama.cpp-class server for reasoning-control evidence. `/props`
 * publishes the loaded `chat_template`; a template that reads
 * `enable_thinking` is the proof that `chat_template_kwargs.enable_thinking`
 * is honored. The same `/props` witness (`default_generation_settings`) proves
 * the llama.cpp server class, whose `n_predict` ceiling counts EVERY generated
 * token — hidden reasoning included — so budget sharing is `true` there.
 *
 * Router-aware: `props?model=` first (a router reports per-model props), then
 * the bare `/props`. Unreachable or shapeless → `null` (caller keeps `unknown`
 * WITHOUT caching, so a cold-start server is probed again next time).
 */
export async function probeOpenAICompatReasoningControl(
  input: ReasoningControlProbeInput,
): Promise<ReasoningControlDescriptor | null> {
  const fetchFn = input.fetchFn ?? globalThis.fetch;
  const rootEndpoint = input.endpoint.replace(/\/v1\/?$/u, '');
  const base = rootEndpoint.endsWith('/') ? rootEndpoint : `${rootEndpoint}/`;
  const deadline = withProbeDeadline(input.signal, input.timeoutMs ?? DEFAULT_REASONING_PROBE_TIMEOUT_MS);
  /** Typed outcome when the composed signal fired: the caller's abort wins over the deadline. */
  const interrupted = (): ReasoningControlDescriptor | null => {
    if (input.signal?.aborted) return PROBE_ABORTED_REASONING_CONTROL;
    if (deadline.timedOut()) return PROBE_TIMEOUT_REASONING_CONTROL;
    return null;
  };
  const read = async (url: string): Promise<{ chatTemplate: string | null; llamaCpp: boolean } | null> => {
    const response = await fetchFn(url, { signal: deadline.signal });
    if (!response.ok) return null;
    const body = await response.json() as { chat_template?: unknown; default_generation_settings?: unknown };
    if (!isPlainObject(body)) return null;
    return {
      chatTemplate: typeof body.chat_template === 'string' ? body.chat_template : null,
      llamaCpp: isPlainObject(body.default_generation_settings),
    };
  };
  try {
    let evidence = await read(new URL(`props?model=${encodeURIComponent(input.model)}`, base).toString()).catch(() => null);
    if (deadline.signal.aborted) return interrupted();
    if (evidence === null || (evidence.chatTemplate === null && !evidence.llamaCpp)) {
      evidence = await read(new URL('props', base).toString()).catch(() => null);
    }
    if (deadline.signal.aborted) return interrupted();
    if (evidence === null) return null;
    if (evidence.chatTemplate === null && !evidence.llamaCpp) return null;
    const toggle: ReasoningToggleDescriptor = evidence.chatTemplate === null
      ? { kind: 'unknown' }
      : evidence.chatTemplate.includes(ENABLE_THINKING_TEMPLATE_TOKEN)
        ? { kind: 'chat_template_kwargs.enable_thinking' }
        : { kind: 'none' };
    return Object.freeze({
      toggle: Object.freeze(toggle),
      sharesCompletionBudget: evidence.llamaCpp ? true : 'unknown',
      provenance: 'server-reported' as const,
    });
  } catch {
    return interrupted();
  } finally {
    deadline.release();
  }
}

// ─── Registry lookup + composed resolver ─────────────────────────────────────

/** The registry entry's descriptor, or the honest `unknown`. */
export function resolveModelReasoningControl(
  modelId: string,
  registry: ModelRegistry = modelRegistry,
): ReasoningControlDescriptor {
  return registry.get(modelId)?.reasoningControl ?? UNKNOWN_REASONING_CONTROL;
}

export interface ReasoningControlResolver {
  /** Descriptor for `model` — configured > registry (known) > live probe > unknown.
   *  `signal` (the turn's abort) cancels an in-flight probe. */
  resolve(model: string, signal?: AbortSignal): Promise<ReasoningControlDescriptor>;
}

/**
 * Compose the three evidence sources into one per-model resolver. Probe
 * results are memoized only on SUCCESS; a failed probe keeps `unknown` and is
 * retried on the next request, so a server that boots later is still seen.
 */
export function createReasoningControlResolver(input: {
  configured?: ReasoningControlDescriptor | undefined;
  registry?: ModelRegistry;
  probe?: (model: string, signal?: AbortSignal) => Promise<ReasoningControlDescriptor | null>;
}): ReasoningControlResolver {
  const registry = input.registry ?? modelRegistry;
  const probed = new Map<string, ReasoningControlDescriptor>();
  const inFlight = new Map<string, Promise<ReasoningControlDescriptor | null>>();
  return {
    async resolve(model, signal) {
      if (input.configured) return input.configured;
      const fromRegistry = resolveModelReasoningControl(model, registry);
      if (isKnownReasoningControl(fromRegistry)) return fromRegistry;
      const cached = probed.get(model);
      if (cached) return cached;
      if (!input.probe) return UNKNOWN_REASONING_CONTROL;
      let pending = inFlight.get(model);
      if (!pending) {
        pending = input.probe(model, signal).catch(() => null);
        inFlight.set(model, pending);
      }
      try {
        const result = await pending;
        // Only REAL evidence is memoized: a timed-out / aborted / failed probe
        // returns its typed no-evidence descriptor and is probed again next time.
        if (result && isKnownReasoningControl(result)) {
          probed.set(model, result);
          return result;
        }
        return result ?? UNKNOWN_REASONING_CONTROL;
      } finally {
        inFlight.delete(model);
      }
    },
  };
}
