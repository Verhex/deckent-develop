import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildRunInspectorSnapshot, listRunInspectorRuns } from '../../src/core/run-inspector-read-model.js';
import type { Sprint } from '../../src/core/sprint-types.js';
import { formatInspectRunListing } from '../../src/cli/commands/inspect.js';
import { readSprintState, writeSprintState } from '../../src/orchestra/sprint-utils.js';

const roots: string[] = [];

describe('critical debt hold production wiring', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('preserves an open hold through durable state, shared read model, and CLI projection', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-debt-hold-'));
    roots.push(root);
    const sprint = {
      id: 'sprint-7099', number: 7099, status: 'PLANNING', phase: 'PLAN', tasks: [], workers: [],
      startedAt: '2026-09-08T00:00:00.000Z',
      debtInjectionHolds: [{ debtId: 'debt-critical', reason: 'legacy-unavailable' }],
    } as unknown as Sprint;

    writeSprintState(root, sprint);

    expect(readSprintState(root)?.debtInjectionHolds).toEqual(sprint.debtInjectionHolds);
    expect(buildRunInspectorSnapshot(root).debtInjectionHolds).toEqual(sprint.debtInjectionHolds);
    const listing = listRunInspectorRuns(root);
    expect(listing.runs[0]?.debtInjectionHolds).toEqual(sprint.debtInjectionHolds);
    expect(formatInspectRunListing(listing, 'en')).toContain('sprint-7099');
    expect(formatInspectRunListing(listing, 'en')).toContain('\t1');
  });
});
