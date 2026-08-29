import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { readCatalogStats } from '../../src/core/catalog-stats-read-model.js';

describe('readCatalogStats', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-catalog-stats-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeSidecar(value: unknown): void {
    const statsDir = join(root, '.deckent', 'stats');
    mkdirSync(statsDir, { recursive: true });
    writeFileSync(join(statsDir, 'catalog-stats.json'), JSON.stringify(value), 'utf8');
  }

  it('projects exact ratios, rounded percentages, counts, recency, and provenance', () => {
    writeSidecar({
      agents: {
        implementer: { totalUses: 25, successRate: 0.84, lastUsedInSprint: 'sprint-545' },
      },
      skills: {
        testing: { totalUses: 3, successCount: 2, lastUsedInSprint: 'sprint-544' },
      },
      skillExposure: {
        testing: { selected: 7, delivered: 6, credited: 3, terminalOutcomes: 7, lastObservedInSprint: 'sprint-545' },
      },
      skillAttribution: {
        authority: 'causal-receipt-v1', cutoverSprint: 'sprint-544', legacyQuarantineDigest: null,
      },
    });

    const result = readCatalogStats(root);

    expect(result.source).toBe('sidecar');
    expect(result.agents.implementer).toEqual({
      uses: 25,
      successes: 21,
      successRatio: 0.84,
      successPercent: 84,
      lastUsedInSprint: 'sprint-545',
    });
    expect(result.skills.testing).toEqual({
      uses: 3,
      successes: 2,
      successRatio: 2 / 3,
      successPercent: 67,
      lastUsedInSprint: 'sprint-544',
    });
    expect(result.skillExposure.testing).toEqual({
      selected: 7, delivered: 6, credited: 3, terminalOutcomes: 7,
      lastObservedInSprint: 'sprint-545',
    });
    expect(result.skillAttribution).toEqual({
      authority: 'causal-receipt-v1', cutoverSprint: 'sprint-544', legacyQuarantineDigest: null,
    });
  });

  it('represents zero uses as never measured rather than a fake zero percent', () => {
    writeSidecar({
      agents: {},
      skills: { unused: { totalUses: 0, successCount: 0, successRate: 0, lastUsedInSprint: '' } },
    });

    expect(readCatalogStats(root).skills.unused).toEqual({
      uses: 0,
      successes: 0,
      successRatio: null,
      successPercent: null,
      lastUsedInSprint: null,
    });
  });

  it.each([
    ['missing sidecar', undefined],
    ['torn JSON', '{"agents":'],
    ['malformed root', JSON.stringify([])],
    ['malformed namespaces', JSON.stringify({ agents: [], skills: {} })],
  ])('returns an absent empty projection for %s', (_label, bytes) => {
    if (bytes !== undefined) {
      const statsDir = join(root, '.deckent', 'stats');
      mkdirSync(statsDir, { recursive: true });
      writeFileSync(join(statsDir, 'catalog-stats.json'), bytes, 'utf8');
    }

    expect(readCatalogStats(root)).toEqual({
      source: 'absent', agents: {}, skills: {}, skillExposure: {}, skillAttribution: null,
    });
  });

  it('skips malformed entity records without rejecting valid siblings', () => {
    writeSidecar({
      agents: {
        broken: { totalUses: 'many', successRate: 1 },
        valid: { uses: 2, successes: 1, lastUsedInSprint: null },
      },
      skills: {},
    });

    expect(readCatalogStats(root)).toEqual({
      source: 'sidecar',
      agents: {
        valid: {
          uses: 2,
          successes: 1,
          successRatio: 0.5,
          successPercent: 50,
          lastUsedInSprint: null,
        },
      },
      skills: {},
      skillExposure: {},
      skillAttribution: null,
    });
  });

  it('skips malformed exposure rows and rejects malformed attribution authority without hiding valid efficacy stats', () => {
    writeSidecar({
      agents: {},
      skills: { valid: { totalUses: 1, successCount: 1 } },
      skillExposure: {
        valid: { selected: 2, delivered: 2, credited: 1, terminalOutcomes: 2 },
        broken: { selected: 'many', delivered: 1, credited: 1, terminalOutcomes: 1 },
      },
      skillAttribution: {
        authority: 'causal-receipt-v1', cutoverSprint: '', legacyQuarantineDigest: 'not-a-digest',
      },
    });

    const result = readCatalogStats(root);
    expect(result.skills.valid?.uses).toBe(1);
    expect(result.skillExposure).toEqual({
      valid: { selected: 2, delivered: 2, credited: 1, terminalOutcomes: 2, lastObservedInSprint: null },
    });
    expect(result.skillAttribution).toBeNull();
  });
});
