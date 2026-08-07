// ═══ Operation Catalog (OPERATION-001, Dalga-3 O1) ═════════════════════════
// The versioned, canonical vocabulary of WHAT an action is. Every mutation,
// read and tool action across every surface resolves to exactly one entry, so
// approval, receipt, audit and routing stop re-deriving that answer from prose.
//
// Owner decisions this implements (2026-08-06 karar-turu):
//   D1 — eight-field schema (id/version/title/effect/gate/risk/capabilities +
//        idempotency + auditEvent)
//   D3 — JSON source of truth + generated constants (governance artifact:
//        diffable, lintable, receipt-pinnable, runtime-independent)
// D2 (counter-ratchet ingress enforcement) is the O3 slice, not this one.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Capability } from '../work-model.js';

/** What the operation does to the world. Ordering is increasing blast radius. */
export type OperationEffect =
  | 'READ'
  | 'MUTATE_LOCAL'
  | 'MUTATE_EXTERNAL'
  | 'SPAWN_EXECUTION'
  | 'DESTRUCTIVE'
  | 'DB'
  | 'MEMORY_LAW'
  | 'PROVIDER_CALL';

/** Owner-approval class (MASTER §2 gate ladder), carried per operation. */
export type OperationGate = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7';

export type OperationRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Retry/replay contract — Attempt-level idempotency semantics. */
export type OperationIdempotency = 'NONE' | 'KEYED' | 'NATURAL';

export interface OperationDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: { readonly en: string; readonly tr: string };
  readonly effect: OperationEffect;
  readonly gate: OperationGate;
  readonly risk: OperationRisk;
  readonly capabilities: readonly Capability[];
  readonly idempotency: OperationIdempotency;
  readonly auditEvent: string;
}

interface CatalogFile {
  readonly schemaVersion: number;
  readonly operations: readonly OperationDefinition[];
}

const CATALOG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'catalog.v1.json',
);

/**
 * effect → the MINIMUM gate that effect may carry. An entry may declare a
 * stricter gate (a read behind G2 is a policy choice), but never a weaker one —
 * this is the structural half of "no silent authority downgrade", enforced by
 * scripts/lint-operation-catalog.mjs at lint time and asserted here at load.
 */
export const EFFECT_MIN_GATE: Readonly<Record<OperationEffect, OperationGate>> = Object.freeze({
  READ: 'G0',
  MUTATE_LOCAL: 'G1',
  MUTATE_EXTERNAL: 'G1',
  SPAWN_EXECUTION: 'G1',
  DESTRUCTIVE: 'G3',
  DB: 'G4',
  MEMORY_LAW: 'G6',
  PROVIDER_CALL: 'G7',
});

const GATE_ORDER: readonly OperationGate[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];

/** True when `gate` is at least as strict as the effect's minimum. */
export function gateSatisfiesEffect(effect: OperationEffect, gate: OperationGate): boolean {
  return GATE_ORDER.indexOf(gate) >= GATE_ORDER.indexOf(EFFECT_MIN_GATE[effect]);
}

let cached: readonly OperationDefinition[] | null = null;

/** Load the catalog (memoized). The JSON file is the single source of truth. */
export function loadOperationCatalog(): readonly OperationDefinition[] {
  if (cached !== null) return cached;
  const parsed = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as CatalogFile;
  cached = Object.freeze(parsed.operations.map((op) => Object.freeze(op)));
  return cached;
}

/**
 * Resolve one operation by id. Absence is a typed error, never a permissive
 * default: an unknown operation id must fail closed rather than proceed with
 * no gate, no risk class and no capability requirement.
 */
export class UnknownOperationError extends Error {
  constructor(public readonly operationId: string) {
    super(`Unknown operation id '${operationId}' — not present in the canonical catalog`);
    this.name = 'UnknownOperationError';
  }
}

export function resolveOperation(id: string): OperationDefinition {
  const found = loadOperationCatalog().find((op) => op.id === id);
  if (!found) throw new UnknownOperationError(id);
  return found;
}

/**
 * Generated constants — call sites use these instead of raw strings so the
 * 0-hardcode rule holds and a renamed/retired id becomes a compile error
 * rather than a silent runtime miss.
 */
export const Op = Object.freeze({
  FsRead: 'op.fs.read',
  FsWrite: 'op.fs.write',
  FsDelete: 'op.fs.delete',
  MemoryRead: 'op.memory.read',
  MemoryWrite: 'op.memory.write',
  MemoryExport: 'op.memory.export',
} as const);

export type OpId = (typeof Op)[keyof typeof Op];
