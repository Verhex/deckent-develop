// ─── 521-004 · Skill catalog S1 — the single effective read model ───────────
//
// Proof obligations for the first slice of
// follow-up-works/skill-catalog-authority-design-2026-08-11.md:
//
//   1. Layer collisions resolve per OWNER DECISION D1 — generated/learned sits
//      BELOW a hand-authored project override (precedence table, below).
//   2. Ids are flat per OWNER DECISION D9 — a publisher-qualified id is never
//      minted by the catalog, at any layer.
//   3. Quarantined and retired are DISPOSITIONS carried as data: masked from
//      every resolvable surface, still readable as a tombstone via
//      getEffective() (design §4 contract point 1).
//   4. Every current consumer keeps its observable behaviour for today's
//      non-conflicting catalogs — same pool membership, same invalid-manifest
//      reporting, same builtin-fallback gates, same sidecar stats overlay.
//   5. The resolver is the only directory-scan path: no rogue directory is
//      scanned, and a single-id lookup performs a single resolution pass.
//
// Hermetic: node:fs is fully mocked with an in-memory tree; no tmpdir, no
// dependency on this checkout's real .deckent/ or builtins/ contents.

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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SkillPoolManager,
  SKILL_LAYER_RANK,
  parseSkillId,
  pickEffectiveLayer,
  resolveSkillCatalog,
  type SkillCatalogLayer,
} from '../../src/core/skill-pool.js';
import { SkillRegistry } from '../../src/core/skill-registry.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';

// ─── Virtual filesystem ─────────────────────────────────────────────────────

const ROOT = '/test/project';
const SKILLS_DIR = join(ROOT, '.deckent', 'skills');
const CONFIG_PATH = join(ROOT, '.deckent', 'config.json');
const STATS_SIDECAR_PATH = join(ROOT, '.deckent', 'stats', 'catalog-stats.json');
const DISPOSITION_LEDGER_PATH = join(ROOT, '.deckent', 'catalog', 'skill-dispositions.json');

/**
 * resolveBuiltinSkillsDir() resolves relative to skill-pool.ts's OWN location
 * (src/core/builtins/skills) — mirrored here so the mocked tree lines up with
 * what the module under test asks for.
 */
const BUILTIN_SKILLS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'core',
  'builtins',
  'skills',
);

const MANIFEST = 'manifest.json';
const SKILL_MD = 'SKILL.md';

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

  dir(path: string): this {
    if (!this.dirs.has(path)) this.dirs.set(path, []);
    return this;
  }

  file(path: string, content: string): this {
    this.files.set(path, content);
    return this;
  }

  /** Mark this project root as having been through `deckent init`. */
  initialized(): this {
    return this.file(CONFIG_PATH, JSON.stringify({ version: 1 }));
  }

  /** `.deckent/skills/<id>/manifest.json` — L2 hand-authored, or L3 when provenance says so. */
  projectManifest(id: string, manifest: Record<string, unknown> | string): this {
    this.dir(SKILLS_DIR);
    this._child(SKILLS_DIR, id, true);
    return this.file(
      join(SKILLS_DIR, id, MANIFEST),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    );
  }

  /** A builtin that ships only a SKILL.md — the 371-001 fallback shape (L1). */
  builtinSkillMd(id: string, markdown: string): this {
    this.dir(BUILTIN_SKILLS_DIR);
    this._child(BUILTIN_SKILLS_DIR, id, true);
    this.dir(join(BUILTIN_SKILLS_DIR, id));
    this._child(join(BUILTIN_SKILLS_DIR, id), SKILL_MD, false);
    return this.file(join(BUILTIN_SKILLS_DIR, id, SKILL_MD), markdown);
  }

  /** A builtin that ships its own manifest.json — deliberately left to the override path. */
  builtinWithManifest(id: string): this {
    this.dir(BUILTIN_SKILLS_DIR);
    this._child(BUILTIN_SKILLS_DIR, id, true);
    this.dir(join(BUILTIN_SKILLS_DIR, id));
    this._child(join(BUILTIN_SKILLS_DIR, id), MANIFEST, false);
    this._child(join(BUILTIN_SKILLS_DIR, id), SKILL_MD, false);
    this.file(join(BUILTIN_SKILLS_DIR, id, MANIFEST), JSON.stringify({ id, name: id }));
    return this.file(join(BUILTIN_SKILLS_DIR, id, SKILL_MD), `# ${id}\n\nBuiltin body.\n`);
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

function builtinBody(title: string): string {
  return `# ${title}\n\nShipped builtin body.\n`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('521-004 · flat skill-id contract (OWNER DECISION D9)', () => {
  it('accepts the flat kebab grammar every shipped id already uses', () => {
    for (const id of ['secure-coding', 'a', 'api2', 'a-b-c', 'project-conventions']) {
      expect(parseSkillId(id)).toEqual({ ok: true, id });
    }
  });

  it('rejects a publisher-qualified id — D9 chose flat-id + registry mapping', () => {
    const result = parseSkillId('acme/secure-coding');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('flat id');
  });

  it('rejects any path-bearing or platform-unsafe id', () => {
    const rejected = [
      'acme\\secure-coding',
      '../escape',
      '..',
      '.',
      'skills/nested/id',
      'Secure-Coding',
      '-leading',
      'trailing-',
      'has space',
      'skill.md',
      'ünïcode',
      'con',
      'com1',
      'lpt9',
      'x'.repeat(65),
      '',
      '   ',
    ];
    for (const id of rejected) {
      expect(parseSkillId(id).ok, `expected ${JSON.stringify(id)} to be rejected`).toBe(false);
    }
    expect(parseSkillId(42).ok).toBe(false);
    expect(parseSkillId(undefined).ok).toBe(false);
  });
});

describe('521-004 · layer precedence table (OWNER DECISION D1)', () => {
  const table: Array<{ candidates: SkillCatalogLayer[]; winner: SkillCatalogLayer }> = [
    { candidates: ['builtin'], winner: 'builtin' },
    { candidates: ['project'], winner: 'project' },
    { candidates: ['generated'], winner: 'generated' },
    { candidates: ['builtin', 'project'], winner: 'project' },
    { candidates: ['builtin', 'generated'], winner: 'generated' },
    { candidates: ['project', 'generated'], winner: 'project' },
    { candidates: ['builtin', 'project', 'generated'], winner: 'project' },
  ];

  it.each(table)('$candidates resolves to $winner', ({ candidates, winner }) => {
    const records = candidates.map((layer) => ({ layer }));
    expect(pickEffectiveLayer(records)?.layer).toBe(winner);
    // Precedence is a pure function of the candidate set, never of scan order.
    expect(pickEffectiveLayer([...records].reverse())?.layer).toBe(winner);
  });

  it('ranks project above generated above builtin', () => {
    expect(SKILL_LAYER_RANK.project).toBeGreaterThan(SKILL_LAYER_RANK.generated);
    expect(SKILL_LAYER_RANK.generated).toBeGreaterThan(SKILL_LAYER_RANK.builtin);
  });

  it('never lets a generated skill outrank a hand-authored override (D1 NO-GO guard)', () => {
    expect(pickEffectiveLayer([{ layer: 'project' }, { layer: 'generated' }])?.layer).toBe('project');
    expect(pickEffectiveLayer([{ layer: 'generated' }, { layer: 'project' }])?.layer).toBe('project');
  });

  it('returns undefined for an empty candidate list', () => {
    expect(pickEffectiveLayer([])).toBeUndefined();
  });
});

describe('521-004 · resolveSkillCatalog — content layers', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  it('lets a hand-authored project manifest win over the shipped builtin', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('secure-coding', manifestJson({ id: 'secure-coding', name: 'Project Secure Coding' }))
        .builtinSkillMd('secure-coding', builtinBody('Builtin Secure Coding')),
    );

    const record = manager.getEffective('secure-coding');
    expect(record?.layer).toBe('project');
    expect(record?.definition.name).toBe('Project Secure Coding');
    expect(record?.overrides).toEqual(['builtin@0.1.0']);
    expect(manager.loadSkills().get('secure-coding')?.name).toBe('Project Secure Coding');
  });

  it('classifies a generated/learned manifest as the generated layer, still above builtin', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest(
          'project-conventions',
          manifestJson({ id: 'project-conventions', name: 'Generated Conventions' }, { source: 'learned' }),
        )
        .builtinSkillMd('project-conventions', builtinBody('Builtin Conventions')),
    );

    const record = manager.getEffective('project-conventions');
    expect(record?.layer).toBe('generated');
    expect(record?.provenance.kind).toBe('generated');
    expect(record?.definition.name).toBe('Generated Conventions');
    expect(record?.overrides).toEqual(['builtin@0.1.0']);
  });

  it('reads the typed provenance block in preference to the legacy source string', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest(
          'api-builder',
          manifestJson({ id: 'api-builder', name: 'Api Builder' }, {
            source: 'builtin',
            provenance: { kind: 'generated' },
          }),
        ),
    );

    const record = manager.getEffective('api-builder');
    expect(record?.layer).toBe('generated');
    expect(record?.provenance.kind).toBe('generated');
  });

  it('keeps the builtin fallback for a package-only skill (371-001 behaviour preserved)', () => {
    mount(new Tree().initialized().builtinSkillMd('observability', builtinBody('Observability')));

    const record = manager.getEffective('observability');
    expect(record?.layer).toBe('builtin');
    expect(record?.provenance.kind).toBe('builtin');
    expect(record?.definition.name).toBe('Observability');
    expect(manager.loadSkills().has('observability')).toBe(true);
  });

  it('keeps the .deckent/config.json gate on the builtin layer', () => {
    mount(new Tree().builtinSkillMd('observability', builtinBody('Observability')));

    expect(manager.loadSkills().size).toBe(0);
    expect(manager.getEffective('observability')).toBeUndefined();
  });

  it('still skips a builtin directory that ships its own manifest.json', () => {
    mount(new Tree().initialized().builtinWithManifest('secure-coding'));

    expect(manager.loadSkills().has('secure-coding')).toBe(false);
    expect(manager.getInvalidCount()).toBe(0);
  });

  it('sorts entries byte-wise by id regardless of directory scan order (§5 rule 1)', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('zeta', manifestJson({ id: 'zeta', name: 'Zeta' }))
        .projectManifest('alpha', manifestJson({ id: 'alpha', name: 'Alpha' }))
        .projectManifest('mid', manifestJson({ id: 'mid', name: 'Mid' })),
    );

    expect(manager.listEffective().map((e) => e.id)).toEqual(['alpha', 'mid', 'zeta']);
    expect([...manager.loadSkills().keys()]).toEqual(['alpha', 'mid', 'zeta']);
  });
});

describe('521-004 · invalid manifests are reported, never silently skipped', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  it('excludes a schema-invalid manifest and reports it under its directory name', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('broken', { id: 'broken', name: '', category: 'not-a-category' })
        .projectManifest('fine', manifestJson({ id: 'fine', name: 'Fine' })),
    );

    const pool = manager.loadSkills();
    expect(pool.has('broken')).toBe(false);
    expect(pool.has('fine')).toBe(true);
    expect(manager.getInvalidCount()).toBe(1);
    expect(manager.getInvalidManifests()[0]!.id).toBe('broken');
  });

  it('reports an unreadable/invalid-JSON manifest', () => {
    mount(new Tree().initialized().projectManifest('corrupt', '{ not json'));

    expect(manager.loadSkills().size).toBe(0);
    expect(manager.getInvalidManifests()[0]!.errors[0]).toContain('invalid JSON');
  });

  it('refuses a publisher-qualified id inside a manifest (D9 NO-GO guard)', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('acme-secure', manifestJson({ id: 'acme/secure-coding', name: 'Acme Secure' })),
    );

    const pool = manager.loadSkills();
    expect(pool.size).toBe(0);
    expect([...pool.keys()]).not.toContain('acme/secure-coding');
    expect(manager.getInvalidManifests()[0]!.errors[0]).toContain('flat id');
  });
});

describe('521-004 · dispositions are data (§3.1 L4/L5)', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  function withLedger(entries: Record<string, unknown>): Tree {
    return new Tree()
      .initialized()
      .projectManifest('secure-coding', manifestJson({ id: 'secure-coding', name: 'Secure Coding' }))
      .file(DISPOSITION_LEDGER_PATH, JSON.stringify({ version: 1, entries }));
  }

  it('masks a retired id everywhere but still returns its tombstone', () => {
    mount(
      withLedger({
        'secure-coding': {
          state: 'retired',
          reasonCode: 'withdrawn',
          since: '2026-08-11T00:00:00Z',
          supersededBy: 'deckent-secure-coding',
        },
      }),
    );

    expect(manager.loadSkills().has('secure-coding')).toBe(false);
    expect(manager.getSkill('secure-coding')).toBeUndefined();
    expect(manager.listSkills()).toEqual([]);

    const tombstone = manager.getEffective('secure-coding');
    expect(tombstone?.masked).toBe(true);
    expect(tombstone?.disposition.state).toBe('retired');
    expect(tombstone?.disposition.reasonCode).toBe('withdrawn');
    expect(tombstone?.disposition.supersededBy).toBe('deckent-secure-coding');
  });

  it('masks a quarantined id with its own reason code', () => {
    mount(withLedger({ 'secure-coding': { state: 'quarantined', reasonCode: 'sandbox-finding' } }));

    expect(manager.loadSkills().has('secure-coding')).toBe(false);
    const record = manager.getEffective('secure-coding');
    expect(record?.masked).toBe(true);
    expect(record?.disposition.state).toBe('quarantined');
    expect(record?.disposition.reasonCode).toBe('sandbox-finding');
  });

  it('distinguishes a withdrawn id from an unknown id', () => {
    mount(withLedger({ 'secure-coding': { state: 'retired' } }));

    expect(manager.getEffective('secure-coding')).toBeDefined();
    expect(manager.getEffective('never-installed')).toBeUndefined();
  });

  it('keeps a disabled skill loadable — enabled stays a consumer-enforced flag', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('off', manifestJson({ id: 'off', name: 'Off', enabled: false })),
    );

    expect(manager.loadSkills().has('off')).toBe(true);
    expect(manager.listEnabled()).toEqual([]);
    const record = manager.getEffective('off');
    expect(record?.disposition.state).toBe('disabled');
    expect(record?.masked).toBe(false);
  });

  it('ignores a malformed ledger, an unknown state and an unknown id', () => {
    mount(
      withLedger({
        'secure-coding': { state: 'not-a-state' },
        'never-installed': { state: 'retired' },
        'acme/qualified': { state: 'retired' },
        broken: 'not-an-object',
      }),
    );

    expect(manager.loadSkills().has('secure-coding')).toBe(true);
    expect(manager.getEffective('secure-coding')?.disposition.state).toBe('active');
    expect(manager.listEffective().map((e) => e.id)).toEqual(['secure-coding']);
  });
});

describe('521-004 · observable behaviour preserved for today\'s catalogs', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  it('keeps loadSkills/listSkills/listByCategory/listEnabled answering as before', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('ts', manifestJson({ id: 'ts', name: 'TypeScript', category: 'language' }))
        .projectManifest('vite', manifestJson({ id: 'vite', name: 'Vite', category: 'tool', enabled: false })),
    );

    expect(manager.loadSkills().size).toBe(2);
    expect(manager.listSkills().map((s) => s.id)).toEqual(['ts', 'vite']);
    expect(manager.listByCategory('language').map((s) => s.id)).toEqual(['ts']);
    expect(manager.listEnabled().map((s) => s.id)).toEqual(['ts']);
    expect(manager.getSkill('ts')?.name).toBe('TypeScript');
    expect(manager.getSkill('nope')).toBeUndefined();
  });

  it('keeps the sidecar stats overlay winning over the manifest, and reports its source', () => {
    const sidecarStats = {
      totalUses: 7,
      successCount: 6,
      successRate: 6 / 7,
      avgCoverage: 82,
      lastUsedInSprint: 'sprint-520',
    };
    mount(
      new Tree()
        .initialized()
        .projectManifest(
          'ts',
          manifestJson({
            id: 'ts',
            name: 'TypeScript',
            stats: { totalUses: 1, successCount: 1, successRate: 1, avgCoverage: 10, lastUsedInSprint: 'sprint-1' },
          }),
        )
        .file(STATS_SIDECAR_PATH, JSON.stringify({ agents: {}, skills: { ts: sidecarStats } })),
    );

    const record = manager.getEffective('ts');
    expect(record?.definition.stats).toEqual(sidecarStats);
    expect(record?.statsSource).toBe('sidecar');
    expect(manager.getSkill('ts')?.stats.totalUses).toBe(7);
  });

  it('reports statsSource=manifest / defaults when no sidecar row exists', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('ts', manifestJson({ id: 'ts', name: 'TypeScript' }))
        .projectManifest('bare', { id: 'bare', name: 'Bare' }),
    );

    expect(manager.getEffective('ts')?.statsSource).toBe('manifest');
    expect(manager.getEffective('bare')?.statsSource).toBe('defaults');
  });

  it('normalizes optional array fields exactly as the previous loader did (born-641)', () => {
    mount(new Tree().initialized().projectManifest('bare', { id: 'bare', name: 'Bare' }));

    const skill = manager.getSkill('bare');
    expect(skill?.triggers).toEqual([]);
    expect(skill?.composableWith).toEqual([]);
    expect(skill?.category).toBe('domain');
    expect(skill?.stackDetection).toEqual({ files: [], dependencies: [], commands: [] });
  });
});

describe('521-004 · the resolver is the only directory-scan path', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  it('scans nothing outside the two catalog roots', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('ts', manifestJson({ id: 'ts', name: 'TypeScript' }))
        .builtinSkillMd('observability', builtinBody('Observability')),
    );

    manager.loadSkills();

    const scanned = vi.mocked(fs.readdirSync).mock.calls.map((call) => String(call[0]));
    expect(scanned.length).toBeGreaterThan(0);
    for (const dir of scanned) {
      expect(dir === SKILLS_DIR || dir.startsWith(BUILTIN_SKILLS_DIR)).toBe(true);
    }
  });

  it('resolves a single-id lookup in one pass — no private rescan', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('ts', manifestJson({ id: 'ts', name: 'TypeScript' }))
        .builtinSkillMd('observability', builtinBody('Observability')),
    );

    manager.getSkill('ts');

    const projectScans = vi
      .mocked(fs.readdirSync)
      .mock.calls.filter((call) => String(call[0]) === SKILLS_DIR);
    expect(projectScans).toHaveLength(1);
  });

  it('exposes the resolution directly, invalid entries included', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('ts', manifestJson({ id: 'ts', name: 'TypeScript' }))
        .projectManifest('broken', { id: '', name: 'Broken' }),
    );

    const resolution = resolveSkillCatalog(ROOT);
    expect(resolution.entries.map((e) => e.id)).toEqual(['ts']);
    expect(resolution.invalid.map((e) => e.id)).toEqual(['broken']);
  });
});

describe('521-004 · SkillRegistry consumes the same flat-id contract (D9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mount(new Tree());
  });

  it('refuses to register a publisher-qualified id', () => {
    const registry = new SkillRegistry('/test/registry');
    expect(() =>
      registry.register(createSkillDefinition({ id: 'acme/secure-coding', name: 'Acme Secure' })),
    ).toThrow(/flat id/);
    expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
  });

  it('registers a flat id', () => {
    const registry = new SkillRegistry('/test/registry');
    expect(() =>
      registry.register(createSkillDefinition({ id: 'secure-coding', name: 'Secure Coding' })),
    ).not.toThrow();
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledTimes(1);
  });
});
