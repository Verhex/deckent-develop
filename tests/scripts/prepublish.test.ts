import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  validatePackageJson,
  checkDistDirectory,
  checkDistSize,
  checkBuild,
  runPrepublishChecks,
} from '../../scripts/prepublish.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedStatSync = vi.mocked(statSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExecSync = vi.mocked(execSync);

const VALID_PACKAGE_JSON = JSON.stringify({
  name: 'deckent',
  version: '0.1.0',
  description: 'AI agent orchestration',
  license: 'MIT',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  bin: {
    deckent: './dist/cli/index.js',
    'deckent-mcp': './dist/mcp/server.js',
  },
  engines: { node: '>=18.0.0' },
  files: ['dist', 'bin', 'README.md', 'LICENSE'],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validatePackageJson', () => {
  it('returns error when package.json does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    const results = validatePackageJson('/project');
    expect(results).toHaveLength(1);
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.message).toContain('not found');
  });

  it('validates all required fields present in valid package.json', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(VALID_PACKAGE_JSON);
    const results = validatePackageJson('/project');
    const failures = results.filter(r => !r.ok);
    expect(failures).toHaveLength(0);
  });

  it('detects missing name field', () => {
    mockedExistsSync.mockReturnValue(true);
    const pkg = JSON.parse(VALID_PACKAGE_JSON);
    delete pkg.name;
    mockedReadFileSync.mockReturnValue(JSON.stringify(pkg));
    const results = validatePackageJson('/project');
    const nameCheck = results.find(r => r.name.includes('name'));
    expect(nameCheck?.ok).toBe(false);
  });

  it('detects missing bin.deckent', () => {
    mockedExistsSync.mockReturnValue(true);
    const pkg = JSON.parse(VALID_PACKAGE_JSON);
    delete pkg.bin.deckent;
    mockedReadFileSync.mockReturnValue(JSON.stringify(pkg));
    const results = validatePackageJson('/project');
    const binCheck = results.find(r => r.name.includes('bin.deckent') && !r.name.includes('mcp'));
    expect(binCheck?.ok).toBe(false);
  });

  it('detects missing bin.deckent-mcp', () => {
    mockedExistsSync.mockReturnValue(true);
    const pkg = JSON.parse(VALID_PACKAGE_JSON);
    delete pkg.bin['deckent-mcp'];
    mockedReadFileSync.mockReturnValue(JSON.stringify(pkg));
    const results = validatePackageJson('/project');
    const binCheck = results.find(r => r.name.includes('deckent-mcp'));
    expect(binCheck?.ok).toBe(false);
  });

  it('detects missing engines.node', () => {
    mockedExistsSync.mockReturnValue(true);
    const pkg = JSON.parse(VALID_PACKAGE_JSON);
    delete pkg.engines;
    mockedReadFileSync.mockReturnValue(JSON.stringify(pkg));
    const results = validatePackageJson('/project');
    const enginesCheck = results.find(r => r.name.includes('engines'));
    expect(enginesCheck?.ok).toBe(false);
  });

  it('detects missing files field', () => {
    mockedExistsSync.mockReturnValue(true);
    const pkg = JSON.parse(VALID_PACKAGE_JSON);
    delete pkg.files;
    mockedReadFileSync.mockReturnValue(JSON.stringify(pkg));
    const results = validatePackageJson('/project');
    const filesCheck = results.find(r => r.name === 'package.json has files field');
    expect(filesCheck?.ok).toBe(false);
  });

  it('checks that files includes dist, README.md, LICENSE', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(VALID_PACKAGE_JSON);
    const results = validatePackageJson('/project');
    const distCheck = results.find(r => r.name === 'files includes dist');
    const readmeCheck = results.find(r => r.name === 'files includes README.md');
    const licenseCheck = results.find(r => r.name === 'files includes LICENSE');
    expect(distCheck?.ok).toBe(true);
    expect(readmeCheck?.ok).toBe(true);
    expect(licenseCheck?.ok).toBe(true);
  });

  it('verifies license is MIT', () => {
    mockedExistsSync.mockReturnValue(true);
    const pkg = JSON.parse(VALID_PACKAGE_JSON);
    pkg.license = 'Apache-2.0';
    mockedReadFileSync.mockReturnValue(JSON.stringify(pkg));
    const results = validatePackageJson('/project');
    const licenseCheck = results.find(r => r.name === 'license is MIT');
    expect(licenseCheck?.ok).toBe(false);
  });
});

describe('checkDistDirectory', () => {
  it('returns error when dist/ does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = checkDistDirectory('/project');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('returns error when dist/ is empty', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([] as any);
    const result = checkDistDirectory('/project');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('empty');
  });

  it('returns ok when dist/ has files', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['index.js', 'index.d.ts'] as any);
    const result = checkDistDirectory('/project');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('2 files');
  });
});

describe('checkDistSize', () => {
  it('returns error when dist/ does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = checkDistSize('/project');
    expect(result.ok).toBe(false);
  });

  it('returns ok when size is under limit', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['file.js'] as any);
    mockedStatSync.mockReturnValue({ isFile: () => true, size: 1024 } as any);
    const result = checkDistSize('/project', 50);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('under');
  });

  it('returns warning when size exceeds limit', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['bigfile.js'] as any);
    mockedStatSync.mockReturnValue({ isFile: () => true, size: 60 * 1024 * 1024 } as any);
    const result = checkDistSize('/project', 50);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('exceeds');
  });
});

describe('checkBuild', () => {
  it('returns ok when tsc succeeds', () => {
    mockedExecSync.mockReturnValue('');
    const result = checkBuild('/project');
    expect(result.ok).toBe(true);
  });

  it('returns error when tsc fails', () => {
    mockedExecSync.mockImplementation(() => { throw new Error('TS2304: Cannot find name'); });
    const result = checkBuild('/project');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Build failed');
  });
});

describe('runPrepublishChecks', () => {
  it('aggregates all checks', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(VALID_PACKAGE_JSON);
    mockedReaddirSync.mockReturnValue(['index.js'] as any);
    mockedStatSync.mockReturnValue({ isFile: () => true, size: 1024 } as any);

    const result = runPrepublishChecks('/project');
    expect(result.checks.length).toBeGreaterThan(5);
    expect(result.ok).toBe(true);
  });

  it('returns ok=false if any check fails', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = runPrepublishChecks('/project');
    expect(result.ok).toBe(false);
  });
});
