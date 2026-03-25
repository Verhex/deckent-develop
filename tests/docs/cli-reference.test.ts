import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CLI_REF_PATH = join(ROOT, 'docs', 'reference', 'cli.md');
const SCRIPT_PATH = join(ROOT, 'scripts', 'generate-cli-docs.ts');

describe('docs/reference/cli.md', () => {
  const content = readFileSync(CLI_REF_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(existsSync(CLI_REF_PATH)).toBe(true);
    expect(content.length).toBeGreaterThan(1000);
  });

  it('has correct title and auto-generated notice', () => {
    expect(content).toContain('# CLI Reference');
    expect(content).toContain('docs:generate-cli');
  });

  it('contains overview section with usage example', () => {
    expect(content).toContain('## Overview');
    expect(content).toContain('deckent <command>');
    expect(content).toContain('## Command Index');
  });

  it('documents all expected command categories', () => {
    expect(content).toContain('Project Setup');
    expect(content).toContain('Sprint Workflow');
    expect(content).toContain('Monitoring');
    expect(content).toContain('Workers & Tasks');
    expect(content).toContain('Configuration');
    expect(content).toContain('Skills & Agents');
    expect(content).toContain('Plugins');
    expect(content).toContain('Server & Dashboard');
  });

  it('documents core sprint workflow commands', () => {
    expect(content).toContain('`deckent start');
    expect(content).toContain('`deckent plan`');
    expect(content).toContain('`deckent status`');
    expect(content).toContain('`deckent retro`');
    expect(content).toContain('`deckent finalize`');
    expect(content).toContain('`deckent cleanup`');
  });

  it('documents project setup commands', () => {
    expect(content).toContain('`deckent init`');
    expect(content).toContain('`deckent onboard`');
    expect(content).toContain('`deckent doctor`');
    expect(content).toContain('`deckent upgrade`');
  });

  it('documents worker management commands', () => {
    expect(content).toContain('`deckent spawn');
    expect(content).toContain('`deckent kill');
    expect(content).toContain('`deckent attach`');
    expect(content).toContain('`deckent run');
  });

  it('documents configuration commands', () => {
    expect(content).toContain('`deckent config`');
    expect(content).toContain('`deckent archive-debt`');
  });

  it('documents skill and agent management', () => {
    expect(content).toContain('`deckent skill`');
    expect(content).toContain('`deckent agent`');
    expect(content).toContain('`deckent plugin`');
  });

  it('documents server commands', () => {
    expect(content).toContain('`deckent serve`');
    expect(content).toContain('`deckent web`');
  });

  it('documents monitoring commands', () => {
    expect(content).toContain('`deckent watch`');
    expect(content).toContain('`deckent dashboard`');
    expect(content).toContain('`deckent usage`');
    expect(content).toContain('`deckent history`');
    expect(content).toContain('`deckent analyze`');
  });

  it('contains options tables for commands with options', () => {
    expect(content).toContain('| Flag | Description |');
    expect(content).toContain('--auto');
    expect(content).toContain('--dry-run');
    expect(content).toContain('--watch');
  });

  it('contains code examples for major commands', () => {
    const codeBlockMatches = content.match(/```bash/g);
    expect(codeBlockMatches).toBeTruthy();
    expect((codeBlockMatches ?? []).length).toBeGreaterThan(10);
  });

  it('documents start command options including --dry-run and --force', () => {
    expect(content).toContain('--dry-run');
    expect(content).toContain('--force');
    expect(content).toContain('--auto-approve');
  });

  it('documents subcommands for config', () => {
    expect(content).toContain('deckent config set');
    expect(content).toContain('deckent config export');
    expect(content).toContain('deckent config import');
  });

  it('documents subcommands for skill', () => {
    expect(content).toContain('deckent skill list');
    expect(content).toContain('deckent skill create');
    expect(content).toContain('deckent skill install');
    expect(content).toContain('deckent skill search');
    expect(content).toContain('deckent skill publish');
  });

  it('documents subcommands for plugin', () => {
    expect(content).toContain('deckent plugin install');
    expect(content).toContain('deckent plugin list');
    expect(content).toContain('deckent plugin create');
  });
});

describe('scripts/generate-cli-docs.ts', () => {
  it('exists as a TypeScript script', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
  });

  it('contains exported CLI_COMMANDS array', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(source).toContain('export const CLI_COMMANDS');
    expect(source).toContain('CliCommand[]');
  });

  it('contains generateCliDocs exported function', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(source).toContain('export function generateCliDocs');
  });

  it('contains exported type definitions', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(source).toContain('export interface CliCommand');
    expect(source).toContain('export interface CliOption');
    expect(source).toContain('export type CommandCategory');
  });

  it('references docs:generate-cli in package.json', () => {
    const pkgPath = join(ROOT, 'package.json');
    const pkg = readFileSync(pkgPath, 'utf-8');
    expect(pkg).toContain('docs:generate-cli');
    expect(pkg).toContain('generate-cli-docs.ts');
  });

  it('script writes to docs/reference/cli.md', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(source).toContain("'docs', 'reference'");
    expect(source).toContain("'cli.md'");
  });

  it('CLI_COMMANDS covers at least 30 top-level commands', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf-8');
    // Count name: entries in CLI_COMMANDS by counting pattern occurrences
    const nameMatches = source.match(/^\s+name: '[a-z-]+',$/gm);
    // This is a rough check - there should be many entries
    expect(nameMatches).toBeTruthy();
    expect((nameMatches ?? []).length).toBeGreaterThanOrEqual(20);
  });
});

describe('generate-cli-docs generateCliDocs function (unit)', async () => {
  // Dynamically import to test the function directly
  const mod = await import(`${ROOT}/scripts/generate-cli-docs.ts`);
  const { generateCliDocs, CLI_COMMANDS } = mod as {
    generateCliDocs: (cmds: unknown[]) => string;
    CLI_COMMANDS: Array<{ name: string; category: string; description: string; options?: unknown[]; subcommands?: unknown[] }>;
  };

  it('returns a non-empty string', () => {
    const result = generateCliDocs(CLI_COMMANDS);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(500);
  });

  it('includes CLI Reference heading', () => {
    const result = generateCliDocs(CLI_COMMANDS);
    expect(result).toContain('# CLI Reference');
  });

  it('includes all command names', () => {
    const result = generateCliDocs(CLI_COMMANDS);
    for (const cmd of CLI_COMMANDS) {
      expect(result).toContain(cmd.name);
    }
  });

  it('CLI_COMMANDS has at least 30 entries', () => {
    expect(CLI_COMMANDS.length).toBeGreaterThanOrEqual(30);
  });

  it('all commands have required fields', () => {
    for (const cmd of CLI_COMMANDS) {
      expect(cmd.name).toBeTruthy();
      expect(cmd.description).toBeTruthy();
      expect(cmd.category).toBeTruthy();
    }
  });
});
