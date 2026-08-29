import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TAXONOMIES,
  auditOperationIngress,
  createOperationIngressSiteId,
  evaluateOperationIngressRatchet,
  loadOperationIngressBaseline,
  normalizeRepositoryRelativePath,
} from '../../scripts/audit-operation-ingress.mjs';

const REPOSITORY_ROOT = process.cwd();
const SCRIPT_PATH = join(REPOSITORY_ROOT, 'scripts/audit-operation-ingress.mjs');
const CATALOG_MODULE_PATH = join(REPOSITORY_ROOT, 'src/core/operation-catalog/index.ts');
const MCP_BROKER_MODULE_PATH = join(REPOSITORY_ROOT, 'src/mcp-client/broker.ts');
const fixtureRoots = new Set<string>();
let captureSequence = 0;

interface FixtureBindings {
  catalog: string;
  mcpBroker: string;
}

function moduleSpecifier(fromDirectory: string, target: string): string {
  let specifier = relative(fromDirectory, target)
    .replaceAll('\\', '/')
    .replace(/\.ts$/u, '.js');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  return specifier;
}

async function createFixture(
  source: string | ((bindings: FixtureBindings) => string),
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'operation-ingress-'));
  fixtureRoots.add(root);
  const sourceDirectory = join(root, 'src');
  await mkdir(sourceDirectory, { recursive: true });
  const content = typeof source === 'function'
    ? source({
      catalog: moduleSpecifier(sourceDirectory, CATALOG_MODULE_PATH),
      mcpBroker: moduleSpecifier(sourceDirectory, MCP_BROKER_MODULE_PATH),
    })
    : source;
  await writeFile(join(sourceDirectory, 'main.ts'), content, 'utf8');
  return root;
}

async function runScript(root: string, args: string[]) {
  const environment = { ...process.env };
  for (const key of [
    'DECKENT_TEST_HERMETICITY',
    'VITEST',
    'VITEST_POOL_ID',
    'VITEST_WORKER_ID',
    'NODE_ENV',
    'NODE_CHANNEL_FD',
    'NODE_CHANNEL_SERIALIZATION_MODE',
  ]) {
    delete environment[key];
  }

  const captureRoot = join(root, '.stdio');
  await mkdir(captureRoot, { recursive: true });
  const sequence = captureSequence++;
  const stdoutPath = join(captureRoot, `${sequence}.stdout`);
  const stderrPath = join(captureRoot, `${sequence}.stderr`);
  const stdoutHandle = await open(stdoutPath, 'w');
  const stderrHandle = await open(stderrPath, 'w');
  let handlesClosed = false;
  const closeHandles = async () => {
    if (handlesClosed) return;
    handlesClosed = true;
    await Promise.all([stdoutHandle.close(), stderrHandle.close()]);
  };

  try {
    let timedOut = false;
    const result = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolvePromise, rejectPromise) => {
      const child = spawn(process.execPath, [SCRIPT_PATH, '--root', root, ...args], {
        cwd: root,
        env: environment,
        shell: false,
        stdio: ['ignore', stdoutHandle.fd, stderrHandle.fd],
      });
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, 30_000);
      child.once('error', error => finish(() => rejectPromise(error)));
      child.once('close', (code, signal) => {
        finish(() => resolvePromise({ code, signal }));
      });
    });
    await closeHandles();
    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, 'utf8'),
      readFile(stderrPath, 'utf8'),
    ]);
    if (timedOut) throw new Error(`operation-ingress subprocess timed out: ${stderr}`);
    return { ...result, stdout, stderr };
  } finally {
    await closeHandles();
  }
}

function schema2Digest(sites: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(sites)).digest('hex');
}

afterEach(async () => {
  const roots = [...fixtureRoots];
  fixtureRoots.clear();
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })));
});

describe('audit-operation-ingress semantic inventory', () => {
  it('inventories every closed taxonomy and accepts only real tool provenance', async () => {
    const root = await createFixture(({ mcpBroker }) => `
      import Database from 'better-sqlite3';
      import * as fs from 'node:fs';
      import { readFileSync as readDirect, promises as fsPromises } from 'node:fs';
      import { writeFile as writePromise } from 'node:fs/promises';
      import * as fsp from 'node:fs/promises';
      import { spawn as launch } from 'node:child_process';
      import type { McpClientBroker } from '${mcpBroker}';

      const save = fs.writeFileSync;
      const remove = fsp.rm;
      const database = new Database(':memory:');
      const localClient = { callTool(_input: unknown) { return undefined; } };
      declare const broker: McpClientBroker;

      readDirect('a');
      fs.readFileSync('b');
      save('c', 'value');
      writePromise('d', 'value');
      fsPromises.appendFile('e', 'value');
      remove('f');
      database.exec('CREATE TABLE example(id)');
      launch('worker');
      fetch('https://example.invalid');
      localClient.callTool({ name: 'not-mcp' });
      broker.callTool('server', 'probe');
    `);

    const report = auditOperationIngress({ root });
    expect(new Set(report.sites.map(site => site.taxonomy))).toEqual(new Set(TAXONOMIES));
    expect(report.diagnostics).toEqual([]);
    expect(report.unclassifiedSites).toEqual([]);
    expect(report.covered).toBe(0);
    expect(report.sites.filter(site => site.taxonomy === 'tool')).toHaveLength(1);
    expect(report.excludedSites).toEqual([
      expect.objectContaining({
        call: 'mcp:callTool',
        exclusion: 'UNVERIFIED_TOOL_ORIGIN',
      }),
    ]);
    expect(report.sites.find(site => site.taxonomy === 'tool')?.binding)
      .toContain('method:');
    expect(report.sites.find(site => (
      site.call === 'node:fs:readFileSync' && site.binding.includes('namespace:fs')
    ))?.binding).toContain('namespace:fs.readFileSync');
    expect(report.sites.find(site => site.binding.includes('readDirect'))?.binding)
      .toContain('direct:readFileSync->readDirect');
    expect(report.sites.find(site => site.binding.includes('alias:namespace:fs.writeFileSync')))
      .toMatchObject({ taxonomy: 'fs-write', covered: false });
  });

  it('binds operation identity only to the canonical catalog declaration', async () => {
    const root = await createFixture(({ catalog }) => `
      import { writeFileSync } from 'node:fs';
      import { resolveOperation, Op } from '${catalog}';
      import { resolveOperation as fakeResolve } from './operation-catalog.js';
      writeFileSync('canonical', 'value', resolveOperation(Op.FsWrite));
      writeFileSync('fake', 'value', fakeResolve('op.fs.write'));
      resolveOperation(Op.FsWrite);
      writeFileSync('dead', 'value');
    `);

    const report = auditOperationIngress({ root });
    expect(report.catalog).toMatchObject({
      schemaVersion: 1,
      source: 'src/core/operation-catalog/catalog.v1.json',
    });
    expect(report.catalog.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(report.sites).toHaveLength(3);
    expect(report.covered).toBe(0);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({ code: 'UNBOUND_ATTRIBUTION' }),
    ]);
  });

  it('rejects generated catalog lookalikes outside the exact canonical projection', async () => {
    const root = await createFixture(({ catalog }) => `
      import { writeFileSync } from 'node:fs';
      import { resolveOperation } from '${catalog}';
      import { Op as lookalikeOp } from './generated-lookalike.js';
      writeFileSync('lookalike', 'value', resolveOperation(lookalikeOp.FsWrite));
    `);
    await writeFile(join(root, 'src/generated-lookalike.ts'), `
      export const Op = Object.freeze({ FsWrite: 'op.fs.write' } as const);
    `, 'utf8');

    const report = auditOperationIngress({ root });
    expect(report).toMatchObject({ covered: 0, total: 1 });
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        code: 'UNKNOWN_TAXONOMY',
        message: "operation '<dynamic>' has no closed-taxonomy attribution",
      }),
    ]);
  });

  it('tracks promise namespaces, static flags, dynamic flags, and FileHandle effects', async () => {
    const root = await createFixture(`
      import { open, readFile } from 'node:fs/promises';
      import * as fsp from 'node:fs/promises';
      import { constants, promises } from 'node:fs';
      readFile('a');
      fsp.writeFile('b', 'value');
      promises.rm('c');
      (await import('node:fs/promises')).readFile('d');
      function readFlags() { return constants.O_RDONLY | constants.O_NOFOLLOW; }
      open('static-read', readFlags());
      declare const dynamicFlags: number;
      open('dynamic', dynamicFlags);
      const handle = await open('e', 'wx');
      handle.writeFile('value');
      handle.stat();
      handle.createReadStream();
    `);

    const report = auditOperationIngress({ root });
    expect(report.diagnostics).toEqual([]);
    expect(report.unclassifiedSites).toEqual([]);
    expect(report.sites.map(site => site.call)).toEqual(expect.arrayContaining([
      'node:fs/promises:readFile',
      'node:fs/promises:writeFile',
      'node:fs/promises:FileHandle.writeFile',
      'node:fs/promises:FileHandle.stat',
      'node:fs/promises:FileHandle.createReadStream',
    ]));
    expect(report.sites.find(site => site.binding.includes('flags:static-write')))
      .toMatchObject({ taxonomy: 'fs-write', covered: false });
    expect(report.sites.find(site => site.binding.includes('flags:static-read')))
      .toMatchObject({ taxonomy: 'fs-read', covered: false });
    expect(report.sites.find(site => site.binding.includes('flags:conservative-write')))
      .toMatchObject({ taxonomy: 'fs-write', covered: false });
  });

  it('uses compiler symbols to exclude shadowed effect lookalikes', async () => {
    const root = await createFixture(`
      import { readFileSync as realRead } from 'node:fs';
      import * as realFs from 'node:fs';
      function shadowed(
        realRead: (...args: unknown[]) => unknown,
        realFs: { readFileSync(...args: unknown[]): unknown },
        fetch: (...args: unknown[]) => unknown,
      ) {
        realRead('shadow');
        realFs.readFileSync('shadow');
        fetch('https://shadow.invalid');
      }
      void shadowed;
      realRead('real');
      realFs.statSync('real');
      fetch('https://example.invalid');
    `);

    const report = auditOperationIngress({ root });
    expect(report.sites).toHaveLength(3);
    expect(report.sites.filter(site => site.taxonomy === 'fs-read')).toHaveLength(2);
    expect(report.sites.filter(site => site.taxonomy === 'provider-network')).toHaveLength(1);
  });

  it('fails closed when a known effect boundary exposes an unknown method', async () => {
    const root = await createFixture(`
      import { futureEffect } from 'node:fs';
      futureEffect('target');
    `);
    const report = auditOperationIngress({ root });
    expect(report.sites).toEqual([]);
    expect(report.unclassifiedSites).toEqual([
      expect.objectContaining({ taxonomy: 'unclassified', call: 'node:fs:futureEffect' }),
    ]);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        siteId: report.unclassifiedSites[0].siteId,
        code: 'UNKNOWN_EFFECT',
      }),
    ]);
    const result = await runScript(root, ['--initialize']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('UNKNOWN_EFFECT');
    await expect(readFile(join(root, 'scripts/operation-ingress-baseline.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('emits stable identities across repeated runs and distinct absolute roots', async () => {
    const source = `import { readFileSync } from 'node:fs';\nreadFileSync('a');\n`;
    const firstRoot = await createFixture(source);
    const secondRoot = await createFixture(source);
    const first = await runScript(firstRoot, []);
    const repeat = await runScript(firstRoot, []);
    const otherRoot = await runScript(secondRoot, []);
    expect(first).toMatchObject({ code: 0, signal: null, stderr: '' });
    expect(repeat.stdout).toBe(first.stdout);
    expect(JSON.parse(otherRoot.stdout)).toMatchObject({
      sites: JSON.parse(first.stdout).sites,
      digest: JSON.parse(first.stdout).digest,
    });
  });

  it('normalizes POSIX, Windows-native, and WSL-style paths deterministically', () => {
    const posixPath = normalizeRepositoryRelativePath('/repo', '/repo/src/main.ts');
    const windowsPath = normalizeRepositoryRelativePath('C:\\Repo', 'c:\\repo\\src\\main.ts');
    expect(posixPath).toBe('src/main.ts');
    expect(windowsPath).toBe('src/main.ts');
    expect(normalizeRepositoryRelativePath('/mnt/c/repo', '/mnt/c/repo/src/main.ts'))
      .toBe('src/main.ts');
    expect(() => normalizeRepositoryRelativePath('C:\\Repo', 'D:\\Repo\\src\\main.ts'))
      .toThrow(/outside repository root/u);
    const semanticSite = {
      taxonomy: 'fs-read',
      call: 'node:fs:readFileSync',
      binding: 'direct:readFileSync',
    };
    expect(createOperationIngressSiteId({
      ...semanticSite,
      location: `${posixPath}:1:1`,
    })).toBe(createOperationIngressSiteId({
      ...semanticSite,
      location: `${windowsPath}:1:1`,
    }));
  });
});

describe('audit-operation-ingress coverage attribution', () => {
  it('rejects file-level promotion, dead lookup, and irrelevant matching arguments', async () => {
    const root = await createFixture(({ catalog }) => `
      import { writeFileSync } from 'node:fs';
      import { resolveOperation, Op } from '${catalog}';
      resolveOperation(Op.FsWrite);
      writeFileSync('uncovered', 'value');
      const lookup = resolveOperation(Op.FsWrite);
      writeFileSync('still-uncovered', 'value', lookup);
      writeFileSync('also-uncovered', 'value');
    `);

    const report = auditOperationIngress({ root });
    expect(report.sites).toHaveLength(3);
    expect(report.covered).toBe(0);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        siteId: report.sites.find(site => site.location.includes(':7:'))?.siteId,
        code: 'UNBOUND_ATTRIBUTION',
      }),
    ]);
  });

  it('rejects moved and substituted sites despite unchanged aggregate totals', async () => {
    const baselineRoot = await createFixture(`import { readFileSync } from 'node:fs';\nreadFileSync('a');\n`);
    const movedRoot = await createFixture(`import { readFileSync } from 'node:fs';\n\nreadFileSync('a');\n`);
    const substitutedRoot = await createFixture(`import { statSync } from 'node:fs';\nstatSync('a');\n`);
    const baseline = auditOperationIngress({ root: baselineRoot });

    for (const live of [
      auditOperationIngress({ root: movedRoot }),
      auditOperationIngress({ root: substitutedRoot }),
    ]) {
      expect(live.total).toBe(baseline.total);
      expect(live.covered).toBe(baseline.covered);
      const result = evaluateOperationIngressRatchet(live, baseline);
      expect(result.ok).toBe(false);
      expect(result.added).toHaveLength(1);
      expect(result.removed).toHaveLength(1);
    }
  });

  it('rejects unknown, unadmitted, and mismatched canonical operation identities', async () => {
    const root = await createFixture(({ catalog }) => `
      import { writeFileSync } from 'node:fs';
      import { spawn } from 'node:child_process';
      import { resolveOperation, Op } from '${catalog}';
      writeFileSync('a', 'value', resolveOperation('op.unknown'));
      writeFileSync('b', 'value', resolveOperation(Op.FsRead));
      spawn('worker', { operation: resolveOperation('op.process') });
    `);

    const report = auditOperationIngress({ root });
    expect(report.covered).toBe(0);
    expect(report.diagnostics.filter(item => item.code === 'UNKNOWN_TAXONOMY')).toHaveLength(2);
    expect(report.diagnostics.filter(item => item.code === 'AMBIGUOUS_ATTRIBUTION')).toHaveLength(1);
    expect(report.diagnostics.map(item => item.message).join('\n')).toContain('op.process');
    expect(report.diagnostics.every(item => (
      report.sites.some(site => site.siteId === item.siteId)
    ))).toBe(true);
  });

  it('rejects multiple operation lookups as ambiguous and unbound', async () => {
    const root = await createFixture(({ catalog }) => `
      import { rmSync } from 'node:fs';
      import { resolveOperation, Op } from '${catalog}';
      rmSync('a', resolveOperation(Op.FsDelete), resolveOperation(Op.FsDelete));
    `);
    const report = auditOperationIngress({ root });
    expect(report.sites[0]).toMatchObject({ covered: false });
    expect(report.diagnostics.filter(item => item.code === 'AMBIGUOUS_ATTRIBUTION'))
      .toHaveLength(1);
    expect(report.diagnostics.filter(item => item.code === 'UNBOUND_ATTRIBUTION'))
      .toHaveLength(2);
  });

  it('does not borrow an operation nested inside an unrelated action', async () => {
    const root = await createFixture(({ catalog }) => `
      import { writeFileSync } from 'node:fs';
      import { resolveOperation, Op } from '${catalog}';
      declare function helper(value: unknown): unknown;
      writeFileSync('a', 'value', helper(resolveOperation(Op.FsWrite)));
    `);
    const report = auditOperationIngress({ root });
    expect(report.sites[0]).toMatchObject({ covered: false });
    expect(report.diagnostics).toEqual([]);
  });

  it('fails both coverage gain and coverage loss until a comparative refresh', async () => {
    const root = await createFixture(`
      import { readFileSync, writeFileSync } from 'node:fs';
      readFileSync('a');
      writeFileSync('b', 'value');
    `);
    const report = auditOperationIngress({ root });
    const baseline = structuredClone(report);
    baseline.sites[0].covered = true;
    baseline.sites[1].covered = false;
    const live = structuredClone(report);
    live.sites[0].covered = false;
    live.sites[1].covered = true;

    const result = evaluateOperationIngressRatchet(live, baseline);
    expect(result.ok).toBe(false);
    expect(result.coverageGained).toHaveLength(1);
    expect(result.coverageLost).toHaveLength(1);
  });
});

describe('audit-operation-ingress baseline and CLI gates', () => {
  it('rejects malformed totals, duplicate ids, semantic identities, catalog drift, and diagnostics', async () => {
    const root = await createFixture(`
      import { readFileSync, writeFileSync } from 'node:fs';
      readFileSync('a');
      writeFileSync('b', 'value');
    `);
    const report = auditOperationIngress({ root });
    const baselinePath = join(root, 'baseline.json');
    await writeFile(baselinePath, JSON.stringify(report), 'utf8');
    expect(loadOperationIngressBaseline(baselinePath)).toMatchObject({ total: 2 });

    const invalidCases = [
      { ...structuredClone(report), total: 99 },
      { ...structuredClone(report), sites: [report.sites[0], report.sites[0]] },
      {
        ...structuredClone(report),
        sites: report.sites.map((site, index) => index === 0
          ? { ...site, location: 'src/moved.ts:1:1' }
          : site),
      },
      {
        ...structuredClone(report),
        catalog: { ...report.catalog, digest: '0'.repeat(64) },
      },
      {
        ...structuredClone(report),
        diagnostics: [{ siteId: report.sites[0].siteId, code: 'TEST', message: 'bad' }],
      },
    ];

    for (const [index, invalid] of invalidCases.entries()) {
      const path = join(root, `invalid-${index}.json`);
      await writeFile(path, JSON.stringify(invalid), 'utf8');
      expect(() => loadOperationIngressBaseline(path)).toThrow();
    }
  });

  it('refuses an atomic write when canonical operation diagnostics exist', async () => {
    const root = await createFixture(({ catalog }) => `
      import { writeFileSync } from 'node:fs';
      import { resolveOperation } from '${catalog}';
      writeFileSync('a', 'value', resolveOperation('op.process'));
    `);
    const baselinePath = join(root, 'scripts/operation-ingress-baseline.json');
    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, 'sentinel\n', 'utf8');

    const result = await runScript(root, ['--write']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('UNKNOWN_TAXONOMY');
    expect(result.stderr).toContain('BASELINE_WRITE_REFUSED');
    expect(await readFile(baselinePath, 'utf8')).toBe('sentinel\n');
    expect((await readdir(dirname(baselinePath))).filter(name => name.endsWith('.tmp')))
      .toEqual([]);
  });

  it('advances only additive debt and refuses removal of prior unmatched debt', async () => {
    const initialSource = `import { readFileSync } from 'node:fs';\nreadFileSync('a');\n`;
    const root = await createFixture(initialSource);
    const sourcePath = join(root, 'src/main.ts');
    const baselinePath = join(root, 'scripts/operation-ingress-baseline.json');

    const initialize = await runScript(root, ['--initialize']);
    expect(initialize).toMatchObject({ code: 0, signal: null, stderr: '' });
    expect(initialize.stdout).toContain('baseline initialized: 1 semantic sites');
    expect(loadOperationIngressBaseline(baselinePath).sites[0].siteId)
      .toMatch(/^site:sha256:[a-f0-9]{64}$/u);
    expect((await runScript(root, ['--initialize'])).stderr)
      .toContain('BASELINE_INITIALIZE_REFUSED');
    expect((await runScript(root, ['--check'])).stdout)
      .toContain('PASS: 1 semantic sites');

    await writeFile(sourcePath, `${initialSource}readFileSync('new-site');\n`, 'utf8');
    const drift = await runScript(root, ['--check']);
    expect(drift.code).toBe(1);
    expect(drift.stderr).toMatch(
      /UNMATCHED_SITE site:sha256:[a-f0-9]{64} src\/main\.ts:\d+:1/u,
    );
    const advance = await runScript(root, ['--write']);
    expect(advance.code).toBe(0);
    expect(advance.stdout).toContain('baseline advanced: 2 semantic sites');
    const preservedBaseline = await readFile(baselinePath, 'utf8');

    await writeFile(
      sourcePath,
      `import { readFileSync } from 'node:fs';\nvoid 0;\nreadFileSync('new-site');\n`,
      'utf8',
    );
    const removal = await runScript(root, ['--write']);
    expect(removal.code).toBe(1);
    expect(removal.stderr).toContain('PRIOR_DEBT_LOST');
    expect(await readFile(baselinePath, 'utf8')).toBe(preservedBaseline);
  });

  it('migrates schema 2 only through a comparative debt-preservation gate', async () => {
    const source = `import { readFileSync } from 'node:fs';\nreadFileSync('a');\n`;
    const root = await createFixture(source);
    const baselinePath = join(root, 'scripts/operation-ingress-baseline.json');
    const report = auditOperationIngress({ root });
    const schema2Sites = report.sites.map(site => ({
      ...site,
      siteId: `site:sha256:${createHash('sha256').update(
        `${site.location}|${site.taxonomy}|${site.call}|${site.binding}`,
      ).digest('hex')}`,
    }));
    const schema2 = {
      schemaVersion: 2,
      taxonomies: report.taxonomies,
      total: schema2Sites.length,
      covered: report.covered,
      unmatched: schema2Sites.length - report.covered,
      sites: schema2Sites,
      diagnostics: [],
      digest: schema2Digest(schema2Sites),
    };
    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, `${JSON.stringify(schema2, null, 2)}\n`, 'utf8');

    const migration = await runScript(root, ['--migrate-baseline']);
    expect(migration).toMatchObject({ code: 0, signal: null, stderr: '' });
    expect(migration.stdout).toContain('baseline migrated: 1 semantic sites');
    expect(loadOperationIngressBaseline(baselinePath)).toMatchObject({ schemaVersion: 3 });
  });
});
