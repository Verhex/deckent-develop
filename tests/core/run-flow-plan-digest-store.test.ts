import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPlannedSprint, savePlannedSprint } from '../../src/core/run-flow-store.js';

describe('run-flow planned sprint exact lookup', () => {
  it('selects v2 records by exact revision+digest+version instead of latest', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-plan-store-'));
    savePlannedSprint(root, 'flow-1', {
      revision: 1,
      planDigest: 'a'.repeat(64),
      planDigestVersion: 2,
      sprint: { id: 'sprint-one' },
    });
    savePlannedSprint(root, 'flow-1', {
      revision: 2,
      planDigest: 'b'.repeat(64),
      planDigestVersion: 2,
      sprint: { id: 'sprint-two' },
    });

    expect(loadPlannedSprint(root, 'flow-1', {
      revision: 1,
      planDigest: 'a'.repeat(64),
      planDigestVersion: 2,
    })?.sprint).toEqual({ id: 'sprint-one' });
    expect(loadPlannedSprint(root, 'flow-1', {
      revision: 1,
      planDigest: 'c'.repeat(64),
      planDigestVersion: 2,
    })).toBeUndefined();
  });

  it('keeps version-absent records on the explicit legacy-v1 revision path', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-plan-store-legacy-'));
    savePlannedSprint(root, 'flow-legacy', { revision: 1, sprint: { id: 'legacy' } });
    expect(loadPlannedSprint(root, 'flow-legacy', {
      revision: 1,
      planDigest: 'legacy-opaque-digest',
    })?.sprint).toEqual({ id: 'legacy' });
    expect(loadPlannedSprint(root, 'flow-legacy', {
      revision: 1,
      planDigest: 'legacy-opaque-digest',
      planDigestVersion: 2,
    })).toBeUndefined();
  });
});
