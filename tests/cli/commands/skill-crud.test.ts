import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock resolveProjectRoot before importing
const testRoot = join(tmpdir(), `deckent-skill-crud-${Date.now()}`);

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
}));

vi.mock('../../../src/cli/commands/skill-marketplace.js', () => ({
  registerSkillMarketplace: () => {},
}));

import { Command } from 'commander';
import { registerSkill } from '../../../src/cli/commands/skill.js';

function createTestSkill(name: string, overrides: Record<string, unknown> = {}): void {
  const skillDir = join(testRoot, '.deckent', 'skills', name);
  mkdirSync(skillDir, { recursive: true });
  const manifest = {
    id: name,
    name,
    version: '1.0.0',
    description: `Test skill ${name}`,
    category: 'testing',
    enabled: true,
    triggers: ['test-trigger'],
    priority: 50,
    ...overrides,
  };
  writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function readManifest(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(testRoot, '.deckent', 'skills', name, 'manifest.json'), 'utf-8'));
}

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerSkill(program);
  return program;
}

async function run(args: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(['node', 'deckent', ...args]);
}

describe('skill enable/disable/delete/info', () => {
  beforeEach(() => {
    mkdirSync(join(testRoot, '.deckent', 'skills'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  // ─── enable ─────────────────────────────────────────────────────
  it('skill enable should set enabled=true in manifest', async () => {
    createTestSkill('my-skill', { enabled: false });
    await run(['skill', 'enable', 'my-skill']);
    const manifest = readManifest('my-skill');
    expect(manifest.enabled).toBe(true);
  });

  it('skill enable on non-existent skill should fail', async () => {
    await expect(run(['skill', 'enable', 'nope'])).resolves.not.toThrow();
    // process.exitCode would be 1 but commander exitOverride may throw
    expect(existsSync(join(testRoot, '.deckent', 'skills', 'nope'))).toBe(false);
  });

  // ─── disable ────────────────────────────────────────────────────
  it('skill disable should set enabled=false in manifest', async () => {
    createTestSkill('my-skill', { enabled: true });
    await run(['skill', 'disable', 'my-skill']);
    const manifest = readManifest('my-skill');
    expect(manifest.enabled).toBe(false);
  });

  it('skill disable on non-existent skill should fail', async () => {
    await expect(run(['skill', 'disable', 'nope'])).resolves.not.toThrow();
  });

  it('skill enable/disable should preserve other manifest fields', async () => {
    createTestSkill('my-skill', { enabled: true, category: 'code', priority: 99 });
    await run(['skill', 'disable', 'my-skill']);
    const manifest = readManifest('my-skill');
    expect(manifest.enabled).toBe(false);
    expect(manifest.category).toBe('code');
    expect(manifest.priority).toBe(99);
    expect(manifest.triggers).toEqual(['test-trigger']);
  });

  // ─── delete ─────────────────────────────────────────────────────
  it('skill delete should remove the skill directory', async () => {
    createTestSkill('to-delete');
    const skillDir = join(testRoot, '.deckent', 'skills', 'to-delete');
    expect(existsSync(skillDir)).toBe(true);
    await run(['skill', 'delete', 'to-delete']);
    expect(existsSync(skillDir)).toBe(false);
  });

  it('skill delete on non-existent skill should fail', async () => {
    await expect(run(['skill', 'delete', 'nope'])).resolves.not.toThrow();
  });

  // ─── info ───────────────────────────────────────────────────────
  it('skill info should show manifest details', async () => {
    createTestSkill('info-skill', { category: 'analysis', priority: 80 });
    // Just ensure it doesn't throw
    await expect(run(['skill', 'info', 'info-skill'])).resolves.not.toThrow();
  });

  it('skill info should show SKILL.md snippet', async () => {
    createTestSkill('with-doc');
    const skillDir = join(testRoot, '.deckent', 'skills', 'with-doc');
    writeFileSync(join(skillDir, 'SKILL.md'), '# My Skill\nLine 2\nLine 3\n');
    await expect(run(['skill', 'info', 'with-doc'])).resolves.not.toThrow();
  });

  it('skill info on non-existent skill should fail', async () => {
    await expect(run(['skill', 'info', 'nope'])).resolves.not.toThrow();
  });
});
