// src/core/structured-output-control.ts
// 7113-E-STRUCTURED-OUTPUT — descriptor authority for server-enforced schemas.
//
// The measured failure (attempt 5f7f4f87cfb6, 2026-09-10T02:2xZ): both map
// responses stopped NORMALLY and were rejected as `payload-json-parse` — the
// model simply did not return JSON. The schema was only ever *described* in the
// prompt (`reference-digest-runner.ts` SCHEMA), so compliance rested on the
// model's goodwill.
//
// This module is the single place that turns EVIDENCE (owner config, a catalog
// entry, a live probe) into a typed descriptor. Like `reasoning-control.ts` it
// never branches on a model NAME (KANUN 10 / ADR-G-036): it branches on what the
// owner or the server actually said. Absent evidence resolves to `unknown`,
// which puts NOTHING on the wire — the caller then holds honestly instead of
// dispatching a request whose contract nobody can enforce.
//
// Dialects are NOT assumed equivalent. `openai.response_format.json_schema` is
// the only one this module can currently express; a llama.cpp GBNF grammar is a
// different mechanism with different semantics and is deliberately absent until
// there is real evidence for it.

import { DeckentError } from './errors.js';
import { modelRegistry, type ModelRegistry } from './model-registry.js';
import type {
  StructuredOutputControlDescriptor,
  StructuredOutputToggleDescriptor,
} from './model-registry-types.js';

export type { StructuredOutputControlDescriptor, StructuredOutputToggleDescriptor };


/** The honest default: no evidence, nothing on the wire. */
export const UNKNOWN_STRUCTURED_OUTPUT_CONTROL: StructuredOutputControlDescriptor = Object.freeze({
  toggle: Object.freeze({ kind: 'unknown' as const }),
  provenance: 'unknown' as const,
});

/** True when the descriptor carries evidence either way (enforced or not). */
export function isKnownStructuredOutputControl(descriptor: StructuredOutputControlDescriptor | undefined): boolean {
  return descriptor !== undefined && descriptor.toggle.kind !== 'unknown';
}

/** True when the descriptor names a mechanism that actually enforces a schema. */
export function enforcesStructuredOutput(descriptor: StructuredOutputControlDescriptor | undefined): boolean {
  return descriptor !== undefined && descriptor.toggle.kind === 'openai.response_format.json_schema';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate an owner-authored descriptor. The accepted shapes are exactly the
 * dialects this module can express; anything else fails loudly rather than
 * being silently downgraded to "unknown".
 */
export function validateStructuredOutputControlConfig(value: unknown, path: string): StructuredOutputControlDescriptor {
  const fail = (detail: string): never => {
    throw new DeckentError('E_STRUCTURED_OUTPUT_CONFIG_INVALID', `${path} ${detail}`);
  };
  const accepted = ['openai.response_format.json_schema', 'none', 'unknown'] as const;
  const isAccepted = (x: unknown): x is typeof accepted[number] => accepted.includes(x as never);
  if (typeof value === 'string') {
    if (isAccepted(value)) {
      return Object.freeze({ toggle: Object.freeze({ kind: value }),
        provenance: value === 'unknown' ? 'unknown' as const : 'configured' as const });
    }
    return fail(`must be one of: ${accepted.join(', ')}`);
  }
  if (!isPlainObject(value)) return fail('must be a string or an object');
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'toggle') return fail("accepts only the key 'toggle'");
  const toggle = value['toggle'];
  if (!isAccepted(toggle)) return fail(`toggle must be one of: ${accepted.join(', ')}`);
  return Object.freeze({ toggle: Object.freeze({ kind: toggle }),
    provenance: toggle === 'unknown' ? 'unknown' as const : 'configured' as const });
}

/** The registry's descriptor for `modelId`, or the honest `unknown`. */
export function resolveModelStructuredOutputControl(
  modelId: string,
  registry: ModelRegistry = modelRegistry,
): StructuredOutputControlDescriptor {
  return registry.get(modelId)?.structuredOutputControl ?? UNKNOWN_STRUCTURED_OUTPUT_CONTROL;
}

export interface StructuredOutputControlResolver {
  /** Descriptor for `model` — configured > registry > unknown. */
  resolve(model: string, signal?: AbortSignal): Promise<StructuredOutputControlDescriptor>;
}

/**
 * Compose the evidence sources into one per-model resolver.
 *
 * There is deliberately NO probe seam here, unlike `reasoning-control.ts`. A
 * reasoning toggle can be proven by rendering the chat template, but nothing
 * this server exposes proves that a schema is ENFORCED: the one authorized
 * probe returned HTTP 200 with empty content, which proves the field is
 * ACCEPTED and says nothing about enforcement. Inventing a probe that reads
 * acceptance as support is exactly the guess this module exists to prevent, so
 * absent owner or catalog evidence the answer stays `unknown`.
 */
export function createStructuredOutputControlResolver(input: {
  configured?: StructuredOutputControlDescriptor | undefined;
  registry?: ModelRegistry;
}): StructuredOutputControlResolver {
  return {
    async resolve(model) {
      // An explicit `unknown` is "no evidence declared", not a verdict: it must
      // not shadow a catalog entry that DOES carry evidence. `none` is a
      // verdict and does shadow it.
      if (input.configured && isKnownStructuredOutputControl(input.configured)) return input.configured;
      return resolveModelStructuredOutputControl(model, input.registry ?? modelRegistry);
    },
  };
}
