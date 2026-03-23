import { describe, it, expect } from 'vitest';
import {
  validatePackContents,
  validatePackageJson,
  validateCliVersion,
  validateCliHelp,
  validateInitStructure,
  validateDoctorOutput,
  SENSITIVE_PATTERNS,
  REQUIRED_PATTERNS,
} from '../../scripts/validate-publish.js';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Helper: build a mock npm pack --dry-run output ─────────────────

function buildPackOutput(opts: {
  files?: string[];
  totalSize?: string;
} = {}): string {
  const files = opts.files ?? [
    'dist/index.js',
    'dist/index.d.ts',
    'dist/cli/entry.js',
    'dist/core/constants.js',
    'README.md',
    'LICENSE',
    'package.json',
  ];
  const totalSize = opts.totalSize ?? '120.5 kB';

  const lines = ['npm notice === Tarball Contents ==='];
  for (const f of files) {
    lines.push(`npm notice 1.2kB  ${f}`);
  }
  lines.push('npm notice === Tarball Details ===');
  lines.push(`npm notice unpacked size: ${totalSize}`);
  lines.push('npm notice total files:   ' + files.length);
  return lines.join('\n');
}

// ─── validatePackContents ───────────────────────────────────────────

describe('validatePackContents', () => {
  it('passes when pack contains only safe files', () => {
    const output = buildPackOutput();
    const checks = validatePackContents(output);
    const errors = checks.filter(c => !c.ok && c.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('fails when .brain/ is in pack', () => {
    const output = buildPackOutput({
      files: ['dist/index.js', '.brain/MEMORY.md', 'README.md', 'LICENSE', 'package.json'],
    });
    const checks = validatePackContents(output);
    const brainCheck = checks.find(c => c.name === 'excludes .brain/');
    expect(brainCheck?.ok).toBe(false);
    expect(brainCheck?.message).toContain('LEAK');
  });

  it('fails when .deckent/ is in pack', () => {
    const output = buildPackOutput({
      files: ['dist/index.js', '.deckent/config.json', 'README.md', 'LICENSE', 'package.json'],
    });
    const checks = validatePackContents(output);
    const deckentCheck = checks.find(c => c.name === 'excludes .deckent/');
    expect(deckentCheck?.ok).toBe(false);
  });

  it('fails when tests/ is in pack', () => {
    const output = buildPackOutput({
      files: ['dist/index.js', 'tests/core.test.ts', 'README.md', 'LICENSE', 'package.json'],
    });
    const checks = validatePackContents(output);
    const testsCheck = checks.find(c => c.name === 'excludes tests/');
    expect(testsCheck?.ok).toBe(false);
  });

  it('fails when .env is in pack', () => {
    const output = buildPackOutput({
      files: ['dist/index.js', '.env', 'README.md', 'LICENSE', 'package.json'],
    });
    const checks = validatePackContents(output);
    const envCheck = checks.find(c => c.name === 'excludes .env');
    expect(envCheck?.ok).toBe(false);
  });

  it('fails when src/ is in pack', () => {
    const output = buildPackOutput({
      files: ['dist/index.js', 'src/index.ts', 'README.md', 'LICENSE', 'package.json'],
    });
    const checks = validatePackContents(output);
    const srcCheck = checks.find(c => c.name === 'excludes src/');
    expect(srcCheck?.ok).toBe(false);
  });

  it('fails when dist/ is missing from pack', () => {
    const output = buildPackOutput({ files: ['README.md', 'LICENSE', 'package.json'] });
    const checks = validatePackContents(output);
    const distCheck = checks.find(c => c.name === 'includes dist/');
    expect(distCheck?.ok).toBe(false);
  });

  it('fails when README.md is missing from pack', () => {
    const output = buildPackOutput({ files: ['dist/index.js', 'LICENSE', 'package.json'] });
    const checks = validatePackContents(output);
    const readmeCheck = checks.find(c => c.name === 'includes README.md');
    expect(readmeCheck?.ok).toBe(false);
  });

  it('fails when LICENSE is missing from pack', () => {
    const output = buildPackOutput({ files: ['dist/index.js', 'README.md', 'package.json'] });
    const checks = validatePackContents(output);
    const licenseCheck = checks.find(c => c.name === 'includes LICENSE');
    expect(licenseCheck?.ok).toBe(false);
  });

  it('passes when size is under 500KB', () => {
    const output = buildPackOutput({ totalSize: '250.0 kB' });
    const checks = validatePackContents(output);
    const sizeCheck = checks.find(c => c.name === 'pack size < 500KB');
    expect(sizeCheck?.ok).toBe(true);
  });

  it('fails when size exceeds 500KB', () => {
    const output = buildPackOutput({ totalSize: '2.5 MB' });
    const checks = validatePackContents(output);
    const sizeCheck = checks.find(c => c.name === 'pack size < 500KB');
    expect(sizeCheck?.ok).toBe(false);
    expect(sizeCheck?.message).toContain('exceeds');
  });

  it('checks all sensitive patterns', () => {
    const output = buildPackOutput();
    const checks = validatePackContents(output);
    for (const pattern of SENSITIVE_PATTERNS) {
      const check = checks.find(c => c.name === `excludes ${pattern}`);
      expect(check, `check for ${pattern} should exist`).toBeDefined();
    }
  });

  it('checks all required patterns', () => {
    const output = buildPackOutput();
    const checks = validatePackContents(output);
    for (const pattern of REQUIRED_PATTERNS) {
      const check = checks.find(c => c.name === `includes ${pattern}`);
      expect(check, `check for ${pattern} should exist`).toBeDefined();
    }
  });
});

// ─── validatePackageJson ────────────────────────────────────────────

describe('validatePackageJson', () => {
  let tmpDir: string;

  function setupPkg(pkg: Record<string, unknown>): void {
    tmpDir = mkdtempSync(join(tmpdir(), 'vpkg-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2));
  }

  it('passes with complete package.json', () => {
    setupPkg({
      version: '0.2.0-beta.1',
      bin: { deckent: './dist/cli/entry.js' },
      files: ['dist', 'README.md', 'LICENSE'],
      engines: { node: '>=18.0.0' },
      homepage: 'https://deckent.agency',
      license: 'MIT',
    });
    const checks = validatePackageJson(tmpDir);
    const errors = checks.filter(c => !c.ok && c.severity === 'error');
    expect(errors).toHaveLength(0);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fails when version is missing', () => {
    setupPkg({ bin: { deckent: './dist/cli/entry.js' }, files: ['dist'] });
    const checks = validatePackageJson(tmpDir);
    const versionCheck = checks.find(c => c.name === 'package.json version');
    expect(versionCheck?.ok).toBe(false);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fails when bin.deckent is missing', () => {
    setupPkg({ version: '1.0.0', files: ['dist'] });
    const checks = validatePackageJson(tmpDir);
    const binCheck = checks.find(c => c.name === 'package.json bin.deckent');
    expect(binCheck?.ok).toBe(false);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fails when files field is missing', () => {
    setupPkg({ version: '1.0.0', bin: { deckent: './dist/cli/entry.js' } });
    const checks = validatePackageJson(tmpDir);
    const filesCheck = checks.find(c => c.name === 'package.json files field');
    expect(filesCheck?.ok).toBe(false);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('warns when engines is missing', () => {
    setupPkg({ version: '1.0.0', bin: { deckent: './dist/cli/entry.js' }, files: ['dist'] });
    const checks = validatePackageJson(tmpDir);
    const enginesCheck = checks.find(c => c.name === 'package.json engines.node');
    expect(enginesCheck?.ok).toBe(false);
    expect(enginesCheck?.severity).toBe('warning');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fails when package.json does not exist', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'vpkg-empty-'));
    const checks = validatePackageJson(emptyDir);
    expect(checks.some(c => !c.ok)).toBe(true);
    rmSync(emptyDir, { recursive: true, force: true });
  });
});

// ─── validateCliVersion ─────────────────────────────────────────────

describe('validateCliVersion', () => {
  it('passes when version matches', () => {
    const check = validateCliVersion('0.2.0-beta.1\n', '0.2.0-beta.1');
    expect(check.ok).toBe(true);
  });

  it('passes when output contains version among other text', () => {
    const check = validateCliVersion('deckent v0.2.0-beta.1', '0.2.0-beta.1');
    expect(check.ok).toBe(true);
  });

  it('fails when version does not match', () => {
    const check = validateCliVersion('0.1.0\n', '0.2.0-beta.1');
    expect(check.ok).toBe(false);
    expect(check.message).toContain('mismatch');
  });
});

// ─── validateCliHelp ────────────────────────────────────────────────

describe('validateCliHelp', () => {
  it('passes when all commands are present', () => {
    const helpOutput = `
Usage: deckent [options] [command]

Commands:
  init          Initialize project
  start         Run sprint
  plan          Plan sprint
  status        Show status
  doctor        Health check
`;
    const check = validateCliHelp(helpOutput);
    expect(check.ok).toBe(true);
  });

  it('fails when commands are missing', () => {
    const helpOutput = 'Usage: deckent [options]\n  init\n';
    const check = validateCliHelp(helpOutput);
    expect(check.ok).toBe(false);
    expect(check.message).toContain('Missing');
  });
});

// ─── validateInitStructure ──────────────────────────────────────────

describe('validateInitStructure', () => {
  it('passes when all expected directories exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vinit-'));
    mkdirSync(join(dir, '.deckent'), { recursive: true });
    mkdirSync(join(dir, '.brain'), { recursive: true });
    writeFileSync(join(dir, 'DECKENT.md'), '# DECKENT');

    const checks = validateInitStructure(dir);
    expect(checks.every(c => c.ok)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails when .deckent is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vinit-'));
    mkdirSync(join(dir, '.brain'), { recursive: true });
    writeFileSync(join(dir, 'DECKENT.md'), '# DECKENT');

    const checks = validateInitStructure(dir);
    const deckentCheck = checks.find(c => c.name === 'init creates .deckent');
    expect(deckentCheck?.ok).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails when .brain is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vinit-'));
    mkdirSync(join(dir, '.deckent'), { recursive: true });
    writeFileSync(join(dir, 'DECKENT.md'), '# DECKENT');

    const checks = validateInitStructure(dir);
    const brainCheck = checks.find(c => c.name === 'init creates .brain');
    expect(brainCheck?.ok).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

// ─── validateDoctorOutput ───────────────────────────────────────────

describe('validateDoctorOutput', () => {
  it('passes when output contains health check results', () => {
    const output = `
  node_version   v20.11.0 (>=18 required)     [pass]
  git            git 2.43.0                    [pass]
  tmux           tmux 3.3a                     [pass]
`;
    const check = validateDoctorOutput(output);
    expect(check.ok).toBe(true);
  });

  it('passes when output contains PASS markers', () => {
    const check = validateDoctorOutput('node_version: PASS\ngit: PASS');
    expect(check.ok).toBe(true);
  });

  it('passes when output contains ok markers', () => {
    const check = validateDoctorOutput('All checks ok. System healthy.');
    expect(check.ok).toBe(true);
  });

  it('fails when output is too short/empty', () => {
    const check = validateDoctorOutput('');
    expect(check.ok).toBe(false);
  });

  it('passes with non-empty output that has enough content', () => {
    const check = validateDoctorOutput('Some meaningful doctor output with health information');
    expect(check.ok).toBe(true);
  });
});

// ─── Constants ──────────────────────────────────────────────────────

describe('constants', () => {
  it('SENSITIVE_PATTERNS includes critical exclusions', () => {
    expect(SENSITIVE_PATTERNS).toContain('.brain/');
    expect(SENSITIVE_PATTERNS).toContain('.deckent/');
    expect(SENSITIVE_PATTERNS).toContain('tests/');
    expect(SENSITIVE_PATTERNS).toContain('src/');
    expect(SENSITIVE_PATTERNS).toContain('.env');
    expect(SENSITIVE_PATTERNS).toContain('.claude/');
  });

  it('REQUIRED_PATTERNS includes essential files', () => {
    expect(REQUIRED_PATTERNS).toContain('dist/');
    expect(REQUIRED_PATTERNS).toContain('README.md');
    expect(REQUIRED_PATTERNS).toContain('LICENSE');
    expect(REQUIRED_PATTERNS).toContain('package.json');
  });
});
