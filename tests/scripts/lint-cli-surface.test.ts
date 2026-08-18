// Tests for the 559-005 extensions to scripts/lint-i18n-hardcode.mjs
// (.description(/description: literal scan) and scripts/lint-cli-mcp-parity.mjs
// (MCP↔CLI description-key parity).
//
// Hermetic: every fixture lives under mkdtempSync(tmpdir()), torn down in
// afterEach. Both scripts resolve their project root via
// `dirname(fileURLToPath(import.meta.url)) + '..'` — relative to the SCRIPT's
// own location, not `cwd` — so a fixture must copy the (current, on-disk)
// script content into `<tmp>/scripts/*.mjs` alongside a synthetic
// `<tmp>/src/...` tree, then spawn the copied script. No real-repo scan runs
// in this file; the real-repo 0-exit proof is a separate `node scripts/...`
// invocation (see task result notes), matching the task's "gerçek repo
// taraması testte koşulmaz" instruction. Async spawn only — no spawnSync.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const I18N_HARDCODE_SRC = fileURLToPath(new URL('../../scripts/lint-i18n-hardcode.mjs', import.meta.url));
const CLI_MCP_PARITY_SRC = fileURLToPath(new URL('../../scripts/lint-cli-mcp-parity.mjs', import.meta.url));

function runScript(scriptPath: string, args: string[] = []): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

/** writeFileSync that creates the parent directory first (writeFileSync does not). */
function writeFileEnsuringDir(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Copies the current on-disk lint scripts into `<tmpRoot>/scripts/`. */
function installScripts(tmpRoot: string): void {
  const scriptsDir = join(tmpRoot, 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  writeFileEnsuringDir(join(scriptsDir, 'lint-i18n-hardcode.mjs'), readFileSync(I18N_HARDCODE_SRC, 'utf8'));
  writeFileEnsuringDir(join(scriptsDir, 'lint-cli-mcp-parity.mjs'), readFileSync(CLI_MCP_PARITY_SRC, 'utf8'));
}

function writeCliFoo(tmpRoot: string, descriptionCall: string): void {
  const path = join(tmpRoot, 'src', 'cli', 'commands', 'foo.ts');
  writeFileEnsuringDir(
    path,
    [
      "import { getMessage, getLanguage } from '../helpers/messages.js';",
      'export function registerFoo(program) {',
      '  program',
      "    .command('foo')",
      `    ${descriptionCall}`,
      '    .action(() => {});',
      '}',
      '',
    ].join('\n'),
  );
}

function writeCliIndex(tmpRoot: string): void {
  const path = join(tmpRoot, 'src', 'cli', 'index.ts');
  writeFileEnsuringDir(
    path,
    [
      "import { getMessage, getLanguage } from './helpers/messages.js';",
      'export function buildProgram(program) {',
      "  program.description(getMessage('cli.program.desc', getLanguage(undefined)));",
      '}',
      '',
    ].join('\n'),
  );
}

function writeMcpFoo(tmpRoot: string, descriptionField: string): void {
  const path = join(tmpRoot, 'src', 'mcp', 'tools', 'foo.ts');
  writeFileEnsuringDir(
    path,
    [
      "import { mcpToolDescription } from './description-catalog.js';",
      'export function registerFooTool(server) {',
      '  server.registerTool(',
      "    'deckent_foo',",
      '    {',
      `      ${descriptionField}`,
      '    },',
      '    async () => ({}),',
      '  );',
      '}',
      '',
    ].join('\n'),
  );
}

function writeDescriptionCatalog(tmpRoot: string, boundKey: string): void {
  const path = join(tmpRoot, 'src', 'mcp', 'tools', 'description-catalog.ts');
  writeFileEnsuringDir(
    path,
    [
      'export const MCP_TOOL_DESCRIPTION_BINDINGS = {',
      `  deckent_foo: { key: '${boundKey}', surface: 'cli-shared' },`,
      '};',
      'export function mcpToolDescription(name) { return name; }',
      '',
    ].join('\n'),
  );
}

function writeBaseline(tmpRoot: string): void {
  const path = join(tmpRoot, 'scripts', 'cli-mcp-parity-baseline.json');
  writeFileEnsuringDir(path, JSON.stringify({ cliOnly: [], mcpOnly: [], descriptionKeyGaps: [] }, null, 2) + '\n');
}

/** Full clean tree: CLI+MCP+catalog all consistent, both scripts should pass. */
function buildFullCleanTree(tmpRoot: string): void {
  installScripts(tmpRoot);
  mkdirSync(join(tmpRoot, 'src', 'desktop', 'src', 'main'), { recursive: true });
  writeCliFoo(tmpRoot, ".description(getMessage('cli.foo.desc', getLanguage(undefined)))");
  writeCliIndex(tmpRoot);
  writeMcpFoo(tmpRoot, 'description: mcpToolDescription(\'deckent_foo\'),');
  writeDescriptionCatalog(tmpRoot, 'cli.foo.desc');
  writeBaseline(tmpRoot);
}

describe('lint-i18n-hardcode.mjs — .description(/description: scan (559-005)', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it('fails (exit 1) on a hardcoded .description(\'...\') literal', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-desc-'));
    buildFullCleanTree(tmpRoot);
    // Overwrite the CLI command with a bare literal instead of getMessage(...).
    writeCliFoo(tmpRoot, ".description('Hardcoded natural language description')");

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'));
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Hardcoded natural language description');
  });

  it('fails (exit 1) on a hardcoded description: \'...\' property in an MCP tool module', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-desc-'));
    buildFullCleanTree(tmpRoot);
    // Overwrite the MCP tool registration with a bare literal instead of mcpToolDescription(...).
    writeMcpFoo(tmpRoot, "description: 'Hardcoded mcp tool description text',");

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'));
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Hardcoded mcp tool description text');
  });

  it('passes (exit 0) when every description resolves through getMessage()/mcpToolDescription()', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-desc-'));
    buildFullCleanTree(tmpRoot);

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('i18n gate clean');
  });

  it('does not false-positive on an unrelated description: data field in a CLI command file', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-desc-'));
    buildFullCleanTree(tmpRoot);
    // A CLI-command-file data shape unrelated to commander (mirrors
    // DoctorFixAction/AgenticAction in the real repo) must NOT be scanned as
    // a description: property — that pattern is MCP-tools-only by design.
    const path = join(tmpRoot, 'src', 'cli', 'commands', 'foo.ts');
    const existing = readFileSync(path, 'utf8');
    writeFileSync(
      path,
      existing
      + "\nexport const someAction = { kind: 'noop', description: `Unrelated data literal for ${'x'}` };\n",
    );

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'));
    expect(result.code).toBe(0);
  });
});

describe('lint-cli-mcp-parity.mjs — description-key parity (559-005)', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it('fails (exit 1) when a cli-shared binding key drifts from the CLI command\'s real key', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-parity-desc-'));
    buildFullCleanTree(tmpRoot);
    // The binding now claims a key the CLI command never actually reads.
    writeDescriptionCatalog(tmpRoot, 'cli.foo.WRONG_DESC_KEY');

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-cli-mcp-parity.mjs'));
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('deckent_foo:cli.foo.WRONG_DESC_KEY');
  });

  it('passes (exit 0) when the cli-shared binding key matches the CLI command\'s real key', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-parity-desc-'));
    buildFullCleanTree(tmpRoot);

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-cli-mcp-parity.mjs'));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No NEW parity gaps beyond the accepted baseline');
  });
});
