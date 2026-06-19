import { describe, it, expect } from 'vitest';
import {
  isValidTaskType,
  type TaskType,
  type DecisionCanonicalKind,
} from '../../src/core/decision-types.js';
import {
  isValidIntentType,
  ALL_INTENT_TYPES,
  type IntentType,
  type IntentCanonicalKind,
} from '../../src/core/routing-types.js';
import {
  decisionTypeToKind,
  intentToKind,
  taskKindToIntent,
  type TaskKind,
} from '../../src/core/work-model.js';

// ─── WM-2: canonical migrate + dup-delete (regression-guard) ─────────────────
// decision-types `TaskType` and routing-types `IntentType` are now single-sourced
// (derived from one const tuple each — the duplicate runtime arrays are gone) and
// provably reconcile to the canonical `TaskKind` SSOT (src/core/work-model.ts) via
// the existing adapters. These tests lock the reconciliation + the dedup so the
// legacy taxonomies cannot silently drift from the canonical one.

// Test-local enumeration of the canonical SSOT (mirrors work-model TaskKind) so a
// drift in either side is caught here rather than by an end-user.
const ALL_TASK_KINDS = [
  'code-development', 'test', 'documentation', 'audit',
  'security', 'refactor', 'devops', 'config', 'design', 'data', 'generic',
] as const satisfies readonly TaskKind[];

const ALL_DECISION_TASK_TYPES: readonly TaskType[] = [
  'code', 'test', 'doc', 'security', 'refactor', 'devops', 'config',
];

describe('WM-2 — decision TaskType ↔ canonical TaskKind', () => {
  it('single-sources isValidTaskType over the 7 decision task types (dup-delete regression-guard)', () => {
    for (const t of ALL_DECISION_TASK_TYPES) {
      expect(isValidTaskType(t)).toBe(true);
    }
    // VALID_TASK_TYPES runtime-array duplicate is gone — validation reads the
    // single const tuple. Invalids still rejected (no behavior change).
    expect(isValidTaskType('unknown')).toBe(false);
    expect(isValidTaskType('')).toBe(false);
    expect(isValidTaskType('CODE')).toBe(false);
    expect(isValidTaskType('code-development')).toBe(false); // canonical id is NOT a decision TaskType
  });

  it('every decision TaskType reconciles to a valid canonical TaskKind via decisionTypeToKind', () => {
    for (const t of ALL_DECISION_TASK_TYPES) {
      const kind = decisionTypeToKind(t);
      expect(ALL_TASK_KINDS).toContain(kind);
      // known decision types never collapse to the catch-all 'generic'
      expect(kind).not.toBe('generic');
    }
  });

  it('preserves the documented decision → canonical mapping', () => {
    expect(decisionTypeToKind('code')).toBe('code-development');
    expect(decisionTypeToKind('doc')).toBe('documentation');
    expect(decisionTypeToKind('test')).toBe('test');
    expect(decisionTypeToKind('security')).toBe('security');
    expect(decisionTypeToKind('refactor')).toBe('refactor');
    expect(decisionTypeToKind('devops')).toBe('devops');
    expect(decisionTypeToKind('config')).toBe('config');
    expect(decisionTypeToKind('totally-unknown')).toBe('generic'); // safe fallback
  });
});

describe('WM-2 — routing IntentType ↔ canonical TaskKind', () => {
  it('single-sources the IntentType union from ALL_INTENT_TYPES (dup-delete)', () => {
    // The union is derived from the tuple — the two can no longer disagree.
    expect(ALL_INTENT_TYPES).toHaveLength(12);
    for (const intent of ALL_INTENT_TYPES) {
      expect(isValidIntentType(intent)).toBe(true);
    }
    // regression-guard: removed/never-present members stay rejected
    expect(isValidIntentType('testing')).toBe(false);
    expect(isValidIntentType('')).toBe(false);
    expect(isValidIntentType('SECURITY')).toBe(false);
  });

  it('every IntentType reconciles to a valid canonical TaskKind via intentToKind', () => {
    for (const intent of ALL_INTENT_TYPES) {
      const kind = intentToKind(intent);
      expect(ALL_TASK_KINDS).toContain(kind);
    }
  });

  it('taskKindToIntent round-trips back into the IntentType union for every canonical kind', () => {
    for (const kind of ALL_TASK_KINDS) {
      const intent = taskKindToIntent(kind);
      expect(ALL_INTENT_TYPES).toContain(intent);
      expect(isValidIntentType(intent)).toBe(true);
    }
  });
});

describe('WM-2 — canonical-import assert', () => {
  it('decision-types & routing-types expose canonical anchors typed as TaskKind', () => {
    // Compile-time linkage: the anchor aliases ARE the canonical TaskKind. If the
    // canonical import is severed or the alias drifts, these assignments fail tsc.
    const decisionKind: DecisionCanonicalKind = 'code-development';
    const intentKind: IntentCanonicalKind = 'design';
    const asTaskKindA: TaskKind = decisionKind;
    const asTaskKindB: TaskKind = intentKind;
    expect(ALL_TASK_KINDS).toContain(asTaskKindA);
    expect(ALL_TASK_KINDS).toContain(asTaskKindB);

    // A canonical-only id is assignable to the anchors but is NOT a legacy member —
    // proving the anchors point at TaskKind, not at the legacy taxonomies.
    const auditKind: DecisionCanonicalKind = 'audit';
    expect(isValidTaskType(auditKind as string)).toBe(false);
  });

  it('legacy union members are assignable to their derived types (single-source proof)', () => {
    const t: TaskType = 'refactor';
    const i: IntentType = 'architecture';
    expect(isValidTaskType(t)).toBe(true);
    expect(isValidIntentType(i)).toBe(true);
  });
});
