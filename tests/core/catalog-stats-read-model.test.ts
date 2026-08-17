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

    expect(readCatalogStats(root)).toEqual({ source: 'absent', agents: {}, skills: {} });
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
    });
  });
});
