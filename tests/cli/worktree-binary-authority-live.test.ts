import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIR, '../..');
const ENTRY_BIN = join(PROJECT_ROOT, 'dist/cli/entry.js');
const BUILD_IDENTITY = join(PROJECT_ROOT, 'dist/build-identity.json');
const HAS_REBUILT_BINARY = existsSync(ENTRY_BIN) && existsSync(BUILD_IDENTITY);

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function run(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = {}): Promise<SpawnResult> {
  return await new Promise<SpawnResult>((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [ENTRY_BIN, ...args], {
      cwd,
      env: {
        ...process.env,
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        DECKENT_OFFLINE: '1',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      rejectResult(new Error('worktree binary authority live smoke timed out'));
    }, 8_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectResult(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveResult({ code, stdout, stderr });
    });
  });
}

async function runExecutable(executable: string, args: readonly string[], cwd: string): Promise<SpawnResult> {
  return await new Promise<SpawnResult>((resolveResult, rejectResult) => {
    const child = spawn(executable, [...args], {
      cwd,
      env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', DECKENT_OFFLINE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });
    child.on('error', rejectResult);
    child.on('close', (code) => resolveResult({ code, stdout, stderr }));
  });
}

describe.skipIf(!HAS_REBUILT_BINARY)('worktree binary authority — rebuilt CLI', () => {
  let checkout: string;

  beforeEach(() => {
    checkout = mkdtempSync(join(tmpdir(), 'deckent-binary-authority-live-'));
    mkdirSync(join(checkout, '.deckent'), { recursive: true });
    writeFileSync(
      join(checkout, 'package.json'),
      `${JSON.stringify({ name: 'deckent', version: '0.0.0-test' })}\n`,
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(checkout, { recursive: true, force: true });
  });

  it.each(['docker', 'subprocess'])(
    'holds a mismatched %s-shaped start before any runtime state is created',
    async (backend) => {
      const result = await run(['start', '--backend', backend], checkout);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('DECKENT_BINARY_IDENTITY_HOLD');
      expect(result.stderr).toContain('npm run build:all');
      expect(existsSync(join(checkout, '.tasks'))).toBe(false);
      expect(existsSync(join(checkout, '.deckent', 'sprint-state.json'))).toBe(false);
    },
  );

  it('keeps help reachable from a mismatched Deckent checkout', async () => {
    const result = await run(['--help'], checkout);

    expect(result.code).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/Usage:\s*deckent/);
    expect(result.stderr).not.toContain('DECKENT_BINARY_IDENTITY_HOLD');
  });

  it('requires an explicit override and surfaces that override before continuing', async () => {
    const result = await run(
      ['unknown-command-for-identity-smoke'],
      checkout,
      { DECKENT_ALLOW_CROSS_CHECKOUT_BINARY: '1' },
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('DECKENT_BINARY_IDENTITY_OVERRIDE');
    expect(result.stderr).not.toContain('DECKENT_BINARY_IDENTITY_HOLD');
    expect(result.stderr.toLowerCase()).toContain('unknown command');
  });

  it.skipIf(process.platform === 'win32')(
    'enforces the same HOLD through an npm-link-shaped executable symlink',
    async () => {
      const launcher = join(checkout, 'deckent-linked');
      symlinkSync(ENTRY_BIN, launcher, 'file');

      const result = await runExecutable(launcher, ['status'], checkout);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('DECKENT_BINARY_IDENTITY_HOLD');
      expect(existsSync(join(checkout, '.tasks'))).toBe(false);
    },
  );
});
