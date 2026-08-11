// ─── 522-010 · Skill catalog S3 — entrypoint + referenced-file authority ────
//
// Proof obligations for design slice S3
// (follow-up-works/skill-catalog-authority-design-2026-08-11.md §3.4, §7 S3):
//
//   1. G1 — the DECLARED entrypoint is the only body a reader may load. A skill
//      whose body is `GUIDE.md` injects `GUIDE.md`, not the hardcoded `SKILL.md`
//      that today's three readers assume.
//   2. G2 — `{entrypoint} ∪ referencedFiles` is ONE package. A missing member is
//      a typed HOLD, never a warning and never a partial prompt.
//   3. Containment is enforced on read, after normalisation AND after symlink
//      resolution — without both, a manifest is an arbitrary-file-read primitive
//      into a worker prompt.
//   4. The package budget (OWNER DECISION D8) refuses an over-budget package
//      instead of billing a provider for it.
//   5. Existing manifests keep loading unchanged.
//
// Hermetic: node:fs is fully mocked with an in-memory tree (files, directories
// and symlinks); no tmpdir, no dependency on this checkout's real .deckent/ or
// builtins/ contents.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  realpathSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  appendFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SkillPoolManager,
  DEFAULT_SKILL_PACKAGE_BUDGET,
  parseDeclaredSkillPath,
  resolveSkillBody,
  resolveSkillCatalog,
  type SkillBody,
  type SkillBodyHold,
} from '../../src/core/skill-pool.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';

// ─── Virtual filesystem ─────────────────────────────────────────────────────

const ROOT = '/test/project';
const SKILLS_DIR = join(ROOT, '.deckent', 'skills');
const CONFIG_PATH = join(ROOT, '.deckent', 'config.json');
const DISPOSITION_LEDGER_PATH = join(ROOT, '.deckent', 'catalog', 'skill-dispositions.json');
const OUTSIDE_PATH = join(ROOT, 'secrets.env');

/** Mirrors resolveBuiltinSkillsDir(), which resolves against skill-pool.ts's own location. */
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
  /** symlink path → the path it points at (resolved recursively by realpathSync). */
  readonly links = new Map<string, string>();

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

  link(from: string, to: string): this {
    this.links.set(from, to);
    return this;
  }

  initialized(): this {
    return this.file(CONFIG_PATH, JSON.stringify({ version: 1 }));
  }

  /** `.deckent/skills/<id>/manifest.json` plus the skill root directory itself. */
  projectManifest(id: string, manifest: Record<string, unknown>): this {
    this.dir(SKILLS_DIR);
    this._child(SKILLS_DIR, id, true);
    this.dir(join(SKILLS_DIR, id));
    return this.file(join(SKILLS_DIR, id, MANIFEST), JSON.stringify(manifest));
  }

  /** A file inside a project skill's root. */
  skillFile(id: string, relativePath: string, content: string): this {
    return this.file(join(SKILLS_DIR, id, ...relativePath.split('/')), content);
  }

  /** A builtin that ships only a SKILL.md — the package-only (L1) shape. */
  builtinSkillMd(id: string, markdown: string): this {
    this.dir(BUILTIN_SKILLS_DIR);
    this._child(BUILTIN_SKILLS_DIR, id, true);
    this.dir(join(BUILTIN_SKILLS_DIR, id));
    this._child(join(BUILTIN_SKILLS_DIR, id), SKILL_MD, false);
    return this.file(join(BUILTIN_SKILLS_DIR, id, SKILL_MD), markdown);
  }
}

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, '${path}'`) as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

function mount(tree: Tree): void {
  const resolveLink = (key: string, depth = 0): string => {
    const target = tree.links.get(key);
    if (target === undefined || depth > 8) return key;
    return resolveLink(target, depth + 1);
  };

  vi.mocked(fs.existsSync).mockImplementation((p) => {
    const key = String(p);
    return tree.files.has(key) || tree.dirs.has(key) || tree.links.has(key);
  });
  vi.mocked(fs.readdirSync).mockImplementation(((p: fs.PathLike) => {
    const key = String(p);
    const entries = tree.dirs.get(key);
    if (!entries) throw enoent(key);
    return entries.map((e) => ({ name: e.name, isDirectory: () => e.isDir })) as unknown as fs.Dirent[];
  }) as unknown as typeof fs.readdirSync);
  vi.mocked(fs.readFileSync).mockImplementation(((p: fs.PathLike) => {
    const key = resolveLink(String(p));
    const content = tree.files.get(key);
    if (content === undefined) throw enoent(key);
    return content;
  }) as unknown as typeof fs.readFileSync);
  vi.mocked(fs.realpathSync).mockImplementation(((p: fs.PathLike) => {
    const key = String(p);
    const resolved = resolveLink(key);
    if (!tree.files.has(resolved) && !tree.dirs.has(resolved)) throw enoent(key);
    return resolved;
  }) as unknown as typeof fs.realpathSync);
  vi.mocked(fs.statSync).mockImplementation(((p: fs.PathLike) => {
    const key = resolveLink(String(p));
    if (tree.dirs.has(key)) {
      return { size: 0, isFile: () => false, isDirectory: () => true } as unknown as fs.Stats;
    }
    const content = tree.files.get(key);
    if (content === undefined) throw enoent(key);
    return {
      size: Buffer.byteLength(content, 'utf8'),
      isFile: () => true,
      isDirectory: () => false,
    } as unknown as fs.Stats;
  }) as unknown as typeof fs.statSync);
}

function manifestJson(
  overrides: Partial<SkillDefinition> & { id: string; name: string },
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...createSkillDefinition(overrides), ...extra } as Record<string, unknown>;
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function expectBody(result: SkillBody | SkillBodyHold): SkillBody {
  expect(result.ok, `expected a body, got HOLD ${JSON.stringify(result)}`).toBe(true);
  return result as SkillBody;
}

/**
 * A HOLD assertion that also proves the NO-GO condition: a refusal must never
 * carry file content, so no caller can assemble a partial prompt out of it.
 */
function expectHold(result: SkillBody | SkillBodyHold, reasonCode: string): SkillBodyHold {
  expect(result.ok, `expected a HOLD, got a body`).toBe(false);
  const held = result as SkillBodyHold;
  expect(held.reasonCode).toBe(reasonCode);
  expect(held.detail.length).toBeGreaterThan(0);
  expect('entrypoint' in held).toBe(false);
  expect('referencedFiles' in held).toBe(false);
  expect(JSON.stringify(held)).not.toContain('BODY-CONTENT');
  return held;
}

const BODY = '# Guide\n\nBODY-CONTENT for the worker prompt.\n';

// ─── Declared-path contract ─────────────────────────────────────────────────

describe('522-010 · declared package-path contract', () => {
  it('accepts a relative path and normalises both separators', () => {
    expect(parseDeclaredSkillPath('SKILL.md')).toEqual({ ok: true, relativePath: 'SKILL.md' });
    expect(parseDeclaredSkillPath('docs/GUIDE.md')).toEqual({ ok: true, relativePath: 'docs/GUIDE.md' });
    expect(parseDeclaredSkillPath('./scripts/check.sh')).toEqual({ ok: true, relativePath: 'scripts/check.sh' });
    expect(parseDeclaredSkillPath('scripts\\check.sh')).toEqual({ ok: true, relativePath: 'scripts/check.sh' });
  });

  it('flags every escaping shape as an escape, on every platform separator', () => {
    for (const declared of ['../SKILL.md', 'docs/../../SKILL.md', 'docs\\..\\..\\SKILL.md', '..']) {
      const result = parseDeclaredSkillPath(declared);
      expect(result.ok, `expected ${declared} to be rejected`).toBe(false);
      expect(result.ok === false && result.escape).toBe(true);
    }
  });

  it('flags an absolute or drive-qualified path as an escape', () => {
    for (const declared of ['/etc/passwd', '\\\\server\\share\\x.md', 'C:\\Windows\\x.md']) {
      const result = parseDeclaredSkillPath(declared);
      expect(result.ok, `expected ${declared} to be rejected`).toBe(false);
      expect(result.ok === false && result.escape).toBe(true);
    }
  });

  it('rejects a non-string or empty declaration without calling it an escape', () => {
    for (const declared of ['', '   ', 42, null, undefined, {}]) {
      const result = parseDeclaredSkillPath(declared);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.escape).toBe(false);
    }
  });
});

// ─── G1 — the declared entrypoint is the body ───────────────────────────────

describe('522-010 · entrypoint authority (design §3.4 G1)', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  it('injects the DECLARED entrypoint, not the hardcoded SKILL.md', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('guided', manifestJson({ id: 'guided', name: 'Guided', entrypoint: 'GUIDE.md' }))
        .skillFile('guided', 'GUIDE.md', BODY)
        .skillFile('guided', SKILL_MD, '# Stale\n\nthe file every reader hardcodes today\n'),
    );

    const body = expectBody(manager.resolveBody('guided'));
    expect(body.entrypoint.declaredPath).toBe('GUIDE.md');
    expect(body.entrypoint.content).toBe(BODY);
    expect(body.entrypoint.digest).toBe(sha256(BODY));
    expect(body.entrypoint.sizeBytes).toBe(Buffer.byteLength(BODY, 'utf8'));
    expect(body.totalBytes).toBe(body.entrypoint.sizeBytes);
    expect(body.layer).toBe('project');
  });

  it('honours a nested entrypoint under the skill root', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('nested', manifestJson({ id: 'nested', name: 'Nested', entrypoint: 'docs/BODY.md' }))
        .skillFile('nested', 'docs/BODY.md', BODY),
    );

    expect(expectBody(manager.resolveBody('nested')).entrypoint.declaredPath).toBe('docs/BODY.md');
  });

  it('reads the schema-v1 entrypoint object beside the legacy string (design §3.3)', () => {
    const manifest = manifestJson({ id: 'v1', name: 'V1' }, {
      entrypoint: { path: 'docs/BODY.md', format: 'markdown', contentDigest: sha256(BODY) },
    });
    mount(new Tree().initialized().projectManifest('v1', manifest).skillFile('v1', 'docs/BODY.md', BODY));

    expect(SkillPoolManager.validateSkillDefinition(manifest).valid).toBe(true);
    expect(manager.loadSkills().has('v1')).toBe(true);
    expect(expectBody(manager.resolveBody('v1')).entrypoint.content).toBe(BODY);
  });

  it('defaults to SKILL.md when no entrypoint is declared (back-compat)', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('bare', { id: 'bare', name: 'Bare' })
        .skillFile('bare', SKILL_MD, BODY),
    );

    expect(expectBody(manager.resolveBody('bare')).entrypoint.declaredPath).toBe(SKILL_MD);
  });

  it('resolves a package-only builtin from the builtin root, same code path', () => {
    mount(new Tree().initialized().builtinSkillMd('observability', BODY));

    const body = expectBody(manager.resolveBody('observability'));
    expect(body.layer).toBe('builtin');
    expect(body.entrypoint.content).toBe(BODY);
    expect(body.entrypoint.absolutePath).toBe(join(BUILTIN_SKILLS_DIR, 'observability', SKILL_MD));
  });

  it('HOLDs when the declared body does not exist', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('missing', manifestJson({ id: 'missing', name: 'Missing', entrypoint: 'GUIDE.md' }))
        .skillFile('missing', SKILL_MD, BODY),
    );

    const held = expectHold(manager.resolveBody('missing'), 'missing-file');
    expect(held.offendingPath).toBe('GUIDE.md');
  });

  it('HOLDs when the declared entrypoint is a directory, not a file', () => {
    const tree = new Tree()
      .initialized()
      .projectManifest('dir', manifestJson({ id: 'dir', name: 'Dir', entrypoint: 'docs' }));
    tree.dir(join(SKILLS_DIR, 'dir', 'docs'));
    mount(tree);

    expectHold(manager.resolveBody('dir'), 'missing-file');
  });
});

// ─── G2 — the package is atomic ─────────────────────────────────────────────

describe('522-010 · referenced-file authority (design §3.4 G2)', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  const CHECK = '#!/bin/sh\necho check\n';
  const DATA = '{"rules":[]}\n';

  function packagedTree(referencedFiles: unknown[]): Tree {
    return new Tree()
      .initialized()
      .projectManifest(
        'packaged',
        manifestJson({ id: 'packaged', name: 'Packaged' }, { referencedFiles }),
      )
      .skillFile('packaged', SKILL_MD, BODY)
      .skillFile('packaged', 'scripts/check.sh', CHECK)
      .skillFile('packaged', 'data/rules.json', DATA);
  }

  it('resolves entrypoint and referenced files as one package', () => {
    mount(
      packagedTree([
        { path: 'scripts/check.sh', role: 'script' },
        { path: 'data/rules.json', role: 'data' },
      ]),
    );

    const body = expectBody(manager.resolveBody('packaged'));
    expect(body.referencedFiles.map((f) => f.declaredPath)).toEqual([
      'scripts/check.sh',
      'data/rules.json',
    ]);
    expect(body.referencedFiles[0]!.content).toBe(CHECK);
    expect(body.referencedFiles[1]!.digest).toBe(sha256(DATA));
    expect(body.totalBytes).toBe(
      Buffer.byteLength(BODY + CHECK + DATA, 'utf8'),
    );
  });

  it('HOLDs the WHOLE package when one referenced file is missing — never a partial prompt', () => {
    mount(packagedTree([{ path: 'scripts/check.sh' }, { path: 'data/absent.json' }]));

    const held = expectHold(manager.resolveBody('packaged'), 'missing-file');
    expect(held.offendingPath).toBe('data/absent.json');
    expect(held.detail).toContain('referencedFiles[1]');
  });

  it('HOLDs an empty declared referenced path', () => {
    mount(packagedTree([{ path: '' }]));
    expectHold(manager.resolveBody('packaged'), 'invalid-declaration');
  });

  it('HOLDs a non-object referencedFiles entry at resolution (defence in depth)', () => {
    mount(packagedTree([]));
    const record = resolveSkillCatalog(ROOT).entries.find((e) => e.id === 'packaged')!;
    (record.definition as { referencedFiles?: unknown[] }).referencedFiles = ['scripts/check.sh'];
    expectHold(resolveSkillBody(record), 'invalid-declaration');
  });

  it('excludes a manifest whose referencedFiles shape is malformed, and reports it', () => {
    mount(packagedTree(['scripts/check.sh']));

    expect(manager.loadSkills().has('packaged')).toBe(false);
    expect(manager.getInvalidManifests()[0]!.errors.join(' ')).toContain('referencedFiles');
    expectHold(manager.resolveBody('packaged'), 'unknown-skill');
  });

  it('validates the referencedFiles shape at manifest level', () => {
    const good = manifestJson({ id: 'p', name: 'P' }, { referencedFiles: [{ path: 'a.md' }] });
    expect(SkillPoolManager.validateSkillDefinition(good).valid).toBe(true);

    for (const bad of [{ referencedFiles: 'a.md' }, { referencedFiles: [{ role: 'x' }] }, { referencedFiles: ['a.md'] }]) {
      const result = SkillPoolManager.validateSkillDefinition(manifestJson({ id: 'p', name: 'P' }, bad));
      expect(result.valid, JSON.stringify(bad)).toBe(false);
      expect(result.errors.join(' ')).toContain('referencedFiles');
    }
  });
});

// ─── Containment ────────────────────────────────────────────────────────────

describe('522-010 · containment is enforced on read (design §3.4)', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  const SECRET = 'BODY-CONTENT-SECRET=never-reaches-a-prompt\n';

  it('HOLDs a `../` escape in the entrypoint', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest(
          'escaper',
          manifestJson({ id: 'escaper', name: 'Escaper', entrypoint: '../../../secrets.env' }),
        )
        .file(OUTSIDE_PATH, SECRET),
    );

    const held = expectHold(manager.resolveBody('escaper'), 'path-escape');
    expect(JSON.stringify(held)).not.toContain('never-reaches-a-prompt');
    expect(vi.mocked(fs.readFileSync).mock.calls.map((c) => String(c[0]))).not.toContain(OUTSIDE_PATH);
  });

  it('HOLDs a `../` escape in a referenced file', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest(
          'refescaper',
          manifestJson({ id: 'refescaper', name: 'Ref Escaper' }, {
            referencedFiles: [{ path: '../../../secrets.env' }],
          }),
        )
        .skillFile('refescaper', SKILL_MD, BODY)
        .file(OUTSIDE_PATH, SECRET),
    );

    expectHold(manager.resolveBody('refescaper'), 'path-escape');
  });

  it('HOLDs an absolute declared path', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest(
          'absolute',
          manifestJson({ id: 'absolute', name: 'Absolute', entrypoint: OUTSIDE_PATH }),
        )
        .file(OUTSIDE_PATH, SECRET),
    );

    expectHold(manager.resolveBody('absolute'), 'path-escape');
  });

  it('HOLDs a symlink whose target leaves the skill root', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('linked', manifestJson({ id: 'linked', name: 'Linked' }))
        .file(OUTSIDE_PATH, SECRET)
        .link(join(SKILLS_DIR, 'linked', SKILL_MD), OUTSIDE_PATH),
    );

    const held = expectHold(manager.resolveBody('linked'), 'symlink-escape');
    expect(JSON.stringify(held)).not.toContain('never-reaches-a-prompt');
    expect(vi.mocked(fs.readFileSync).mock.calls.map((c) => String(c[0]))).not.toContain(OUTSIDE_PATH);
  });

  it('HOLDs a referenced file that symlinks out of the skill root', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest(
          'reflinked',
          manifestJson({ id: 'reflinked', name: 'Ref Linked' }, {
            referencedFiles: [{ path: 'scripts/check.sh' }],
          }),
        )
        .skillFile('reflinked', SKILL_MD, BODY)
        .file(OUTSIDE_PATH, SECRET)
        .link(join(SKILLS_DIR, 'reflinked', 'scripts', 'check.sh'), OUTSIDE_PATH),
    );

    expectHold(manager.resolveBody('reflinked'), 'symlink-escape');
  });

  it('still resolves a link that stays inside the skill root', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('innerlink', manifestJson({ id: 'innerlink', name: 'Inner Link' }))
        .skillFile('innerlink', 'docs/BODY.md', BODY)
        .link(join(SKILLS_DIR, 'innerlink', SKILL_MD), join(SKILLS_DIR, 'innerlink', 'docs', 'BODY.md')),
    );

    const body = expectBody(manager.resolveBody('innerlink'));
    expect(body.entrypoint.content).toBe(BODY);
    expect(body.entrypoint.absolutePath).toBe(join(SKILLS_DIR, 'innerlink', 'docs', 'BODY.md'));
  });
});

// ─── Budget (OWNER DECISION D8) ─────────────────────────────────────────────

describe('522-010 · package budget', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  it('ships HIGH, non-blocking defaults (D8) that today\'s manifests never hit', () => {
    expect(DEFAULT_SKILL_PACKAGE_BUDGET.maxFileBytes).toBeGreaterThanOrEqual(500 * 1024);
    expect(DEFAULT_SKILL_PACKAGE_BUDGET.maxTotalBytes).toBeGreaterThanOrEqual(
      DEFAULT_SKILL_PACKAGE_BUDGET.maxFileBytes,
    );
    expect(DEFAULT_SKILL_PACKAGE_BUDGET.maxFiles).toBeGreaterThan(1);

    mount(
      new Tree()
        .initialized()
        .projectManifest('normal', manifestJson({ id: 'normal', name: 'Normal' }))
        .skillFile('normal', SKILL_MD, BODY),
    );
    expect(manager.resolveBody('normal').ok).toBe(true);
  });

  it('HOLDs an over-budget single file', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('fat', manifestJson({ id: 'fat', name: 'Fat' }))
        .skillFile('fat', SKILL_MD, 'x'.repeat(4096)),
    );

    const held = expectHold(
      manager.resolveBody('fat', { maxFiles: 8, maxFileBytes: 1024, maxTotalBytes: 8192 }),
      'budget-exceeded',
    );
    expect(held.detail).toContain('per-file budget');
    // Refused on the stat, before the bytes were ever pulled into memory.
    expect(vi.mocked(fs.readFileSync).mock.calls.map((c) => String(c[0])))
      .not.toContain(join(SKILLS_DIR, 'fat', SKILL_MD));
  });

  it('HOLDs an over-budget package total', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('heavy', manifestJson({ id: 'heavy', name: 'Heavy' }, {
          referencedFiles: [{ path: 'a.md' }, { path: 'b.md' }],
        }))
        .skillFile('heavy', SKILL_MD, 'x'.repeat(400))
        .skillFile('heavy', 'a.md', 'y'.repeat(400))
        .skillFile('heavy', 'b.md', 'z'.repeat(400)),
    );

    const held = expectHold(
      manager.resolveBody('heavy', { maxFiles: 8, maxFileBytes: 1024, maxTotalBytes: 900 }),
      'budget-exceeded',
    );
    expect(held.detail).toContain('total budget');
  });

  it('HOLDs an over-count package before reading anything', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('many', manifestJson({ id: 'many', name: 'Many' }, {
          referencedFiles: [{ path: 'a.md' }, { path: 'b.md' }, { path: 'c.md' }],
        }))
        .skillFile('many', SKILL_MD, BODY)
        .skillFile('many', 'a.md', 'a')
        .skillFile('many', 'b.md', 'b')
        .skillFile('many', 'c.md', 'c'),
    );

    const held = expectHold(
      manager.resolveBody('many', { maxFiles: 2, maxFileBytes: 1024, maxTotalBytes: 8192 }),
      'budget-exceeded',
    );
    expect(held.detail).toContain('4 files');
    const skillRoot = join(SKILLS_DIR, 'many');
    const bodyReads = vi
      .mocked(fs.readFileSync)
      .mock.calls.map((c) => String(c[0]))
      .filter((p) => p.startsWith(skillRoot) && !p.endsWith(MANIFEST));
    expect(bodyReads).toEqual([]);
  });
});

// ─── Fail-closed gates before any read ──────────────────────────────────────

describe('522-010 · resolveBody fail-closed gates', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  it('HOLDs an unknown id and a non-flat id distinctly from a body', () => {
    mount(new Tree().initialized().projectManifest('known', manifestJson({ id: 'known', name: 'Known' })));

    expectHold(manager.resolveBody('never-installed'), 'unknown-skill');
    expectHold(manager.resolveBody('acme/secure-coding'), 'unknown-skill');
  });

  it('HOLDs a quarantined or retired id — withdrawn is unresolvable by any surface', () => {
    for (const state of ['quarantined', 'retired'] as const) {
      vi.clearAllMocks();
      mount(
        new Tree()
          .initialized()
          .projectManifest('secure-coding', manifestJson({ id: 'secure-coding', name: 'Secure Coding' }))
          .skillFile('secure-coding', SKILL_MD, BODY)
          .file(
            DISPOSITION_LEDGER_PATH,
            JSON.stringify({ version: 1, entries: { 'secure-coding': { state, reasonCode: 'sandbox-finding' } } }),
          ),
      );

      const held = expectHold(manager.resolveBody('secure-coding'), 'withdrawn');
      expect(held.detail).toContain(state);
      expect(held.detail).toContain('sandbox-finding');
      // The tombstone stays readable — withdrawn is a state, not a disappearance.
      expect(manager.getEffective('secure-coding')?.disposition.state).toBe(state);
    }
  });

  it('resolves a disabled skill — `enabled` is consumer-enforced, not a containment failure', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('off', manifestJson({ id: 'off', name: 'Off', enabled: false }))
        .skillFile('off', SKILL_MD, BODY),
    );

    expect(expectBody(manager.resolveBody('off')).entrypoint.content).toBe(BODY);
  });

  it('resolves a record handed in directly, without a second catalog pass', () => {
    mount(
      new Tree()
        .initialized()
        .projectManifest('direct', manifestJson({ id: 'direct', name: 'Direct', entrypoint: 'GUIDE.md' }))
        .skillFile('direct', 'GUIDE.md', BODY),
    );

    const record = resolveSkillCatalog(ROOT).entries.find((e) => e.id === 'direct')!;
    expect(expectBody(resolveSkillBody(record)).entrypoint.content).toBe(BODY);
  });
});

// ─── Back-compat: existing manifests keep loading unchanged ─────────────────

describe('522-010 · existing manifests keep loading unchanged (NO-GO guard)', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  it('keeps today\'s shape — string entrypoint, no referencedFiles — valid and loadable', () => {
    const today = manifestJson({ id: 'secure-coding', name: 'Secure Coding', entrypoint: SKILL_MD }, {
      source: 'builtin',
    });
    mount(
      new Tree()
        .initialized()
        .projectManifest('secure-coding', today)
        .skillFile('secure-coding', SKILL_MD, BODY),
    );

    expect(SkillPoolManager.validateSkillDefinition(today)).toEqual({ valid: true, errors: [] });
    expect(manager.loadSkills().get('secure-coding')?.entrypoint).toBe(SKILL_MD);
    expect(manager.getInvalidCount()).toBe(0);
    expect(expectBody(manager.resolveBody('secure-coding')).entrypoint.content).toBe(BODY);
  });

  it('still rejects an entrypoint that is neither a string nor a {path} object', () => {
    const result = SkillPoolManager.validateSkillDefinition(
      manifestJson({ id: 'p', name: 'P' }, { entrypoint: 42 }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('entrypoint');

    const objectResult = SkillPoolManager.validateSkillDefinition(
      manifestJson({ id: 'p', name: 'P' }, { entrypoint: { format: 'markdown' } }),
    );
    expect(objectResult.valid).toBe(false);
    expect(objectResult.errors.join(' ')).toContain('entrypoint.path');
  });
});
