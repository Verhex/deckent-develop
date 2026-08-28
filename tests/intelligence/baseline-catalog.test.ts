import { access } from 'node:fs/promises';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { BASELINE_CATALOG, UNDERIVED_DIGEST } from '../../src/intelligence/baseline-catalog.js';
import {
  CAPABILITY_STATUSES,
  type CapabilityEntry,
  type CapabilityStatus,
} from '../../src/intelligence/types.js';

const EXPECTED_DOMAINS = [
  'Goal/Mission/Flow/Run/WorkItem/Attempt/Operation',
  'Brain',
  'worker self-assessment',
  'Auditor',
  'Nervous',
  'ApprovalBroker-HITL',
  'normative verdicts',
  'dependency dispatch',
  'collision control',
  'FIX/retry/recovery',
  'checkpoints',
  'settlement',
  'evidence/receipts',
  'XVerify/cross-provider',
  'routing/provider authority',
  'budgets/landing',
  'backends/isolation',
  'MCP/API/CLI/Terminal/Desktop',
  'connectors',
  'process',
  'autonomous',
  'memory',
  'agents',
  'skills',
  'capability authority',
  'reactive/notification',
] as const;

describe('baseline capability catalog', () => {
  it('keeps the status vocabulary closed to exactly seven values', () => {
    expect(CAPABILITY_STATUSES).toEqual([
      'LIVE_PROVEN',
      'LIVE_PARTIAL',
      'WIRED_UNPROVEN',
      'DORMANT_DEFAULT_OFF',
      'ROADMAP',
      'HOLD',
      'DEAD_LEGACY',
    ]);
    expectTypeOf<CapabilityStatus>().toEqualTypeOf<
      (typeof CAPABILITY_STATUSES)[number]
    >();
  });

  it('requires evidence at the type boundary', () => {
    expectTypeOf<CapabilityEntry['evidenceRefs']>().toMatchTypeOf<
      readonly [string, ...string[]]
    >();
    expectTypeOf<readonly []>().not.toMatchTypeOf<
      CapabilityEntry['evidenceRefs']
    >();
  });

  it('contains every canonical domain once with unique capability ids', () => {
    expect(BASELINE_CATALOG.map((entry) => entry.domain)).toEqual(EXPECTED_DOMAINS);
    expect(new Set(BASELINE_CATALOG.map((entry) => entry.domain)).size).toBe(
      BASELINE_CATALOG.length,
    );
    expect(new Set(BASELINE_CATALOG.map((entry) => entry.capabilityId)).size).toBe(
      BASELINE_CATALOG.length,
    );
  });

  it('declares non-empty exact repo evidence paths that exist', async () => {
    for (const entry of BASELINE_CATALOG) {
      expect(entry.evidenceRefs.length).toBeGreaterThan(0);
      for (const evidenceRef of entry.evidenceRefs) {
        expect(evidenceRef).not.toMatch(/^fixtures?\//);
        expect(evidenceRef).not.toMatch(/^\//);
        await expect(access(evidenceRef)).resolves.toBeUndefined();
      }
    }
  });

  // The catalog is authored data and cannot read files, so it must NOT carry a
  // hand-written content digest: such a value silently goes stale the moment the
  // referenced implementation moves, which is exactly the drift this subsystem
  // exists to detect. Real digests are a derivation-time property — that contract
  // is pinned in baseline.test.ts against `deriveBaseline`.
  it('never authors a content digest, so an entry cannot claim stale content', () => {
    for (const entry of BASELINE_CATALOG) {
      expect(entry.sourceDigest).toBe(UNDERIVED_DIGEST);
      expect(entry.sourceDigest).not.toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('classifies every entry with an honest, evidence-bound status', () => {
    for (const entry of BASELINE_CATALOG) {
      // An entry claiming a live observation must say what was observed.
      if (entry.status === 'LIVE_PROVEN' || entry.status === 'LIVE_PARTIAL') {
        expect(entry.notes).toMatch(/[Oo]bserved/);
      }
      // The catalog answers "what does the code do today", so its evidence is
      // implementation, never a brief, plan or governance document.
      for (const evidenceRef of entry.evidenceRefs) {
        expect(evidenceRef).toMatch(/^src\//);
      }
    }
  });

  it('does not collapse every field into one uniform status', () => {
    const statuses = new Set(BASELINE_CATALOG.map(entry => entry.status));
    expect(statuses.size).toBeGreaterThan(1);
  });
});
