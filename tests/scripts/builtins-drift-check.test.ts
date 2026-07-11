// Tests for scripts/builtins-drift-check.mjs — the MASTER-PLAN 502 (406-001 dilim-1)
// two-tree (`.deckent/{agents,skills}` vs `src/core/builtins/{agents,skills}`) drift
// inventory + no-new-drift ratchet gate.
//
// Hermetic: every fixture tree lives under mkdtempSync(tmpdir()), torn down in afterEach.
// The one exception (per project convention, mirrors lint-no-spawnsync.test.ts's "live
// baseline is in sync" style check) is a read-only sanity pass against the REAL repo
// trees — it never writes anywhere and asserts only structural invariants + the specific
// known-real drift example this task's goCriteria calls out as the "RED-önce" proof.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  listItemDirs,
  normalizeManifestForCompare,
  compareManifestJson,
  diffLines,
  compareTextFile,
  scanCategory,
  scanAll,
  flattenDriftKeys,
  diffAgainstBaseline,
  writeBaseline,
  loadBaseline,
  CATEGORIES,
} from '../../scripts/builtins-drift-check.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('../../scripts/builtins-drift-check.mjs', import.meta.url));

function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

describe('listItemDirs', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it('returns [] for a missing directory', () => {
    expect(listItemDirs(join(tmpdir(), 'does-not-exist-' + Math.random().toString(36)))).toEqual([]);
  });

  it('excludes archive/ and temp-* directories', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-list-'));
    for (const name of ['real-agent', 'archive', 'temp-foo', 'another-real']) {
      mkdirSync(join(tmpRoot, name), { recursive: true });
    }
    expect(listItemDirs(tmpRoot)).toEqual(['another-real', 'real-agent']);
  });

  it('ignores plain files, only lists directories', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-list-'));
    mkdirSync(join(tmpRoot, 'a-dir'));
    writeFileSync(join(tmpRoot, 'a-file.txt'), 'x');
    expect(listItemDirs(tmpRoot)).toEqual(['a-dir']);
  });
});

describe('normalizeManifestForCompare', () => {
  it('drops a top-level stats key', () => {
    const withStats = { id: 'x', stats: { totalUses: 99 } };
    const withoutStats = { id: 'x' };
    expect(normalizeManifestForCompare(withStats)).toEqual(normalizeManifestForCompare(withoutStats));
  });

  it('does NOT drop a nested key merely named stats-adjacent (only top-level "stats")', () => {
    const nested = { id: 'x', config: { stats: { keep: true } } };
    expect(normalizeManifestForCompare(nested)).toEqual({ config: { stats: { keep: true } }, id: 'x' });
  });

  it('is insensitive to key order (recursively)', () => {
    const a = { b: 1, a: { y: 2, x: 1 } };
    const b = { a: { x: 1, y: 2 }, b: 1 };
    expect(JSON.stringify(normalizeManifestForCompare(a))).toBe(JSON.stringify(normalizeManifestForCompare(b)));
  });
});

describe('compareManifestJson', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  function write(name: string, obj: unknown): string {
    const p = join(tmpRoot!, name);
    writeFileSync(p, JSON.stringify(obj, null, 2));
    return p;
  }

  it('treats stats-value-differences as equal (605 sidecar noise)', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-json-'));
    const a = write('a.json', { id: 'x', stats: { totalUses: 500 } });
    const b = write('b.json', { id: 'x', stats: { totalUses: 0 } });
    expect(compareManifestJson(a, b).equal).toBe(true);
  });

  it('treats stats-present-vs-stats-entirely-absent as equal (the real secure-coding shape)', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-json-'));
    const a = write('a.json', { id: 'secure-coding', entrypoint: 'SKILL.md', stats: { totalUses: 20 } });
    const b = write('b.json', { id: 'secure-coding', entrypoint: 'SKILL.md' });
    expect(compareManifestJson(a, b).equal).toBe(true);
  });

  it('flags a real non-stats content diff and names the differing key', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-json-'));
    const a = write('a.json', { id: 'secure-coding', entrypoint: 'SKILL.md' });
    const b = write('b.json', { id: 'secure-coding' });
    const result = compareManifestJson(a, b);
    expect(result.equal).toBe(false);
    expect(result.diffKeys).toEqual(['entrypoint']);
  });

  it('reports an error (not a throw) for invalid JSON', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-json-'));
    const a = join(tmpRoot, 'a.json');
    const b = write('b.json', { id: 'x' });
    writeFileSync(a, '{not valid json');
    const result = compareManifestJson(a, b);
    expect(result.equal).toBe(false);
    expect(result.error).toContain('a.json');
  });
});

describe('diffLines', () => {
  it('reports zero added/removed for identical text', () => {
    const r = diffLines('a\nb\nc', 'a\nb\nc');
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
  });

  it('detects a pure prepend (the real PROMPT.md frontmatter-block shape)', () => {
    const original = 'body line 1\nbody line 2';
    const withFrontmatter = '---\ndoc_rank: 50\nstatus: active\n---\n\nbody line 1\nbody line 2';
    const r = diffLines(original, withFrontmatter);
    expect(r.added).toBe(5);
    expect(r.removed).toBe(0);
  });

  it('detects a pure removal', () => {
    const r = diffLines('a\nb\nc', 'a\nc');
    expect(r.removed).toBe(1);
    expect(r.added).toBe(0);
  });

  it('caps the sample at `limit` entries but still counts the full total', () => {
    const a = Array.from({ length: 20 }, (_, i) => `orig-${i}`).join('\n');
    const b = Array.from({ length: 20 }, (_, i) => `new-${i}`).join('\n');
    const r = diffLines(a, b, 3);
    expect(r.sample.length).toBeLessThanOrEqual(3);
    expect(r.added).toBeGreaterThan(3);
  });
});

describe('compareTextFile', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it('equal for byte-identical files', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-text-'));
    writeFileSync(join(tmpRoot, 'a.md'), '# Title\nbody');
    writeFileSync(join(tmpRoot, 'b.md'), '# Title\nbody');
    expect(compareTextFile(join(tmpRoot, 'a.md'), join(tmpRoot, 'b.md')).equal).toBe(true);
  });

  it('not equal + line-diff detail for divergent files', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-text-'));
    writeFileSync(join(tmpRoot, 'a.md'), '# Title\nbody');
    writeFileSync(join(tmpRoot, 'b.md'), '# Title\nbody\nextra');
    const r = compareTextFile(join(tmpRoot, 'a.md'), join(tmpRoot, 'b.md'));
    expect(r.equal).toBe(false);
    expect(r.added).toBe(1);
  });
});

// ─── scanCategory: the full item-universe classification ──────────────────

function makeItem(root: string, side: 'deckent' | 'builtins', item: string, files: { manifest?: unknown; doc?: string }) {
  const dir = join(root, side, item);
  mkdirSync(dir, { recursive: true });
  if (files.manifest !== undefined) writeFileSync(join(dir, side === 'deckent' ? 'agent.json' : 'agent.json'), JSON.stringify(files.manifest));
  if (files.doc !== undefined) writeFileSync(join(dir, 'PROMPT.md'), files.doc);
}

describe('scanCategory', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  function fixtureCfg() {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-scan-'));
    return {
      deckentDir: join(tmpRoot, 'deckent'),
      builtinsDir: join(tmpRoot, 'builtins'),
      manifestFile: 'agent.json',
      docFile: 'PROMPT.md',
    };
  }

  it('classifies only-in-deckent, only-in-builtins, identical, content-diff, and excluded items', () => {
    const cfg = fixtureCfg();

    // only in .deckent
    makeItem(tmpRoot!, 'deckent', 'deckent-only', { manifest: { id: 'deckent-only' }, doc: 'body' });

    // only in builtins, AND missing its manifest there too (the real api-designer shape)
    makeItem(tmpRoot!, 'builtins', 'builtins-only', { doc: 'body' });

    // identical on both sides (after stats-strip)
    makeItem(tmpRoot!, 'deckent', 'twin', { manifest: { id: 'twin', stats: { totalUses: 5 } }, doc: 'same body' });
    makeItem(tmpRoot!, 'builtins', 'twin', { manifest: { id: 'twin', stats: { totalUses: 0 } }, doc: 'same body' });

    // real content-diff on both manifest and doc
    makeItem(tmpRoot!, 'deckent', 'drifted', { manifest: { id: 'drifted', entrypoint: 'PROMPT.md' }, doc: 'body v1' });
    makeItem(tmpRoot!, 'builtins', 'drifted', { manifest: { id: 'drifted' }, doc: 'body v2' });

    // excluded: a directory with neither manifest nor doc file on either side
    mkdirSync(join(tmpRoot!, 'deckent', 'not-a-catalog-item', 'unrelated-subdir'), { recursive: true });

    const result = scanCategory(cfg);

    expect(result.excluded).toEqual(['not-a-catalog-item']);

    expect(result.onlyInDeckent).toEqual([{ item: 'deckent-only', files: { manifest: true, doc: true } }]);
    expect(result.onlyInBuiltins).toEqual([{ item: 'builtins-only', files: { manifest: false, doc: true } }]);

    const items = result.commonDiffs.map((d) => `${d.item}/${d.file}`);
    expect(items).toContain('drifted/manifest');
    expect(items).toContain('drifted/doc');
    expect(items).not.toContain('twin/manifest');
    expect(items).not.toContain('twin/doc');

    const manifestDiff = result.commonDiffs.find((d) => d.item === 'drifted' && d.file === 'manifest');
    expect(manifestDiff?.kind).toBe('json');
    expect((manifestDiff?.detail as { diffKeys?: string[] }).diffKeys).toEqual(['entrypoint']);
  });

  it('flags a presence-mismatch file (manifest exists on one side only, both sides otherwise present)', () => {
    const cfg = fixtureCfg();
    makeItem(tmpRoot!, 'deckent', 'shared-item', { manifest: { id: 'shared-item' }, doc: 'body' });
    makeItem(tmpRoot!, 'builtins', 'shared-item', { doc: 'body' }); // manifest.json missing here (real api-design shape)

    const result = scanCategory(cfg);
    const diff = result.commonDiffs.find((d) => d.item === 'shared-item' && d.file === 'manifest');
    expect(diff?.kind).toBe('presence');
    expect((diff?.detail as { onlySide: string }).onlySide).toBe('deckent');
  });
});

// ─── baseline ratchet ───────────────────────────────────────────────────────

describe('flattenDriftKeys / diffAgainstBaseline', () => {
  const report = {
    agents: {
      excluded: [],
      onlyInDeckent: [{ item: 'a-only', files: { manifest: true, doc: true } }],
      onlyInBuiltins: [],
      commonDiffs: [{ item: 'b', file: 'doc', kind: 'text', detail: { added: 1, removed: 0 } }],
    },
  };

  it('produces stable, sorted keys', () => {
    const keys = flattenDriftKeys(report as never);
    expect(keys).toEqual(['agents::diff::b::doc', 'agents::only-a::a-only']);
  });

  it('finds no new/resolved keys when scan matches baseline exactly', () => {
    const baseline = { driftKeys: flattenDriftKeys(report as never) };
    const { newKeys, resolvedKeys } = diffAgainstBaseline(report as never, baseline);
    expect(newKeys).toEqual([]);
    expect(resolvedKeys).toEqual([]);
  });

  it('flags a key present in the live scan but absent from baseline as new', () => {
    const baseline = { driftKeys: ['agents::only-a::a-only'] };
    const { newKeys, resolvedKeys } = diffAgainstBaseline(report as never, baseline);
    expect(newKeys).toEqual(['agents::diff::b::doc']);
    expect(resolvedKeys).toEqual([]);
  });

  it('flags a baseline key no longer present in the live scan as resolved', () => {
    const baseline = { driftKeys: [...flattenDriftKeys(report as never), 'agents::only-b::long-gone'] };
    const { newKeys, resolvedKeys } = diffAgainstBaseline(report as never, baseline);
    expect(newKeys).toEqual([]);
    expect(resolvedKeys).toEqual(['agents::only-b::long-gone']);
  });
});

describe('writeBaseline / loadBaseline round-trip', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it('returns null for a missing baseline path', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-baseline-'));
    expect(loadBaseline(join(tmpRoot, 'nope.json'))).toBeNull();
  });

  it('writes a baseline that loadBaseline reads back with the same driftKeys', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-baseline-'));
    const baselinePath = join(tmpRoot, 'baseline.json');
    const report = {
      agents: {
        excluded: [],
        onlyInDeckent: [],
        onlyInBuiltins: [{ item: 'x', files: { manifest: false, doc: true } }],
        commonDiffs: [],
      },
    };
    writeBaseline(report as never, baselinePath);
    expect(existsSync(baselinePath)).toBe(true);
    const loaded = loadBaseline(baselinePath);
    expect(loaded.driftKeys).toEqual(['agents::only-b::x']);
  });
});

// ─── CLI exit-code contract (hermetic: async spawn, tmpdir baseline paths) ──

describe('CLI --check / --write exit codes', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it('--check exits 2 with a --write suggestion when the baseline file is missing', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-cli-'));
    const baselinePath = join(tmpRoot, 'missing-baseline.json');
    const { code, stderr } = await runCli(['--check', '--baseline', baselinePath]);
    expect(code).toBe(2);
    expect(stderr).toContain('--write');
  });

  it('--write then --check round-trips clean (exit 0) against the live repo trees', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-cli-'));
    const baselinePath = join(tmpRoot, 'baseline.json');
    const write = await runCli(['--write', '--baseline', baselinePath]);
    expect(write.code).toBe(0);
    expect(existsSync(baselinePath)).toBe(true);

    const check = await runCli(['--check', '--baseline', baselinePath]);
    expect(check.code).toBe(0);
    expect(check.stdout).toContain('no new drift');
  });

  it('--check exits 1 when the live baseline is missing a key the current scan reports', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'drift-cli-'));
    const baselinePath = join(tmpRoot, 'stale-baseline.json');
    // A baseline with driftKeys that do NOT include the real, currently-live
    // secure-coding manifest drift (see the RED-önce block below) — so --check
    // must treat it as brand-new and fail.
    writeFileSync(baselinePath, JSON.stringify({ driftKeys: [] }));
    const { code, stderr } = await runCli(['--check', '--baseline', baselinePath]);
    expect(code).toBe(1);
    expect(stderr).toContain('new drift item');
  });
});

// ─── RED-önce: proof against the REAL repo trees (read-only, no writes) ────
//
// This section intentionally reads the actual `.deckent/{agents,skills}` vs
// `src/core/builtins/{agents,skills}` trees — no baseline file is written (that
// path is outside this task's write scope; see docs/analysis/builtins-drift-
// inventory-2026-07-11.md). It proves the script catches the specific known-real
// drift example this task calls out, and stays structurally sound end-to-end.

describe('live two-tree scan (real repo, read-only)', () => {
  it('does not throw and returns the expected category shape', () => {
    expect(() => scanAll(CATEGORIES)).not.toThrow();
    const report = scanAll(CATEGORIES);
    expect(Object.keys(report).sort()).toEqual(['agents', 'skills']);
    for (const cat of Object.values(report)) {
      expect(Array.isArray(cat.excluded)).toBe(true);
      expect(Array.isArray(cat.onlyInDeckent)).toBe(true);
      expect(Array.isArray(cat.onlyInBuiltins)).toBe(true);
      expect(Array.isArray(cat.commonDiffs)).toBe(true);
    }
  });

  it('excludes .deckent/skills/docs (a memory-export dir, not a real skill manifest)', () => {
    const report = scanAll(CATEGORIES);
    expect(report.skills.excluded).toContain('docs');
  });

  it('secure-coding manifest drift is CLOSED — the two trees agree (Alperen karar-turu merge, 2026-07-11)', () => {
    // Bu test eskiden canlı-drift'i (builtins'te eksik `entrypoint`) RED-önce kanıtı olarak
    // pinliyordu; 502 karar-turu merge'i o gap'i kapattı. Test artık TERSİNİ pinler:
    // secure-coding iki ağaçta manifest-eşit kalmalı (yeniden-drift = burada kırmızı).
    const report = scanAll(CATEGORIES);
    const secureCodingDiff = report.skills.commonDiffs.find((d) => d.item === 'secure-coding' && d.file === 'manifest');
    expect(secureCodingDiff, 'secure-coding manifest iki-ağaçta yeniden drift etti!').toBeUndefined();
  });
});
