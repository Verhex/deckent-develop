/**
 * Tests for skill command improvements (task-057-012):
 * E) Git install checksum
 * F) Version pinning (parseGitSource)
 * G) skill update command
 * H) --stats flag in skill info
 * I) node_modules exclude on local install
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';

const testRoot = join(tmpdir(), `deckent-skill-impr-${Date.now()}`);

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
}));

const output: string[] = [];
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (msg: string) => output.push(msg),
  printError: (err: unknown) => output.push(String(err instanceof Error ? err.message : err)),
  formatTable: (headers: string[], rows: string[][]) =>
    [headers.join('|'), ...rows.map(r => r.join('|'))].join('\n'),
}));

import {
  registerSkill,
  parseGitSource,
  computeDirectoryHash,
} from '../../../src/cli/commands/skill.js';

function makeSkill(name: string, overrides: Record<string, unknown> = {}) {
  const skillDir = join(testRoot, '.deckent/skills', name);
  mkdirSync(skillDir, { recursive: true });
  const manifest = {
    id: name,
    name,
    version: '1.0.0',
    description: `Skill ${name}`,
    entrypoint: 'SKILL.md',
    category: 'tool',
    triggers: ['test'],
    stackDetection: { files: [], dependencies: [], commands: [] },
    composableWith: [],
    priority: 0,
    promptInjection: { position: 'append', maxTokens: 1500 },
    enabled: true,
    stats: { totalUses: 5, successRate: 0.9, avgCoverage: 85, lastUsedInSprint: 'sprint-010' },
    ...overrides,
  };
  writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(skillDir, 'SKILL.md'), '# Skill content');
  return skillDir;
}

async function run(args: string[]) {
  output.length = 0;
  process.exitCode = undefined;
  const program = new Command();
  program.exitOverride();
  registerSkill(program);
  try {
    await program.parseAsync(['node', 'deckent', ...args]);
  } catch {
    // commander exitOverride
  }
}

describe('skill improvements', () => {
  beforeEach(() => {
    mkdirSync(join(testRoot, '.deckent/skills'), { recursive: true });
    output.length = 0;
  });

  afterEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
  });

  // ─── E) checksum ────────────────────────────────────────────────────────

  describe('E: computeDirectoryHash', () => {
    it('returns a 64-char hex string (SHA-256)', () => {
      const tmpDir = join(tmpdir(), `hash-e-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, 'file.txt'), 'hello');
      const hash = computeDirectoryHash(tmpDir);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('is deterministic for same content', () => {
      const tmpDir = join(tmpdir(), `hash-det-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, 'a.txt'), 'content-a');
      writeFileSync(join(tmpDir, 'b.txt'), 'content-b');
      const h1 = computeDirectoryHash(tmpDir);
      const h2 = computeDirectoryHash(tmpDir);
      expect(h1).toBe(h2);
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('differs for different content', () => {
      const d1 = join(tmpdir(), `hash-d1-${Date.now()}`);
      const d2 = join(tmpdir(), `hash-d2-${Date.now()}`);
      mkdirSync(d1, { recursive: true });
      mkdirSync(d2, { recursive: true });
      writeFileSync(join(d1, 'f.txt'), 'content-1');
      writeFileSync(join(d2, 'f.txt'), 'content-2');
      expect(computeDirectoryHash(d1)).not.toBe(computeDirectoryHash(d2));
      rmSync(d1, { recursive: true, force: true });
      rmSync(d2, { recursive: true, force: true });
    });
  });

  // ─── F) parseGitSource (version pinning) ───────────────────────────────

  describe('F: parseGitSource', () => {
    it('parses URL with # version pin', () => {
      const r = parseGitSource('https://github.com/user/repo.git#v1.2.3');
      expect(r.url).toBe('https://github.com/user/repo.git');
      expect(r.ref).toBe('v1.2.3');
    });

    it('parses URL without version pin', () => {
      const r = parseGitSource('https://github.com/user/repo.git');
      expect(r.url).toBe('https://github.com/user/repo.git');
      expect(r.ref).toBeUndefined();
    });

    it('does not treat git@github.com: as version split', () => {
      const r = parseGitSource('git@github.com:user/repo.git');
      expect(r.url).toBe('git@github.com:user/repo.git');
      expect(r.ref).toBeUndefined();
    });

    it('parses @ version suffix on https URL', () => {
      const r = parseGitSource('https://github.com/user/repo@v2.0.0');
      expect(r.url).toBe('https://github.com/user/repo');
      expect(r.ref).toBe('v2.0.0');
    });

    it('parses branch name with # syntax', () => {
      const r = parseGitSource('https://github.com/user/repo#main');
      expect(r.url).toBe('https://github.com/user/repo');
      expect(r.ref).toBe('main');
    });
  });

  // ─── G) skill update command ────────────────────────────────────────────

  describe('G: skill update', () => {
    it('errors when skill does not exist', async () => {
      await run(['skill', 'update', 'nonexistent']);
      expect(output.some(o => o.includes('not found'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    it('errors when skill has no source metadata', async () => {
      makeSkill('no-source');
      // no .source.json present
      await run(['skill', 'update', 'no-source']);
      expect(output.some(o => o.includes('source metadata') || o.includes('Cannot update'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    it('errors gracefully when local source no longer exists', async () => {
      const skillDir = makeSkill('orphan-skill');
      // Create .source.json pointing to non-existent path
      writeFileSync(join(skillDir, '.source.json'), JSON.stringify({
        source: '/tmp/nonexistent-source-dir',
        type: 'local',
        installedAt: '2026-01-01T00:00:00.000Z',
        checksum: 'abc123',
      }));
      await run(['skill', 'update', 'orphan-skill']);
      expect(output.some(o => o.includes('no longer exists') || o.includes('not found'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });
  });

  // ─── H) --stats flag in skill info ─────────────────────────────────────

  describe('H: skill info --stats', () => {
    it('shows usage stats when --stats flag given', async () => {
      makeSkill('stats-skill');
      await run(['skill', 'info', 'stats-skill', '--stats']);
      expect(output.some(o => o.includes('Total uses') || o.includes('5'))).toBe(true);
      expect(output.some(o => o.includes('90%') || o.includes('success') || o.includes('Success'))).toBe(true);
    });

    it('shows the truth-source usage statistics with --stats', async () => {
      // Catalog-stats truth (7014): --stats reads readCatalogStats — the
      // OutcomeTracker-derived store — never the manifest's self-declared
      // numbers. A fresh skill with no recorded outcomes shows zero/never.
      makeSkill('cov-skill');
      await run(['skill', 'info', 'cov-skill', '--stats']);
      expect(output.some(o => o.includes('Usage Statistics'))).toBe(true);
      expect(output.some(o => o.includes('Total uses:'))).toBe(true);
    });

    it('does not show stats section without --stats flag', async () => {
      makeSkill('no-stats-skill');
      await run(['skill', 'info', 'no-stats-skill']);
      expect(output.some(o => o.includes('Usage Statistics'))).toBe(false);
    });

    it('shows last sprint with --stats (truth store, never manifest)', async () => {
      // Catalog-stats truth (7014): the manifest's own lastUsedInSprint is not
      // consulted; with no truth-store record the honest answer is 'never'.
      makeSkill('sprint-skill');
      await run(['skill', 'info', 'sprint-skill', '--stats']);
      expect(output.some(o => o.includes('Last sprint:') && o.includes('never'))).toBe(true);
    });
  });

  // ─── I) node_modules exclude ─────────────────────────────────────────────

  describe('I: node_modules exclude on local install', () => {
    it('excludes node_modules when installing from local path', async () => {
      const sourceDir = join(tmpdir(), `source-skill-i-${Date.now()}`);
      mkdirSync(join(sourceDir, 'node_modules/some-pkg'), { recursive: true });
      writeFileSync(join(sourceDir, 'node_modules/some-pkg/index.js'), 'module.exports = {}');
      const manifest = {
        id: 'no-nm-skill',
        name: 'no-nm-skill',
        version: '1.0.0',
        description: 'Test skill',
        entrypoint: 'SKILL.md',
        category: 'tool',
        triggers: [],
        stackDetection: { files: [], dependencies: [], commands: [] },
        composableWith: [],
        priority: 0,
        promptInjection: { position: 'append', maxTokens: 1500 },
        enabled: true,
        stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
      };
      writeFileSync(join(sourceDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      writeFileSync(join(sourceDir, 'SKILL.md'), '# Test');

      await run(['skill', 'install', sourceDir]);

      const targetDir = join(testRoot, '.deckent/skills/no-nm-skill');
      expect(existsSync(targetDir)).toBe(true);
      expect(existsSync(join(targetDir, 'node_modules'))).toBe(false);
      expect(existsSync(join(targetDir, 'manifest.json'))).toBe(true);

      rmSync(sourceDir, { recursive: true, force: true });
    });

    it('saves .source.json after local install', async () => {
      const sourceDir = join(tmpdir(), `source-meta-${Date.now()}`);
      mkdirSync(sourceDir, { recursive: true });
      const manifest = {
        id: 'meta-skill',
        name: 'meta-skill',
        version: '1.0.0',
        description: 'Meta test',
        entrypoint: 'SKILL.md',
        category: 'tool',
        triggers: [],
        stackDetection: { files: [], dependencies: [], commands: [] },
        composableWith: [],
        priority: 0,
        promptInjection: { position: 'append', maxTokens: 1500 },
        enabled: true,
        stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
      };
      writeFileSync(join(sourceDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      writeFileSync(join(sourceDir, 'SKILL.md'), '# Meta');

      await run(['skill', 'install', sourceDir]);

      const targetDir = join(testRoot, '.deckent/skills/meta-skill');
      const metaPath = join(targetDir, '.source.json');
      expect(existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      expect(meta.type).toBe('local');
      expect(meta.checksum).toBeDefined();

      rmSync(sourceDir, { recursive: true, force: true });
    });

    it('shows checksum in output after install', async () => {
      const sourceDir = join(tmpdir(), `checksum-out-${Date.now()}`);
      mkdirSync(sourceDir, { recursive: true });
      const manifest = {
        id: 'checksum-skill',
        name: 'checksum-skill',
        version: '1.0.0',
        description: 'Checksum test',
        entrypoint: 'SKILL.md',
        category: 'tool',
        triggers: [],
        stackDetection: { files: [], dependencies: [], commands: [] },
        composableWith: [],
        priority: 0,
        promptInjection: { position: 'append', maxTokens: 1500 },
        enabled: true,
        stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
      };
      writeFileSync(join(sourceDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      writeFileSync(join(sourceDir, 'SKILL.md'), '# Checksum');

      await run(['skill', 'install', sourceDir]);

      expect(output.some(o => o.includes('Checksum') || o.includes('SHA-256'))).toBe(true);

      rmSync(sourceDir, { recursive: true, force: true });
    });
  });
});
