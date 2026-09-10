// src/agent/structured-output-control.ts
// 7113-E-STRUCTURED-OUTPUT — the agent-side seam between a transport's declared
// schema-enforcement capability and the reference-digest program.
//
// This mirrors `reasoning-control.ts` exactly on purpose: the reference program
// must never guess what a server enforces, and a transport that declares
// nothing is treated as "no evidence", never as "supported".

import type { ProviderAdapter, StructuredOutputDirective } from './provider-tooluse/types.js';
import {
  enforcesStructuredOutput,
  type StructuredOutputControlDescriptor,
} from '../core/structured-output-control.js';

/** Resolve the transport's descriptor for `model`; any failure is "no evidence". */
export async function resolveAdapterStructuredOutputControl(
  adapter: ProviderAdapter,
  model: string,
  signal?: AbortSignal,
): Promise<StructuredOutputControlDescriptor | undefined> {
  if (!adapter.structuredOutputControl) return undefined;
  try {
    return (await adapter.structuredOutputControl(model, signal)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * True only when the resolved descriptor names a mechanism that makes the
 * SERVER enforce the schema. `undefined` (transport declares no capability),
 * `unknown` (no evidence) and `none` (evidence of no enforcement) are all
 * false — the reference program then holds instead of sending a request whose
 * contract nobody can enforce.
 */
export function canEnforceStructuredOutput(descriptor: StructuredOutputControlDescriptor | undefined): boolean {
  return enforcesStructuredOutput(descriptor);
}

/**
 * The host-authored response contract for one digest node.
 *
 * It is STRUCTURAL only — types, nesting, required keys and closed objects.
 * Size bounds (`maxItems`, `maxTextBytes`) are deliberately absent: the strict
 * json_schema dialect restricts the keyword subset a server accepts, and a byte
 * ceiling cannot be expressed in a schema whose string lengths are counted in
 * code units anyway. Those bounds stay where they are already enforced, on the
 * host side in `validateDigestPayload`, which remains the sole authority on
 * whether a payload is acceptable. Server enforcement narrows the SHAPE of the
 * output; it never becomes the reason to trust its contents.
 */
export function digestPayloadJsonSchema(): Record<string, unknown> {
  const stringList = { type: 'array', items: { type: 'string' } } as const;
  return {
    type: 'object',
    additionalProperties: false,
    required: ['claims', 'decisions', 'entities', 'openQuestions', 'contradictions', 'lossNotes'],
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'citations'],
          properties: {
            text: { type: 'string' },
            citations: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['sectionId', 'byteStart', 'byteEnd'],
                properties: {
                  sectionId: { type: 'string' },
                  byteStart: { type: 'integer' },
                  byteEnd: { type: 'integer' },
                },
              },
            },
          },
        },
      },
      decisions: stringList,
      entities: stringList,
      openQuestions: stringList,
      contradictions: stringList,
      lossNotes: stringList,
    },
  };
}

/** The directive attached to every reference-digest request. */
export function digestStructuredOutputDirective(): StructuredOutputDirective {
  return { name: 'reference_digest_payload', schema: digestPayloadJsonSchema() };
}
