import { describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AGENT_MANIFEST_SCHEMA_VERSION_CURRENT,
  AGENT_MANIFEST_SCHEMA_VERSION_DEFAULT,
  KNOWN_AGENT_MANIFEST_SCHEMA_VERSIONS,
  classifyAgentManifest,
} from '../../src/core/agent-types.js';
import type {
  AgentCatalogLayer,
  AgentManifestClassification,
  AgentManifestDiagnosticCode,
  AgentRoutabilityBlocker,
  ObservedAgentManifest,
} from '../../src/core/agent-types.js';

// Slice S1 of follow-up-works/agent-catalog-authority-design-2026-08-11.md (row 7011).
//
// The design's S1 proof obligation, verbatim: "every current live manifest — 21 builtin,
// 21 shadow, 2 learned, 3 archived — classifies to an explicit validity and provenance,
// with zero silent skips. `test-writer-removed-sprint-148` must classify as a `warning` for
// id/directory mismatch, not load clean."
//
// So the real manifests are the fixture: every live manifest directory is copied into a
// tmpdir and classified from there, and the resulting table is pinned below. The two
// `temp-*` learned records are gitignored (design §2.3 — they exist on a long-lived machine
// and in no checkout), so they are asserted only when present; every other row is
// git-tracked and therefore required. That asymmetry is the §2.3 finding, not a soft
// assertion: a count that differs between a checkout and a machine is exactly what the
// authority model exists to make expressible.

const BUILTIN_AGENTS_DIR = fileURLToPath(new URL('../../src/core/builtins/agents', import.meta.url));
const PROJECT_AGENTS_DIR = fileURLToPath(new URL('../../.deckent/agents', import.meta.url));
const ARCHIVE_AGENTS_DIR = join(PROJECT_AGENTS_DIR, 'archive');

/** The 21 shipped built-ins, pinned. A new or removed built-in must update this list. */
const BUILTIN_IDS = [
  'accessibility-auditor',
  'api-builder',
  'api-designer',
  'architect',
  'architecture-planner',
  'bug-fixer',
  'ci-guardian',
  'code-reviewer',
  'data-engineer',
  'devops-engineer',
  'doc-writer',
  'frontend-designer',
  'i18n-specialist',
  'implementer',
  'integration-engineer',
  'migration-specialist',
  'observability-engineer',
  'performance-analyzer',
  'refactorer',
  'security-auditor',
  'terminal-ux-engineer',
] as const;

/**
 * Manifests carrying top-level fields the interface never declared (`type` on ci-guardian,
 * `role`/`domain` on the other two) — in both the shipped copy and its project shadow.
 * Design §3.3: an undeclared additive field is a `warning` and the agent still loads.
 */
const UNDECLARED_FIELD_IDS = ['ci-guardian', 'integration-engineer', 'terminal-ux-engineer'] as const;

/** The gitignored learned records (design §2.3) — asserted only when the machine has them. */
const LEARNED_IDS = ['temp-react-specialist', 'temp-react-ts-specialist'] as const;

interface FixtureRoot {
  readonly dir: string;
  readonly layer: AgentCatalogLayer;
}

/**
 * Copy every live manifest directory into a tmpdir, then observe it from there.
 *
 * The layer is decided here, by the caller, never by the classifier: the design's D3 says
 * `temp-` must stop carrying layer semantics, so the prefix rule below is this test's local
 * observation rule standing in for the S2 resolver — it is deliberately not exported.
 */
function observeLiveCatalog(): { records: ObservedAgentManifest[]; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'deckent-agent-catalog-'));
  const roots: FixtureRoot[] = [
    { dir: join(root, 'builtin'), layer: 'builtin' },
    { dir: join(root, 'project'), layer: 'project' },
    { dir: join(root, 'archive'), layer: 'archive' },
  ];
  cpSync(BUILTIN_AGENTS_DIR, roots[0]!.dir, { recursive: true });
  cpSync(PROJECT_AGENTS_DIR, roots[1]!.dir, { recursive: true });
  cpSync(ARCHIVE_AGENTS_DIR, roots[2]!.dir, { recursive: true });
  rmSync(join(roots[1]!.dir, 'archive'), { recursive: true, force: true });

  const records: ObservedAgentManifest[] = [];
  for (const { dir, layer } of roots) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(dir, entry.name, 'agent.json');
      let manifest: ObservedAgentManifest['manifest'];
      try {
        manifest = { ok: true, value: JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown };
      } catch (err) {
        manifest = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      records.push({
        directoryName: entry.name,
        resolvedFrom: manifestPath,
        layer: layer === 'project' && entry.name.startsWith('temp-') ? 'runtime' : layer,
        manifest,
        hasPromptFile: existsSync(join(dir, entry.name, 'PROMPT.md')),
      });
    }
  }
  return { records, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function codesOf(classification: AgentManifestClassification): AgentManifestDiagnosticCode[] {
  return classification.diagnostics.map((diagnostic) => diagnostic.code);
}

function baseManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sample-agent',
    name: 'Sample Agent',
    description: 'fixture',
    systemPrompt: 'persona',
    expertise: [],
    allowedTools: [],
    deniedTools: [],
    preferredModel: 'claude-sonnet-5',
    effortMultiplier: 1,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: true,
    enabled: true,
    source: 'user',
    stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    manifestVersion: 2,
    capabilities: { capabilitiesVersion: 3 },
    ...overrides,
  };
}

function observe(
  manifestValue: unknown,
  overrides: Partial<ObservedAgentManifest> = {},
): ObservedAgentManifest {
  return {
    directoryName: 'sample-agent',
    resolvedFrom: '/fixture/sample-agent/agent.json',
    layer: 'project',
    manifest: { ok: true, value: manifestValue },
    hasPromptFile: true,
    ...overrides,
  };
}

// ─── The live-catalog classification table (S1 proof obligation) ─────────────

describe('agent catalog schema — live manifest classification table', () => {
  const { records, cleanup } = observeLiveCatalog();
  const classifications = records.map((record) => classifyAgentManifest(record));
  const byKey = new Map(
    records.map((record, index) => [`${record.layer}/${record.directoryName}`, classifications[index]!]),
  );
  cleanup();

  it('classifies every observed record exactly once — zero silent skips', () => {
    expect(classifications).toHaveLength(records.length);
    expect(byKey.size).toBe(records.length);
    for (const classification of classifications) {
      expect(classification.id).not.toBe('');
      expect(['valid', 'warning', 'invalid']).toContain(classification.validity);
      expect(['builtin', 'project', 'learned', 'archived']).toContain(classification.provenance.kind);
      expect(classification.provenance.resolvedFrom).toContain('agent.json');
      if (classification.validity !== 'valid') expect(classification.diagnostics.length).toBeGreaterThan(0);
    }
  });

  it('sees the 21 shipped built-ins and their 21 project shadows', () => {
    const builtinIds = records
      .filter((record) => record.layer === 'builtin')
      .map((record) => record.directoryName)
      .sort();
    const shadowIds = records
      .filter((record) => record.layer === 'project')
      .map((record) => record.directoryName)
      .sort();
    expect(builtinIds).toEqual([...BUILTIN_IDS]);
    expect(shadowIds).toEqual([...BUILTIN_IDS]);
  });

  it('classifies every built-in as routable, on the current schema version', () => {
    for (const id of BUILTIN_IDS) {
      const entry = byKey.get(`builtin/${id}`)!;
      expect(entry, id).toBeDefined();
      expect(entry.id, id).toBe(id);
      expect(entry.provenance, id).toMatchObject({ declared: 'builtin', layer: 'builtin', kind: 'builtin' });
      expect(entry.schemaVersion, id).toMatchObject({
        declared: AGENT_MANIFEST_SCHEMA_VERSION_CURRENT,
        effective: AGENT_MANIFEST_SCHEMA_VERSION_CURRENT,
        defaulted: false,
        known: true,
      });
      expect(entry.enabled, id).toBe(true);
      expect(entry.prompt, id).toBe('prompt-file');
      expect(entry.routable, id).toEqual({ value: true, reasons: [] });
      const expectedValidity = (UNDECLARED_FIELD_IDS as readonly string[]).includes(id) ? 'warning' : 'valid';
      expect(entry.validity, id).toBe(expectedValidity);
    }
  });

  it('reports undeclared additive fields as warnings that still load and stay routable', () => {
    for (const id of UNDECLARED_FIELD_IDS) {
      for (const layer of ['builtin', 'project'] as const) {
        const entry = byKey.get(`${layer}/${id}`)!;
        expect(codesOf(entry), `${layer}/${id}`).toContain('undeclared-field');
        expect(entry.validity, `${layer}/${id}`).toBe('warning');
        expect(entry.routable.value, `${layer}/${id}`).toBe(true);
      }
    }
  });

  it('keeps a synced built-in shadow in the project layer without a provenance disagreement', () => {
    for (const id of BUILTIN_IDS) {
      const entry = byKey.get(`project/${id}`)!;
      expect(entry.provenance, id).toMatchObject({ declared: 'builtin', layer: 'project', kind: 'project' });
      expect(codesOf(entry), id).not.toContain('provenance-disagreement');
      expect(entry.routable, id).toEqual({ value: true, reasons: [] });
    }
  });

  it('classifies the archived records — and the id/directory mismatch is a warning, not a clean load', () => {
    const archived = records.filter((record) => record.layer === 'archive').map((record) => record.directoryName).sort();
    expect(archived).toEqual(['temp-react-specialist', 'temp-react-ts-specialist', 'test-writer-removed-sprint-148']);

    for (const directoryName of ['temp-react-specialist', 'temp-react-ts-specialist'] as const) {
      const entry = byKey.get(`archive/${directoryName}`)!;
      expect(entry.id, directoryName).toBe(directoryName);
      expect(entry.validity, directoryName).toBe('valid');
      expect(entry.provenance, directoryName).toMatchObject({ declared: 'learned', layer: 'archive', kind: 'archived' });
      expect(entry.prompt, directoryName).toBe('system-prompt');
      expect(entry.routable, directoryName).toEqual({
        value: false,
        reasons: ['archived', 'capabilities-missing'] satisfies AgentRoutabilityBlocker[],
      });
    }

    const testWriter = byKey.get('archive/test-writer-removed-sprint-148')!;
    expect(testWriter.id).toBe('test-writer');
    expect(testWriter.validity).toBe('warning');
    expect(codesOf(testWriter)).toContain('id-directory-mismatch');
    expect(testWriter.provenance).toMatchObject({ declared: 'builtin', layer: 'archive', kind: 'archived' });
    expect(testWriter.enabled).toBe(true);
    expect(testWriter.prompt).toBe('prompt-file');
    expect(testWriter.routable).toEqual({
      value: false,
      reasons: ['archived', 'capabilities-missing'] satisfies AgentRoutabilityBlocker[],
    });
  });

  it('classifies each present learned record as enabled but definitively non-routable (D4)', () => {
    const learned = records.filter((record) => record.layer === 'runtime');
    expect(learned.map((record) => record.directoryName).sort()).toEqual(
      LEARNED_IDS.filter((id) => byKey.has(`runtime/${id}`)),
    );
    for (const record of learned) {
      const entry = byKey.get(`runtime/${record.directoryName}`)!;
      // Learned records mutate as sprints generate/refresh temp agents, so the
      // live-tree pin asserts the CONTRACT (explicit classification, no silent
      // skip) rather than the exact validity of a moving record.
      expect(['valid', 'warning'], record.directoryName).toContain(entry.validity);
      expect(entry.provenance, record.directoryName).toMatchObject({
        declared: 'learned',
        layer: 'runtime',
        kind: 'learned',
      });
      // enabled/prompt/routability of a LIVE learned record are moving state —
      // the D4 semantics those fields obey are pinned by the hermetic fixture
      // suite below ("agent routability (D4)"), which cannot rot with the tree.
    }
  });
});

// ─── D2 — schema versioning ──────────────────────────────────────────────────

describe('agent manifest schema version (D2)', () => {
  it('exposes exactly the versions this runtime knows', () => {
    expect(KNOWN_AGENT_MANIFEST_SCHEMA_VERSIONS).toEqual([1, 2]);
    expect(AGENT_MANIFEST_SCHEMA_VERSION_CURRENT).toBe(2);
    expect(AGENT_MANIFEST_SCHEMA_VERSION_DEFAULT).toBe(1);
  });

  it('defaults an absent version on read and says so, without downgrading validity', () => {
    const { manifestVersion: _omitted, ...legacy } = baseManifest();
    const entry = classifyAgentManifest(observe(legacy));
    expect(entry.schemaVersion).toEqual({
      declared: null,
      effective: AGENT_MANIFEST_SCHEMA_VERSION_DEFAULT,
      defaulted: true,
      known: true,
    });
    expect(codesOf(entry)).toContain('schema-version-defaulted');
    expect(entry.validity).toBe('valid');
    expect(entry.routable.value).toBe(true);
  });

  it('treats a future version as typed invalid — never coerced, never dropped', () => {
    const entry = classifyAgentManifest(observe(baseManifest({ manifestVersion: 3 })));
    expect(entry.schemaVersion).toEqual({ declared: 3, effective: null, defaulted: false, known: false });
    expect(codesOf(entry)).toContain('schema-version-unknown');
    expect(entry.validity).toBe('invalid');
    expect(entry.routable.reasons).toContain('manifest-invalid');
    expect(entry.id).toBe('sample-agent');
  });

  it('treats a non-numeric version as unknown rather than parsing it', () => {
    const entry = classifyAgentManifest(observe(baseManifest({ manifestVersion: '2' })));
    expect(entry.schemaVersion).toEqual({ declared: null, effective: null, defaulted: false, known: false });
    expect(entry.validity).toBe('invalid');
  });
});

// ─── D4 — routability ────────────────────────────────────────────────────────

describe('agent routability (D4)', () => {
  it('makes a missing capabilities block definitively non-routable', () => {
    const { capabilities: _dropped, ...withoutCapabilities } = baseManifest();
    const entry = classifyAgentManifest(observe(withoutCapabilities));
    expect(entry.validity).toBe('valid');
    expect(entry.enabled).toBe(true);
    expect(entry.routable).toEqual({ value: false, reasons: ['capabilities-missing'] });
  });

  it('never blocks routing on an unresolvable preferredModel', () => {
    const entry = classifyAgentManifest(observe(baseManifest({ preferredModel: 'model-that-does-not-exist' })));
    expect(entry.validity).toBe('valid');
    expect(entry.routable).toEqual({ value: true, reasons: [] });
  });

  it('keeps a degraded inline persona routable but records it', () => {
    const entry = classifyAgentManifest(observe(baseManifest(), { hasPromptFile: false }));
    expect(entry.prompt).toBe('system-prompt');
    expect(codesOf(entry)).toContain('prompt-degraded');
    expect(entry.routable).toEqual({ value: true, reasons: [] });
  });

  it('blocks an agent with no resolvable persona at all', () => {
    const entry = classifyAgentManifest(observe(baseManifest({ systemPrompt: '  ' }), { hasPromptFile: false }));
    expect(entry.prompt).toBe('none');
    expect(entry.routable).toEqual({ value: false, reasons: ['prompt-unresolvable'] });
  });

  it('reports owner intent separately from every other facet', () => {
    const entry = classifyAgentManifest(observe(baseManifest({ enabled: false })));
    expect(entry.enabled).toBe(false);
    expect(entry.validity).toBe('valid');
    expect(entry.routable).toEqual({ value: false, reasons: ['agent-disabled'] });
  });

  it('lists every blocker in a fixed order', () => {
    const entry = classifyAgentManifest(
      observe(baseManifest({ manifestVersion: 3, enabled: false, capabilities: undefined, systemPrompt: '' }), {
        layer: 'archive',
        hasPromptFile: false,
      }),
    );
    expect(entry.routable.reasons).toEqual([
      'manifest-invalid',
      'agent-disabled',
      'archived',
      'capabilities-missing',
      'prompt-unresolvable',
    ] satisfies AgentRoutabilityBlocker[]);
  });
});

// ─── Identity, provenance and unreadable records ─────────────────────────────

describe('agent manifest identity and provenance', () => {
  it('classifies an unreadable manifest instead of dropping it, and claims no owner intent', () => {
    const entry = classifyAgentManifest({
      directoryName: 'broken-agent',
      resolvedFrom: '/fixture/broken-agent/agent.json',
      layer: 'project',
      manifest: { ok: false, error: 'Unexpected token } in JSON at position 12' },
      hasPromptFile: false,
    });
    expect(entry.id).toBe('broken-agent');
    expect(entry.validity).toBe('invalid');
    expect(codesOf(entry)).toEqual(['manifest-unreadable']);
    expect(entry.diagnostics[0]!.message).toContain('Unexpected token');
    expect(entry.enabled).toBe(false);
    expect(entry.provenance).toEqual({
      declared: null,
      layer: 'project',
      kind: 'project',
      resolvedFrom: '/fixture/broken-agent/agent.json',
    });
    expect(entry.routable.reasons).toEqual(['manifest-invalid', 'capabilities-missing', 'prompt-unresolvable']);
  });

  it('classifies a non-object manifest', () => {
    const entry = classifyAgentManifest(observe([{ id: 'sample-agent' }]));
    expect(codesOf(entry)).toEqual(['manifest-not-object']);
    expect(entry.validity).toBe('invalid');
    expect(entry.id).toBe('sample-agent');
  });

  it('rejects a missing or malformed id', () => {
    const { id: _noId, ...anonymous } = baseManifest();
    const missing = classifyAgentManifest(observe(anonymous));
    expect(codesOf(missing)).toContain('id-missing');
    expect(missing.validity).toBe('invalid');
    expect(missing.id).toBe('sample-agent'); // directory name, for reporting only

    const malformed = classifyAgentManifest(
      observe(baseManifest({ id: 'Bad Id!' }), { directoryName: 'Bad Id!' }),
    );
    expect(codesOf(malformed)).toContain('id-malformed');
    expect(malformed.validity).toBe('invalid');
  });

  it('warns when a declared source disagrees with the observed layer', () => {
    const entry = classifyAgentManifest(observe(baseManifest({ source: 'learned' }), { layer: 'builtin' }));
    expect(codesOf(entry)).toContain('provenance-disagreement');
    expect(entry.validity).toBe('warning');
    expect(entry.provenance).toMatchObject({ declared: 'learned', layer: 'builtin', kind: 'builtin' });
    expect(entry.routable.value).toBe(true);
  });

  it('records an absent source without inventing one', () => {
    const { source: _noSource, ...sourceless } = baseManifest();
    const entry = classifyAgentManifest(observe(sourceless));
    expect(codesOf(entry)).toContain('provenance-declared-absent');
    expect(entry.provenance.declared).toBeNull();
    expect(entry.validity).toBe('valid');
  });

  it('separates a malformed core field from a malformed additive field', () => {
    const core = classifyAgentManifest(observe(baseManifest({ expertise: 'react' })));
    expect(codesOf(core)).toContain('core-field-invalid');
    expect(core.validity).toBe('invalid');

    const additive = classifyAgentManifest(observe(baseManifest({ capabilitiesProvisional: 'yes' })));
    expect(codesOf(additive)).toContain('additive-field-invalid');
    expect(additive.validity).toBe('warning');
    expect(additive.routable.value).toBe(true);
  });

  it('classifies a malformed promptSha256 as additive-field-invalid, still loading (524-012)', () => {
    const entry = classifyAgentManifest(observe(baseManifest({ promptSha256: 12345 })));
    expect(codesOf(entry)).toContain('additive-field-invalid');
    expect(entry.validity).toBe('warning');
    expect(entry.routable.value).toBe(true);
  });
});
