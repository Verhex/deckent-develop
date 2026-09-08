import { describe, expect, it } from 'vitest';
import { parseToolReadJson } from '../../../src/cli/repl/tool-read-model.js';

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
      agentPromptSync: { created: [], updated: ['worker'], conflicts: [] },
      agentManifestSync: { created: [], updated: [], conflicts: [] },
      agentCapabilitiesSync: { migrated: [], alreadyV3: ['worker'], issues: [] },
      skillManifestSync: { created: [], updated: [], keptLocal: [], unchanged: ['audit'], issues: [] },
      workspaceSync: { changed: [], unchanged: ['AGENTS.md'] },
      gitChanges: { commits: 0, sprintId: null, modified: [], added: [], deleted: [], renamed: [] },
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
});
