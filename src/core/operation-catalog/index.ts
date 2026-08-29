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
// 4032 adds exact version references and registry-neutral identity convergence.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Capability } from '../work-model.js';

export { Op, OperationRef } from './generated.js';
export type { ExactOperationReference, GeneratedOperationReference, OpId } from './generated.js';

export type OperationEffect = 'READ' | 'MUTATE_LOCAL' | 'MUTATE_EXTERNAL' | 'SPAWN_EXECUTION' | 'DESTRUCTIVE' | 'DB' | 'MEMORY_LAW' | 'PROVIDER_CALL';
export type OperationGate = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7';
export type OperationRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
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

export interface OperationReference {
  readonly operationId: string;
  readonly version: number;
  readonly key: string;
}

export interface OperationReferenceInput {
  readonly operationId: string;
  readonly version: number;
}

export interface OperationDeclaration {
  readonly registry: string;
  readonly action: string;
  readonly semanticEquivalenceKey: string;
  readonly operation: OperationReferenceInput;
}

export interface ConvergedOperationEvidence {
  readonly semanticEquivalenceKey: string;
  readonly operation: OperationReference;
  readonly declarations: readonly Readonly<Pick<OperationDeclaration, 'registry' | 'action'>>[];
}

export type ConvergenceValidationResult =
  | { readonly ok: true; readonly evidence: readonly ConvergedOperationEvidence[] }
  | { readonly ok: false; readonly diagnostics: readonly string[] };

const CATALOG_PATH = join(dirname(fileURLToPath(import.meta.url)), 'catalog.v1.json');
const GATE_ORDER: readonly OperationGate[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];

export const EFFECT_MIN_GATE: Readonly<Record<OperationEffect, OperationGate>> = Object.freeze({
  READ: 'G0', MUTATE_LOCAL: 'G1', MUTATE_EXTERNAL: 'G1', SPAWN_EXECUTION: 'G1',
  DESTRUCTIVE: 'G3', DB: 'G4', MEMORY_LAW: 'G6', PROVIDER_CALL: 'G7',
});

export function gateSatisfiesEffect(effect: OperationEffect, gate: OperationGate): boolean {
  return GATE_ORDER.indexOf(gate) >= GATE_ORDER.indexOf(EFFECT_MIN_GATE[effect]);
}

let cachedCatalog: readonly OperationDefinition[] | null = null;

export function loadOperationCatalog(): readonly OperationDefinition[] {
  if (cachedCatalog !== null) return cachedCatalog;
  const parsed = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as CatalogFile;
  cachedCatalog = Object.freeze(parsed.operations.map(operation => Object.freeze({
    ...operation,
    title: Object.freeze({ ...operation.title }),
    capabilities: Object.freeze([...operation.capabilities]),
  })));
  return cachedCatalog;
}

export class UnknownOperationError extends Error {
  constructor(public readonly operationId: string) {
    super(`Unknown operation id '${operationId}' — not present in the canonical catalog`);
    this.name = 'UnknownOperationError';
  }
}

export class OperationVersionMismatchError extends Error {
  constructor(
    public readonly operationId: string,
    public readonly requestedVersion: number,
    public readonly currentVersion: number,
  ) {
    super(`Operation '${operationId}' requested version ${requestedVersion}, canonical version is ${currentVersion}`);
    this.name = 'OperationVersionMismatchError';
  }
}

export function resolveOperation(operationId: string): OperationDefinition {
  const operation = loadOperationCatalog().find(candidate => candidate.id === operationId);
  if (!operation) throw new UnknownOperationError(operationId);
  return operation;
}

export function operationReference(operationId: string, version: number): OperationReference {
  const operation = resolveOperationReference({ operationId, version });
  return Object.freeze({
    operationId: operation.id,
    version: operation.version,
    key: `${operation.id}@${operation.version}`,
  });
}

export function resolveOperationReference(reference: OperationReferenceInput): OperationDefinition {
  const operation = resolveOperation(reference.operationId);
  if (!Number.isInteger(reference.version) || reference.version < 1 || reference.version !== operation.version) {
    throw new OperationVersionMismatchError(reference.operationId, reference.version, operation.version);
  }
  return operation;
}

function validText(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function validateOperationConvergence(declarations: readonly unknown[]): ConvergenceValidationResult {
  const diagnostics: string[] = [];
  const normalized: OperationDeclaration[] = [];
  const resolved: Array<{ declaration: OperationDeclaration; operation: OperationReference }> = [];

  for (const candidate of declarations) {
    if (!candidate || typeof candidate !== 'object') {
      diagnostics.push('malformed declaration: expected object');
      continue;
    }
    const declaration = candidate as Partial<OperationDeclaration>;
    if (!validText(declaration.registry) || !validText(declaration.action) || !validText(declaration.semanticEquivalenceKey)
      || !declaration.operation || typeof declaration.operation !== 'object'
      || !validText(declaration.operation.operationId) || !Number.isInteger(declaration.operation.version)
      || declaration.operation.version < 1) {
      diagnostics.push('malformed declaration: registry, action, semanticEquivalenceKey, and positive operation version are required');
      continue;
    }
    normalized.push(declaration as OperationDeclaration);
  }

  const identityCounts = new Map<string, { count: number; registry: string; action: string }>();
  for (const declaration of normalized) {
    const identity = `${declaration.registry}\u0000${declaration.action}`;
    const current = identityCounts.get(identity);
    identityCounts.set(identity, current
      ? { ...current, count: current.count + 1 }
      : { count: 1, registry: declaration.registry, action: declaration.action });
  }
  for (const duplicate of [...identityCounts.values()]
    .filter(identity => identity.count > 1)
    .sort((left, right) => compareText(`${left.registry}\u0000${left.action}`, `${right.registry}\u0000${right.action}`))) {
    diagnostics.push(`duplicate declaration identity '${duplicate.registry}/${duplicate.action}'`);
  }

  for (const declaration of normalized) {
    try {
      const operation = resolveOperationReference(declaration.operation);
      resolved.push({
        declaration,
        operation: operationReference(operation.id, operation.version),
      });
    } catch (error: unknown) {
      diagnostics.push(error instanceof Error ? error.message : String(error));
    }
  }

  const groups = new Map<string, typeof resolved>();
  for (const item of resolved) {
    const group = groups.get(item.declaration.semanticEquivalenceKey) ?? [];
    group.push(item);
    groups.set(item.declaration.semanticEquivalenceKey, group);
  }

  const evidence: ConvergedOperationEvidence[] = [];
  for (const semanticEquivalenceKey of [...groups.keys()].sort(compareText)) {
    const group = groups.get(semanticEquivalenceKey)!;
    const referenceKeys = [...new Set(group.map(item => item.operation.key))].sort(compareText);
    if (referenceKeys.length !== 1) {
      diagnostics.push(`ambiguous semantic-equivalence key '${semanticEquivalenceKey}': ${referenceKeys.join(', ')}`);
      continue;
    }
    const first = group[0];
    if (!first) {
      diagnostics.push(`empty semantic-equivalence group '${semanticEquivalenceKey}'`);
      continue;
    }
    evidence.push(Object.freeze({
      semanticEquivalenceKey,
      operation: first.operation,
      declarations: Object.freeze(group.map(item => Object.freeze({
        registry: item.declaration.registry,
        action: item.declaration.action,
      })).sort((left, right) => compareText(`${left.registry}\u0000${left.action}`, `${right.registry}\u0000${right.action}`))),
    }));
  }

  return Object.freeze(diagnostics.length > 0
    ? { ok: false as const, diagnostics: Object.freeze(diagnostics.sort(compareText)) }
    : { ok: true as const, evidence: Object.freeze(evidence) });
}
