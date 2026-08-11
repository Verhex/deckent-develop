// ─── 521-005 · Skill catalog S2 — V3 profile state carried as data ──────────
//
// Proof obligations for follow-up-works/skill-catalog-authority-design-2026-08-11.md
// §3.5 and OWNER DECISIONS D5/D6 (2026-08-11):
//
//   1. The catalog CARRIES exactly three profile states — present-valid,
//      present-invalid, absent — derived from the real manifest `profile` field
//      through the one validator production already routes on.
//   2. There is ONE derivation path: validity is `validateSkillProfile()`'s own
//      verdict, never a re-implemented schema check.
//   3. D5 — an installed-but-unroutable skill stays a catalog entry and is
//      labelled `installed-unroutable`; it is never hidden.
//   4. D6 — the catalog decides no reconciliation: a legacy V2-activation skill
//      with no profile is plainly `absent`, and no `unresolved` verdict is
//      minted for it.
//   5. `routable` agrees, state for state, with the V3 candidacy rule
//      `src/orchestra/routing-plan-adapter.ts:90-92` already applies.
//
// Hermetic: node:fs is fully mocked with an in-memory tree (the 521-004
// pattern); no tmpdir, and no dependency on this checkout's real .deckent/ or
// builtins/ contents.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  appendFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { join } from 'node:path';
import { resolveSkillCatalog, type EffectiveSkill } from '../../src/core/skill-pool.js';
import {
  createSkillDefinition,
  deriveSkillProfileState,
  deriveSkillRoutingState,
  type SkillDefinition,
  type SkillProfileState,
} from '../../src/core/skill-types.js';
import { validateSkillProfile } from '../../src/core/routing/capability-vector.js';

// ─── Virtual filesystem ─────────────────────────────────────────────────────

const ROOT = '/test/project';
const SKILLS_DIR = join(ROOT, '.deckent', 'skills');
const DISPOSITION_LEDGER_PATH = join(ROOT, '.deckent', 'catalog', 'skill-dispositions.json');
const MANIFEST = 'manifest.json';

interface VirtualDirEntry {
  name: string;
  isDir: boolean;
}

class Tree {
  readonly dirs = new Map<string, VirtualDirEntry[]>();
  readonly files = new Map<string, string>();

  private _child(parent: string, name: string, isDir: boolean): void {
    const entries = this.dirs.get(parent) ?? [];
    if (!entries.some((e) => e.name === name)) entries.push({ name, isDir });
    this.dirs.set(parent, entries);
  }

  file(path: string, content: string): this {
    this.files.set(path, content);
    return this;
  }

  /** `.deckent/skills/<id>/manifest.json` — the L2/L3 project tree. */
  projectManifest(id: string, manifest: Record<string, unknown>): this {
    if (!this.dirs.has(SKILLS_DIR)) this.dirs.set(SKILLS_DIR, []);
    this._child(SKILLS_DIR, id, true);
    return this.file(join(SKILLS_DIR, id, MANIFEST), JSON.stringify(manifest));
  }

  /** §3.1 L4/L5 — quarantine / retirement carried as data. */
  dispositions(entries: Record<string, { state: string; reasonCode?: string }>): this {
    return this.file(DISPOSITION_LEDGER_PATH, JSON.stringify({ entries }));
  }
}

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, '${path}'`) as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

function mount(tree: Tree): void {
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    const key = String(p);
    return tree.files.has(key) || tree.dirs.has(key);
  });
  vi.mocked(fs.readdirSync).mockImplementation(((p: fs.PathLike) => {
    const key = String(p);
    const entries = tree.dirs.get(key);
    if (!entries) throw enoent(key);
    return entries.map((e) => ({ name: e.name, isDirectory: () => e.isDir })) as unknown as fs.Dirent[];
  }) as unknown as typeof fs.readdirSync);
  vi.mocked(fs.readFileSync).mockImplementation(((p: fs.PathLike) => {
    const key = String(p);
    const content = tree.files.get(key);
    if (content === undefined) throw enoent(key);
    return content;
  }) as unknown as typeof fs.readFileSync);
}

function manifestJson(
  overrides: Partial<SkillDefinition> & { id: string; name: string },
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...createSkillDefinition(overrides), ...extra } as Record<string, unknown>;
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * Copied verbatim from the single project manifest that carries a profile today
 * (`.deckent/skills/project-conventions/manifest.json`) — the present-valid case
 * is pinned against real shipped data, not an invented shape.
 */
const REAL_PROJECT_CONVENTIONS_PROFILE = {
  profileVersion: 3,
  workTypes: [
    { type: 'build', proficiency: 'able' },
    { type: 'fix', proficiency: 'able' },
    { type: 'refactor', proficiency: 'able' },
  ],
  domains: [{ id: '*', proficiency: 'able' }],
  expertise: ['project conventions', 'stack idioms'],
  deliverables: [],
} as const;

/**
 * The legacy V2 activation block every one of today's project manifests carries.
 * It must NOT be read as profile evidence (D6 / row 7121).
 */
const LEGACY_ACTIVATION: SkillDefinition['activation'] = {
  rules: [{ name: 'code-work', when: { 'task.kind': 'code-development' }, score: 5 }],
  exclude: [],
  minScore: 3,
};

/** Rejected shapes — each fails `skillProfileSchema` for a different reason. */
const INVALID_PROFILES: ReadonlyArray<{ label: string; profile: unknown }> = [
  { label: 'empty object (every required key missing)', profile: {} },
  {
    label: 'superseded profileVersion',
    profile: { ...REAL_PROJECT_CONVENTIONS_PROFILE, profileVersion: 2 },
  },
  {
    label: 'work-type outside the closed core vocabulary',
    profile: {
      ...REAL_PROJECT_CONVENTIONS_PROFILE,
      workTypes: [{ type: 'invent', proficiency: 'able' }],
    },
  },
  {
    label: 'unknown proficiency grade',
    profile: {
      ...REAL_PROJECT_CONVENTIONS_PROFILE,
      domains: [{ id: '*', proficiency: 'wizard' }],
    },
  },
  {
    label: 'stray key (strict schema keeps outcome-stats out of a profile)',
    profile: { ...REAL_PROJECT_CONVENTIONS_PROFILE, stats: { totalUses: 3 } },
  },
  { label: 'non-object scalar', profile: 'project-conventions' },
  { label: 'boolean false (present, not absent)', profile: false },
  { label: 'array', profile: [REAL_PROJECT_CONVENTIONS_PROFILE] },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('521-005 · the three profile states (design §3.5)', () => {
  it('reports present-valid for the one real shipped profile block', () => {
    const status = deriveSkillProfileState({ profile: REAL_PROJECT_CONVENTIONS_PROFILE });
    expect(status.profileState).toBe('present-valid');
    expect(status.profile).toEqual(REAL_PROJECT_CONVENTIONS_PROFILE);
    expect(status.issues).toEqual([]);
  });

  it.each(INVALID_PROFILES)('reports present-invalid for $label', ({ profile }) => {
    const status = deriveSkillProfileState({ profile });
    expect(status.profileState).toBe('present-invalid');
    expect(status.profile).toBeNull();
    expect(status.issues.length).toBeGreaterThan(0);
    // Issues are the validator's own typed verdict, carried through unchanged.
    for (const issue of status.issues) {
      expect(typeof issue.path).toBe('string');
      expect(typeof issue.message).toBe('string');
      expect(typeof issue.code).toBe('string');
    }
  });

  it('reports absent only when the manifest carries no profile key', () => {
    for (const definition of [{}, { profile: undefined }, { profile: null }]) {
      const status = deriveSkillProfileState(definition);
      expect(status.profileState).toBe('absent');
      expect(status.profile).toBeNull();
      expect(status.issues).toEqual([]);
    }
  });

  it('never carries a profile or issues that contradict its own state', () => {
    const samples: unknown[] = [
      undefined,
      null,
      REAL_PROJECT_CONVENTIONS_PROFILE,
      ...INVALID_PROFILES.map((entry) => entry.profile),
    ];
    for (const profile of samples) {
      const status = deriveSkillProfileState({ profile });
      expect(status.profile === null).toBe(status.profileState !== 'present-valid');
      expect(status.issues.length === 0).toBe(status.profileState !== 'present-invalid');
    }
  });
});

describe('521-005 · one derivation path, not a second validator', () => {
  it('delegates validity to validateSkillProfile for every sample', () => {
    const samples: unknown[] = [
      REAL_PROJECT_CONVENTIONS_PROFILE,
      ...INVALID_PROFILES.map((entry) => entry.profile),
    ];
    for (const profile of samples) {
      const expected = validateSkillProfile(profile);
      const status = deriveSkillProfileState({ profile });
      expect(status.profileState).toBe(expected.ok ? 'present-valid' : 'present-invalid');
      if (expected.ok) expect(status.profile).toEqual(expected.value);
      else expect(status.issues).toEqual(expected.issues);
    }
  });

  it('agrees with the V3 candidacy rule routing already applies', () => {
    // routing-plan-adapter.ts:90-92 — `profile ? validateSkillProfile(profile) : null`,
    // then `if (!validation?.ok) continue`. Same admissions, now reported instead of dropped.
    const samples: unknown[] = [
      undefined,
      null,
      REAL_PROJECT_CONVENTIONS_PROFILE,
      ...INVALID_PROFILES.map((entry) => entry.profile),
    ];
    for (const profile of samples) {
      const adapterAdmits = profile ? validateSkillProfile(profile).ok : false;
      const routing = deriveSkillRoutingState({
        definition: { profile },
        disposition: { state: 'active' },
        masked: false,
      });
      expect(routing.routable).toBe(adapterAdmits);
    }
  });
});

describe('521-005 · profile state derived from the real catalog read model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** The read model is the only source of records under test — never a hand-built row. */
  function resolveStates(): Map<string, EffectiveSkill> {
    const { entries } = resolveSkillCatalog(ROOT);
    return new Map(entries.map((entry) => [entry.id, entry]));
  }

  it('carries a distinct state for each of the three manifests on disk', () => {
    mount(
      new Tree()
        .projectManifest(
          'valid-profile',
          manifestJson({ id: 'valid-profile', name: 'Valid' }, {
            profile: REAL_PROJECT_CONVENTIONS_PROFILE,
          }),
        )
        .projectManifest(
          'broken-profile',
          manifestJson({ id: 'broken-profile', name: 'Broken' }, { profile: { profileVersion: 2 } }),
        )
        .projectManifest('no-profile', manifestJson({ id: 'no-profile', name: 'None' })),
    );

    const catalog = resolveStates();
    const states: Record<string, SkillProfileState> = {};
    for (const [id, record] of catalog) states[id] = deriveSkillRoutingState(record).profileState;

    expect(states).toEqual({
      'valid-profile': 'present-valid',
      'broken-profile': 'present-invalid',
      'no-profile': 'absent',
    });
    // Derivation reads the real manifest field, so the parsed profile round-trips.
    expect(deriveSkillRoutingState(catalog.get('valid-profile')!).profile).toEqual(
      REAL_PROJECT_CONVENTIONS_PROFILE,
    );
  });

  it('reads a legacy V2-activation skill as absent, never as a reconciled profile (D6)', () => {
    mount(
      new Tree().projectManifest(
        'legacy-activation',
        manifestJson({
          id: 'legacy-activation',
          name: 'Legacy',
          manifestVersion: 2,
          activation: LEGACY_ACTIVATION,
        }),
      ),
    );

    const record = resolveStates().get('legacy-activation')!;
    expect(record.definition.activation).toBeDefined();
    const routing = deriveSkillRoutingState(record);
    // Row 7121 owns the mapping decision — the catalog states the plain fact only.
    expect(routing.profileState).toBe('absent');
    expect(routing.profile).toBeNull();
    expect(routing.routable).toBe(false);
  });
});

describe('521-005 · D5 — installed-but-unroutable is visible, not hidden', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps every unroutable skill in the catalog and labels it honestly', () => {
    mount(
      new Tree()
        .projectManifest(
          'routable-skill',
          manifestJson({ id: 'routable-skill', name: 'Routable' }, {
            profile: REAL_PROJECT_CONVENTIONS_PROFILE,
          }),
        )
        .projectManifest('unroutable-skill', manifestJson({ id: 'unroutable-skill', name: 'Unroutable' }))
        .projectManifest(
          'disabled-skill',
          manifestJson({ id: 'disabled-skill', name: 'Disabled', enabled: false }, {
            profile: REAL_PROJECT_CONVENTIONS_PROFILE,
          }),
        ),
    );

    const { entries } = resolveSkillCatalog(ROOT);
    // D5 NO-GO guard: nothing is dropped from the listing because it cannot route.
    expect(entries.map((entry) => entry.id)).toEqual([
      'disabled-skill',
      'routable-skill',
      'unroutable-skill',
    ]);

    const byId = new Map(entries.map((entry) => [entry.id, deriveSkillRoutingState(entry)]));
    expect(byId.get('routable-skill')).toMatchObject({
      profileState: 'present-valid',
      routable: true,
      visibility: 'routable',
    });
    expect(byId.get('unroutable-skill')).toMatchObject({
      profileState: 'absent',
      routable: false,
      visibility: 'installed-unroutable',
    });
    // A valid profile is not enough — a disabled disposition is still unroutable.
    expect(byId.get('disabled-skill')).toMatchObject({
      profileState: 'present-valid',
      routable: false,
      visibility: 'installed-unroutable',
    });
  });

  it('labels a withdrawn skill as withdrawn even when its profile is valid', () => {
    mount(
      new Tree()
        .projectManifest(
          'quarantined-skill',
          manifestJson({ id: 'quarantined-skill', name: 'Quarantined' }, {
            profile: REAL_PROJECT_CONVENTIONS_PROFILE,
          }),
        )
        .projectManifest(
          'retired-skill',
          manifestJson({ id: 'retired-skill', name: 'Retired' }, {
            profile: REAL_PROJECT_CONVENTIONS_PROFILE,
          }),
        )
        .dispositions({
          'quarantined-skill': { state: 'quarantined', reasonCode: 'SANDBOX_VIOLATION' },
          'retired-skill': { state: 'retired' },
        }),
    );

    for (const record of resolveSkillCatalog(ROOT).entries) {
      expect(record.masked).toBe(true);
      const routing = deriveSkillRoutingState(record);
      // Masking is the resolver's fail-closed decision — never re-derived here.
      expect(routing.profileState).toBe('present-valid');
      expect(routing.routable).toBe(false);
      expect(routing.visibility).toBe('withdrawn');
    }
  });
});
