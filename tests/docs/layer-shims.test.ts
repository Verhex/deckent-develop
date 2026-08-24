/** Adversarial hermetic contract matrix for the ADR-D-004 graph gate. */
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'lint-layer-shims.mjs');
const REAL_REGISTRY = join(ROOT, '.deckent', 'settings', 'layer-shims.json');
const ADR = join(ROOT, 'docs', 'adr', 'adr-d-004-brain-central-import.md');
const TOPOLOGY = {
  version: 1,
  layers: ['core', 'orchestra', 'providers', 'cli', 'api', 'mcp'],
  forbidden: [
    'core>orchestra', 'core>providers', 'core>cli', 'core>api', 'core>mcp',
    'orchestra>providers', 'orchestra>cli', 'orchestra>api', 'orchestra>mcp',
    'cli>api', 'cli>mcp', 'api>cli', 'api>mcp', 'mcp>cli', 'mcp>api',
  ],
  brainFamily: [
    'brain', 'debt-manager', 'index', 'resource-monitor', 'result-collector',
    'result-evaluator', 'spawn-backend', 'spawn-backend-docker',
    'sprint-controller', 'sprint-finalizer', 'sprint-lifecycle', 'sprint-phases',
    'sprint-planner', 'sprint-spawner', 'sprint-utils',
  ],
  brainInternals: ['auditor', 'tmux', 'worker'],
};

interface Result { code: number; stdout: string; stderr: string }
interface Shim {
  id: string; from: string; to: string; symbols: string[]; reason: string;
  adrRef: string; owner: string; dateAdded: string; expiresOn: string;
  replacement: string; enforced?: boolean;
}
interface Registry {
  schemaVersion: number;
  registryId: string;
  registryVersion: string;
  sourcePolicy: {
    productionRoots: Array<{ path: string; include: string[] }>;
    ignore: string[]; unmatchedPolicy: string; multipleMatchPolicy: string;
  };
  ownership: Array<{
    moduleId: string;
    selector: { kind: 'exact-file' | 'subtree'; path: string };
  }>;
  shims: Shim[];
  topology?: typeof TOPOLOGY;
  baseline?: { version: number; atoms: string[]; sccs: string[][] };
}

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

function run(root: string, ...extra: string[]): Promise<Result> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [
      SCRIPT, '--root', root, '--registry',
      join(root, '.deckent', 'settings', 'layer-shims.json'),
      '--now', '2026-08-24', '--json', ...extra,
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => resolvePromise({
      code: code ?? -1, stdout, stderr,
    }));
  });
}

function makeRegistry(overrides: Partial<Registry> = {}): Registry {
  return {
    schemaVersion: 2,
    registryId: 'fixture.module-ownership-and-layer-exceptions',
    registryVersion: '2.0.0',
    sourcePolicy: {
      productionRoots: [{ path: 'src', include: ['**/*.ts', '**/*.tsx'] }],
      ignore: [
        'src/**/node_modules/**', 'src/**/out/**', 'src/**/dist/**',
        'src/**/dist-app/**', 'src/**/build/**', 'src/**/tests/**',
        'src/**/__tests__/**', 'src/**/*.test.ts', 'src/**/*.test.tsx',
        'src/**/*.spec.ts', 'src/**/*.spec.tsx',
      ],
      unmatchedPolicy: 'reject', multipleMatchPolicy: 'reject',
    },
    ownership: ['core', 'orchestra', 'cli', 'api', 'mcp'].map((name) => ({
      moduleId: name,
      selector: { kind: 'subtree' as const, path: `src/${name}` },
    })),
    shims: [], topology: TOPOLOGY,
    baseline: { version: 1, atoms: [], sccs: [] },
    ...overrides,
  };
}

async function put(root: string, relativePath: string, content: string): Promise<void> {
  const path = join(root, ...relativePath.split('/'));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
async function writeRegistry(root: string, value: Registry): Promise<string> {
  const path = join(root, '.deckent', 'settings', 'layer-shims.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}
async function fixture(value: Registry = makeRegistry()): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'deckent-graph-gate-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeRegistry(root, value);
  return root;
}
async function crossing(source: string, value = makeRegistry()): Promise<string> {
  const root = await fixture(value);
  await put(root, 'src/mcp/consumer.ts', source);
  await put(root, 'src/cli/service.ts',
    'export default 1; export const allowed = 1; export const extra = 2;\n');
  return root;
}
function shim(overrides: Partial<Shim> = {}): Shim {
  return {
    id: 'FIXTURE-SHIM-1', from: 'src/mcp/consumer.ts',
    to: 'src/cli/service.js', symbols: ['allowed'], reason: 'temporary fixture',
    adrRef: 'ADR-D-004 C3', owner: 'fixture', dateAdded: '2026-08-01',
    expiresOn: '2027-01-01',
    replacement: 'Move this service into core and delete the exception.',
    enforced: true, ...overrides,
  };
}
const payload = (result: Result): Record<string, unknown> =>
  JSON.parse(result.stdout || result.stderr) as Record<string, unknown>;

describe('fixture discovery and exact atom semantics', () => {
  it('fixture auto-discovers a newly created crossing', async () => {
    const root = await crossing("import { allowed } from '../cli/service.js';\n");
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'src/mcp/consumer.ts|import|src/cli/service.ts|allowed',
    );
  });

  it('fixture rejects count-preserving replacement and symbol broadening', async () => {
    const old = 'src/mcp/consumer.ts|import|src/cli/service.ts|previous';
    const replaced = await crossing(
      "import { allowed } from '../cli/service.js';\n",
      makeRegistry({ baseline: { version: 1, atoms: [old], sccs: [] } }),
    );
    const broadened = await crossing(
      "import { allowed, extra } from '../cli/service.js';\n",
      makeRegistry({ baseline: { version: 1, atoms: [
        'src/mcp/consumer.ts|import|src/cli/service.ts|allowed',
      ], sccs: [] } }),
    );
    const [replacement, broadening] = await Promise.all([run(replaced), run(broadened)]);
    expect(replacement.code).toBe(1);
    expect(replacement.stderr).toContain('new-crossing');
    expect(replacement.stderr).toContain('baseline-reduction-requires-shrink');
    expect(broadening.code).toBe(1);
    expect(broadening.stderr).toContain('|allowed,extra');
  });

  it('fixture requires explicit shrink after atom removal', async () => {
    const old = 'src/mcp/consumer.ts|import|src/cli/service.ts|allowed';
    const root = await fixture(makeRegistry({
      baseline: { version: 1, atoms: [old], sccs: [] },
    }));
    await put(root, 'src/mcp/consumer.ts', 'export {};\n');
    await put(root, 'src/cli/service.ts', 'export const allowed = 1;\n');
    const before = await run(root);
    expect(before.code).toBe(1);
    expect(before.stderr).toContain('baseline-reduction-requires-shrink');
    const shrink = await run(root, '--shrink-baseline');
    expect(shrink.code).toBe(0);
    expect(payload(shrink)).toMatchObject({ action: 'shrink-baseline', atoms: 0 });
    expect((await run(root)).code).toBe(0);
  });
});

describe('fixture exceptions and unique ownership', () => {
  it('fixture accepts exactly one exact exception owner', async () => {
    const root = await crossing(
      "import { allowed } from '../cli/service.js';\n",
      makeRegistry({ shims: [shim()] }),
    );
    expect((await run(root)).code).toBe(0);
  });

  it.each([
    ['expired', shim({ expiresOn: '2026-08-23' })],
    ['wildcard', shim({ symbols: ['*'] })],
  ])('fixture denies a %s exception', async (_name, exception) => {
    const root = await crossing(
      "import { allowed } from '../cli/service.js';\n",
      makeRegistry({ shims: [exception] }),
    );
    expect((await run(root)).code).toBe(2);
  });

  it('fixture denies stale, zero-owner, and multiple-owner exception atoms', async () => {
    const stale = await fixture(makeRegistry({ shims: [shim()] }));
    await put(stale, 'src/mcp/consumer.ts', 'export {};\n');
    await put(stale, 'src/cli/service.ts', 'export const allowed = 1;\n');
    const zero = await crossing("import { allowed } from '../cli/service.js';\n");
    const multiple = await crossing(
      "import { allowed } from '../cli/service.js';\n",
      makeRegistry({ shims: [shim(), shim({ id: 'FIXTURE-SHIM-2' })] }),
    );
    const [staleResult, zeroResult, multipleResult] = await Promise.all([
      run(stale), run(zero), run(multiple),
    ]);
    expect(staleResult.code).toBe(1);
    expect(staleResult.stderr).toContain('stale-exception');
    expect(zeroResult.code).toBe(1);
    expect(zeroResult.stderr).toContain('new-crossing');
    expect(multipleResult.code).toBe(1);
    expect(multipleResult.stderr).toContain('ambiguous-ownership');
  });

  it('fixture rejects zero and multiple source ownership', async () => {
    const zeroRegistry = makeRegistry({ ownership: [
      { moduleId: 'cli', selector: { kind: 'subtree', path: 'src/cli' } },
    ] });
    const multipleRegistry = makeRegistry({ ownership: [
      { moduleId: 'mcp-a', selector: { kind: 'subtree', path: 'src/mcp' } },
      { moduleId: 'mcp-b', selector: {
        kind: 'exact-file', path: 'src/mcp/consumer.ts',
      } },
      { moduleId: 'cli', selector: { kind: 'subtree', path: 'src/cli' } },
    ] });
    const zero = await crossing('export {};\n', zeroRegistry);
    const multiple = await crossing('export {};\n', multipleRegistry);
    const [zeroResult, multipleResult] = await Promise.all([run(zero), run(multiple)]);
    expect(zeroResult.code).toBe(1);
    expect(zeroResult.stderr).toContain('unowned-source');
    expect(multipleResult.code).toBe(1);
    expect(multipleResult.stderr).toContain('multiple-source-owners');
  });
});

describe('fixture static and runtime import grammar', () => {
  it.each([
    ['named import', "import { allowed } from '../cli/service.js';", 'import', 'allowed'],
    ['default import', "import service from '../cli/service.js';", 'import', 'default'],
    ['namespace import', "import * as service from '../cli/service.js';", 'import', '*'],
    ['side effect', "import '../cli/service.js';", 'import', '(side-effect)'],
    ['named export', "export { allowed } from '../cli/service.js';", 'export', 'allowed'],
    ['star export', "export * from '../cli/service.js';", 'export', '*'],
    ['namespace export', "export * as service from '../cli/service.js';", 'export', '*'],
    ['dynamic import', "void import('../cli/service.js');", 'dynamic-import', '*'],
    ['require', "void require('../cli/service.js');", 'require', '*'],
    ['import equals', "import service = require('../cli/service.js');", 'import-equals', '*'],
  ])('fixture discovers %s', async (_name, source, kind, symbol) => {
    const result = await run(await crossing(`${source}\n`));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`|${kind}|src/cli/service.ts|${symbol}`);
  });
});

describe('portable fixture paths, nesting, ignores, and links', () => {
  it('portable fixture resolves a relative non-source asset without graph ownership', async () => {
    const root = await fixture();
    await put(root, 'src/core/use.ts', "import data from './data.json'; void data;\n");
    await put(root, 'src/core/data.json', '{"ok":true}\n');
    expect((await run(root)).code).toBe(0);
  });

  it.each([
    ['malformed', "import { broken from '../cli/service.js';"],
    ['unresolvable', "import '../cli/missing.js';"],
    ['root escape', "import '../../../../outside.js';"],
    ['Windows separator', "import '..\\\\cli\\\\service.js';"],
  ])('portable fixture rejects %s with exit 2', async (_name, source) => {
    const result = await run(await crossing(source));
    expect(result.code).toBe(2);
    expect(payload(result)).toMatchObject({ ok: false });
  });

  it('portable fixture rejects wrong-case resolution and case collisions', async () => {
    const root = await fixture();
    await put(root, 'src/mcp/use.ts', "import '../cli/SERVICE.js';\n");
    await put(root, 'src/cli/service.ts', 'export {};\n');
    await put(root, 'src/cli/SERVICE.ts', 'export {};\n');
    const names = await readdir(join(root, 'src', 'cli'));
    const caseSensitive = names.includes('service.ts') && names.includes('SERVICE.ts');
    if (caseSensitive) {
      const result = await run(root);
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/case collision|incorrect case|ambiguous/i);
    } else {
      expect(names.filter((name) => name.toLowerCase() === 'service.ts')).toHaveLength(1);
    }
  });

  it('portable fixture discovers a new file inside a nested workspace', async () => {
    const root = await fixture();
    await put(root, 'src/mcp/nested/workspace/new.ts',
      "import { allowed } from '../../../cli/service.js';\n");
    await put(root, 'src/cli/service.ts', 'export const allowed = 1;\n');
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('src/mcp/nested/workspace/new.ts');
  });

  it.each([
    'node_modules', 'out', 'dist', 'dist-app', 'build', 'tests', '__tests__',
  ])('portable fixture explicitly ignores %s directories', async (directory) => {
    const root = await fixture();
    await put(root, `src/mcp/${directory}/generated.ts`,
      "import '../cli/missing.js';\n");
    expect((await run(root)).code).toBe(0);
  });

  it.each(['x.test.ts', 'x.spec.ts', 'x.test.tsx', 'x.spec.tsx'])(
    'portable fixture explicitly ignores %s', async (name) => {
      const root = await fixture();
      await put(root, `src/mcp/${name}`, "import '../cli/missing.js';\n");
      expect((await run(root)).code).toBe(0);
    },
  );

  it.each([
    ['file symlink', 'file' as const],
    ['directory link or junction', 'dir' as const],
  ])('portable fixture capability-probes and rejects %s containment', async (_name, kind) => {
    const root = await fixture();
    const outside = await mkdtemp(join(tmpdir(), 'deckent-graph-outside-'));
    temporaryDirectories.push(outside);
    const target = kind === 'file' ? join(outside, 'escaped.ts') : outside;
    if (kind === 'file') await writeFile(target, 'export {};\n', 'utf8');
    else await writeFile(join(target, 'escaped.ts'), 'export {};\n', 'utf8');
    const link = join(root, 'src', 'core', kind === 'file' ? 'escaped.ts' : 'linked');
    await mkdir(dirname(link), { recursive: true });
    let capability: 'available' | 'denied' = 'available';
    try {
      const type = kind === 'file' ? 'file' : process.platform === 'win32' ? 'junction' : 'dir';
      await symlink(target, link, type);
    } catch (error) {
      capability = 'denied';
      expect((error as NodeJS.ErrnoException).code).toMatch(/EPERM|EACCES|ENOSYS/);
    }
    if (capability === 'available') {
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      const result = await run(root);
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/symlink|escapes repository root/);
    } else {
      expect(capability).toBe('denied');
    }
  });
});

describe('fixture initializer and deterministic CLI', () => {
  it('fixture produces stable JSON for exit statuses 0, 1, and 2', async () => {
    const clean = await fixture();
    await put(clean, 'src/core/clean.ts', 'export {};\n');
    const violation = await crossing("import { allowed } from '../cli/service.js';\n");
    const invalid = await crossing("import '../cli/missing.js';\n");
    const [zero, one, two] = await Promise.all([run(clean), run(violation), run(invalid)]);
    expect(zero.code).toBe(0);
    expect(payload(zero)).toMatchObject({ ok: true });
    expect(one.code).toBe(1);
    expect(payload(one)).toMatchObject({ ok: false });
    expect(two.code).toBe(2);
    expect(payload(two)).toMatchObject({ ok: false });
    expect(await run(violation)).toEqual(one);
  });

  it('fixture initializer is no-clobber and atomic under replay', async () => {
    const value = makeRegistry();
    delete value.baseline;
    delete value.topology;
    const root = await crossing(
      "import { allowed } from '../cli/service.js';\n", value,
    );
    const [first, second] = await Promise.all([
      run(root, '--init-baseline'), run(root, '--init-baseline'),
    ]);
    expect([first.code, second.code].sort()).toEqual([0, 2]);
    const path = join(root, '.deckent', 'settings', 'layer-shims.json');
    const initializedText = await readFile(path, 'utf8');
    const initialized = JSON.parse(initializedText) as Registry;
    expect(initialized.baseline?.atoms).toEqual([
      'src/mcp/consumer.ts|import|src/cli/service.ts|allowed',
    ]);
    expect(initialized.topology).toEqual(TOPOLOGY);
    expect((await readdir(dirname(path))).sort()).toEqual(['layer-shims.json']);
    expect((await run(root, '--init-baseline')).code).toBe(2);
    expect(await readFile(path, 'utf8')).toBe(initializedText);
  });

  it('fixture shrink-only writer refuses replacement without changing bytes', async () => {
    const root = await crossing(
      "import { allowed } from '../cli/service.js';\n",
      makeRegistry({ baseline: { version: 1, atoms: [
        'src/mcp/consumer.ts|import|src/cli/service.ts|previous',
      ], sccs: [] } }),
    );
    const path = join(root, '.deckent', 'settings', 'layer-shims.json');
    const before = await readFile(path, 'utf8');
    const result = await run(root, '--shrink-baseline');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('cannot shrink with new crossing atoms');
    expect(await readFile(path, 'utf8')).toBe(before);
  });
});

describe('real registry and ADR projection', () => {
  it('registry has schema-v2 exact exceptions with lifecycle metadata', async () => {
    const real = JSON.parse(await readFile(REAL_REGISTRY, 'utf8')) as Registry;
    expect(real.schemaVersion).toBe(2);
    expect(real.shims.length).toBeGreaterThanOrEqual(3);
    for (const entry of real.shims) {
      expect(entry.expiresOn).toMatch(/^20\d\d-\d\d-\d\d$/);
      expect(entry.replacement.trim()).not.toBe('');
      expect(entry.symbols).not.toContain('*');
      expect(new Set(entry.symbols).size).toBe(entry.symbols.length);
    }
  });

  it('registry projects production layers to unique owners and fail-closed policy', async () => {
    const real = JSON.parse(await readFile(REAL_REGISTRY, 'utf8')) as Registry;
    const selectors = real.ownership.map((entry) => entry.selector.path);
    expect(new Set(selectors).size).toBe(selectors.length);
    expect(selectors).toEqual(expect.arrayContaining([
      'src/core', 'src/orchestra', 'src/providers', 'src/cli', 'src/api', 'src/mcp',
    ]));
    expect(real.sourcePolicy.unmatchedPolicy).toBe('reject');
    expect(real.sourcePolicy.multipleMatchPolicy).toBe('reject');
  });

  it('registry assertion exposes checked-in ADR exception-projection drift', async () => {
    const real = JSON.parse(await readFile(REAL_REGISTRY, 'utf8')) as Registry;
    const adr = await readFile(ADR, 'utf8');
    const registryIds = real.shims.map((entry) => entry.id).sort();
    const adrIds = [...adr.matchAll(/`(D004-SHIM-\d+)`/g)]
      .map((match) => match[1])
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .sort();
    expect(registryIds).toContain('D004-SHIM-003');
    expect(adrIds).not.toContain('D004-SHIM-003');
    expect(registryIds).not.toEqual(adrIds);
  });

  it('registry topology projection happens only in a tmpdir', async () => {
    const real = JSON.parse(await readFile(REAL_REGISTRY, 'utf8')) as Registry;
    const root = await fixture({
      ...real,
      ownership: makeRegistry().ownership,
      shims: [], baseline: { version: 1, atoms: [], sccs: [] },
      topology: undefined,
    });
    const result = await run(root, '--write-topology');
    expect(result.code).toBe(0);
    const projected = JSON.parse(await readFile(
      join(root, '.deckent', 'settings', 'layer-shims.json'), 'utf8',
    )) as Registry;
    expect(projected.topology).toEqual(TOPOLOGY);
  });
});
