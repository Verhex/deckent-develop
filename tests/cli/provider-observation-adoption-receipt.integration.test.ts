import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
let compiledRoot = '';
let compiledEntry = '';
let compiledContainer = '';
const DATABASE = '.deckent/provider-execution-observations.db';
const PREIMAGE = '.deckent/provider-execution-observations-v1.db';
const RAW_IDENTITIES = /execution-secret|task-secret|attempt-secret|principal-secret|private-owner/u;

interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

interface AdoptionJson {
  readonly mode: 'dry-run' | 'persisted' | 'replay';
  readonly operation: 'adoption';
  readonly plan: { readonly planDigest: string };
  readonly receipt?: {
    readonly receiptId: string;
    readonly projectRelativeReceiptPath: string;
    readonly planDigest: `sha256:${string}`;
    readonly databaseMutation: 'none';
    readonly sourceProjectRelativePath: string;
    readonly targetProjectRelativePath: string;
  };
}

function createDatabase(path: string, version: 1 | 2): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE provider_execution_contradictions (
      contradiction_id INTEGER PRIMARY KEY,
      principal_digest TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE provider_execution_intervals (
      execution_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      principal_digest TEXT NOT NULL,
      fence TEXT NOT NULL,
      start_json TEXT NOT NULL,
      end_json TEXT,
      start_sequence INTEGER NOT NULL,
      end_sequence INTEGER${version === 2 ? ', run_id TEXT, retired INTEGER NOT NULL DEFAULT 0' : ''}
    );
    ${version === 2 ? `CREATE INDEX idx_provider_execution_run_scope
      ON provider_execution_intervals
      (run_id, attempt_id, principal_digest, fence, retired, start_sequence, execution_id);` : ''}
    PRAGMA user_version = ${version};
  `);
  db.prepare(`INSERT INTO provider_execution_intervals
    (execution_id, task_id, attempt_id, principal_digest, fence, start_json,
     end_json, start_sequence, end_sequence${version === 2 ? ', run_id, retired' : ''})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${version === 2 ? ', ?, ?' : ''})`).run(
    'execution-secret', 'task-secret', 'attempt-secret', 'principal-secret',
    'fence-secret', '{"state":"started"}', '{"state":"ended"}', 1, 2,
    ...(version === 2 ? [null, 0] : []),
  );
  db.close();
}

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'provider-observation-real-binary-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  // Match the real repository control-directory policy: the shared `.deckent`
  // root may be traversable/readable, while receipt descendants stay private.
  chmodSync(join(root, '.deckent'), 0o755);
  createDatabase(join(root, PREIMAGE), 1);
  createDatabase(join(root, DATABASE), 2);
  return root;
}

async function runBinary(root: string, args: readonly string[]): Promise<RunResult> {
  return await new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const key of [
      'VITEST', 'VITEST_POOL_ID', 'VITEST_WORKER_ID', 'NODE_ENV',
      'DECKENT_TEST_HERMETICITY', 'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE',
    ]) delete env[key];
    const child = spawn(process.execPath, [compiledEntry, ...args], {
      cwd: root,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (bytes: Buffer) => { stdout += bytes.toString('utf8'); });
    child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString('utf8'); });
    child.once('error', reject);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 15_000);
    child.once('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

function snapshot(path: string): ReadonlyMap<string, Buffer | undefined> {
  return new Map([path, `${path}-wal`, `${path}-shm`].map(candidate => [
    candidate,
    existsSync(candidate) ? readFileSync(candidate) : undefined,
  ]));
}

function expectSnapshot(snapshotBefore: ReadonlyMap<string, Buffer | undefined>): void {
  for (const [path, bytes] of snapshotBefore) {
    expect(existsSync(path), path).toBe(bytes !== undefined);
    if (bytes !== undefined) expect(readFileSync(path), path).toEqual(bytes);
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function expectedReceiptId(receipt: Record<string, unknown>): string {
  const { receiptId: _receiptId, ...body } = receipt;
  return `sha256:${createHash('sha256')
    .update(`deckent:provider-observation-adoption-receipt:v1\0${canonical(body)}`)
    .digest('hex')}`;
}

function tempResidue(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, name.name);
      if (name.isDirectory()) walk(path);
      else if (/\.tmp(?:\.|$)|\.partial$/u.test(name.name)) found.push(path);
    }
  };
  walk(join(root, '.deckent'));
  return found;
}

describe('provider observation adoption receipt — real compiled CLI', () => {
  beforeAll(() => {
    compiledContainer = mkdtempSync(join(tmpdir(), 'provider-observation-compiled-cli-'));
    compiledRoot = join(compiledContainer, 'dist');
    copyFileSync(join(REPO_ROOT, 'package.json'), join(compiledContainer, 'package.json'));
    execFileSync(join(REPO_ROOT, 'node_modules', '.bin', 'tsc'), [
      '--outDir', compiledRoot,
      '--declaration', 'false',
      '--declarationMap', 'false',
      '--sourceMap', 'false',
      '--noEmit', 'false',
    ], { cwd: REPO_ROOT, stdio: 'pipe' });
    symlinkSync(join(REPO_ROOT, 'node_modules'), join(compiledContainer, 'node_modules'), 'dir');
    compiledEntry = join(compiledRoot, 'cli', 'entry.js');
    expect(existsSync(compiledEntry)).toBe(true);
  }, 30_000);

  afterAll(() => {
    rmSync(compiledContainer, { recursive: true, force: true });
  });

  it('exposes production adopt-runtime as a dry-run that fails closed without verified live-runtime authority', async () => {
    const root = createFixture();
    const sourcePath = join(root, PREIMAGE);
    const targetPath = join(root, DATABASE);
    const sourceBefore = snapshot(sourcePath);
    const targetBefore = snapshot(targetPath);

    const held = await runBinary(root, [
      'provider-observations', 'adopt-runtime', '--preimage', PREIMAGE, '--json',
    ]);

    expect(held).toMatchObject({ code: 1, stderr: '', timedOut: false });
    expect(JSON.parse(held.stdout)).toEqual({
      mode: 'hold', operation: 'runtime-adoption', reasonCode: 'RUNTIME_OWNERSHIP_MISMATCH',
    });
    expect(held.stdout).not.toContain(root);
    expect(held.stdout).not.toMatch(RAW_IDENTITIES);
    expectSnapshot(sourceBefore);
    expectSnapshot(targetBefore);
    expect(readdirSync(join(root, '.deckent')).sort()).toEqual([
      'provider-execution-observations-v1.db', 'provider-execution-observations.db',
    ]);
    expect(tempResidue(root)).toEqual([]);
  }, 30_000);

  it('proves inspect → dry-run → apply → fresh-process replay with a canonical durable receipt and zero database mutation', async () => {
    const root = createFixture();
    const sourcePath = join(root, PREIMAGE);
    const targetPath = join(root, DATABASE);
    const sourceBefore = snapshot(sourcePath);
    const targetBefore = snapshot(targetPath);

    const inspect = await runBinary(root, [
      'provider-observations', 'inspect', '--database', PREIMAGE, '--json',
    ]);
    expect(inspect).toMatchObject({ code: 0, stderr: '', timedOut: false });
    expect(JSON.parse(inspect.stdout)).toMatchObject({
      mode: 'inspect', operation: 'migration', inspection: { state: 'migration-required', rowCount: 1 },
    });

    const dry = await runBinary(root, [
      'provider-observations', 'adopt', '--preimage', PREIMAGE, '--json',
    ]);
    expect(dry).toMatchObject({ code: 0, stderr: '', timedOut: false });
    const dryJson = JSON.parse(dry.stdout) as AdoptionJson;
    expect(dryJson).toMatchObject({ mode: 'dry-run', operation: 'adoption' });
    expect(dryJson.plan.planDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(readdirSync(join(root, '.deckent')).sort()).toEqual([
      'provider-execution-observations-v1.db', 'provider-execution-observations.db',
    ]);

    const applied = await runBinary(root, [
      'provider-observations', 'adopt', '--preimage', PREIMAGE,
      '--apply', '--plan-digest', dryJson.plan.planDigest, '--json',
    ]);
    expect(applied).toMatchObject({ code: 0, stderr: '', timedOut: false });
    const appliedJson = JSON.parse(applied.stdout) as AdoptionJson;
    expect(appliedJson).toMatchObject({
      mode: 'persisted',
      operation: 'adoption',
      receipt: {
        planDigest: `sha256:${dryJson.plan.planDigest}`,
        databaseMutation: 'none',
        sourceProjectRelativePath: PREIMAGE,
        targetProjectRelativePath: DATABASE,
      },
    });
    const receiptProjection = appliedJson.receipt!;
    expect(receiptProjection.receiptId).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(receiptProjection.projectRelativeReceiptPath).toMatch(
      /^\.deckent\/provider-observation-adoption\/receipts\/v1\/[a-z2-7]{52}\/[a-z2-7]{52}\/[a-f0-9]{64}\.json$/u,
    );
    expect(receiptProjection.projectRelativeReceiptPath.endsWith(
      `/${receiptProjection.receiptId.slice('sha256:'.length)}.json`,
    )).toBe(true);

    const receiptPath = join(root, receiptProjection.projectRelativeReceiptPath);
    const receiptBytes = readFileSync(receiptPath);
    const receipt = JSON.parse(receiptBytes.toString('utf8')) as Record<string, unknown>;
    expect(receiptBytes.toString('utf8')).toBe(canonical(receipt));
    expect(receipt['receiptId']).toBe(receiptProjection.receiptId);
    expect(expectedReceiptId(receipt)).toBe(receiptProjection.receiptId);
    expect(receipt).toMatchObject({
      planDigest: `sha256:${dryJson.plan.planDigest}`,
      databaseMutation: 'none',
      source: { projectRelativePath: PREIMAGE, contentDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u) },
      target: { projectRelativePath: DATABASE, contentDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u) },
    });

    const replay = await runBinary(root, [
      'provider-observations', 'adopt', '--preimage', PREIMAGE,
      '--apply', '--plan-digest', dryJson.plan.planDigest, '--json',
    ]);
    expect(replay).toMatchObject({ code: 0, stderr: '', timedOut: false });
    expect(JSON.parse(replay.stdout)).toMatchObject({
      mode: 'replay', receipt: receiptProjection,
    });
    expect(readFileSync(receiptPath)).toEqual(receiptBytes);
    expect([inspect.stdout, dry.stdout, applied.stdout, replay.stdout, receiptBytes.toString('utf8')].join('\n'))
      .not.toMatch(RAW_IDENTITIES);
    expect([inspect.stdout, dry.stdout, applied.stdout, replay.stdout, receiptBytes.toString('utf8')].join('\n'))
      .not.toContain(root);
    expectSnapshot(sourceBefore);
    expectSnapshot(targetBefore);
    expect(tempResidue(root)).toEqual([]);
  }, 60_000);

  it('fails closed for non-empty WAL evidence and a tampered durable receipt without database or temp mutation', async () => {
    const walRoot = createFixture();
    const walSource = join(walRoot, PREIMAGE);
    const walTarget = join(walRoot, DATABASE);
    writeFileSync(`${walTarget}-wal`, 'principal-secret:/home/private-owner');
    const walSourceBefore = snapshot(walSource);
    const walTargetBefore = snapshot(walTarget);
    const held = await runBinary(walRoot, [
      'provider-observations', 'adopt', '--preimage', PREIMAGE, '--json',
    ]);
    expect(held).toMatchObject({ code: 1, stderr: '', timedOut: false });
    expect(JSON.parse(held.stdout)).toMatchObject({ detail: 'CONCURRENT_CHANGE', mode: 'hold', operation: 'adoption' });
    expect(held.stdout).not.toMatch(RAW_IDENTITIES);
    expect(held.stdout).not.toContain(walRoot);
    expectSnapshot(walSourceBefore);
    expectSnapshot(walTargetBefore);
    expect(tempResidue(walRoot)).toEqual([]);

    const tamperRoot = createFixture();
    const tamperSource = join(tamperRoot, PREIMAGE);
    const tamperTarget = join(tamperRoot, DATABASE);
    const dry = JSON.parse((await runBinary(tamperRoot, [
      'provider-observations', 'adopt', '--preimage', PREIMAGE, '--json',
    ])).stdout) as AdoptionJson;
    const applied = JSON.parse((await runBinary(tamperRoot, [
      'provider-observations', 'adopt', '--preimage', PREIMAGE,
      '--apply', '--plan-digest', dry.plan.planDigest, '--json',
    ])).stdout) as AdoptionJson;
    const receiptPath = join(tamperRoot, applied.receipt!.projectRelativeReceiptPath);
    const sourceBeforeTamper = snapshot(tamperSource);
    const targetBeforeTamper = snapshot(tamperTarget);
    writeFileSync(receiptPath, '{"identity":"principal-secret:/home/private-owner"}');
    const tamperedReceiptBytes = readFileSync(receiptPath);
    const replay = await runBinary(tamperRoot, [
      'provider-observations', 'adopt', '--preimage', PREIMAGE,
      '--apply', '--plan-digest', dry.plan.planDigest, '--json',
    ]);
    expect(replay).toMatchObject({ code: 1, stderr: '', timedOut: false });
    expect(JSON.parse(replay.stdout)).toMatchObject({ mode: 'hold', operation: 'adoption' });
    expect(replay.stdout).not.toMatch(RAW_IDENTITIES);
    expect(replay.stdout).not.toContain(tamperRoot);
    expect(readFileSync(receiptPath)).toEqual(tamperedReceiptBytes);
    expectSnapshot(sourceBeforeTamper);
    expectSnapshot(targetBeforeTamper);
    expect(tempResidue(tamperRoot)).toEqual([]);
  }, 60_000);
});
