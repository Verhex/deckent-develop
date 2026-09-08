import { describe, expect, it } from 'vitest';
import {
  buildSyncAggregate,
  isSyncAggregateSummary,
  SYNC_AGGREGATE_SCHEMA_VERSION,
  type SyncAggregateSummary,
  type SyncCommandOutput,
} from '../../src/cli/helpers/sync-aggregate.js';
import {
  SYNC_CHANGE_DETECTION_MODES,
  SYNC_CHANGE_DETECTION_ISSUE_CODES,
} from '../../src/cli/helpers/sync-change-detection.js';

describe('buildSyncAggregate', () => {
  it('reduces an empty sync output to all-zero counts, a null git block and empty conflict state', () => {
    const summary = buildSyncAggregate({});

    expect(summary.schemaVersion).toBe(SYNC_AGGREGATE_SCHEMA_VERSION);
    expect(summary.adapters).toEqual({ synced: 0, errors: 0 });
    expect(summary.agentPrompts).toEqual({ created: 0, updated: 0, keptLocal: 0 });
    expect(summary.agentManifests).toEqual({ created: 0, updated: 0, keptLocal: 0 });
    expect(summary.capabilities).toEqual({ migrated: 0, issues: 0 });
    expect(summary.skills).toEqual({ created: 0, updated: 0, keptLocal: 0, unchanged: 0, issues: 0 });
    expect(summary.workspace).toEqual({ changed: 0, unchanged: 0 });
    expect(summary.git).toBeNull();
    expect(summary.missingBaseline).toEqual({ count: 0, agentIds: [] });
    expect(summary.conflicts).toEqual([]);
    expect(summary.warnings).toBe(0);
  });

  it('dedupes missing-baseline agent ids across prompt and manifest reports and sorts local-edit conflicts by scope then agentId', () => {
    const output: SyncCommandOutput = {
      adaptersSynced: ['gemini', 'cursor'],
      adapterErrors: [{ label: 'codex', file: 'AGENTS.md', reason: 'EACCES' }],
      agentPromptSync: {
        created: ['a1'],
        updated: ['a2', 'a3'],
        keptLocal: ['zulu', 'shared-agent'],
        conflicts: [
          { agentId: 'shared-agent', shadowPath: 'p1', builtinPath: 'b1', reason: 'r1', kind: 'missing-baseline' },
          { agentId: 'zulu', shadowPath: 'p2', builtinPath: 'b2', reason: 'r2', kind: 'local-edit' },
        ],
      },
      agentManifestSync: {
        created: [],
        updated: ['a4'],
        keptLocal: ['alpha', 'shared-agent'],
        conflicts: [
          { agentId: 'shared-agent', shadowPath: 'p3', builtinPath: 'b3', reason: 'r3', kind: 'missing-baseline' },
          { agentId: 'alpha', shadowPath: 'p4', builtinPath: 'b4', reason: 'r4', kind: 'local-edit' },
        ],
      },
      agentCapabilitiesSync: {
        migrated: ['a1', 'a2'],
        alreadyV3: ['a3'],
        issues: [{ agentId: 'a5', code: 'MALFORMED', message: 'bad json' }],
        protected: [],
      },
      skillManifestSync: {
        created: ['s1'],
        updated: ['s2'],
        unchanged: ['s3', 's4'],
        keptLocal: ['s5'],
        issues: [{ skillId: 's6', reason: 'checksum-mismatch' }],
      },
      workspaceSync: { changed: ['IDENTITY.md'], unchanged: ['README.md', 'CHANGELOG.md'] },
      gitChanges: { commits: 3, sprintId: '7104', modified: ['x.ts', 'y.ts'], added: ['z.ts'], deleted: [], renamed: ['w.ts'], detection: { mode: 'range', issue: null } },
      warnings: ['w1', 'w2', 'w3'],
    };

    const summary = buildSyncAggregate(output);

    expect(summary.adapters).toEqual({ synced: 2, errors: 1 });
    expect(summary.agentPrompts).toEqual({ created: 1, updated: 2, keptLocal: 2 });
    expect(summary.agentManifests).toEqual({ created: 0, updated: 1, keptLocal: 2 });
    expect(summary.capabilities).toEqual({ migrated: 2, issues: 1 });
    expect(summary.skills).toEqual({ created: 1, updated: 1, keptLocal: 1, unchanged: 2, issues: 1 });
    expect(summary.workspace).toEqual({ changed: 1, unchanged: 2 });
    expect(summary.git).toEqual({ commits: 3, modified: 2, added: 1, deleted: 0, renamed: 1, detection: 'range', issueCode: null });
    expect(summary.warnings).toBe(3);

    // Two missing-baseline conflict records, sharing one agent id across the
    // prompt and manifest reports, collapse to a single unique, sorted id.
    expect(summary.missingBaseline).toEqual({ count: 1, agentIds: ['shared-agent'] });

    // The two local-edit conflicts are ordered agent-prompt before
    // agent-manifest, and by agentId ascending within a scope.
    expect(summary.conflicts).toEqual([
      { scope: 'agent-prompt', agentId: 'zulu', kind: 'local-edit' },
      { scope: 'agent-manifest', agentId: 'alpha', kind: 'local-edit' },
    ]);
  });

  it('orders multiple local-edit conflicts within the same scope by agentId ascending', () => {
    const output: SyncCommandOutput = {
      agentPromptSync: {
        created: [],
        updated: [],
        keptLocal: ['zebra', 'beta'],
        conflicts: [
          { agentId: 'zebra', shadowPath: 'p1', builtinPath: 'b1', reason: 'r1', kind: 'local-edit' },
          { agentId: 'beta', shadowPath: 'p2', builtinPath: 'b2', reason: 'r2', kind: 'local-edit' },
        ],
      },
    };

    const summary = buildSyncAggregate(output);

    expect(summary.conflicts).toEqual([
      { scope: 'agent-prompt', agentId: 'beta', kind: 'local-edit' },
      { scope: 'agent-prompt', agentId: 'zebra', kind: 'local-edit' },
    ]);
  });

  it('treats a legacy conflict record lacking `kind` as local-edit (fail-closed)', () => {
    // A pre-7104 producer never emitted `kind` at all; the current report
    // type declares it required, so the whole literal is cast through
    // `unknown` to model that legacy runtime shape without fighting the type.
    const output = {
      agentManifestSync: {
        created: [],
        updated: [],
        keptLocal: ['legacy-agent'],
        conflicts: [{ agentId: 'legacy-agent', shadowPath: 'p', builtinPath: 'b', reason: 'no kind field' }],
      },
    } as unknown as SyncCommandOutput;

    const summary = buildSyncAggregate(output);

    expect(summary.missingBaseline).toEqual({ count: 0, agentIds: [] });
    expect(summary.conflicts).toEqual([
      { scope: 'agent-manifest', agentId: 'legacy-agent', kind: 'local-edit' },
    ]);
  });

  it('reports git as null when gitChanges is explicitly null, and populated when present', () => {
    expect(buildSyncAggregate({ gitChanges: null }).git).toBeNull();
    expect(buildSyncAggregate({}).git).toBeNull();

    const withGit = buildSyncAggregate({
      gitChanges: { commits: 0, sprintId: null, modified: [], added: [], deleted: ['gone.ts'], renamed: [], detection: { mode: 'range', issue: null } },
    });
    expect(withGit.git).toEqual({ commits: 0, modified: 0, added: 0, deleted: 1, renamed: 0, detection: 'range', issueCode: null });
  });

  it('propagates a `root-fallback` detection mode from the raw report onto `git.detection`', () => {
    const summary = buildSyncAggregate({
      gitChanges: {
        commits: 500,
        sprintId: '7104',
        modified: ['deep-history.ts'],
        added: [],
        deleted: [],
        renamed: [],
        // The requested commit window reached the full repo history, so
        // `getChangedFiles` (src/cli/commands/sync.ts) fell back to diffing
        // against the empty-tree root instead of a `HEAD~N` ref.
        detection: { mode: 'root-fallback', issue: null },
      },
    });
    expect(summary.git).toEqual({ commits: 500, modified: 1, added: 0, deleted: 0, renamed: 0, detection: 'root-fallback', issueCode: null });
  });

  it('propagates an `unavailable` detection mode from the raw report onto `git.detection`, carrying the issue code onto `git.issueCode` (the free-text `detail` is what gets dropped)', () => {
    const summary = buildSyncAggregate({
      gitChanges: {
        commits: 3,
        sprintId: '7104',
        // A failed `git diff` reports empty file lists — the aggregate must
        // still surface `detection: 'unavailable'` so a consumer never
        // renders this as "no changes".
        modified: [],
        added: [],
        deleted: [],
        renamed: [],
        detection: { mode: 'unavailable', issue: { code: 'GIT_DIFF_FAILED', detail: 'fatal: bad revision' } },
      },
    });
    expect(summary.git).toEqual({ commits: 3, modified: 0, added: 0, deleted: 0, renamed: 0, detection: 'unavailable', issueCode: 'GIT_DIFF_FAILED' });
  });

  it('fails closed to `detection: \'unavailable\'` when a legacy raw report omits `detection` entirely', () => {
    // A pre-7104 producer never emitted `detection` at all; the current
    // `SyncResult` type declares it required, so the whole literal is cast
    // through `unknown` to model that legacy runtime shape without fighting
    // the type (same technique the conflict `kind` legacy test above uses).
    const output = {
      gitChanges: { commits: 2, sprintId: '7104', modified: ['a.ts'], added: [], deleted: [], renamed: [] },
    } as unknown as SyncCommandOutput;

    const summary = buildSyncAggregate(output);

    expect(summary.git).toEqual({ commits: 2, modified: 1, added: 0, deleted: 0, renamed: 0, detection: 'unavailable', issueCode: null });
  });

  it('distinguishes a failed log (commits: 0, `unavailable`, `GIT_LOG_FAILED`) from a successful zero (commits: 0, `range`, `issueCode: null`) — the two must never be deep-equal', () => {
    const failedLog = buildSyncAggregate({
      gitChanges: {
        commits: 0,
        sprintId: '7104',
        modified: [],
        added: [],
        deleted: [],
        renamed: [],
        detection: { mode: 'unavailable', issue: { code: 'GIT_LOG_FAILED', detail: 'fatal: bad object HEAD' } },
      },
    });
    expect(failedLog.git).toEqual({
      commits: 0, modified: 0, added: 0, deleted: 0, renamed: 0,
      detection: 'unavailable', issueCode: 'GIT_LOG_FAILED',
    });

    const successfulZero = buildSyncAggregate({
      gitChanges: {
        commits: 0,
        sprintId: '7104',
        modified: [],
        added: [],
        deleted: [],
        renamed: [],
        detection: { mode: 'range', issue: null },
      },
    });
    expect(successfulZero.git).toEqual({
      commits: 0, modified: 0, added: 0, deleted: 0, renamed: 0,
      detection: 'range', issueCode: null,
    });

    expect(failedLog.git).not.toEqual(successfulZero.git);
  });

  it('freezes the returned summary and every nested object/array so it cannot be mutated', () => {
    const summary = buildSyncAggregate({
      agentPromptSync: {
        created: [],
        updated: [],
        keptLocal: [],
        conflicts: [{ agentId: 'x', shadowPath: 'p', builtinPath: 'b', reason: 'r', kind: 'local-edit' }],
      },
      gitChanges: { commits: 1, sprintId: '1', modified: [], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: null } },
    });

    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.adapters)).toBe(true);
    expect(Object.isFrozen(summary.agentPrompts)).toBe(true);
    expect(Object.isFrozen(summary.agentManifests)).toBe(true);
    expect(Object.isFrozen(summary.capabilities)).toBe(true);
    expect(Object.isFrozen(summary.skills)).toBe(true);
    expect(Object.isFrozen(summary.workspace)).toBe(true);
    expect(Object.isFrozen(summary.git)).toBe(true);
    expect(Object.isFrozen(summary.missingBaseline)).toBe(true);
    expect(Object.isFrozen(summary.missingBaseline.agentIds)).toBe(true);
    expect(Object.isFrozen(summary.conflicts)).toBe(true);
    expect(Object.isFrozen(summary.conflicts[0])).toBe(true);

    expect(() => {
      (summary as { warnings: number }).warnings = 99;
    }).toThrow();
    // `git.issueCode` is part of the frozen `git` block, same as every other
    // field on it — a consumer must not be able to smuggle a forged code in
    // after the fact.
    expect(() => {
      (summary.git! as { issueCode: string | null }).issueCode = 'GIT_LOG_FAILED';
    }).toThrow();
  });
});

describe('isSyncAggregateSummary', () => {
  const validSummary: SyncAggregateSummary = buildSyncAggregate({
    agentPromptSync: {
      created: ['a'],
      updated: [],
      keptLocal: [],
      conflicts: [{ agentId: 'x', shadowPath: 'p', builtinPath: 'b', reason: 'r', kind: 'local-edit' }],
    },
    gitChanges: { commits: 2, sprintId: '7104', modified: ['a'], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: null } },
  });

  it('accepts a summary produced by buildSyncAggregate, including the empty-output shape', () => {
    expect(isSyncAggregateSummary(validSummary)).toBe(true);
    expect(isSyncAggregateSummary(buildSyncAggregate({}))).toBe(true);
  });

  it('rejects a non-object, null, or array value', () => {
    expect(isSyncAggregateSummary(null)).toBe(false);
    expect(isSyncAggregateSummary(undefined)).toBe(false);
    expect(isSyncAggregateSummary('summary')).toBe(false);
    expect(isSyncAggregateSummary([])).toBe(false);
  });

  it('rejects a wrong schemaVersion', () => {
    expect(isSyncAggregateSummary({ ...validSummary, schemaVersion: 2 })).toBe(false);
  });

  it('rejects a negative count field', () => {
    expect(
      isSyncAggregateSummary({ ...validSummary, adapters: { synced: -1, errors: 0 } }),
    ).toBe(false);
  });

  it('rejects a non-integer count field', () => {
    expect(
      isSyncAggregateSummary({ ...validSummary, adapters: { synced: 1.5, errors: 0 } }),
    ).toBe(false);
  });

  it('rejects a non-string agentId inside missingBaseline.agentIds', () => {
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        missingBaseline: { count: 1, agentIds: [42] },
      }),
    ).toBe(false);
  });

  it('rejects an unknown conflict kind', () => {
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        conflicts: [{ scope: 'agent-prompt', agentId: 'x', kind: 'renamed' }],
      }),
    ).toBe(false);
  });

  it('rejects an unknown conflict scope', () => {
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        conflicts: [{ scope: 'agent-skill', agentId: 'x', kind: 'local-edit' }],
      }),
    ).toBe(false);
  });

  it('rejects a mismatched missingBaseline.count / agentIds.length pair', () => {
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        missingBaseline: { count: 2, agentIds: ['only-one'] },
      }),
    ).toBe(false);
  });

  it('rejects a git block with a non-numeric field, but accepts a null git block', () => {
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        git: { commits: '3', modified: 0, added: 0, deleted: 0, renamed: 0, detection: 'range' },
      }),
    ).toBe(false);
    expect(isSyncAggregateSummary({ ...validSummary, git: null })).toBe(true);
  });

  it('rejects a git block whose detection is outside the three closed modes, and rejects one missing detection entirely', () => {
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        git: { commits: 3, modified: 0, added: 0, deleted: 0, renamed: 0, detection: 'stale' },
      }),
    ).toBe(false);
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        // Same numeric fields as `validSummary.git`, but the `detection`
        // field is missing outright — the validator must reject this, not
        // silently treat an absent field as some default mode.
        git: { commits: 2, modified: 1, added: 0, deleted: 0, renamed: 0 },
      }),
    ).toBe(false);
  });

  it('accepts each of the four closed issue codes paired with `unavailable`', () => {
    for (const code of SYNC_CHANGE_DETECTION_ISSUE_CODES) {
      expect(
        isSyncAggregateSummary({
          ...validSummary,
          git: { ...validSummary.git!, detection: 'unavailable', issueCode: code },
        }),
      ).toBe(true);
    }
  });

  it('accepts `issueCode: null` paired with each of the three closed detection modes', () => {
    for (const mode of SYNC_CHANGE_DETECTION_MODES) {
      expect(
        isSyncAggregateSummary({
          ...validSummary,
          git: { ...validSummary.git!, detection: mode, issueCode: null },
        }),
      ).toBe(true);
    }
  });

  it('rejects an unknown issue code string', () => {
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        git: { ...validSummary.git!, detection: 'unavailable', issueCode: 'GIT_FOO' },
      }),
    ).toBe(false);
  });

  it('rejects a valid issue code paired with a clean detection mode (`range` or `root-fallback`) — a code names a failure, so it can only ever accompany `unavailable`', () => {
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        git: { ...validSummary.git!, detection: 'range', issueCode: 'GIT_LOG_FAILED' },
      }),
    ).toBe(false);
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        git: { ...validSummary.git!, detection: 'root-fallback', issueCode: 'GIT_LOG_FAILED' },
      }),
    ).toBe(false);
  });

  it('rejects a git block missing `issueCode` entirely (the field is required, not merely optional-and-null)', () => {
    const { issueCode: _issueCode, ...gitWithoutIssueCode } = validSummary.git!;
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        git: gitWithoutIssueCode,
      }),
    ).toBe(false);
  });

  it('rejects a non-null, non-string `issueCode` (explicit undefined, a number, an object)', () => {
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        git: { ...validSummary.git!, issueCode: undefined },
      }),
    ).toBe(false);
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        git: { ...validSummary.git!, issueCode: 42 },
      }),
    ).toBe(false);
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        git: { ...validSummary.git!, issueCode: {} },
      }),
    ).toBe(false);
  });

  it('rejects a conflicts entry whose kind is missing-baseline (contract: conflicts is local-edit only)', () => {
    // `missing-baseline` is a real, closed `AgentSyncConflictKind` value —
    // it just never belongs inside `conflicts`. It lives exclusively in
    // `missingBaseline`. A conflicts entry carrying it must be rejected even
    // though the kind itself is otherwise well-formed.
    expect(
      isSyncAggregateSummary({
        ...validSummary,
        conflicts: [{ scope: 'agent-prompt', agentId: 'x', kind: 'missing-baseline' }],
      }),
    ).toBe(false);
  });

  it('accepts buildSyncAggregate output for a raw report mixing missing-baseline and local-edit records, with missing-baseline kept out of conflicts', () => {
    const output: SyncCommandOutput = {
      agentPromptSync: {
        created: [],
        updated: [],
        keptLocal: ['shared-agent', 'edited-agent'],
        conflicts: [
          { agentId: 'shared-agent', shadowPath: 'p1', builtinPath: 'b1', reason: 'r1', kind: 'missing-baseline' },
          { agentId: 'edited-agent', shadowPath: 'p2', builtinPath: 'b2', reason: 'r2', kind: 'local-edit' },
        ],
      },
      agentManifestSync: {
        created: [],
        updated: [],
        keptLocal: ['shared-agent'],
        conflicts: [
          { agentId: 'shared-agent', shadowPath: 'p3', builtinPath: 'b3', reason: 'r3', kind: 'missing-baseline' },
        ],
      },
    };

    const summary = buildSyncAggregate(output);

    expect(summary.missingBaseline).toEqual({ count: 1, agentIds: ['shared-agent'] });
    expect(summary.conflicts).toEqual([
      { scope: 'agent-prompt', agentId: 'edited-agent', kind: 'local-edit' },
    ]);
    expect(isSyncAggregateSummary(summary)).toBe(true);
  });
});
