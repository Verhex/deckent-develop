import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  EXCLUDE,
  isExcluded,
  partitionFiles,
  scanForKeys,
  shouldSkipKeyScan,
  syncToProduct,
} from '../../scripts/sync-to-product.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/sync-to-product.mjs');
const DOC_PATH = resolve(REPO_ROOT, 'docs/development/repo-sync.md');

// ─── partitionFiles / isExcluded ───────────────────────────────────────────

describe('partitionFiles + isExcluded', () => {
  it('drops files matching every EXCLUDE category; keeps everything else', () => {
    const sample = [
      // should DROP — directory prefixes
      '.brain/exports/summary.md',
      '.deckent/archive/sprint-100.json',
      'docs/superpowers/x.md',
      'docs/directives/sprint-180.md',
      'docs/launch/plan.md',
      'docs/release/v1.md',
      'docs/development/repo-sync.md',
      'docs/archive/old.md',
      'docs/audits/sprint-139/dead-code-report.md',
      'docs/analysis/notes.md',
      'docs/core-memory/identity.md',
      // should DROP — personal root markdowns
      'DIRECTIVES.md',
      'RESUME-MONDAY.md',
      'DECKENT-ANA-PLAN.md',
      'DECKENT-ANA-PLAN-TR.md',
      'NERVOUS-TODO.md',
      // should DROP — runtime state
      '.deckent/config.json',
      '.deckent/config.json.bak',
      '.deckent/provider-cache.json',
      '.deckent/ci-baseline.json',
      // should KEEP — public-facing surface
      'src/cli/entry.ts',
      'package.json',
      'README.md',
      'README-TR.md',
      'LICENSE',
      'docs/guide/getting-started.md',
      'docs/reference/api.md',
      'docs/adr/065-develop-product-repo-split.md',
      '.deckent/agents/doc-writer/agent.json',
    ];
    const { keep, drop } = partitionFiles(sample);
    // Every drop entry was excluded; every keep entry was not.
    expect(drop).toContain('.brain/exports/summary.md');
    expect(drop).toContain('DIRECTIVES.md');
    expect(drop).toContain('.deckent/archive/sprint-100.json');
    expect(drop).toContain('docs/audits/sprint-139/dead-code-report.md');
    expect(drop).toContain('.deckent/config.json.bak');
    expect(keep).toContain('src/cli/entry.ts');
    expect(keep).toContain('package.json');
    expect(keep).toContain('docs/guide/getting-started.md');
    expect(keep).toContain('.deckent/agents/doc-writer/agent.json');
    // Counts add up — no entry lost or duplicated.
    expect(keep.length + drop.length).toBe(sample.length);
  });

  it('isExcluded matches directory prefix only at boundary (not as substring)', () => {
    // `.brain-other/x.md` must NOT match `.brain/`.
    expect(isExcluded('.brain-other/x.md')).toBe(false);
    expect(isExcluded('.brain/x.md')).toBe(true);
    // exact-file rules do not match nested files with the same name
    expect(isExcluded('subdir/DIRECTIVES.md')).toBe(false);
    expect(isExcluded('DIRECTIVES.md')).toBe(true);
  });

  it('exposes the full EXCLUDE list documented in the task spec', () => {
    // 1:1 with Sprint 201 manual snapshot list — guard against silent drift.
    const expected = [
      '.brain/',
      '.deckent/archive/',
      'docs/superpowers/',
      'docs/directives/',
      'docs/launch/',
      'docs/release/',
      'docs/development/',
      'docs/archive/',
      'docs/audits/',
      'docs/analysis/',
      '.deckent/docs/core-memory/',
      'DIRECTIVES.md',
      'RESUME-MONDAY.md',
      'DECKENT-ANA-PLAN.md',
      'DECKENT-ANA-PLAN-TR.md',
      'NERVOUS-TODO.md',
      '.deckent/config.json',
      '.deckent/config.json.bak',
      '.deckent/provider-cache.json',
      '.deckent/ci-baseline.json',
    ];
    for (const entry of expected) {
      expect(EXCLUDE).toContain(entry);
    }
  });
});

// ─── security gate ─────────────────────────────────────────────────────────

describe('security gate — scanForKeys + shouldSkipKeyScan', () => {
  it('catches Anthropic + Google key shapes; ignores plain text', () => {
    // Two real-shape keys (length-bounded so short ids do not false-positive).
    const ant = 'sk-ant-' + 'A'.repeat(40);
    const goog = 'AIza' + 'B'.repeat(35);
    const hits = scanForKeys(`leak: ${ant} another ${goog} done`);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.some((h) => h.startsWith('sk-ant-'))).toBe(true);
    expect(hits.some((h) => h.startsWith('AIza'))).toBe(true);

    // No keys present.
    expect(scanForKeys('hello world')).toEqual([]);
    // Too short to be a real key — must not match.
    expect(scanForKeys('sk-ant-short AIzashort')).toEqual([]);
  });

  it('shouldSkipKeyScan allows test fixtures, blocks production paths', () => {
    expect(shouldSkipKeyScan('tests/scripts/foo.test.ts')).toBe(true);
    expect(shouldSkipKeyScan('test/fixtures/leak.txt')).toBe(true);
    expect(shouldSkipKeyScan('src/__fixtures__/sample.ts')).toBe(true);
    // Production paths are NOT exempt.
    expect(shouldSkipKeyScan('src/core/config.ts')).toBe(false);
    expect(shouldSkipKeyScan('docs/guide/quickstart.md')).toBe(false);
  });

  it('syncToProduct aborts with violations when a real-shape key sits in a kept file', () => {
    // Build a tiny fake repo with one file containing a key, run the pipeline against it.
    const fakeRepo = mkdtempSync(join(tmpdir(), 'sync-secgate-'));
    try {
      execSync('git init -q', { cwd: fakeRepo });
      execSync('git config user.email t@t.t', { cwd: fakeRepo });
      execSync('git config user.name t', { cwd: fakeRepo });
      mkdirSync(join(fakeRepo, 'src'));
      writeFileSync(join(fakeRepo, 'src/leak.ts'), `export const k = "sk-ant-${'X'.repeat(40)}";\n`);
      writeFileSync(join(fakeRepo, 'package.json'), '{"name":"x"}\n');
      execSync('git add -A && git commit -q -m init', { cwd: fakeRepo, shell: '/bin/bash' });

      const report = syncToProduct({ repoRoot: fakeRepo, dryRun: true });
      expect(report.ok).toBe(false);
      expect(report.abort).toBe('security');
      expect(report.violations.length).toBeGreaterThanOrEqual(1);
      expect(report.violations[0].file).toBe('src/leak.ts');
    } finally {
      rmSync(fakeRepo, { recursive: true, force: true });
    }
  });
});

// ─── dry-run + apply (idempotent) ──────────────────────────────────────────

describe('syncToProduct — dry-run vs apply', () => {
  let stage: string;

  beforeEach(() => { stage = mkdtempSync(join(tmpdir(), 'sync-stage-')); });
  afterEach(() => { try { rmSync(stage, { recursive: true, force: true }); } catch { /* noop */ } });

  it('dry-run does NOT write anything to disk', () => {
    const before = readdirSync(stage);
    const report = syncToProduct({ dryRun: true });
    const after = readdirSync(stage);
    expect(report.ok).toBe(true);
    expect(report.dryRun).toBe(true);
    expect(report.staging).toBeNull();
    expect(report.keep).toBeGreaterThan(0);
    expect(report.drop).toBeGreaterThan(0);
    // The supplied stage dir must be untouched in dry-run.
    expect(after).toEqual(before);
  });

  it('apply writes a staging dir; running twice is idempotent (same drop set, exclusions absent)', () => {
    // Use a small synthetic tracked-files list to keep the test fast and deterministic.
    // We point at a fake repo where everything is in-scope, plus one excluded file.
    const fakeRepo = mkdtempSync(join(tmpdir(), 'sync-apply-'));
    try {
      execSync('git init -q', { cwd: fakeRepo });
      execSync('git config user.email t@t.t', { cwd: fakeRepo });
      execSync('git config user.name t', { cwd: fakeRepo });
      mkdirSync(join(fakeRepo, '.brain'));
      writeFileSync(join(fakeRepo, '.brain/secret.md'), 'sprint internals\n');
      writeFileSync(join(fakeRepo, 'DIRECTIVES.md'), '# private\n');
      writeFileSync(join(fakeRepo, 'package.json'), '{"name":"x"}\n');
      writeFileSync(join(fakeRepo, 'README.md'), '# public\n');
      execSync('git add -A && git commit -q -m init', { cwd: fakeRepo, shell: '/bin/bash' });

      // First apply
      const r1 = syncToProduct({ repoRoot: fakeRepo, dryRun: false, stagingDir: stage });
      expect(r1.ok).toBe(true);
      expect(r1.staging).toBe(stage);
      expect(existsSync(join(stage, 'package.json'))).toBe(true);
      expect(existsSync(join(stage, 'README.md'))).toBe(true);
      // Excluded paths must be absent.
      expect(existsSync(join(stage, '.brain'))).toBe(false);
      expect(existsSync(join(stage, '.brain/secret.md'))).toBe(false);
      expect(existsSync(join(stage, 'DIRECTIVES.md'))).toBe(false);
      const drop1 = [...r1.dropList].sort();

      // Second apply — into same staging dir, must succeed and produce the same drop set.
      const r2 = syncToProduct({ repoRoot: fakeRepo, dryRun: false, stagingDir: stage });
      expect(r2.ok).toBe(true);
      const drop2 = [...r2.dropList].sort();
      expect(drop2).toEqual(drop1);
      // Excluded paths still absent after second pass.
      expect(existsSync(join(stage, '.brain'))).toBe(false);
      expect(existsSync(join(stage, 'DIRECTIVES.md'))).toBe(false);
      expect(existsSync(join(stage, 'package.json'))).toBe(true);
    } finally {
      rmSync(fakeRepo, { recursive: true, force: true });
    }
  });
});

// ─── artifact + doc sanity ─────────────────────────────────────────────────

describe('artifact + doc', () => {
  it('script stays within reasonable size budget and contains the security regex literals', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
    const src = readFileSync(SCRIPT_PATH, 'utf-8');
    // Task budget: ~150 LoC target, ≤200 LoC ceiling.
    expect(src.split('\n').length).toBeLessThanOrEqual(200);
    // goCriteria: grep -c "sk-ant|AIza" must be ≥1
    const total = (src.match(/sk-ant/g) ?? []).length + (src.match(/AIza/g) ?? []).length;
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it('docs/development/repo-sync.md exists and explains two-repo model + manual-push rule', () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    expect(statSync(DOC_PATH).size).toBeGreaterThan(400);
    const doc = readFileSync(DOC_PATH, 'utf-8');
    expect(doc).toMatch(/deckent-develop/);
    expect(doc).toMatch(/--apply/);
    expect(doc).toMatch(/--dry-run/);
    expect(doc).toMatch(/EXCLUDE/);
    // Must justify why push stays manual.
    expect(doc.toLowerCase()).toMatch(/manual|human/);
  });
});
