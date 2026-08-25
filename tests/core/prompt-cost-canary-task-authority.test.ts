import { describe, expect, it } from 'vitest';

import {
  createPromptCostCanaryTaskAuthority,
  parsePromptCostCanaryTaskAuthority,
} from '../../src/core/prompt-cost-canary-task-authority.js';

const definition = {
  title: 'Canonical canary workload',
  description: 'Run the same workload across two independently allocated sprints.',
  type: 'code-development' as const,
  scope: {
    directories: ['./src/core/'],
    filesRead: ['src\\core\\input.ts'],
    filesWrite: ['./src/core/output.ts'],
  },
  dependencies: ['642-001'],
  goNogo: {
    goCriteria: 'Tests pass',
    noGoCriteria: 'Tests fail',
    techDebtAcceptable: 'None',
  },
};

describe('prompt-cost canary task authority', () => {
  it('keeps workload identity stable across sprint ids and path separators', () => {
    const baseline = createPromptCostCanaryTaskAuthority(definition);
    const candidate = createPromptCostCanaryTaskAuthority({
      ...definition,
      scope: {
        directories: ['src/core/'],
        filesRead: ['./src/core/input.ts'],
        filesWrite: ['src\\core\\output.ts'],
      },
      dependencies: ['643-001'],
    });
    expect(candidate.logicalLineageId).toBe(baseline.logicalLineageId);
    expect(candidate.workloadDigest).toBe(baseline.workloadDigest);
    expect(candidate.authorityDigest).toBe(baseline.authorityDigest);
  });

  it('keeps workload identity while binding a changed effective feature snapshot', () => {
    const baseline = createPromptCostCanaryTaskAuthority(definition, { catalog_mount_mask: false });
    const candidate = createPromptCostCanaryTaskAuthority(definition, { catalog_mount_mask: true });
    expect(candidate.logicalLineageId).toBe(baseline.logicalLineageId);
    expect(candidate.workloadDigest).toBe(baseline.workloadDigest);
    expect(candidate.featureDigest).not.toBe(baseline.featureDigest);
    expect(candidate.authorityDigest).not.toBe(baseline.authorityDigest);
    expect(candidate.featureSnapshot.catalogMountMask).toBe(true);
  });

  it('round-trips canonical authority and rejects any digest or snapshot tamper', () => {
    const authority = createPromptCostCanaryTaskAuthority(definition);
    expect(parsePromptCostCanaryTaskAuthority(authority)).toEqual(authority);
    expect(parsePromptCostCanaryTaskAuthority({
      ...authority,
      // Default flipped ON 2026-08-25 — tampering toward OFF now diverges.
      featureSnapshot: { ...authority.featureSnapshot, codexCoreChannel: false },
    })).toBeNull();
    expect(parsePromptCostCanaryTaskAuthority({
      ...authority,
      logicalLineageId: `prompt-cost-lineage:sha256:${'0'.repeat(64)}`,
    })).toBeNull();
  });
});
