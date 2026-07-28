import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const temporaryRoots: string[] = [];

function fixtureRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function cleanScriptFixture(
  prefix: string,
  options: { withDependencies?: boolean } = {},
): { root: string; scriptPath: string } {
  const root = fixtureRoot(prefix);
  const scriptsDir = join(root, 'scripts');
  const scriptPath = join(scriptsDir, 'clean.mjs');
  mkdirSync(scriptsDir, { recursive: true });
  copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);
  if (options.withDependencies !== false) {
    symlinkSync(
      join(REPO_ROOT, 'node_modules'),
      join(root, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
  return { root, scriptPath };
}

function runNode(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', rejectPromise);
    child.on('close', code => {
      clearTimeout(timeout);
      resolvePromise({ code, output });
    });
  });
}

function cleanDistFixture(
  fixture: { root: string; scriptPath: string },
): Promise<{ code: number | null; output: string }> {
  return runNode([fixture.scriptPath], fixture.root, {
    ...process.env,
    DECKENT_TEST_HERMETICITY: '0',
    VITEST: 'false',
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('cleanDist hermetic boundary', () => {
  it('refuses its physical source root without risking the live checkout', async () => {
    const fixture = cleanScriptFixture('deckent-clean-source-authority-');
    const sentinel = join(fixture.root, 'dist', 'cli', 'entry.js');
    mkdirSync(join(fixture.root, 'dist', 'cli'), { recursive: true });
    writeFileSync(sentinel, 'preserve');

    const result = await runNode([fixture.scriptPath], fixture.root, {
      ...process.env,
      DECKENT_TEST_HERMETICITY: '1',
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain('E_HERMETIC_DIST_CLEAN');
    expect(readFileSync(sentinel, 'utf-8')).toBe('preserve');
  });

  it('rejects caller-supplied authority without touching either physical root', async () => {
    const fixture = cleanScriptFixture('deckent-clean-call-authority-');
    const unrelatedRoot = fixtureRoot('deckent-clean-victim-authority-');
    const physicalEntry = join(fixture.root, 'dist', 'cli', 'entry.js');
    const victimSentinel = join(unrelatedRoot, 'dist', 'cli', 'entry.js');
    const authorityResult = join(
      fixture.root,
      '.caller-authority-result.json',
    );
    mkdirSync(join(fixture.root, 'dist', 'cli'), { recursive: true });
    mkdirSync(join(unrelatedRoot, 'dist', 'cli'), { recursive: true });
    writeFileSync(physicalEntry, 'remove-from-physical-source');
    writeFileSync(victimSentinel, 'preserve-victim');
    const source = `
      import { writeFileSync } from 'node:fs';
      import { cleanDist } from ${JSON.stringify(pathToFileURL(fixture.scriptPath).href)};
      try {
        cleanDist({
          rootDir: ${JSON.stringify(unrelatedRoot)},
        });
        writeFileSync(
          ${JSON.stringify(authorityResult)},
          JSON.stringify({ code: 'unexpected-success' }),
          'utf8'
        );
        process.exitCode = 0;
      } catch (error) {
        writeFileSync(
          ${JSON.stringify(authorityResult)},
          JSON.stringify({ code: error?.code ?? 'UNTYPED' }),
          'utf8'
        );
        process.exitCode = 19;
      }
    `;

    const result = await runNode(
      ['--input-type=module', '--eval', source],
      fixture.root,
      {
        ...process.env,
        DECKENT_TEST_HERMETICITY: '0',
        VITEST: 'false',
      },
    );

    expect(result.code).toBe(19);
    expect(JSON.parse(readFileSync(authorityResult, 'utf8'))).toEqual({
      code: 'E_CLEAN_OPERATION_OPTIONS_INVALID',
    });
    expect(readFileSync(physicalEntry, 'utf8'))
      .toBe('remove-from-physical-source');
    expect(readFileSync(victimSentinel, 'utf-8')).toBe('preserve-victim');
  });

  it('fails closed when the canonical SQLite authority dependency is unavailable', async () => {
    const fixture = cleanScriptFixture(
      'deckent-clean-module-unavailable-',
      { withDependencies: false },
    );
    const sentinel = join(fixture.root, 'dist', 'cli', 'entry.js');
    mkdirSync(join(sentinel, '..'), { recursive: true });
    writeFileSync(sentinel, 'must-survive', 'utf8');

    const result = await cleanDistFixture(fixture);

    expect(result.code).toBe(1);
    expect(result.output).toContain('MODULE_UNAVAILABLE');
    expect(readFileSync(sentinel, 'utf8')).toBe('must-survive');
  });

  it('cleans only its physical temp fixture and preserves dashboard', async () => {
    const fixture = cleanScriptFixture('deckent-clean-fixture-');
    mkdirSync(join(fixture.root, 'dist', 'cli'), { recursive: true });
    mkdirSync(join(fixture.root, 'dist', 'dashboard'), { recursive: true });
    writeFileSync(join(fixture.root, 'dist', 'cli', 'entry.js'), 'remove');
    writeFileSync(join(fixture.root, 'dist', 'dashboard', 'index.html'), 'preserve');

    const result = await cleanDistFixture(fixture);

    expect(result.code).toBe(0);
    expect(readFileSync(join(fixture.root, 'dist', 'dashboard', 'index.html'), 'utf-8'))
      .toBe('preserve');
    expect(() => lstatSync(join(fixture.root, 'dist', 'cli'))).toThrow();
  });

  it('preserves a case variant only when the filesystem resolves it as dashboard', async () => {
    const fixture = cleanScriptFixture('deckent-clean-casefold-fixture-');
    mkdirSync(join(fixture.root, 'dist', 'Dashboard'), { recursive: true });
    mkdirSync(join(fixture.root, 'dist', 'cli'), { recursive: true });
    writeFileSync(join(fixture.root, 'dist', 'Dashboard', 'index.html'), 'preserve');
    writeFileSync(join(fixture.root, 'dist', 'cli', 'entry.js'), 'remove');
    const caseVariantAliasesCanonical = existsSync(join(fixture.root, 'dist', 'dashboard'))
      && realpathSync.native(join(fixture.root, 'dist', 'Dashboard'))
        === realpathSync.native(join(fixture.root, 'dist', 'dashboard'));

    const result = await cleanDistFixture(fixture);

    expect(result.code).toBe(0);
    expect(existsSync(join(fixture.root, 'dist', 'Dashboard')))
      .toBe(caseVariantAliasesCanonical);
    expect(existsSync(join(fixture.root, 'dist', 'cli'))).toBe(false);
  });

  it('refuses a symlinked dist target instead of following or deleting it', async () => {
    const fixture = cleanScriptFixture('deckent-clean-link-root-');
    const external = fixtureRoot('deckent-clean-link-target-');
    writeFileSync(join(external, 'sentinel.txt'), 'unchanged');
    symlinkSync(
      external,
      join(fixture.root, 'dist'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const result = await runNode([fixture.scriptPath], fixture.root, {
      ...process.env,
      DECKENT_TEST_HERMETICITY: '0',
      VITEST: 'false',
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain('E_CLEAN_DIST_SYMLINK');
    expect(readFileSync(join(external, 'sentinel.txt'), 'utf-8')).toBe('unchanged');
  });

  it('refuses a preserved dashboard symlink before a later build can follow it', async () => {
    const fixture = cleanScriptFixture('deckent-clean-preserved-link-root-');
    const external = fixtureRoot('deckent-clean-preserved-link-target-');
    const removableSentinel = join(fixture.root, 'dist', 'cli', 'entry.js');
    mkdirSync(join(fixture.root, 'dist'), { recursive: true });
    mkdirSync(join(fixture.root, 'dist', 'cli'), { recursive: true });
    writeFileSync(join(external, 'sentinel.txt'), 'unchanged');
    writeFileSync(removableSentinel, 'preserve-on-preflight-failure');
    symlinkSync(
      external,
      join(fixture.root, 'dist', 'dashboard'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const result = await runNode([fixture.scriptPath], fixture.root, {
      ...process.env,
      DECKENT_TEST_HERMETICITY: '0',
      VITEST: 'false',
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain('E_CLEAN_PRESERVED_SYMLINK');
    expect(readFileSync(join(external, 'sentinel.txt'), 'utf-8')).toBe('unchanged');
    expect(readFileSync(removableSentinel, 'utf-8'))
      .toBe('preserve-on-preflight-failure');
  });

  it.skipIf(process.platform === 'win32')(
    'recognizes symlink invocation as the direct clean entrypoint',
    async () => {
      const fixture = cleanScriptFixture('deckent-clean-entry-source-');
      const aliasRoot = fixtureRoot('deckent-clean-entry-alias-');
      const linkedEntry = join(aliasRoot, 'clean-link.mjs');
      const sentinel = join(fixture.root, 'dist', 'cli', 'entry.js');
      mkdirSync(join(fixture.root, 'dist', 'cli'), { recursive: true });
      writeFileSync(sentinel, 'preserve');
      symlinkSync(fixture.scriptPath, linkedEntry);
      const result = await runNode([linkedEntry], aliasRoot, {
        ...process.env,
        DECKENT_TEST_HERMETICITY: '1',
      });

      expect(result.code).toBe(1);
      expect(result.output).toContain('E_HERMETIC_DIST_CLEAN');
      expect(readFileSync(sentinel, 'utf-8')).toBe('preserve');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'uses physical source authority under --preserve-symlinks-main',
    async () => {
      const fixture = cleanScriptFixture('deckent-clean-preserve-source-');
      const aliasRoot = fixtureRoot('deckent-clean-preserve-alias-');
      const aliasScripts = join(aliasRoot, 'scripts');
      const linkedEntry = join(aliasScripts, 'clean.mjs');
      const physicalEntry = join(fixture.root, 'dist', 'cli', 'entry.js');
      const aliasEntry = join(aliasRoot, 'dist', 'cli', 'entry.js');
      mkdirSync(join(fixture.root, 'dist', 'cli'), { recursive: true });
      mkdirSync(join(aliasRoot, 'dist', 'cli'), { recursive: true });
      writeFileSync(physicalEntry, 'remove-from-physical-source');
      writeFileSync(aliasEntry, 'preserve-alias-root');
      mkdirSync(aliasScripts, { recursive: true });
      symlinkSync(fixture.scriptPath, linkedEntry);

      const result = await runNode(
        ['--preserve-symlinks-main', linkedEntry],
        aliasRoot,
        {
          ...process.env,
          DECKENT_TEST_HERMETICITY: '0',
          VITEST: 'false',
        },
      );

      expect(result.code).toBe(0);
      expect(existsSync(physicalEntry)).toBe(false);
      expect(readFileSync(aliasEntry, 'utf-8')).toBe('preserve-alias-root');
    },
  );
});
