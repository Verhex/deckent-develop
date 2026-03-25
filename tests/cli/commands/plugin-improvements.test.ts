/**
 * Tests for plugin command improvements (task-057-012):
 * J) plugin remove + update commands
 * K) entrypoint validation
 * L) conflict detection
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';

const testRoot = join(tmpdir(), `deckent-plugin-impr-${Date.now()}`);

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
}));

const output: string[] = [];
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (msg: string) => output.push(msg),
  printError: (err: unknown) => output.push(String(err instanceof Error ? err.message : err)),
}));

import { registerPlugin } from '../../../src/cli/commands/plugin.js';

function makePlugin(name: string, withEntrypoint = true) {
  const pluginDir = join(testRoot, '.deckent/plugins', name);
  mkdirSync(pluginDir, { recursive: true });
  const manifest = {
    name,
    version: '1.0.0',
    description: `Plugin ${name}`,
    entrypoint: 'SKILL.md',
    enabled: true,
  };
  writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (withEntrypoint) {
    writeFileSync(join(pluginDir, 'SKILL.md'), `# ${name}`);
  }
  return pluginDir;
}

async function run(args: string[]) {
  output.length = 0;
  process.exitCode = undefined;
  const program = new Command();
  program.exitOverride();
  registerPlugin(program);
  try {
    await program.parseAsync(['node', 'deckent', ...args]);
  } catch {
    // commander exitOverride
  }
}

describe('plugin improvements', () => {
  beforeEach(() => {
    mkdirSync(join(testRoot, '.deckent/plugins'), { recursive: true });
    output.length = 0;
  });

  afterEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
  });

  // ─── J) plugin remove ──────────────────────────────────────────────────

  describe('J: plugin remove', () => {
    it('removes an existing plugin directory', async () => {
      const dir = makePlugin('remove-me');
      expect(existsSync(dir)).toBe(true);
      await run(['plugin', 'remove', 'remove-me']);
      expect(existsSync(dir)).toBe(false);
    });

    it('prints success message after removal', async () => {
      makePlugin('remove-success');
      await run(['plugin', 'remove', 'remove-success']);
      expect(output.some(o => o.includes('removed') || o.includes('remove-success'))).toBe(true);
    });

    it('reports error for non-existent plugin', async () => {
      await run(['plugin', 'remove', 'ghost-plugin']);
      expect(output.some(o => o.includes('not found') || o.includes('ghost-plugin'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    it('remove command is registered', () => {
      const program = new Command();
      program.exitOverride();
      registerPlugin(program);
      const pluginCmd = program.commands.find(c => c.name() === 'plugin');
      expect(pluginCmd).toBeDefined();
      const removeCmd = pluginCmd!.commands.find(c => c.name() === 'remove');
      expect(removeCmd).toBeDefined();
    });
  });

  // ─── K) entrypoint validation ───────────────────────────────────────────

  describe('K: entrypoint validation', () => {
    it('warns about missing entrypoint in plugin list', async () => {
      makePlugin('broken-plugin', false); // no SKILL.md
      await run(['plugin', 'list']);
      expect(output.some(o => o.includes('entrypoint') && o.includes('missing'))).toBe(true);
    });

    it('shows OK for valid entrypoint in plugin info', async () => {
      const dir = makePlugin('good-plugin');
      await run(['plugin', 'info', dir]);
      expect(output.some(o => o.includes('Entrypoint: OK'))).toBe(true);
    });

    it('warns about missing entrypoint in plugin info', async () => {
      const dir = makePlugin('bad-ep-plugin', false);
      await run(['plugin', 'info', dir]);
      expect(output.some(o => o.includes('WARNING') || o.includes('does not exist'))).toBe(true);
    });

    it('does not warn about valid entrypoint in list', async () => {
      makePlugin('valid-ep');
      await run(['plugin', 'list']);
      const allOutput = output.join('\n');
      // Should not contain warning for this plugin
      expect(allOutput).not.toContain('[WARNING: entrypoint missing]');
    });
  });

  // ─── L) conflict detection ───────────────────────────────────────────────

  describe('L: conflict detection', () => {
    it('warns when creating a plugin that already exists', async () => {
      makePlugin('conflict-plugin');
      await run(['plugin', 'create', 'conflict-plugin']);
      expect(output.some(o => o.includes('already installed') || o.includes('conflict-plugin'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });

    it('creates plugin successfully when no conflict', async () => {
      await run(['plugin', 'create', 'new-unique-plugin']);
      const dir = join(testRoot, '.deckent/plugins/new-unique-plugin');
      expect(existsSync(dir)).toBe(true);
      expect(existsSync(join(dir, 'manifest.json'))).toBe(true);
    });

    it('update command is registered', () => {
      const program = new Command();
      program.exitOverride();
      registerPlugin(program);
      const pluginCmd = program.commands.find(c => c.name() === 'plugin');
      expect(pluginCmd).toBeDefined();
      const updateCmd = pluginCmd!.commands.find(c => c.name() === 'update');
      expect(updateCmd).toBeDefined();
    });
  });
});
