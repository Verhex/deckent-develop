/**
 * ADR-D-004 (C3) mcp/ <-> cli/ sanctioned-exception registry (362-012, 361-014 debt).
 *
 * Guards scripts/lint-layer-shims.mjs + .deckent/settings/layer-shims.json:
 *   1. Unit coverage of the extraction/resolution/validation helpers.
 *   2. The real, checked-in registry has every required field (incl. `expiry`).
 *   3. The real repo check is green with the registered 2 crossings
 *      (nervous.ts, nervous-edit.ts).
 *   4. A spawned-subprocess fixture proves the ratchet: registered → exit 0,
 *      an added unregistered import in a governed file → exit 1.
 *
 * Hermetic per .claude/rules/karpathy-discipline.md (CUSTOM — Test Hermeticity):
 * all I/O under os.tmpdir(), subprocess calls via async spawn (never
 * spawnSync/execSync), fixtures torn down after each test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractCliCrossings,
  resolveSpecifier,
  loadRegistry,
  validateRegistry,
  checkFile,
  runCheck,
} from '../../scripts/lint-layer-shims.mjs';

const PROJECT_ROOT = process.cwd();
const LINT_SCRIPT = join(PROJECT_ROOT, 'scripts', 'lint-layer-shims.mjs');
const REGISTRY_PATH = join(PROJECT_ROOT, '.deckent', 'settings', 'layer-shims.json');

interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runLintScript(args: string[]): Promise<SpawnResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [LINT_SCRIPT, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
  });
}

describe('extractCliCrossings', () => {
  it('extracts a single-line named import crossing into cli/', () => {
    const crossings = extractCliCrossings(
      `import { acceptPanicGuard, listPendingPanicEvents } from '../../cli/commands/nervous.js';`,
    );
    expect(crossings).toHaveLength(1);
    expect(crossings[0].to).toBe('../../cli/commands/nervous.js');
    expect(crossings[0].symbols).toEqual(['acceptPanicGuard', 'listPendingPanicEvents']);
  });

  it('extracts a multi-line named import and strips `type` prefixes', () => {
    const src = `import {\n  handleEdit,\n  type NervousPendingStore,\n  type NervousBridgePlanResult,\n} from '../../cli/repl/nervous-bridge.js';`;
    const crossings = extractCliCrossings(src);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].symbols).toEqual(['handleEdit', 'NervousPendingStore', 'NervousBridgePlanResult']);
  });

  it('ignores imports that do not cross into cli/', () => {
    const crossings = extractCliCrossings(`import { NervousHistory } from '../../nervous/history.js';`);
    expect(crossings).toHaveLength(0);
  });

  it('finds multiple distinct crossings in one file', () => {
    const src = `import { a } from '../../cli/commands/one.js';\nimport { b } from '../../cli/commands/two.js';`;
    expect(extractCliCrossings(src)).toHaveLength(2);
  });
});

describe('resolveSpecifier', () => {
  it('resolves a relative specifier to a repo-root-relative POSIX path', () => {
    const resolved = resolveSpecifier(
      'src/mcp/tools/nervous-edit.ts',
      '../../cli/repl/nervous-bridge.js',
      PROJECT_ROOT,
    );
    expect(resolved).toBe('src/cli/repl/nervous-bridge.js');
  });
});

describe('validateRegistry', () => {
  it('flags an entry missing the mandatory expiry field', () => {
    const problems = validateRegistry({
      shims: [
        {
          id: 'X-1',
          from: 'src/mcp/tools/x.ts',
          to: 'src/cli/commands/x.js',
          symbols: ['fn'],
          reason: 'r',
          adrRef: 'ADR-D-004',
          owner: 'o',
          // expiry intentionally omitted
        },
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].missingFields).toContain('expiry');
  });

  it('passes a fully-populated entry', () => {
    const problems = validateRegistry({
      shims: [
        {
          id: 'X-1',
          from: 'src/mcp/tools/x.ts',
          to: 'src/cli/commands/x.js',
          symbols: ['fn'],
          reason: 'r',
          adrRef: 'ADR-D-004',
          owner: 'o',
          expiry: '2027-01-02',
        },
      ],
    });
    expect(problems).toHaveLength(0);
  });
});

describe('the real, checked-in layer-shims.json registry', () => {
  const registry = loadRegistry(REGISTRY_PATH);

  it('has at least the 2 registered nervous-system crossings (361-014 debt)', () => {
    const ids = (registry.shims ?? []).map((s: { id: string }) => s.id);
    expect(ids).toContain('D004-SHIM-001');
    expect(ids).toContain('D004-SHIM-002');
  });

  it('every entry has all required fields, including a non-empty expiry', () => {
    expect(validateRegistry(registry)).toHaveLength(0);
  });

  it('is green against the real repo — no unregistered crossings in governed files', () => {
    const results = runCheck(registry, PROJECT_ROOT);
    expect(results, JSON.stringify(results)).toHaveLength(0);
  });
});

describe('checkFile — direct unit check against real governed files', () => {
  it('nervous-edit.ts crossing matches its registered symbols', () => {
    const registry = loadRegistry(REGISTRY_PATH);
    const entry = (registry.shims ?? []).find((s: { id: string }) => s.id === 'D004-SHIM-002');
    const violations = checkFile(
      join(PROJECT_ROOT, 'src/mcp/tools/nervous-edit.ts'),
      'src/mcp/tools/nervous-edit.ts',
      [entry],
      PROJECT_ROOT,
    );
    expect(violations).toHaveLength(0);
  });
});

describe('spawned CLI — fixture ratchet (kayıtsız-yeni-crossing FAIL)', () => {
  let fixtureDir: string;

  afterEach(() => {
    if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
  });

  function writeFixture(governedFileContent: string) {
    fixtureDir = mkdtempSync(join(tmpdir(), 'deckent-layer-shims-'));
    mkdirSync(join(fixtureDir, 'src', 'mcp', 'tools'), { recursive: true });
    writeFileSync(join(fixtureDir, 'src', 'mcp', 'tools', 'widget.ts'), governedFileContent, 'utf-8');
    const registryPath = join(fixtureDir, 'layer-shims.json');
    writeFileSync(
      registryPath,
      JSON.stringify({
        shims: [
          {
            id: 'FIXTURE-1',
            from: 'src/mcp/tools/widget.ts',
            to: 'src/cli/commands/widget.js',
            symbols: ['doWidget'],
            reason: 'fixture',
            adrRef: 'ADR-D-004',
            owner: 'test',
            expiry: '2099-01-01',
          },
        ],
      }),
      'utf-8',
    );
    return registryPath;
  }

  it('exits 0 when the governed file only uses registered symbols', async () => {
    const registryPath = writeFixture(
      `import { doWidget } from '../../cli/commands/widget.js';\ndoWidget();\n`,
    );
    const result = await runLintScript(['--root', fixtureDir, '--registry', registryPath]);
    expect(result.code, result.stderr).toBe(0);
  });

  it('exits 1 when the governed file gains an unregistered symbol from the same module', async () => {
    const registryPath = writeFixture(
      `import { doWidget, doExtra } from '../../cli/commands/widget.js';\ndoWidget();\ndoExtra();\n`,
    );
    const result = await runLintScript(['--root', fixtureDir, '--registry', registryPath]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('unregistered symbol');
  });

  it('exits 1 when the governed file gains an entirely new, unregistered cli/ crossing', async () => {
    const registryPath = writeFixture(
      `import { doWidget } from '../../cli/commands/widget.js';\nimport { sneak } from '../../cli/helpers/sneaky.js';\ndoWidget();\nsneak();\n`,
    );
    const result = await runLintScript(['--root', fixtureDir, '--registry', registryPath]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('unregistered crossing');
  });
});
