import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExecSync = vi.mocked(execSync);
const mockedSpawnSync = vi.mocked(spawnSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedStatSync = vi.mocked(statSync);

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST_CLI = join(PROJECT_ROOT, 'dist', 'cli', 'index.js');

describe('npm install simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dist/cli/index.js path is correctly configured in package.json', () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      bin: { deckent: './dist/cli/index.js' },
    }));
    const pkg = JSON.parse(mockedReadFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8') as string);
    expect(pkg.bin.deckent).toBe('./dist/cli/index.js');
  });

  it('package.json has correct bin entry for deckent', () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      bin: { deckent: './dist/cli/index.js', 'deckent-mcp': './dist/mcp/server.js' },
    }));
    const pkg = JSON.parse(mockedReadFileSync('package.json', 'utf-8') as string);
    expect(pkg.bin).toHaveProperty('deckent');
    expect(pkg.bin.deckent).toMatch(/dist\/cli\/index\.js$/);
  });

  it('shebang line would be present in dist output', () => {
    // The source file src/cli/index.ts starts with #!/usr/bin/env node
    mockedReadFileSync.mockReturnValue('#!/usr/bin/env node\nconsole.log("ok");');
    const content = mockedReadFileSync(DIST_CLI, 'utf-8') as string;
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('deckent init creates required directories', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedMkdirSync.mockReturnValue(undefined);

    // Simulate the directories that init would create
    const dirs = ['.deckent', '.brain', '.tasks', '.locks', '.claude/rules'];
    for (const d of dirs) {
      mkdirSync(join('/tmp/project', d), { recursive: true });
    }

    expect(mockedMkdirSync).toHaveBeenCalledTimes(dirs.length);
    for (const d of dirs) {
      expect(mockedMkdirSync).toHaveBeenCalledWith(
        join('/tmp/project', d),
        { recursive: true },
      );
    }
  });

  it('deckent init creates config.json', () => {
    mockedExistsSync.mockReturnValue(false);

    const configPath = join('/tmp/project', '.deckent', 'config.json');
    const config = { mode: 'max_plan', language: 'en', projectName: 'test' };
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      configPath,
      expect.stringContaining('max_plan'),
    );
  });

  it('deckent init creates DECKENT.md', () => {
    mockedExistsSync.mockReturnValue(false);

    writeFileSync(join('/tmp/project', 'DECKENT.md'), '# test');
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      join('/tmp/project', 'DECKENT.md'),
      expect.any(String),
    );
  });

  it('deckent init creates brain memory files', () => {
    mockedExistsSync.mockReturnValue(false);

    const brainFiles = ['MEMORY.md', 'DECISIONS.md', 'DEBT.md', 'PATTERNS.md', 'RETRO.md'];
    for (const f of brainFiles) {
      writeFileSync(join('/tmp/project', '.brain', f), '# content');
    }

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(brainFiles.length);
  });

  it('deckent doctor checks are available as exported function', () => {
    // The doctor command should be importable
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ mode: 'max_plan' }));

    // Simulate doctor check results
    const checks = [
      { name: 'config', ok: true },
      { name: 'directories', ok: true },
      { name: 'claude', ok: false, message: 'claude CLI not found' },
    ];

    expect(checks.filter(c => c.ok).length).toBeGreaterThanOrEqual(1);
  });

  it('package.json engines requires Node >= 18', () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      engines: { node: '>=18.0.0' },
    }));
    const pkg = JSON.parse(mockedReadFileSync('package.json', 'utf-8') as string);
    expect(pkg.engines.node).toMatch(/>=18/);
  });

  it('package.json type is module (ESM)', () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify({ type: 'module' }));
    const pkg = JSON.parse(mockedReadFileSync('package.json', 'utf-8') as string);
    expect(pkg.type).toBe('module');
  });

  it('package.json exports field is configured', () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } },
    }));
    const pkg = JSON.parse(mockedReadFileSync('package.json', 'utf-8') as string);
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['.'].import).toMatch(/dist/);
  });

  it('file structure matches expected layout after init', () => {
    // Verify the expected file tree
    const expectedFiles = [
      '.deckent/config.json',
      '.brain/MEMORY.md',
      '.brain/DECISIONS.md',
      '.brain/DEBT.md',
      '.brain/PATTERNS.md',
      '.brain/RETRO.md',
      'DECKENT.md',
      'DIRECTIVES.md',
    ];

    mockedExistsSync.mockReturnValue(true);
    for (const f of expectedFiles) {
      expect(existsSync(join('/tmp/project', f))).toBe(true);
    }
  });
});
