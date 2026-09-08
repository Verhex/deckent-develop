import { describe, expect, it } from 'vitest';
import { parseToolReadJson } from '../../../src/cli/repl/tool-read-model.js';
import { buildSyncAggregate, type SyncCommandOutput } from '../../../src/cli/helpers/sync-aggregate.js';

describe('structured tool read model', () => {
  it('keeps doctor diagnostic rows when the execution outcome is later nonzero', () => {
    const model = parseToolReadJson('doctor', JSON.stringify({
      ok: false,
      checks: [{ name: 'config', passed: false, required: true, message: 'missing key' }],
      providers: [], providerAuth: [], providerSummary: {}, honestSummary: 'failed',
    }));
    expect(model.state).toBe('valid');
    expect(model.rows[0]?.title).toBe('config');
    expect(model.rows[0]?.fields).toContainEqual({ key: 'passed', value: 'false' });
  });

  it('distinguishes valid empty from malformed and unsupported schemas', () => {
    expect(parseToolReadJson('history', '[]').state).toBe('empty');
    expect(parseToolReadJson('history', '{}').state).toBe('schema-unknown');
    expect(parseToolReadJson('history', '{').reasonCode).toBe('READ_JSON_INVALID');
    expect(parseToolReadJson('models', JSON.stringify({ schemaVersion: 2, kind: 'model-catalog-list', models: [] })).state).toBe('schema-unknown');
  });

  it('keeps model authority HOLD as unavailable rather than a successful empty catalog', () => {
    const model = parseToolReadJson('model-active-set', JSON.stringify({
      schemaVersion: 1,
      kind: 'model-active-set',
      authority: { state: 'hold', reasonCode: 'MODEL_ACTIVATION_AUTHORITY_UNAVAILABLE', policySnapshotDigest: 'a'.repeat(64) },
      catalog: null, offline: true, ownerPermittedModels: [], unknownActiveModels: [],
    }));
    expect(model.state).toBe('unavailable');
    expect(model.reasonCode).toBe('MODEL_ACTIVATION_AUTHORITY_UNAVAILABLE');
    expect(model.count).toBeNull();
    expect(model.rows[0]?.fields).toContainEqual({ key: 'policySnapshotDigest', value: 'a'.repeat(64) });
  });

  it('retains catalog metadata and rejects a loose model-shaped object', () => {
    const model = parseToolReadJson('models', JSON.stringify({
      schemaVersion: 1, kind: 'model-catalog-list', source: 'cache', fetchedAt: null, ageMs: null, offline: true,
      filter: { provider: null }, count: 1, catalogDigest: 'd'.repeat(64), warnings: [],
      models: [{ id: 'm', apiId: 'm', provider: 'p', tier: 'standard', status: 'active', contextWindow: 8, maxOutputTokens: null, costPerMillion: { input: 1, output: 2 }, capabilities: {}, preferredForTier: false }],
    }));
    expect(model.state).toBe('valid');
    expect(model.count).toBe(1);
    expect(model.rows[0]?.fields).toContainEqual({ key: 'catalogDigest', value: 'd'.repeat(64) });
    expect(parseToolReadJson('models', JSON.stringify({ schemaVersion: 1, kind: 'model-catalog-list', source: 'x', filter: {}, count: 1, catalogDigest: 'x', warnings: [], models: [{ id: 'x' }] })).state).toBe('schema-unknown');
  });

  it('uses the producer count and leaves it unknown when the count is invalid', () => {
    const base = {
      schemaVersion: 1, kind: 'model-catalog-list', source: 'cache', fetchedAt: null, ageMs: null, offline: true,
      filter: { provider: null }, catalogDigest: 'd'.repeat(64), warnings: [], models: [],
    };
    expect(parseToolReadJson('models', JSON.stringify({ ...base, count: 17 })).count).toBe(17);
    expect(parseToolReadJson('models', JSON.stringify({ ...base, count: Number.NaN })).count).toBeNull();
    expect(parseToolReadJson('models', JSON.stringify({ ...base, count: -1 })).count).toBeNull();
  });

  it('keeps the complete history record and its unknown counts without accepting a partial schema', () => {
    const record = {
      sprint: '724', tasks: 3, completed: '-', noGo: null, techDebt: '1', noGoRate: '-',
      successRate: '66.7%', coverage: '80%', duration: '20s', agents: 'a', skills: 's',
      tokens: '300', calls: '2', filesChanged: '1', additive: { retained: true },
    };
    const parsed = parseToolReadJson('history', JSON.stringify([record]));
    expect(parsed.state).toBe('valid');
    expect(parsed.rows[0]?.fields).toHaveLength(Object.keys(record).length);
    for (const key of ['techDebt', 'successRate', 'noGoRate', 'coverage', 'filesChanged'] as const) {
      expect(parsed.rows[0]?.fields).toContainEqual({ key, value: record[key] });
    }
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'noGo', value: 'null' });
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'completed', value: '-' });
    expect(parseToolReadJson('history', '[{"sprint":"724"}]').state).toBe('schema-unknown');
    expect(parseToolReadJson('history', JSON.stringify([{ ...record, tasks: '3' }])).state).toBe('schema-unknown');
  });

  it('preserves skill activation, exposure, statistics, explicit null and additive fields', () => {
    const record = {
      id: 's', name: 'Skill', category: 'domain', enabled: true, layer: 'project',
      disposition: { state: 'active', reasonCode: null, since: null, supersededBy: null }, masked: false, profileState: null, priority: 0, triggers: ['typescript'],
      activation: { languages: ['typescript'] }, routing: { mode: 'automatic' },
      stats: { uses: 2 }, exposure: { available: true }, nullable: null,
      ['unsafe\u001b[2J']: '$& {value}',
    };
    const parsed = parseToolReadJson('skills', JSON.stringify([record]));
    expect(parsed.state).toBe('valid');
    expect(parsed.rows[0]?.fields).toHaveLength(Object.keys(record).length);
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'activation', value: '{"languages":["typescript"]}' });
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'profileState', value: 'null' });
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'disposition', value: '{"state":"active","reasonCode":null,"since":null,"supersededBy":null}' });
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'unsafe\\u001b[2J', value: '$& {value}' });
    expect(parseToolReadJson('skills', JSON.stringify([{ ...record, stats: null, exposure: null }])).state).toBe('valid');
    expect(parseToolReadJson('skills', '[{"id":"s","name":"Skill"}]').state).toBe('schema-unknown');
    expect(parseToolReadJson('skills', JSON.stringify([{ ...record, triggers: [3] }])).state).toBe('schema-unknown');
    expect(parseToolReadJson('skills', JSON.stringify([{ ...record, disposition: 'active' }])).state).toBe('schema-unknown');
    expect(parseToolReadJson('skills', JSON.stringify([{ ...record, disposition: { ...record.disposition, reasonCode: 42 } }])).state).toBe('schema-unknown');
  });

  it('keeps doctor aggregate and nested additive diagnostics in their original sections', () => {
    const parsed = parseToolReadJson('doctor', JSON.stringify({
      ok: false, checks: [{ name: 'config', passed: false, required: true, message: 'missing', detail: { reason: 'absent' } }],
      providers: [{ name: 'p', extra: null }], providerAuth: [{ provider: 'p', principal: { state: 'unknown' } }],
      providerSummary: { ready: 0, total: 1, authWarningCount: 1 }, honestSummary: 'failed',
      extra: ['diagnostic'],
    }));
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'detail', value: '{"reason":"absent"}' });
    expect(parsed.rows[1]?.fields).toContainEqual({ key: 'extra', value: 'null' });
    expect(parsed.rows[2]?.fields).toContainEqual({ key: 'principal', value: '{"state":"unknown"}' });
    expect(parsed.rows.at(-1)?.fields).toContainEqual({ key: 'providerSummary', value: '{"ready":0,"total":1,"authWarningCount":1}' });
    expect(parsed.rows.at(-1)?.fields).toContainEqual({ key: 'extra', value: '["diagnostic"]' });
    expect(parsed.rows.at(-1)?.fields.map((field) => field.key)).not.toContain('checks');
  });

  it('retains active authority and snapshot details in both ready and HOLD states', () => {
    const ready = parseToolReadJson('model-active-set', JSON.stringify({
      schemaVersion: 1, kind: 'model-active-set', offline: true, extension: { version: 2 },
      authority: { state: 'ready', policySnapshotDigest: 'd', defaultMode: 'explicit', extra: null },
      catalog: { source: 'cache', warnings: [], extra: false },
      ownerPermittedModels: [{ id: 'm', provider: 'p', maxOutputTokens: null, extra: { permitted: true } }],
      unknownActiveModels: [{ modelId: 'unknown', provider: 'p', extra: ['retained'] }],
    }));
    expect(ready.state).toBe('valid');
    expect(ready.rows[0]?.fields).toContainEqual({ key: 'catalog.extra', value: 'false' });
    expect(ready.rows[0]?.fields).toContainEqual({ key: 'snapshot.extension', value: '{"version":2}' });
    expect(ready.rows[1]?.fields).toContainEqual({ key: 'maxOutputTokens', value: 'null' });
    expect(ready.rows[2]?.fields).toContainEqual({ key: 'extra', value: '["retained"]' });
    const hold = parseToolReadJson('model-active-set', JSON.stringify({
      schemaVersion: 1, kind: 'model-active-set', catalog: null,
      authority: { state: 'hold', reasonCode: 'UNAVAILABLE', evidence: { cause: 'unreadable' } },
    }));
    expect(hold.state).toBe('unavailable');
    expect(hold.rows[0]?.fields).toContainEqual({ key: 'evidence', value: '{"cause":"unreadable"}' });
    expect(hold.rows[0]?.fields).toContainEqual({ key: 'snapshot.catalog', value: 'null' });
  });

  it('sanitizes control and bidi code points only in the display projection', () => {
    const model = parseToolReadJson('agents', JSON.stringify([
      {
        id: 'agent-1', name: 'safe\u001b[2J\u202eevil', enabled: true, validity: 'valid',
        routable: { value: true, reasons: [] },
        provenance: { declared: 'builtin', layer: 'builtin', resolvedFrom: '/safe' },
        prompt: { availability: 'available', degraded: false }, model: null, uses: 0, successRate: 0,
        diagnostics: [], displayType: 'builtin',
      },
    ]));
    expect(model.rows[0]?.title).toContain('\\u001b');
    expect(model.rows[0]?.title).toContain('\\u202e');
    expect(model.rows[0]?.fields).toContainEqual({ key: 'routable', value: '{"value":true,"reasons":[]}' });
  });
  it('preserves the canonical never-used agent null success rate without inventing zero success', () => {
    const agent = {
      id: 'never-used', name: 'Never used', enabled: true, validity: 'valid',
      routable: { value: true, reasons: [] }, provenance: { declared: 'builtin', layer: 'builtin' },
      prompt: { availability: 'prompt-file', degraded: false }, model: 'model-id', uses: 0,
      successRate: null, successes: 0, successRatio: null, successPercent: null,
      lastUsedInSprint: null, diagnostics: [], displayType: 'builtin',
    };
    const model = parseToolReadJson('agents', JSON.stringify([agent]));
    expect(model.state).toBe('valid');
    expect(model.count).toBe(1);
    for (const key of ['successRate', 'successRatio', 'successPercent', 'lastUsedInSprint']) {
      expect(model.rows[0]?.fields).toContainEqual({ key, value: 'null' });
    }
    expect(parseToolReadJson('agents', JSON.stringify([{ ...agent, successRate: '-' }])).state).toBe('schema-unknown');
  });

  it('parses the optional canonical sync report without inventing aggregate success or a count', () => {
    const report = {
      adaptersSynced: ['Claude'],
      adapterErrors: [{ label: 'Gemini', file: 'GEMINI.md', reason: 'kept-local' }],
      agentPromptSync: { created: [], updated: ['worker'], keptLocal: [], conflicts: [] },
      agentManifestSync: { created: [], updated: [], keptLocal: [], conflicts: [] },
      agentCapabilitiesSync: { migrated: [], alreadyV3: ['worker'], issues: [], protected: [] },
      skillManifestSync: { created: [], updated: [], keptLocal: [], unchanged: ['audit'], issues: [] },
      workspaceSync: { changed: [], unchanged: ['AGENTS.md'] },
      gitChanges: { commits: 0, sprintId: null, modified: [], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: null } },
      warnings: [],
      future: { retained: true },
    };
    const parsed = parseToolReadJson('sync', JSON.stringify(report));
    expect(parsed).toMatchObject({ kind: 'sync', state: 'valid', count: null, reasonCode: null });
    expect(parsed.rows[0]?.fields).toHaveLength(Object.keys(report).length);
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'future', value: '{"retained":true}' });
    expect(parseToolReadJson('sync', '{}').state).toBe('schema-unknown');
    expect(parseToolReadJson('sync', JSON.stringify({ gitChanges: { commits: -1 } })).state).toBe('schema-unknown');
  });

  it('prepends an aggregate summary row ahead of the raw sync report and derives the conflict count from it', () => {
    // The summary must be the exact aggregate `buildSyncAggregate` derives
    // from this same raw report (see the "rejects a summary that disagrees
    // with the raw report" tests below) — so this fixture is built from a
    // real raw report via `buildSyncAggregate`, not hand-typed numbers.
    const rawReport: SyncCommandOutput = {
      adaptersSynced: ['Claude', 'Gemini'],
      adapterErrors: [{ label: 'Cursor', file: 'AGENTS.md', reason: 'kept-local' }],
      agentPromptSync: {
        created: [],
        updated: ['worker'],
        keptLocal: [],
        conflicts: [
          { agentId: 'a', shadowPath: 'p1', builtinPath: 'b1', reason: 'r1', kind: 'missing-baseline' },
          { agentId: 'worker', shadowPath: 'p2', builtinPath: 'b2', reason: 'r2', kind: 'local-edit' },
        ],
      },
      agentManifestSync: {
        created: [],
        updated: [],
        keptLocal: [],
        conflicts: [
          { agentId: 'b', shadowPath: 'p3', builtinPath: 'b3', reason: 'r3', kind: 'missing-baseline' },
        ],
      },
      skillManifestSync: { created: ['s1'], updated: [], keptLocal: [], unchanged: ['s2', 's3', 's4'], issues: [] },
      // A normal `HEAD~N..HEAD` comparison — the common case, so the
      // `sync:aggregate` row below carries no `detection` field for it
      // (see the dedicated "git change detection (7104)" describe block).
      gitChanges: { commits: 4, sprintId: null, modified: [], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: null } },
      warnings: [],
    };
    const summary = buildSyncAggregate(rawReport);
    const report = { ...rawReport, summary };
    const parsed = parseToolReadJson('sync', JSON.stringify(report));
    expect(parsed.state).toBe('valid');
    expect(parsed.count).toBe(1);
    expect(parsed.rows[0]?.id).toBe('sync:aggregate');
    expect(parsed.rows[0]?.fields).toEqual([
      { key: 'adapters', value: '2/1' },
      { key: 'skills', value: '1/3' },
      { key: 'commits', value: '4' },
      { key: 'conflicts', value: '1' },
      { key: 'missingBaseline', value: '2' },
      { key: 'missingBaselineAgents', value: 'a,b' },
      { key: 'conflictAgents', value: 'agent-prompt:worker' },
    ]);
    expect(parsed.rows[1]?.id).toBe('sync:summary');
    expect(parsed.rows[1]?.fields.map((field) => field.key)).not.toContain('summary');
  });

  it('renders a dash for commits and omits the empty conditional fields when the aggregate summary has no git repository', () => {
    const summary = {
      schemaVersion: 1,
      adapters: { synced: 0, errors: 0 },
      agentPrompts: { created: 0, updated: 0, keptLocal: 0 },
      agentManifests: { created: 0, updated: 0, keptLocal: 0 },
      capabilities: { migrated: 0, issues: 0 },
      skills: { created: 0, updated: 0, keptLocal: 0, unchanged: 0, issues: 0 },
      workspace: { changed: 0, unchanged: 0 },
      git: null,
      missingBaseline: { count: 0, agentIds: [] },
      conflicts: [],
      warnings: 0,
    };
    const parsed = parseToolReadJson('sync', JSON.stringify({ warnings: [], summary }));
    expect(parsed.count).toBe(0);
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'adapters', value: '0' });
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'commits', value: '-' });
    expect(parsed.rows[0]?.fields.map((field) => field.key)).not.toContain('missingBaselineAgents');
    expect(parsed.rows[0]?.fields.map((field) => field.key)).not.toContain('conflictAgents');
  });

  describe('git change detection (7104: a git failure must never look like "no changes")', () => {
    it('root-fallback: the `sync:aggregate` row surfaces a `detection` field carrying the mode', () => {
      const raw: SyncCommandOutput = {
        gitChanges: {
          commits: 500,
          sprintId: '7104',
          modified: ['deep-history.ts'],
          added: [],
          deleted: [],
          renamed: [],
          detection: { mode: 'root-fallback', issue: null },
        },
      };
      const summary = buildSyncAggregate(raw);
      const parsed = parseToolReadJson('sync', JSON.stringify({ ...raw, summary }));
      expect(parsed.state).toBe('valid');
      expect(parsed.rows[0]?.id).toBe('sync:aggregate');
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'commits', value: '500' });
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'detection', value: 'root-fallback' });
    });

    it("unavailable (with an issue): the row's `commits` count still shows the raw number, plus a `detection` field", () => {
      const raw: SyncCommandOutput = {
        gitChanges: {
          commits: 5,
          sprintId: '7104',
          modified: [],
          added: [],
          deleted: [],
          renamed: [],
          detection: { mode: 'unavailable', issue: { code: 'GIT_DIFF_FAILED', detail: 'fatal: bad revision' } },
        },
      };
      const summary = buildSyncAggregate(raw);
      const parsed = parseToolReadJson('sync', JSON.stringify({ ...raw, summary }));
      expect(parsed.state).toBe('valid');
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'commits', value: '5' });
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'detection', value: 'unavailable' });
    });

    it('malformed detection: an out-of-range mode, and a non-null issue with an unknown code, both fail closed to schema-unknown', () => {
      expect(parseToolReadJson('sync', JSON.stringify({
        gitChanges: { commits: 1, sprintId: null, modified: [], added: [], deleted: [], renamed: [], detection: { mode: 'stale', issue: null } },
      })).state).toBe('schema-unknown');
      expect(parseToolReadJson('sync', JSON.stringify({
        gitChanges: {
          commits: 1,
          sprintId: null,
          modified: [],
          added: [],
          deleted: [],
          renamed: [],
          detection: { mode: 'unavailable', issue: { code: 'GIT_FETCH_FAILED', detail: 'x' } },
        },
      })).state).toBe('schema-unknown');
      expect(parseToolReadJson('sync', JSON.stringify({
        gitChanges: { commits: 1, sprintId: null, modified: [], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: 'not-an-object-or-null' } },
      })).state).toBe('schema-unknown');
    });

    it('legacy gitChanges without `detection`: still valid, and the derived aggregate fails closed to `detection: \'unavailable\'` on the row', () => {
      // A pre-7104 producer never emitted `detection` at all; the current
      // `SyncResult` type declares it required, so the whole literal is cast
      // through `unknown` to model that legacy runtime shape without
      // fighting the type.
      const raw = {
        gitChanges: { commits: 2, sprintId: '7104', modified: ['a.ts'], added: [], deleted: [], renamed: [] },
      } as unknown as SyncCommandOutput;
      const summary = buildSyncAggregate(raw);
      const parsed = parseToolReadJson('sync', JSON.stringify({ ...raw, summary }));
      expect(parsed.state).toBe('valid');
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'commits', value: '2' });
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'detection', value: 'unavailable' });
      // 7104 extension: a legacy raw report carries no `detection.issue` at
      // all (it predates `detection` entirely), so the derived `issueCode`
      // must fail closed to `null` — never a guessed code — and the row
      // must carry no `detectionIssue` field for it.
      expect(summary.git?.issueCode).toBeNull();
      expect(parsed.rows[0]?.fields.map((field) => field.key)).not.toContain('detectionIssue');
    });

    it("range: the common case adds no `detection` field to the row", () => {
      const raw: SyncCommandOutput = {
        gitChanges: { commits: 4, sprintId: '7104', modified: ['x.ts'], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: null } },
      };
      const summary = buildSyncAggregate(raw);
      const parsed = parseToolReadJson('sync', JSON.stringify({ ...raw, summary }));
      expect(parsed.state).toBe('valid');
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'commits', value: '4' });
      expect(parsed.rows[0]?.fields.map((field) => field.key)).not.toContain('detection');
    });

    it.each(['GIT_LOG_FAILED', 'GIT_LS_TREE_FAILED'] as const)(
      'unavailable + %s: the raw detection issue code round-trips through a matching summary as `valid`',
      (code) => {
        const raw: SyncCommandOutput = {
          gitChanges: {
            commits: 3,
            sprintId: '7104',
            modified: [],
            added: [],
            deleted: [],
            renamed: [],
            detection: { mode: 'unavailable', issue: { code, detail: 'x' } },
          },
        };
        const summary = buildSyncAggregate(raw);
        const parsed = parseToolReadJson('sync', JSON.stringify({ ...raw, summary }));
        expect(parsed.state).toBe('valid');
      },
    );

    it('an unknown raw issue code (`GIT_FOO`) fails closed to schema-unknown', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        gitChanges: {
          commits: 1, sprintId: null, modified: [], added: [], deleted: [], renamed: [],
          detection: { mode: 'unavailable', issue: { code: 'GIT_FOO', detail: 'x' } },
        },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('incoherent raw: mode `range` paired with a non-null, otherwise well-formed issue object fails closed to schema-unknown', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        gitChanges: {
          commits: 1, sprintId: null, modified: [], added: [], deleted: [], renamed: [],
          detection: { mode: 'range', issue: { code: 'GIT_LOG_FAILED', detail: 'x' } },
        },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('the `sync:aggregate` row places `detectionIssue` immediately after `detection` for `unavailable`, omits `detectionIssue` (but keeps `detection`) for `root-fallback`, and carries neither for `range`', () => {
      const unavailableRaw: SyncCommandOutput = {
        gitChanges: {
          commits: 1, sprintId: '7104', modified: [], added: [], deleted: [], renamed: [],
          detection: { mode: 'unavailable', issue: { code: 'GIT_LOG_FAILED', detail: 'fatal: bad object HEAD' } },
        },
      };
      const unavailableParsed = parseToolReadJson('sync', JSON.stringify({ ...unavailableRaw, summary: buildSyncAggregate(unavailableRaw) }));
      const unavailableFields = unavailableParsed.rows[0]?.fields ?? [];
      const detectionIndex = unavailableFields.findIndex((field) => field.key === 'detection');
      expect(detectionIndex).toBeGreaterThanOrEqual(0);
      expect(unavailableFields[detectionIndex]).toEqual({ key: 'detection', value: 'unavailable' });
      expect(unavailableFields[detectionIndex + 1]).toEqual({ key: 'detectionIssue', value: 'GIT_LOG_FAILED' });

      const rootFallbackRaw: SyncCommandOutput = {
        gitChanges: {
          commits: 500, sprintId: '7104', modified: ['deep-history.ts'], added: [], deleted: [], renamed: [],
          detection: { mode: 'root-fallback', issue: null },
        },
      };
      const rootFallbackParsed = parseToolReadJson('sync', JSON.stringify({ ...rootFallbackRaw, summary: buildSyncAggregate(rootFallbackRaw) }));
      const rootFallbackKeys = rootFallbackParsed.rows[0]?.fields.map((field) => field.key) ?? [];
      expect(rootFallbackKeys).toContain('detection');
      expect(rootFallbackKeys).not.toContain('detectionIssue');

      const rangeRaw: SyncCommandOutput = {
        gitChanges: { commits: 4, sprintId: '7104', modified: ['x.ts'], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: null } },
      };
      const rangeParsed = parseToolReadJson('sync', JSON.stringify({ ...rangeRaw, summary: buildSyncAggregate(rangeRaw) }));
      const rangeKeys = rangeParsed.rows[0]?.fields.map((field) => field.key) ?? [];
      expect(rangeKeys).not.toContain('detection');
      expect(rangeKeys).not.toContain('detectionIssue');
    });

    it("a `commits: 0` raw with GIT_LOG_FAILED renders as `valid` with `commits: '0'` AND `detectionIssue: 'GIT_LOG_FAILED'` on the row — the REPL must show why a zero is untrusted", () => {
      const raw: SyncCommandOutput = {
        gitChanges: {
          commits: 0, sprintId: '7104', modified: [], added: [], deleted: [], renamed: [],
          detection: { mode: 'unavailable', issue: { code: 'GIT_LOG_FAILED', detail: 'fatal: bad object HEAD' } },
        },
      };
      const summary = buildSyncAggregate(raw);
      const parsed = parseToolReadJson('sync', JSON.stringify({ ...raw, summary }));
      expect(parsed.state).toBe('valid');
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'commits', value: '0' });
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'detectionIssue', value: 'GIT_LOG_FAILED' });
    });
  });

  it('fails closed to schema-unknown rather than partially rendering a malformed aggregate summary', () => {
    expect(parseToolReadJson('sync', JSON.stringify({ warnings: [], summary: { schemaVersion: 2 } })).state).toBe('schema-unknown');
    expect(parseToolReadJson('sync', JSON.stringify({
      warnings: [],
      summary: {
        schemaVersion: 1,
        adapters: { synced: 0, errors: 0 },
        agentPrompts: { created: 0, updated: 0, keptLocal: 0 },
        agentManifests: { created: 0, updated: 0, keptLocal: 0 },
        capabilities: { migrated: 0, issues: 0 },
        skills: { created: 0, updated: 0, keptLocal: 0, unchanged: 0, issues: 0 },
        workspace: { changed: 0, unchanged: 0 },
        git: null,
        missingBaseline: { count: -1, agentIds: [] },
        conflicts: [],
        warnings: 0,
      },
    })).state).toBe('schema-unknown');
  });

  it('accepts a summary that is exactly buildSyncAggregate applied to the same raw report (real producer shape)', () => {
    const raw: SyncCommandOutput = {
      adaptersSynced: ['Claude'],
      adapterErrors: [],
      agentPromptSync: { created: ['worker'], updated: [], keptLocal: [], conflicts: [] },
      agentManifestSync: { created: [], updated: ['worker'], keptLocal: [], conflicts: [] },
      agentCapabilitiesSync: { migrated: ['worker'], alreadyV3: [], issues: [], protected: [] },
      skillManifestSync: { created: [], updated: [], keptLocal: [], unchanged: ['audit'], issues: [] },
      workspaceSync: { changed: ['IDENTITY.md'], unchanged: [] },
      gitChanges: { commits: 1, sprintId: '7104', modified: ['x.ts'], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: null } },
      warnings: ['w1'],
    };
    const summary = buildSyncAggregate(raw);
    const parsed = parseToolReadJson('sync', JSON.stringify({ ...raw, summary }));

    expect(parsed.state).toBe('valid');
    expect(parsed.count).toBe(0);
    expect(parsed.rows[0]?.id).toBe('sync:aggregate');
    expect(parsed.rows.find((row) => row.id === 'sync:summary')).toBeDefined();
  });

  describe('rejects a summary that disagrees with the raw report it was derived from (raw is the truth, not the claimed summary)', () => {
    const baseRaw: SyncCommandOutput = {
      adaptersSynced: ['Claude'],
      adapterErrors: [],
      agentPromptSync: {
        created: ['worker'],
        updated: [],
        keptLocal: [],
        conflicts: [{ agentId: 'legacy', shadowPath: 'p', builtinPath: 'b', reason: 'r', kind: 'local-edit' }],
      },
      agentManifestSync: {
        created: [],
        updated: ['worker'],
        keptLocal: [],
        conflicts: [{ agentId: 'unverified', shadowPath: 'p2', builtinPath: 'b2', reason: 'r2', kind: 'missing-baseline' }],
      },
      agentCapabilitiesSync: { migrated: [], alreadyV3: [], issues: [], protected: [] },
      skillManifestSync: { created: [], updated: [], keptLocal: [], unchanged: ['audit'], issues: [] },
      workspaceSync: { changed: [], unchanged: ['AGENTS.md'] },
      gitChanges: { commits: 3, sprintId: '7104', modified: ['a.ts'], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: null } },
      warnings: ['w1'],
    };
    const baseSummary = buildSyncAggregate(baseRaw);

    it('sanity: the unmodified raw/summary pair is internally consistent and renders valid', () => {
      expect(parseToolReadJson('sync', JSON.stringify({ ...baseRaw, summary: baseSummary })).state).toBe('valid');
    });

    it('adapters: raw reports zero synced adapters while the forged summary claims 999', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...baseRaw,
        adaptersSynced: [],
        summary: { ...baseSummary, adapters: { ...baseSummary.adapters, synced: 999 } },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('agentPrompts: a forged created count disagrees with the raw report', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...baseRaw,
        summary: { ...baseSummary, agentPrompts: { ...baseSummary.agentPrompts, created: baseSummary.agentPrompts.created + 41 } },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('skills: a forged unchanged count disagrees with the raw report', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...baseRaw,
        summary: { ...baseSummary, skills: { ...baseSummary.skills, unchanged: baseSummary.skills.unchanged + 6 } },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('workspace: a forged unchanged count disagrees with the raw report', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...baseRaw,
        summary: { ...baseSummary, workspace: { ...baseSummary.workspace, unchanged: baseSummary.workspace.unchanged + 8 } },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('git: a forged commits count disagrees with the raw report', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...baseRaw,
        summary: { ...baseSummary, git: { ...baseSummary.git!, commits: 999 } },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('git: a forged `detection` disagrees with a raw report whose provenance was actually a clean range (7104: a git failure must never look like "no changes", nor the reverse)', () => {
      // `baseRaw.gitChanges.detection.mode` is 'range'; claiming 'unavailable'
      // in the summary is exactly the kind of provenance lie this equality
      // check exists to catch.
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...baseRaw,
        summary: { ...baseSummary, git: { ...baseSummary.git!, detection: 'unavailable' } },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('git: a forged `issueCode` disagrees with the raw report’s actual issue code (raw names `GIT_LOG_FAILED`, summary claims `GIT_DIFF_FAILED`)', () => {
      const unavailableRaw: SyncCommandOutput = {
        ...baseRaw,
        gitChanges: {
          commits: 0, sprintId: '7104', modified: [], added: [], deleted: [], renamed: [],
          detection: { mode: 'unavailable', issue: { code: 'GIT_LOG_FAILED', detail: 'fatal: bad object HEAD' } },
        },
      };
      const unavailableSummary = buildSyncAggregate(unavailableRaw);
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...unavailableRaw,
        summary: { ...unavailableSummary, git: { ...unavailableSummary.git!, issueCode: 'GIT_DIFF_FAILED' } },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('git: a forged null `issueCode` disagrees with a raw report that names a real issue', () => {
      const unavailableRaw: SyncCommandOutput = {
        ...baseRaw,
        gitChanges: {
          commits: 0, sprintId: '7104', modified: [], added: [], deleted: [], renamed: [],
          detection: { mode: 'unavailable', issue: { code: 'GIT_LOG_FAILED', detail: 'fatal: bad object HEAD' } },
        },
      };
      const unavailableSummary = buildSyncAggregate(unavailableRaw);
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...unavailableRaw,
        summary: { ...unavailableSummary, git: { ...unavailableSummary.git!, issueCode: null } },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('git: a forged null block disagrees with a raw report that has real git changes', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...baseRaw,
        summary: { ...baseSummary, git: null },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('git: a forged non-null block disagrees with a raw report that has no git changes', () => {
      const { gitChanges: _gitChanges, ...rawWithoutGit } = baseRaw;
      const parsed = parseToolReadJson('sync', JSON.stringify({ ...rawWithoutGit, summary: baseSummary }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('missingBaseline: a forged count/agentIds pair disagrees with the raw report, despite being internally shape-consistent', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...baseRaw,
        summary: { ...baseSummary, missingBaseline: { count: 2, agentIds: ['unverified', 'ghost'] } },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('conflicts: an extra entry with no corresponding raw conflict record is rejected', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...baseRaw,
        summary: {
          ...baseSummary,
          conflicts: [...baseSummary.conflicts, { scope: 'agent-manifest', agentId: 'ghost', kind: 'local-edit' }],
        },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });

    it('warnings: a forged warnings count disagrees with the raw report', () => {
      const parsed = parseToolReadJson('sync', JSON.stringify({
        ...baseRaw,
        summary: { ...baseSummary, warnings: baseSummary.warnings + 4 },
      }));
      expect(parsed.state).toBe('schema-unknown');
    });
  });

  it('rejects a summary whose conflicts contain a missing-baseline entry even when it is otherwise shape-consistent', () => {
    const parsed = parseToolReadJson('sync', JSON.stringify({
      warnings: [],
      summary: {
        schemaVersion: 1,
        adapters: { synced: 0, errors: 0 },
        agentPrompts: { created: 0, updated: 0, keptLocal: 0 },
        agentManifests: { created: 0, updated: 0, keptLocal: 0 },
        capabilities: { migrated: 0, issues: 0 },
        skills: { created: 0, updated: 0, keptLocal: 0, unchanged: 0, issues: 0 },
        workspace: { changed: 0, unchanged: 0 },
        git: null,
        missingBaseline: { count: 0, agentIds: [] },
        conflicts: [{ scope: 'agent-prompt', agentId: 'x', kind: 'missing-baseline' }],
        warnings: 0,
      },
    }));
    expect(parsed.state).toBe('schema-unknown');
  });

  it('leaves state and count unchanged for the canonical sync sample when no aggregate summary is present', () => {
    const report = {
      adaptersSynced: ['Claude'],
      adapterErrors: [{ label: 'Gemini', file: 'GEMINI.md', reason: 'kept-local' }],
      agentPromptSync: { created: [], updated: ['worker'], keptLocal: [], conflicts: [] },
      agentManifestSync: { created: [], updated: [], keptLocal: [], conflicts: [] },
      agentCapabilitiesSync: { migrated: [], alreadyV3: ['worker'], issues: [], protected: [] },
      skillManifestSync: { created: [], updated: [], keptLocal: [], unchanged: ['audit'], issues: [] },
      workspaceSync: { changed: [], unchanged: ['AGENTS.md'] },
      gitChanges: { commits: 0, sprintId: null, modified: [], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: null } },
      warnings: [],
      future: { retained: true },
    };
    const parsed = parseToolReadJson('sync', JSON.stringify(report));
    expect(parsed.state).toBe('valid');
    expect(parsed.count).toBeNull();
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.id).toBe('sync:summary');
  });

  it('keeps producer error JSON visibly raw and never promotes it to a successful structured action', () => {
    for (const kind of ['sync', 'audit-gate', 'audit-query', 'audit-compliance'] as const) {
      const parsed = parseToolReadJson(kind, JSON.stringify({
        error: 'unsafe\u001b[2J\u202etext',
        code: 'PRODUCER_FAILED',
        future: { retained: true },
      }));
      expect(parsed).toMatchObject({ kind, state: 'raw', count: null, reasonCode: 'READ_PRODUCER_ERROR' });
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'error', value: 'unsafe\\u001b[2J\\u202etext' });
      expect(parsed.rows[0]?.fields).toContainEqual({ key: 'future', value: '{"retained":true}' });
    }
  });

  it('parses audit gate verdict as data independently from the attached process exit truth', () => {
    const gate = {
      overallGate: 'GATE_FAILURE',
      tsc: { status: 'PASS', errors: [], future: null },
      vitest: {
        status: 'FAIL',
        delta: { files: 2, pass: 7, fail: 1, skipped: 0 },
        execution: { mode: 'scoped', exitCode: 1 },
      },
      honesty: { violations: 0, flaggedTasks: [] },
      observability: { metricsJsonlExists: true, lineCount: 4 },
      futureTopLevel: ['retained'],
    };
    const parsed = parseToolReadJson('audit-gate', JSON.stringify(gate));
    const withExecution = {
      ...parsed,
      execution: { exitCode: 1, signal: null, reason: 'exit-code', stderr: null },
    };
    expect(withExecution).toMatchObject({ state: 'valid', count: null, execution: { exitCode: 1 } });
    expect(withExecution.rows[0]?.fields).toContainEqual({ key: 'overallGate', value: 'GATE_FAILURE' });
    expect(withExecution.rows[0]?.fields).toContainEqual({ key: 'futureTopLevel', value: '["retained"]' });
    expect(withExecution.rows.find((row) => row.id === 'audit-gate:vitest')?.fields)
      .toContainEqual({ key: 'execution', value: '{"mode":"scoped","exitCode":1}' });
    expect(withExecution.rows.slice(1).map((row) => row.titleKind)).toEqual([
      'tsc', 'vitest', 'honesty', 'observability',
    ]);
    expect(parseToolReadJson('audit-gate', JSON.stringify({ ...gate, overallGate: 'PASS', vitest: { status: 'FAIL', delta: gate.vitest.delta } })).state)
      .toBe('valid');
    const negativeDelta = parseToolReadJson('audit-gate', JSON.stringify({
      ...gate,
      vitest: { status: 'PASS', delta: { files: -2, pass: -7, fail: -1, skipped: -3 } },
    }));
    expect(negativeDelta).toMatchObject({ state: 'valid', reasonCode: null });
    expect(negativeDelta.rows.find((row) => row.id === 'audit-gate:vitest')?.fields)
      .toContainEqual({ key: 'delta', value: '{"files":-2,"pass":-7,"fail":-1,"skipped":-3}' });
    expect(parseToolReadJson('audit-gate', JSON.stringify({ ...gate, vitest: { status: 'FAIL', delta: { pass: 7 } } })).state)
      .toBe('schema-unknown');
  });

  it('keeps an empty audit query as an explicit scanned/matched summary, not an invented success', () => {
    const empty = parseToolReadJson('audit-query', JSON.stringify({
      sprintId: 'sprint-7099', totalScanned: 3, matched: [], filteredBy: { tenant: 'acme' },
    }));
    expect(empty).toMatchObject({ state: 'valid', count: 0, reasonCode: null });
    expect(empty.rows).toHaveLength(1);
    expect(empty.rows[0]?.fields).toContainEqual({ key: 'totalScanned', value: '3' });
    expect(empty.rows[0]?.fields).toContainEqual({ key: 'filteredBy', value: '{"tenant":"acme"}' });

    const matched = parseToolReadJson('audit-query', JSON.stringify({
      sprintId: 'sprint-7099', totalScanned: 4,
      matched: [{
        timestamp: '2026-09-08T00:00:00.000Z', sequence: 2,
        source: 'operator\u001b[2J', target: 'runtime', channel: 'approval\u202e',
        tenantId: 'acme', payload: { verdict: 'deny' }, additive: null,
      }],
    }));
    expect(matched).toMatchObject({ state: 'valid', count: 1 });
    expect(matched.rows[1]?.title).toBe('approval\\u202e');
    expect(matched.rows[1]?.fields).toContainEqual({ key: 'source', value: 'operator\\u001b[2J' });
    expect(matched.rows[1]?.fields).toContainEqual({ key: 'additive', value: 'null' });
    expect(parseToolReadJson('audit-query', '{').reasonCode).toBe('READ_JSON_INVALID');
    expect(parseToolReadJson('audit-query', JSON.stringify({ sprintId: 's', totalScanned: 1, matched: [{}] })).state)
      .toBe('schema-unknown');
  });

  it('parses compliance controls, empty actors, broken chains and additive evidence without inference', () => {
    const report = {
      rbacStatus: 'ON', tenantIsolationStatus: 'OFF',
      auditChainIntegrity: { intact: false, brokenAt: 2, evidence: 'digest' },
      eventCount: 0,
      actorBreakdown: {},
      controls: { rbacEnforcement: 'ON', tenantIsolation: 'OFF', auditChainIntact: 'OFF', additive: true },
      future: { version: 2 },
    };
    const parsed = parseToolReadJson('audit-compliance', JSON.stringify(report));
    expect(parsed).toMatchObject({ state: 'valid', count: 0, reasonCode: null });
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'auditChainIntegrity', value: '{"intact":false,"brokenAt":2,"evidence":"digest"}' });
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'controls', value: '{"rbacEnforcement":"ON","tenantIsolation":"OFF","auditChainIntact":"OFF","additive":true}' });
    expect(parsed.rows[0]?.fields).toContainEqual({ key: 'future', value: '{"version":2}' });
    expect(parseToolReadJson('audit-compliance', JSON.stringify({ ...report, controls: { ...report.controls, auditChainIntact: 'UNKNOWN' } })).state)
      .toBe('schema-unknown');
  });

  // MASTER 7104 F2 (external review, second pass): the raw nested sync
  // reports (`agentPromptSync` / `agentManifestSync` / `agentCapabilitiesSync`
  // / `skillManifestSync`) were previously only shape-checked with `isRecord`.
  // `buildSyncAggregate` reads nothing but `.length` off their arrays, so an
  // array-LIKE object (e.g. `{ length: 1 }`) derives the exact same count a
  // real array of that length would — meaning a forged raw report paired with
  // a hand-matched `summary` slipped past the canonical-equality gate too.
  // These cases prove the raw reports are now deep-validated (real arrays,
  // real conflict/issue records) BEFORE the equality gate is ever reached.
  describe('deep raw-report validation (7104 F2)', () => {
    it('agentCapabilitiesSync: array-like `migrated`/`issues` are rejected even when a hand-built summary claims matching counts (only the deep validator catches this — the equality gate alone cannot)', () => {
      const raw = {
        agentCapabilitiesSync: { migrated: { length: 1 }, alreadyV3: [], issues: { length: 0 }, protected: [] },
        summary: {
          schemaVersion: 1,
          adapters: { synced: 0, errors: 0 },
          agentPrompts: { created: 0, updated: 0, keptLocal: 0 },
          agentManifests: { created: 0, updated: 0, keptLocal: 0 },
          capabilities: { migrated: 1, issues: 0 },
          skills: { created: 0, updated: 0, keptLocal: 0, unchanged: 0, issues: 0 },
          workspace: { changed: 0, unchanged: 0 },
          git: null,
          missingBaseline: { count: 0, agentIds: [] },
          conflicts: [],
          warnings: 0,
        },
      };
      expect(parseToolReadJson('sync', JSON.stringify(raw)).state).toBe('schema-unknown');
    });

    it('agentPromptSync: array-like `created` is rejected', () => {
      const raw = {
        agentPromptSync: { created: { length: 0 }, updated: [], keptLocal: [], conflicts: [] },
      };
      expect(parseToolReadJson('sync', JSON.stringify(raw)).state).toBe('schema-unknown');
    });

    it('agentPromptSync.conflicts: a non-record entry, and separately an entry with an out-of-range `kind`, are both rejected', () => {
      expect(parseToolReadJson('sync', JSON.stringify({
        agentPromptSync: { created: [], updated: [], keptLocal: [], conflicts: ['not-a-record'] },
      })).state).toBe('schema-unknown');
      expect(parseToolReadJson('sync', JSON.stringify({
        agentPromptSync: {
          created: [], updated: [], keptLocal: [],
          conflicts: [{ agentId: 'a', shadowPath: 'p', builtinPath: 'b', reason: 'r', kind: 'bogus' }],
        },
      })).state).toBe('schema-unknown');
    });

    it('skillManifestSync.issues: a record missing `skillId`/`reason` is rejected', () => {
      const raw = {
        skillManifestSync: { created: [], updated: [], unchanged: [], keptLocal: [], issues: [{}] },
      };
      expect(parseToolReadJson('sync', JSON.stringify(raw)).state).toBe('schema-unknown');
    });

    it('agentCapabilitiesSync.issues: a record missing `code`/`message` is rejected', () => {
      const raw = {
        agentCapabilitiesSync: { migrated: [], alreadyV3: [], issues: [{ agentId: 'a' }], protected: [] },
      };
      expect(parseToolReadJson('sync', JSON.stringify(raw)).state).toBe('schema-unknown');
    });

    it('agentManifestSync.keptLocal: a string instead of a string array is rejected', () => {
      const raw = {
        agentManifestSync: { created: [], updated: [], keptLocal: 'worker', conflicts: [] },
      };
      expect(parseToolReadJson('sync', JSON.stringify(raw)).state).toBe('schema-unknown');
    });

    it('accepts a real producer-shaped report with all four nested reports fully populated, including conflicts of both kinds and a non-empty capabilities.protected', () => {
      const raw: SyncCommandOutput = {
        adaptersSynced: ['Claude', 'Gemini'],
        adapterErrors: [{ label: 'Cursor', file: 'AGENTS.md', reason: 'kept-local' }],
        agentPromptSync: {
          created: ['new-agent'],
          updated: ['worker'],
          keptLocal: ['legacy'],
          conflicts: [
            { agentId: 'legacy', shadowPath: 'p1', builtinPath: 'b1', reason: 'r1', kind: 'missing-baseline' },
            { agentId: 'worker', shadowPath: 'p2', builtinPath: 'b2', reason: 'r2', kind: 'local-edit' },
          ],
        },
        agentManifestSync: {
          created: [],
          updated: ['worker'],
          keptLocal: ['legacy'],
          conflicts: [
            { agentId: 'legacy', shadowPath: 'p3', builtinPath: 'b3', reason: 'r3', kind: 'missing-baseline' },
          ],
        },
        agentCapabilitiesSync: {
          migrated: ['worker'],
          alreadyV3: ['audit'],
          issues: [{ agentId: 'ghost', code: 'MANIFEST_UNREADABLE', message: 'bad json' }],
          protected: ['legacy'],
        },
        skillManifestSync: {
          created: ['s1'], updated: ['s2'], unchanged: ['s3'], keptLocal: ['s4'],
          issues: [{ skillId: 's5', reason: 'schema-unknown' }],
        },
        workspaceSync: { changed: ['IDENTITY.md'], unchanged: ['AGENTS.md'] },
        gitChanges: { commits: 2, sprintId: '7104', modified: ['x.ts'], added: [], deleted: [], renamed: [], detection: { mode: 'range', issue: null } },
        warnings: ['w1'],
      };
      const summary = buildSyncAggregate(raw);
      const parsed = parseToolReadJson('sync', JSON.stringify({ ...raw, summary }));
      expect(parsed.state).toBe('valid');
    });

    it('accepts a legacy conflict entry with no `kind` field at all (predates the field; buildSyncAggregate conservatively classifies it as local-edit)', () => {
      const raw = {
        agentPromptSync: {
          created: [], updated: [], keptLocal: ['legacy'],
          conflicts: [{ agentId: 'legacy', shadowPath: 'p', builtinPath: 'b', reason: 'r' }],
        },
      } as unknown as SyncCommandOutput;
      const summary = buildSyncAggregate(raw);
      const parsed = parseToolReadJson('sync', JSON.stringify({ ...raw, summary }));
      expect(parsed.state).toBe('valid');
    });
  });
});
