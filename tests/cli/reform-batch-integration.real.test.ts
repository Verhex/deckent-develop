/**
 * Terminal verification wave for the reformed CLI surface.
 *
 * This suite intentionally executes the compiled entry point. It has no mocked
 * process boundary and fails closed when dist is absent or stale.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { DEPRECATED_FORWARDING } from '../../src/cli/surface-contract.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY_BIN = join(REPO_ROOT, 'dist/cli/entry.js');
const SURFACE_GATE = join(REPO_ROOT, 'scripts/lint-cli-surface.mjs');
const FORWARDED_SENTINEL = '--reform-forwarded-sentinel';
const TIMEOUT_MS = 20_000;
const REQUIRED_TARGET_ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
  'plan-nl': ['forwarded-goal'],
  recall: ['forwarded-query'],
  remember: ['forwarded-note'],
};

interface ProcessResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface Fixture {
  readonly root: string;
  readonly project: string;
  readonly home: string;
}

const fixtures: Fixture[] = [];

function createFixture(label: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), `deckent-reform-${label}-`));
  const project = join(root, 'project');
  const home = join(root, 'home');
  mkdirSync(join(project, 'src'), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(project, 'package.json'), '{"name":"reform-smoke","private":true}\n');
  const fixture = { root, project, home };
  fixtures.push(fixture);
  return fixture;
}

function runProcess(
  executable: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly home?: string },
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolveResult, rejectResult) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DECKENT_LANGUAGE: 'en',
      DECKENT_OFFLINE: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    };
    if (options.home !== undefined) {
      env['HOME'] = options.home;
      env['XDG_CONFIG_HOME'] = join(options.home, '.config');
      env['XDG_CACHE_HOME'] = join(options.home, '.cache');
      env['XDG_DATA_HOME'] = join(options.home, '.local', 'share');
    }

    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      if (!settled) {
        settled = true;
        rejectResult(new Error(
          `process timed out: ${executable} ${args.join(' ')}; stdout=${stdout}; stderr=${stderr}`,
        ));
      }
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        rejectResult(error);
      }
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolveResult({ code, signal, stdout, stderr });
      }
    });
  });
}

function runBinary(args: readonly string[], fixture: Fixture): Promise<ProcessResult> {
  return runProcess(process.execPath, [ENTRY_BIN, ...args], {
    cwd: fixture.project,
    home: fixture.home,
  });
}

function commandRows(output: string): readonly string[] {
  return output.split(/\r?\n/).filter((line) => /^\s{2}\S/.test(line));
}

beforeAll(() => {
  expect(existsSync(ENTRY_BIN), 'real-binary gate requires dist/cli/entry.js').toBe(true);
});

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

describe('CLI surface gates', () => {
  it('passes the registration gate and the package-resolved CLI parity gate', async () => {
    const registration = await runProcess(process.execPath, [SURFACE_GATE], { cwd: REPO_ROOT });
    expect(registration.code, registration.stdout + registration.stderr).toBe(0);
    expect(registration.stdout).toContain('CLI surface gate clean');

    const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const parityCommand = packageJson.scripts?.['lint:parity'];
    expect(parityCommand).toBe('node scripts/lint-cli-mcp-parity.mjs');
    const parity = await runProcess(
      process.execPath,
      [join(REPO_ROOT, 'scripts/lint-cli-mcp-parity.mjs')],
      { cwd: REPO_ROOT },
    );
    expect(parity.code, parity.stdout + parity.stderr).toBe(0);
  });
});

describe('generated root help against the compiled binary', () => {
  it('keeps deprecated aliases out of primary groups and exposes every new group member', async () => {
    const fixture = createFixture('help');
    const [rootHelp, auditHelp, autonomousHelp, memoryHelp] = await Promise.all([
      runBinary(['help'], fixture),
      runBinary(['audit', '--help'], fixture),
      runBinary(['autonomous', '--help'], fixture),
      runBinary(['memory', '--help'], fixture),
    ]);

    for (const result of [rootHelp, auditHelp, autonomousHelp, memoryHelp]) {
      expect(result.code, result.stdout + result.stderr).toBe(0);
      expect(result.signal).toBeNull();
    }

    const primaryRows = commandRows(rootHelp.stdout);
    for (const surface of DEPRECATED_FORWARDING) {
      expect(
        primaryRows.some((row) => new RegExp(`^\\s{2}${surface.command}(?:\\s|$)`).test(row)),
        `${surface.command} must not be rendered as a primary command`,
      ).toBe(false);
    }
    expect(rootHelp.stdout).toContain('Run');
    expect(rootHelp.stdout).toContain('Observe');
    expect(rootHelp.stdout).toContain('Control');
    expect(rootHelp.stdout).toContain('System');
    expect(auditHelp.stdout).toMatch(/^\s{2}verify(?:\s|$)/m);
    expect(autonomousHelp.stdout).toMatch(/^\s{2}mission(?:\s|$)/m);
    expect(memoryHelp.stdout).toMatch(/^\s{2}recall(?:\s|$)/m);
    expect(memoryHelp.stdout).toMatch(/^\s{2}remember(?:\s|$)/m);
  });
});

describe('all deprecated aliases forward through the compiled binary', () => {
  it.each(DEPRECATED_FORWARDING)(
    '$command emits one typed warning and forwards an argument to $replacement',
    async (surface) => {
      const fixture = createFixture(surface.command);
      const targetArguments = REQUIRED_TARGET_ARGUMENTS[surface.command] ?? [];
      const result = await runBinary(
        [surface.command, ...targetArguments, FORWARDED_SENTINEL],
        fixture,
      );
      const warning = getMessage(surface.warningKey, 'en');
      const warningLines = result.stdout.split(/\r?\n/).filter((line) => line === warning);

      expect(warning).not.toBe(surface.warningKey);
      expect(warning).not.toContain('\n');
      expect(warningLines, result.stdout + result.stderr).toEqual([warning]);
      expect(result.signal).toBeNull();
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(`unknown option '${FORWARDED_SENTINEL}'`);
    },
  );
});
