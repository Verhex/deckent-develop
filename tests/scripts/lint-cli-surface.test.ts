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
      "import { registerFoo } from './commands/foo.js';",
      'export function buildProgram(program) {',
      "  program.description(getMessage('cli.program.desc', getLanguage(undefined)));",
      "  program.command('foo').description(getMessage('cli.foo.desc', getLanguage(undefined)));",
      '  registerFoo(program);',
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

/**
 * The parity gate reads `src/core/command-registry.ts` unconditionally (it
 * cross-checks the baseline's `intentionalCliAuthority` rows against the
 * registry catalog), so a hermetic fixture must provide one or the script dies
 * with ENOENT before printing anything. The fixture baseline declares no
 * authority intent, so a registry with no catalog rows is the correct clean
 * tree. `src/core` is outside every i18n-gate scan root, so this file cannot
 * perturb the lint-i18n-hardcode.mjs fixtures above.
 */
function writeCoreCommandRegistry(tmpRoot: string): void {
  const path = join(tmpRoot, 'src', 'core', 'command-registry.ts');
  writeFileEnsuringDir(
    path,
    [
      '// Fixture registry — projection of the path-level contract SSOT.',
      'export const COMMAND_REGISTRY = [];',
      '',
    ].join('\n'),
  );
}

/** Full clean tree: CLI+MCP+catalog all consistent, both scripts should pass. */
function buildFullCleanTree(tmpRoot: string): void {
  installScripts(tmpRoot);
  writeCoreCommandRegistry(tmpRoot);
  mkdirSync(join(tmpRoot, 'src', 'desktop', 'src', 'main'), { recursive: true });
  writeCliFoo(tmpRoot, ".description(getMessage('cli.foo.desc', getLanguage(undefined)))");
  writeCliIndex(tmpRoot);
  writeMcpFoo(tmpRoot, 'description: mcpToolDescription(\'deckent_foo\'),');
  writeDescriptionCatalog(tmpRoot, 'cli.foo.desc');
  // The parity gate now reads the CLI surface registry as a second authority.
  writeCliSurfaceRegistry(tmpRoot, ['foo']);
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

// ─── CLI-CONTRACT-001 — commander help-surface scan ─────────────────────────
//
// The i18n gate now also scans the REST of the commander help surface —
// `.option(`/`.requiredOption(`, `.argument(`, `.helpOption(` and
// `.addHelpText(` — in src/cli/commands/*.ts + src/cli/index.ts.
//
// That surface carries hundreds of pre-existing English literals, so it is a
// RATCHET by default (observed count may never exceed the declared ceiling)
// with an opt-in `--surface-gate` hard mode for the closure family tasks that
// migrate it. Both modes are proven hermetically below, on tmpdir fixtures —
// never against the real repo.

/** A clean tree whose `foo` command chains `extraChain` after .description(). */
function buildTreeWithChain(tmpRoot: string, extraChain: string): void {
  buildFullCleanTree(tmpRoot);
  writeCliFoo(
    tmpRoot,
    `.description(getMessage('cli.foo.desc', getLanguage(undefined)))\n    ${extraChain}`,
  );
}

describe('lint-i18n-hardcode.mjs — commander help-surface scan (CLI-CONTRACT-001)', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  const HARDCODED_OPTION = ".option('--verbose', 'Print a lot of detail while running')";

  it('reports a hardcoded .option() description but stays exit 0 under the declared ratchet ceiling', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-surface-'));
    buildTreeWithChain(tmpRoot, HARDCODED_OPTION);

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'));
    expect(result.code).toBe(0);
    // Reported (never silent) — with the surface label and the literal itself.
    expect(result.stdout).toContain('Print a lot of detail while running');
    expect(result.stdout).toContain('option-single-quote');
    expect(result.stdout).toContain('Surface scan');
  });

  it('--surface-gate turns the same .option() literal into a hard failure', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-surface-'));
    buildTreeWithChain(tmpRoot, HARDCODED_OPTION);

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'), ['--surface-gate']);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Print a lot of detail while running');
  });

  it('--surface-baseline 0 fails the ratchet (a NEW help-surface literal cannot slip in)', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-surface-'));
    buildTreeWithChain(tmpRoot, HARDCODED_OPTION);

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'), ['--surface-baseline', '0']);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('ratchet broken');
    expect(result.stdout).not.toContain('✓ i18n gate clean');
  });

  it.each([
    ['argument', ".argument('<file>', 'Path to the input file to read')", 'Path to the input file to read'],
    ['helpOption', ".helpOption('-h, --help', 'Show this help message right here')", 'Show this help message right here'],
    ['addHelpText', ".addHelpText('after', 'Some trailing help prose for the operator')", 'Some trailing help prose for the operator'],
    ['requiredOption', ".requiredOption('--target <t>', 'Target directory to operate on')", 'Target directory to operate on'],
  ])('scans the %s surface too (hard-gated under --surface-gate)', async (_surface, chain, text) => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-surface-'));
    buildTreeWithChain(tmpRoot, chain);

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'), ['--surface-gate']);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(text);
  });

  it('does not false-positive when the help-surface text resolves through getMessage()', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-surface-'));
    buildTreeWithChain(
      tmpRoot,
      ".option('--verbose', getMessage('cli.foo.opt_verbose', getLanguage(undefined)))\n"
      + "    .argument('<file>', getMessage('cli.foo.arg_file', getLanguage(undefined)))",
    );

    const strict = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'), ['--surface-gate']);
    expect(strict.code).toBe(0);
    expect(strict.stdout).toContain('0 literal(s)');
  });

  it('a flags/name token is never itself treated as help text (first argument is skipped)', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-surface-'));
    // `--dry-run` and `<sprintId>` are technical tokens in first position with
    // NO second argument at all — nothing to gate.
    buildTreeWithChain(tmpRoot, ".option('--dry-run')\n    .argument('<sprintId>')");

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'), ['--surface-gate']);
    expect(result.code).toBe(0);
  });
});

// ─── 701-003 — registration ↔ surface-registry drift gate ───────────────────

const CLI_SURFACE_GATE_SRC = fileURLToPath(new URL('../../scripts/lint-cli-surface.mjs', import.meta.url));

function installCliSurfaceGate(tmpRoot: string): void {
  writeFileEnsuringDir(
    join(tmpRoot, 'scripts', 'lint-cli-surface.mjs'),
    readFileSync(CLI_SURFACE_GATE_SRC, 'utf8'),
  );
}

function writeCliSurfaceIndex(tmpRoot: string, registrations: string[]): void {
  writeFileEnsuringDir(
    join(tmpRoot, 'src', 'cli', 'index.ts'),
    [
      ...registrations.map((name) => `import { register${name} } from './commands/${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.js';`),
      'const program = {};',
      ...registrations.map((name) => `register${name}(program);`),
      '',
    ].join('\n'),
  );
}

function writeCliSurfaceRegistry(tmpRoot: string, visible: string[], deprecated: [string, string][] = []): void {
  writeFileEnsuringDir(
    join(tmpRoot, 'src', 'cli', 'surface-registry.ts'),
    [
      // Satır-başına-bir-row biçimi gerçek registry ile hizalı — parity-script'in
      // satır-çapası (^\\s*\\[') ancak bu biçimde eşleşir (701 el-kapanışı).
      'const VISIBLE_ROWS = [',
      ...visible.map((name) => `  ['${name}', 'system', 'x'],`),
      '] as const;',
      'const ADVANCED_ROWS = [] as const;',
      'const DEPRECATED_ROWS = [',
      ...deprecated.map(([name, replacement]) => `  ['${name}', 'x', '${replacement}'],`),
      '] as const;',
      `export const SURFACE_REGISTRY = [${[...visible, ...deprecated.map(([name]) => name)].map((name) => `{ name: '${name}' }`).join(', ')}] as const;`,
      '',
    ].join('\n'),
  );
}

function buildCliSurfaceTree(tmpRoot: string): void {
  installCliSurfaceGate(tmpRoot);
  writeCliSurfaceIndex(tmpRoot, ['Foo']);
  writeCliSurfaceRegistry(tmpRoot, ['foo']);
}

describe('lint-cli-surface.mjs — fail-closed registration drift (701-003)', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it('fails when an invoked register* command lacks a registry row', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-cli-surface-'));
    buildCliSurfaceTree(tmpRoot);
    writeCliSurfaceRegistry(tmpRoot, []);

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-cli-surface.mjs'), ['--root', tmpRoot]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('REGISTERED_WITHOUT_REGISTRY: foo');
  });

  it('fails when a registry row has no invoked register* command', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-cli-surface-'));
    buildCliSurfaceTree(tmpRoot);
    writeCliSurfaceRegistry(tmpRoot, ['foo', 'dead']);

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-cli-surface.mjs'), ['--root', tmpRoot]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('REGISTRY_WITHOUT_REGISTRATION: dead');
  });

  it('fails when a deprecated replacement has no registry command', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-cli-surface-'));
    buildCliSurfaceTree(tmpRoot);
    writeCliSurfaceRegistry(tmpRoot, ['foo'], [['old-foo', 'missing --flag']]);
    writeCliSurfaceIndex(tmpRoot, ['Foo', 'OldFoo']);

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-cli-surface.mjs'), ['--root', tmpRoot]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('DEPRECATED_REPLACEMENT_MISSING: missing');
  });

  it('ignores nested alias metadata when reading registry rows', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-cli-surface-'));
    installCliSurfaceGate(tmpRoot);
    writeCliSurfaceIndex(tmpRoot, ['Foo']);
    writeFileEnsuringDir(
      join(tmpRoot, 'src', 'cli', 'surface-registry.ts'),
      "const VISIBLE_ROWS = [['foo', 'system', 'x', ['foo-alias']]] as const;\n"
      + 'const ADVANCED_ROWS = [] as const;\n'
      + 'const DEPRECATED_ROWS = [] as const;\n',
    );

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-cli-surface.mjs'), ['--root', tmpRoot]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('CLI surface gate clean');
  });

  it('is green against the real repository', async () => {
    const result = await runScript(CLI_SURFACE_GATE_SRC);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('CLI surface gate clean');
  });
});
