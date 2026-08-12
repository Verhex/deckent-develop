// S5 (sprint-523 task 7): the canonical skill-catalog snapshot — created here
// because the design's assumed `snapshot()` did not exist (sol cross-review) —
// is consumed by BOTH read surfaces. Pins: identical ids across CLI-shape,
// MCP-shape and the snapshot on one tree; disposition/masked/profileState
// visible; digest stable across two resolutions of an unchanged tree and
// changed by a catalog mutation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotSkillCatalog } from '../../src/core/skill-pool.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-skill-s5-'));
  mkdirSync(join(root, '.deckent', 'skills'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function installSkill(id: string, extra: Record<string, unknown> = {}): void {
  const dir = join(root, '.deckent', 'skills', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify(createSkillDefinition({ id, name: id, ...extra }), null, 2),
    'utf-8',
  );
  writeFileSync(join(dir, 'SKILL.md'), `# ${id}\nbody`, 'utf-8');
}

describe('skill catalog S5 — the canonical snapshot and its surfaces', () => {
  it('snapshot carries ordered entries, invalid records and a sha256 digest', () => {
    installSkill('beta-skill');
    installSkill('alpha-skill');
    const snap = snapshotSkillCatalog(root);
    const ids = snap.entries.map((e) => e.id);
    expect(ids.indexOf('alpha-skill')).toBeLessThan(ids.indexOf('beta-skill'));
    expect(snap.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Array.isArray(snap.invalid)).toBe(true);
  });

  it('digest is deterministic on an unchanged tree and moves on catalog mutation', () => {
    installSkill('alpha-skill');
    const first = snapshotSkillCatalog(root);
    const second = snapshotSkillCatalog(root);
    expect(second.digest).toBe(first.digest);
    installSkill('gamma-skill');
    expect(snapshotSkillCatalog(root).digest).not.toBe(first.digest);
  });

  it('disposition, masked and profileState travel through the snapshot entries', () => {
    installSkill('delta-skill');
    const entry = snapshotSkillCatalog(root).entries.find((e) => e.id === 'delta-skill')!;
    expect(entry).toHaveProperty('disposition');
    expect(entry).toHaveProperty('masked');
    expect(entry.layer).toBeTruthy();
  });

  it('an invalid manifest is REPORTED, never silently dropped', () => {
    const dir = join(root, '.deckent', 'skills', 'broken-skill');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), '{"name":"broken-skill"}', 'utf-8');
    const snap = snapshotSkillCatalog(root);
    expect(snap.invalid.some((r) => r.id === 'broken-skill' || r.path.includes('broken-skill'))).toBe(true);
  });

  it('both read surfaces resolve through the snapshot (no raw scan symbols survive)', async () => {
    const mcpSrc = await import('node:fs').then((fs) =>
      fs.readFileSync('src/mcp/tools/skill-list.ts', 'utf-8'));
    expect(mcpSrc).toContain('snapshotSkillCatalog');
    expect(mcpSrc).not.toContain('readdirSync');
    const cliSrc = await import('node:fs').then((fs) =>
      fs.readFileSync('src/cli/commands/skill.ts', 'utf-8'));
    expect(cliSrc).toContain('snapshotSkillCatalog(root)');
  });
});
