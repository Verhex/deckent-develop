import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPOSITORY = fileURLToPath(new URL('../..', import.meta.url));
const PREIMAGE = '.deckent/provider-execution-observations-v1.db';
const CURRENT = '.deckent/provider-execution-observations.db';
const FORBIDDEN = /execution-secret|task-secret|attempt-secret|principal-secret|private-owner/u;
const execFileAsync = promisify(execFile);
let checkout = '';
let entrypoint = '';
let listener: ReturnType<typeof spawn> | undefined;
let botDaemonPath = '';

interface RunResult { readonly code: number | null; readonly stdout: string; readonly stderr: string }
interface RuntimeProjection {
  readonly mode: 'dry-run' | 'persisted' | 'replay';
  readonly operation: 'runtime-adoption';
  readonly plan: { readonly databaseMutation: 'none'; readonly planDigest: string };
  readonly receipts: { readonly providerReceiptId: string; readonly runtimeReceiptId: string | null };
}

function database(path: string, version: 1 | 2): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE provider_execution_contradictions (
      contradiction_id INTEGER PRIMARY KEY, principal_digest TEXT NOT NULL, payload_json TEXT NOT NULL
    );
    CREATE TABLE provider_execution_intervals (
      execution_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
      principal_digest TEXT NOT NULL, fence TEXT NOT NULL, start_json TEXT NOT NULL,
      end_json TEXT, start_sequence INTEGER NOT NULL, end_sequence INTEGER
      ${version === 2 ? ', run_id TEXT, retired INTEGER NOT NULL DEFAULT 0' : ''}
    );
    ${version === 2 ? `CREATE INDEX idx_provider_execution_run_scope ON provider_execution_intervals
      (run_id, attempt_id, principal_digest, fence, retired, start_sequence, execution_id);` : ''}
    PRAGMA user_version = ${version};
  `);
  db.prepare(`INSERT INTO provider_execution_intervals
    (execution_id, task_id, attempt_id, principal_digest, fence, start_json, end_json,
     start_sequence, end_sequence${version === 2 ? ', run_id, retired' : ''})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${version === 2 ? ', ?, ?' : ''})`).run(
    'execution-secret', 'task-secret', 'attempt-secret', 'principal-secret', 'fence-secret',
    '{"state":"started"}', '{"state":"ended"}', 1, 2, ...(version === 2 ? [null, 0] : []),
  );
  db.close();
}

function run(args: readonly string[], timeout = 20_000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const name of ['VITEST', 'VITEST_POOL_ID', 'VITEST_WORKER_ID', 'NODE_ENV', 'DECKENT_TEST_HERMETICITY']) delete env[name];
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd: checkout, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

function files(path: string): ReadonlyMap<string, Buffer | undefined> {
  return new Map([path, `${path}-wal`, `${path}-shm`].map(name => [
    name, existsSync(name) ? readFileSync(name) : undefined,
  ]));
}

function expectUnchanged(before: ReadonlyMap<string, Buffer | undefined>): void {
  for (const [path, bytes] of before) {
    expect(existsSync(path), path).toBe(bytes !== undefined);
    if (bytes) expect(readFileSync(path), path).toEqual(bytes);
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function residue(directory: string): string[] {
  const result: string[] = [];
  const walk = (path: string): void => {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, item.name);
      if (item.isDirectory()) walk(child);
      else if (/\.tmp(?:\.|$)|\.partial$/u.test(item.name)) result.push(child);
    }
  };
  walk(directory); return result;
}

describe('real compiled provider-to-runtime adoption fan-in', () => {
  beforeAll(async () => {
    checkout = mkdtempSync(join(tmpdir(), 'deckent-runtime-adoption-checkout-'));
    cpSync(REPOSITORY, checkout, {
      recursive: true,
      filter: source => {
        const relative = source.slice(REPOSITORY.length).replace(/^\//u, '');
        return !/^(?:node_modules|dist|\.brain|\.deckent|\.tasks)(?:\/|$)/u.test(relative);
      },
    });
    symlinkSync(join(REPOSITORY, 'node_modules'), join(checkout, 'node_modules'), 'dir');
    // Active-run policy forbids a repository clean/build lifecycle, even in a
    // copied checkout. Compile only into this hermetic tmpdir, then invoke the
    // production asset/build-identity writer without touching live dist.
    await execFileAsync(process.execPath, [
      join(REPOSITORY, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--project', join(checkout, 'tsconfig.json'),
    ], { cwd: checkout, timeout: 120_000 });
    await execFileAsync(process.execPath, [join(checkout, 'scripts', 'copy-assets.mjs')], {
      cwd: checkout, timeout: 120_000,
    });
    entrypoint = join(checkout, 'dist/cli/entry.js');
    expect(existsSync(join(checkout, 'dist/build-identity.json'))).toBe(true);
    mkdirSync(join(checkout, '.deckent'), { recursive: true });
    database(join(checkout, PREIMAGE), 1);
    database(join(checkout, CURRENT), 2);
    botDaemonPath = join(checkout, 'dist', 'connectors', 'bot-daemon.js');
    const listenerPath = join(checkout, 'runtime-adoption-listener.mjs');
    writeFileSync(listenerPath, `
const root = ${JSON.stringify(checkout)};
const entrypoint = ${JSON.stringify(pathToFileURL(entrypoint).href)};
const botDaemon = ${JSON.stringify(pathToFileURL(botDaemonPath).href)};
await import(entrypoint);
process.argv[1] = ${JSON.stringify(entrypoint)};
const daemon = await import(botDaemon + '?runtime-adoption-listener=1');
if (!daemon.writeBotPid(root)) process.exit(91);
process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');
const keepAlive = setInterval(() => {}, 1_000);
await new Promise((resolve) => {
  const stop = () => { daemon.clearBotPid(root); resolve(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
});
clearInterval(keepAlive);
`, 'utf8');
    const compiledDaemon = await import(pathToFileURL(botDaemonPath).href) as {
      startBotDaemon(root: string, options: {
        spawnFn: () => number | null;
      }): { readonly status: string; readonly pid?: number };
    };
    const started = compiledDaemon.startBotDaemon(checkout, {
      spawnFn: () => {
        listener = spawn(process.execPath, [listenerPath], {
          cwd: checkout, env: { ...process.env }, shell: false,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        return listener.pid ?? null;
      },
    });
    expect(started).toMatchObject({ status: 'started', pid: listener?.pid });
  }, 150_000);

  afterAll(async () => {
    if (entrypoint) await run(['bot', 'stop', '--root', checkout]);
    if (listener && !listener.killed) listener.kill('SIGTERM');
    if (checkout) rmSync(checkout, { recursive: true, force: true });
  });

  it('dry-runs, applies, and replays one canonical provider-linked composite receipt without mutating either database', async () => {
    const source = join(checkout, PREIMAGE); const target = join(checkout, CURRENT);
    const sourceBefore = files(source); const targetBefore = files(target);
    const dryResult = await run(['provider-observations', 'adopt-runtime', '--preimage', PREIMAGE, '--json']);
    expect(dryResult).toMatchObject({ code: 0, stderr: '' });
    const dry = JSON.parse(dryResult.stdout) as RuntimeProjection;
    expect(dry).toMatchObject({ operation: 'runtime-adoption', mode: 'dry-run', plan: { databaseMutation: 'none' } });
    expect(dry.plan.planDigest).toMatch(/^[a-f0-9]{64}$/u);

    const applyResult = await run(['provider-observations', 'adopt-runtime', '--preimage', PREIMAGE,
      '--apply', '--plan-digest', dry.plan.planDigest, '--json']);
    expect(applyResult).toMatchObject({ code: 0, stderr: '' });
    const applied = JSON.parse(applyResult.stdout) as RuntimeProjection;
    expect(applied.mode).toBe('persisted');
    expect(applied.receipts.providerReceiptId).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(applied.receipts.runtimeReceiptId).toMatch(/^sha256:[a-f0-9]{64}$/u);

    const replay = JSON.parse((await run(['provider-observations', 'adopt-runtime', '--preimage', PREIMAGE,
      '--apply', '--plan-digest', dry.plan.planDigest, '--json'])).stdout) as RuntimeProjection;
    expect(replay).toEqual({ ...applied, mode: 'replay' });

    const receiptName = `${applied.receipts.runtimeReceiptId!.slice(7)}.json`;
    const receiptPaths: string[] = [];
    const collect = (directory: string): void => {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, item.name);
        if (item.isDirectory()) collect(path); else if (item.name === receiptName) receiptPaths.push(path);
      }
    };
    collect(join(checkout, '.deckent'));
    expect(receiptPaths).toHaveLength(1);
    const bytes = readFileSync(receiptPaths[0]!, 'utf8');
    const receipt = JSON.parse(bytes) as Record<string, unknown>;
    expect(bytes).toBe(canonical(receipt));
    expect(receipt).toMatchObject({
      receiptId: applied.receipts.runtimeReceiptId,
      databaseMutation: 'none',
      plan: {
        providerObservationReceipt: { receiptId: applied.receipts.providerReceiptId },
        deckentBuild: {
          buildIdentityDigest: expect.stringMatching(/^sha256:/u),
          sourceTreeIdentityDigest: expect.stringMatching(/^sha256:/u),
        },
        entrypoint: {
          projectRelativePath: 'dist/cli/entry.js',
          artifactDigest: expect.stringMatching(/^sha256:/u),
        },
        liveRuntime: {
          processId: expect.any(Number),
          processStartIdentity: expect.any(String),
        },
      },
    });
    expect(`$${dryResult.stdout}${applyResult.stdout}${bytes}`).not.toMatch(FORBIDDEN);
    expectUnchanged(sourceBefore); expectUnchanged(targetBefore);
    expect(residue(join(checkout, '.deckent'))).toEqual([]);
  }, 60_000);

  it('returns typed HOLDs for a wrong digest, symlink preimage, and concurrent target evidence', async () => {
    const wrong = await run(['provider-observations', 'adopt-runtime', '--preimage', PREIMAGE,
      '--apply', '--plan-digest', '0'.repeat(64), '--json']);
    expect(JSON.parse(wrong.stdout)).toEqual({ mode: 'hold', operation: 'runtime-adoption', reasonCode: 'PLAN_DIGEST_MISMATCH' });

    const link = join(checkout, '.deckent/provider-observations-link.db');
    symlinkSync(join(checkout, PREIMAGE), link);
    const symlink = await run(['provider-observations', 'adopt-runtime', '--preimage', '.deckent/provider-observations-link.db', '--json']);
    expect(JSON.parse(symlink.stdout)).toMatchObject({ mode: 'hold', operation: 'runtime-adoption' });
    expect(lstatSync(link).isSymbolicLink()).toBe(true);

    const sourcePath = join(checkout, 'src', 'cli', 'entry.ts');
    const sourceBefore = readFileSync(sourcePath);
    writeFileSync(sourcePath, Buffer.concat([sourceBefore, Buffer.from('\n// stale-build-proof\n')]));
    const staleBuild = await run([
      'provider-observations', 'adopt-runtime', '--preimage', PREIMAGE, '--json',
    ]);
    expect(JSON.parse(staleBuild.stdout)).toEqual({
      mode: 'hold', operation: 'runtime-adoption', reasonCode: 'BUILD_IDENTITY_MISMATCH',
    });
    writeFileSync(sourcePath, sourceBefore);

    writeFileSync(`${join(checkout, CURRENT)}-wal`, 'private-owner');
    const concurrent = await run(['provider-observations', 'adopt-runtime', '--preimage', PREIMAGE, '--json']);
    expect(JSON.parse(concurrent.stdout)).toMatchObject({ mode: 'hold', operation: 'runtime-adoption', reasonCode: 'CONCURRENT_CHANGE' });
    expect([wrong.stdout, symlink.stdout, staleBuild.stdout, concurrent.stdout].join('\n'))
      .not.toMatch(FORBIDDEN);
    unlinkSync(`${join(checkout, CURRENT)}-wal`);
  }, 60_000);

  it('fails closed for legacy, dead, and reused ownership records', async () => {
    const stopped = await run(['bot', 'stop', '--root', checkout]);
    expect(stopped.code, stopped.stderr || stopped.stdout).toBe(0);
    const pidPath = join(checkout, '.deckent', 'bot.pid');
    const deadline = Date.now() + 5_000;
    while (existsSync(pidPath) && Date.now() < deadline) {
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    expect(existsSync(pidPath)).toBe(false);

    const ownership = await import(pathToFileURL(
      join(checkout, 'dist', 'core', 'pid-ownership.js'),
    ).href) as { processStartToken(pid: number): string | null };
    const currentToken = ownership.processStartToken(process.pid);
    expect(currentToken).toMatch(/^s\d+$/u);
    const rootDigest = createHash('sha256')
      .update(realpathSync.native(checkout)).digest('hex');
    writeFileSync(pidPath, JSON.stringify({
      schemaVersion: 1,
      pid: process.pid,
      startToken: currentToken,
      projectRootDigest: rootDigest,
      recordedAt: '2026-01-01T00:00:00.000Z',
    }));
    const legacy = await run([
      'provider-observations', 'adopt-runtime', '--preimage', PREIMAGE, '--json',
    ]);
    expect(JSON.parse(legacy.stdout)).toEqual({
      mode: 'hold', operation: 'runtime-adoption', reasonCode: 'RUNTIME_OWNERSHIP_MISMATCH',
    });
    expect(JSON.parse(readFileSync(pidPath, 'utf8'))).toHaveProperty('schemaVersion', 1);
    unlinkSync(pidPath);

    const runtimeIdentity = {
      entrypointDigest: createHash('sha256').update(readFileSync(entrypoint)).digest('hex'),
      buildIdentityDigest: createHash('sha256').update(readFileSync(botDaemonPath)).digest('hex'),
    };
    const compiledDaemon = await import(pathToFileURL(botDaemonPath).href) as {
      writeBotPid(root: string, pid: number, options: {
        isAlive: (pid: number) => boolean;
        startToken: (pid: number) => string | null;
        runtimeIdentity: () => typeof runtimeIdentity;
      }): boolean;
    };
    expect(compiledDaemon.writeBotPid(checkout, 2_147_483_647, {
      isAlive: () => false,
      startToken: () => 's1',
      runtimeIdentity: () => runtimeIdentity,
    })).toBe(true);
    const dead = await run([
      'provider-observations', 'adopt-runtime', '--preimage', PREIMAGE, '--json',
    ]);
    expect(JSON.parse(dead.stdout)).toEqual({
      mode: 'hold', operation: 'runtime-adoption', reasonCode: 'RUNTIME_OWNERSHIP_MISMATCH',
    });
    expect(existsSync(pidPath)).toBe(false);

    const live = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      cwd: checkout, stdio: 'ignore', shell: false,
    });
    try {
      expect(live.pid).toEqual(expect.any(Number));
      expect(compiledDaemon.writeBotPid(checkout, live.pid!, {
        isAlive: () => false,
        startToken: () => 's0',
        runtimeIdentity: () => runtimeIdentity,
      })).toBe(true);
      const reused = await run([
        'provider-observations', 'adopt-runtime', '--preimage', PREIMAGE, '--json',
      ]);
      expect(JSON.parse(reused.stdout)).toEqual({
        mode: 'hold', operation: 'runtime-adoption', reasonCode: 'RUNTIME_OWNERSHIP_MISMATCH',
      });
      expect(existsSync(pidPath)).toBe(false);
    } finally {
      live.kill('SIGTERM');
    }
  }, 60_000);
});
