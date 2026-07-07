import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { loadAllSkills } from '../../src/cli/commands/skill.js';

// born-558: `loadAllSkills()` JSON.parse'd manifests verbatim, and `skill
// list`'s render called `s.triggers.slice(0, 3)` unconditionally. A
// v2-schema manifest (manifestVersion: 2, routes via `activation.rules`
// instead of literal keywords) that omits `triggers` entirely — mirroring
// the shipped `.deckent/skills/secure-coding/manifest.json` — made
// `s.triggers` `undefined`, so `.slice` threw and `deckent skill list`
// exited 1.

const V2_MINIMAL_MANIFEST = {
  id: 'v2-minimal',
  name: 'V2 Minimal',
  version: '0.1.0',
  description: 'A v2 manifest with no triggers array',
  manifestVersion: 2,
  activation: {
    rules: [
      { when: { 'intent.primary': 'security' }, score: 10 },
      { when: { 'intent.primary': 'implementation' }, score: 3 },
    ],
    exclude: [],
    minScore: 5,
  },
  enabled: true,
};

// Mirrors the actually-shipped secure-coding manifest: also omits category,
// priority, entrypoint, stackDetection, composableWith, promptInjection.
const V2_BARE_MANIFEST = {
  id: 'v2-bare',
  name: 'V2 Bare',
  version: '0.1.0',
  description: 'Bare v2 manifest',
  manifestVersion: 2,
  activation: { rules: [{ when: { 'intent.primary': 'security' }, score: 10 }], exclude: [], minScore: 5 },
  enabled: true,
};

const V1_MANIFEST = {
  id: 'v1-classic',
  name: 'V1 Classic',
  version: '0.1.0',
  description: 'A classic v1 manifest',
  entrypoint: 'SKILL.md',
  category: 'language',
  triggers: ['ts', 'typescript'],
  stackDetection: { files: [], dependencies: [], commands: [] },
  composableWith: [],
  priority: 5,
  promptInjection: { position: 'append', maxTokens: 1500 },
  enabled: true,
  stats: { totalUses: 1, successCount: 1, successRate: 1, avgCoverage: 0, lastUsedInSprint: '' },
};

function writeManifest(skillsDir: string, id: string, manifest: unknown): void {
  const dir = join(skillsDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ─── loadAllSkills(): real fs, hermetic tmpdir ──────────────────────────────

describe('loadAllSkills — v2 manifest normalization (born-558)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'skill-list-v2-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('does not throw for a v2 manifest with no triggers array', () => {
    writeManifest(join(root, '.deckent/skills'), 'v2-minimal', V2_MINIMAL_MANIFEST);
    expect(() => loadAllSkills(root)).not.toThrow();
  });

  it('always returns a triggers array, derived from activation.rules when missing', () => {
    writeManifest(join(root, '.deckent/skills'), 'v2-minimal', V2_MINIMAL_MANIFEST);
    const [skill] = loadAllSkills(root);
    expect(Array.isArray(skill.triggers)).toBe(true);
    expect([...skill.triggers].sort()).toEqual(['implementation', 'security']);
  });

  it('renders skill.triggers.slice(0, 3) safely — the exact call site that crashed', () => {
    writeManifest(join(root, '.deckent/skills'), 'v2-bare', V2_BARE_MANIFEST);
    const [skill] = loadAllSkills(root);
    expect(() => skill.triggers.slice(0, 3).join(', ')).not.toThrow();
  });

  it('safe-defaults category, enabled, priority, name, description for a bare v2 manifest', () => {
    writeManifest(join(root, '.deckent/skills'), 'v2-bare', V2_BARE_MANIFEST);
    const [skill] = loadAllSkills(root);
    expect(skill.category).toBe('domain');
    expect(skill.enabled).toBe(true);
    expect(skill.priority).toBe(0);
    expect(skill.name).toBe('V2 Bare');
    expect(skill.description).toBe('Bare v2 manifest');
  });

  it('falls back triggers to [] when there is no activation config at all', () => {
    writeManifest(join(root, '.deckent/skills'), 'v2-no-activation', {
      id: 'v2-no-activation',
      name: 'No Activation',
      manifestVersion: 2,
    });
    const [skill] = loadAllSkills(root);
    expect(skill.triggers).toEqual([]);
    expect(skill.name).toBe('No Activation');
  });

  it('falls back name to id when a v2 manifest omits it', () => {
    writeManifest(join(root, '.deckent/skills'), 'v2-noname', {
      id: 'v2-noname',
      manifestVersion: 2,
    });
    const [skill] = loadAllSkills(root);
    expect(skill.name).toBe('v2-noname');
    expect(skill.description).toBe('');
  });

  it('leaves a well-formed v1 manifest unchanged (no regression)', () => {
    writeManifest(join(root, '.deckent/skills'), 'v1-classic', V1_MANIFEST);
    const [skill] = loadAllSkills(root);
    expect(skill.triggers).toEqual(['ts', 'typescript']);
    expect(skill.category).toBe('language');
    expect(skill.priority).toBe(5);
    expect(skill.name).toBe('V1 Classic');
  });

  it('loads a mix of v1 and v2-bare manifests without throwing', () => {
    writeManifest(join(root, '.deckent/skills'), 'v1-classic', V1_MANIFEST);
    writeManifest(join(root, '.deckent/skills'), 'v2-bare', V2_BARE_MANIFEST);
    const skills = loadAllSkills(root);
    expect(skills).toHaveLength(2);
    expect(skills.every((s) => Array.isArray(s.triggers))).toBe(true);
  });
});

// ─── `deckent skill list` CLI action: real fs, only resolveProjectRoot ─────
// mocked (mirrors tests/cli/commands/skill-crud.test.ts's established
// pattern) — proves the full command path exits clean on a v2 manifest.

const cliTestRoot = join(tmpdir(), `deckent-skill-list-v2-${process.pid}`);

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => cliTestRoot,
}));

vi.mock('../../src/cli/commands/skill-marketplace.js', () => ({
  registerSkillMarketplace: () => {},
}));

const { registerSkill } = await import('../../src/cli/commands/skill.js');

async function runSkillListCommand(args: string[]): Promise<string> {
  const program = new Command();
  program.exitOverride();
  registerSkill(program);

  const chunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (chunk: unknown) => {
    if (typeof chunk === 'string') chunks.push(chunk);
    return true;
  };
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on --help / exit
  } finally {
    process.stdout.write = origWrite;
  }
  return chunks.join('');
}

describe('deckent skill list — v2 manifest CLI action (born-558)', () => {
  beforeEach(() => {
    mkdirSync(join(cliTestRoot, '.deckent/skills'), { recursive: true });
    process.exitCode = undefined;
  });

  afterEach(() => {
    if (existsSync(cliTestRoot)) rmSync(cliTestRoot, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('exits clean (process.exitCode stays unset) for a v2 manifest missing triggers', async () => {
    writeManifest(join(cliTestRoot, '.deckent/skills'), 'secure-coding-like', V2_BARE_MANIFEST);

    await runSkillListCommand(['skill', 'list']);

    expect(process.exitCode).not.toBe(1);
  });

  it('renders the derived triggers and safe defaults in the printed table', async () => {
    writeManifest(join(cliTestRoot, '.deckent/skills'), 'v2-minimal', V2_MINIMAL_MANIFEST);

    const output = await runSkillListCommand(['skill', 'list']);

    expect(process.exitCode).not.toBe(1);
    expect(output).toContain('V2 Minimal');
    expect(output).toContain('domain');
    expect(output).toMatch(/security|implementation/);
  });
});
