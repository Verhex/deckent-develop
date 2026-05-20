import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../');

// ─── Package.json Assertions ─────────────────────────────────────────────────

describe('bin entry — package.json validation', () => {
  let pkg: Record<string, unknown>;

  beforeEach(() => {
    pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8')) as Record<
      string,
      unknown
    >;
  });

  it('bin.deckent resolves to ./dist/cli/entry.js', () => {
    const bin = pkg['bin'] as Record<string, string>;
    expect(bin['deckent']).toBe('./dist/cli/entry.js');
  });

  it('bin entry path starts with ./dist (compiled output)', () => {
    const bin = pkg['bin'] as Record<string, string>;
    expect(bin['deckent']?.startsWith('./dist')).toBe(true);
  });

  it('package has type:module required for ESM shebang execution', () => {
    expect(pkg['type']).toBe('module');
  });

  it('engines.node is >= 24 (Active LTS — Node 18/20/22 EOL by May 2026)', () => {
    const engines = pkg['engines'] as Record<string, string>;
    expect(engines['node']).toMatch(/^>=\s*24/);
  });

  it('files array contains dist so bin target is published', () => {
    const files = pkg['files'] as string[];
    expect(files).toContain('dist');
  });

  it('prepublishOnly script runs build to ensure dist/ is fresh', () => {
    const scripts = pkg['scripts'] as Record<string, string>;
    expect(scripts['prepublishOnly']).toContain('build');
  });
});

// ─── entry.ts Source Assertions ──────────────────────────────────────────────

describe('bin entry — src/cli/entry.ts source validation', () => {
  let source: string;

  beforeEach(() => {
    source = readFileSync(join(PROJECT_ROOT, 'src/cli/entry.ts'), 'utf-8');
  });

  it('first line is shebang #!/usr/bin/env node', () => {
    expect(source.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('calls buildProgram().parseAsync(process.argv)', () => {
    expect(source).toContain('parseAsync(process.argv)');
  });

  it('has unhandledRejection handler to catch async errors', () => {
    expect(source).toContain("'unhandledRejection'");
  });

  it('handles SIGINT for graceful ctrl-c shutdown', () => {
    expect(source).toContain("'SIGINT'");
  });

  it('handles SIGTERM for container/systemd shutdown', () => {
    expect(source).toContain("'SIGTERM'");
  });

  it('has Node version guard requiring >= 24 (Active LTS)', () => {
    expect(source).toContain('< 24');
  });

  it('imports handleCliError from helpers/process', () => {
    expect(source).toContain("from './helpers/process.js'");
  });
});

// ─── buildProgram API Assertions ─────────────────────────────────────────────

describe('bin entry — buildProgram registration', () => {
  it('buildProgram is exported from src/cli/index.ts', () => {
    const indexSrc = readFileSync(join(PROJECT_ROOT, 'src/cli/index.ts'), 'utf-8');
    expect(indexSrc).toContain('export function buildProgram');
  });

  it('buildProgram registers doctor command (deckent doctor)', () => {
    const indexSrc = readFileSync(join(PROJECT_ROOT, 'src/cli/index.ts'), 'utf-8');
    expect(indexSrc).toContain('registerDoctor');
  });

  it('buildProgram sets program name to deckent', () => {
    const indexSrc = readFileSync(join(PROJECT_ROOT, 'src/cli/index.ts'), 'utf-8');
    expect(indexSrc).toContain(".name('deckent')");
  });

  it('buildProgram has --version option for deckent --version', () => {
    const indexSrc = readFileSync(join(PROJECT_ROOT, 'src/cli/index.ts'), 'utf-8');
    expect(indexSrc).toContain('--version');
  });
});

// ─── Runtime buildProgram Smoke Test ─────────────────────────────────────────

describe('bin entry — buildProgram runtime smoke', () => {
  it('buildProgram() returns a Command instance without throwing', async () => {
    const { buildProgram } = await import('../../src/cli/index.js');
    expect(() => buildProgram()).not.toThrow();
  });

  it('program.name() returns deckent', async () => {
    const { buildProgram } = await import('../../src/cli/index.js');
    const program = buildProgram();
    expect(program.name()).toBe('deckent');
  });

  it('program has doctor command registered', async () => {
    const { buildProgram } = await import('../../src/cli/index.js');
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('doctor');
  });

  it('program has init command registered', async () => {
    const { buildProgram } = await import('../../src/cli/index.js');
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('init');
  });

  it('program has start command registered', async () => {
    const { buildProgram } = await import('../../src/cli/index.js');
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('start');
  });
});

// ─── Postinstall / chmod Assertions ──────────────────────────────────────────

describe('bin entry — install scenario validation', () => {
  it('no postinstall script in package.json (npm handles chmod +x via bin field)', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8')) as Record<
      string,
      unknown
    >;
    const scripts = (pkg['scripts'] ?? {}) as Record<string, string>;
    // npm automatically sets execute bit on bin entries — no postinstall needed
    expect(scripts['postinstall']).toBeUndefined();
  });

  it('entry.ts shebang is compatible with npx (no shell wrapper needed)', () => {
    const source = readFileSync(join(PROJECT_ROOT, 'src/cli/entry.ts'), 'utf-8');
    // npx resolves shebang directly; a separate bin/ shell script is not required
    expect(source.startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
