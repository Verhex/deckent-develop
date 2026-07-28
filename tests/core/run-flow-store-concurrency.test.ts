import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';
import { build } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listFlowIds, loadPlannedSprint } from '../../src/core/run-flow-store.js';

const require = createRequire(import.meta.url);
const PROCESS_COUNT = 6;
const RECORDS_PER_PROCESS = 100;
const PROCESS_TIMEOUT_MS = 60_000;
const BARRIER_TIMEOUT_MS = 10_000;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'run-flow-store-xproc-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function buildStoreBundle(): Promise<string> {
  const outfile = join(root, 'run-flow-store.bundle.mjs');
  const nativeEntry = require.resolve('better-sqlite3');
  await build({
    entryPoints: [resolve('src/core/run-flow-store.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    logLevel: 'silent',
    plugins: [{
      name: 'external-native-sqlite',
      setup(context) {
        context.onResolve({ filter: /^better-sqlite3$/ }, () => ({
          path: nativeEntry,
          external: true,
        }));
      },
    }],
  });
  return outfile;
}

interface BarrierWriter {
  readonly ready: Promise<void>;
  readonly completion: Promise<void>;
  release(): void;
}

function startBarrierWriter(workerScript: string, storeBundle: string, workerIndex: number): BarrierWriter {
  const child = spawn(process.execPath, [
    workerScript,
    pathToFileURL(storeBundle).href,
    root,
    String(workerIndex),
    String(RECORDS_PER_PROCESS),
  ], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  let readySettled = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolvePromise, reject) => {
    resolveReady = resolvePromise;
    rejectReady = reject;
  });
  const barrierTimeout = setTimeout(() => {
    if (readySettled) return;
    readySettled = true;
    child.kill('SIGKILL');
    rejectReady(new Error(`writer ${workerIndex} did not reach the cold-open barrier`));
  }, BARRIER_TIMEOUT_MS);
  child.on('message', (message) => {
    if (
      readySettled
      || typeof message !== 'object'
      || message === null
      || (message as { type?: unknown }).type !== 'ready'
    ) return;
    readySettled = true;
    clearTimeout(barrierTimeout);
    resolveReady();
  });

  const completion = new Promise<void>((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`writer ${workerIndex} exceeded ${PROCESS_TIMEOUT_MS}ms`));
    }, PROCESS_TIMEOUT_MS);
    child.once('error', (error) => {
      clearTimeout(timeout);
      clearTimeout(barrierTimeout);
      if (!readySettled) {
        readySettled = true;
        rejectReady(error);
      }
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(barrierTimeout);
      if (!readySettled) {
        readySettled = true;
        rejectReady(new Error(
          `writer ${workerIndex} exited before the cold-open barrier `
          + `(code=${String(code)}, signal=${String(signal)}): ${stderr}`,
        ));
      }
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(
        `writer ${workerIndex} failed (code=${String(code)}, signal=${String(signal)}): ${stderr}`,
      ));
    });
  });

  return {
    ready,
    completion,
    release() {
      child.send({ type: 'release' });
    },
  };
}

describe('run-flow-store — canonical cross-process authority', () => {
  it('preserves every concurrent append with unique ordinals and a lossless projection', async () => {
    const storeBundle = await buildStoreBundle();
    const workerScript = join(root, 'writer.mjs');
    writeFileSync(workerScript, `
      const [storeUrl, root, workerRaw, countRaw] = process.argv.slice(2);
      const { savePlannedSprint } = await import(storeUrl);
      const worker = Number(workerRaw);
      const count = Number(countRaw);
      process.send({ type: 'ready' });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('cold-open barrier release timed out')),
          ${BARRIER_TIMEOUT_MS},
        );
        process.once('message', (message) => {
          clearTimeout(timeout);
          if (message?.type === 'release') resolve();
          else reject(new Error('invalid cold-open barrier release'));
        });
      });
      for (let index = 0; index < count; index += 1) {
        const revision = worker * 100000 + index + 1;
        savePlannedSprint(root, 'shared-flow', {
          revision,
          sprint: { worker, index },
          planDigest: 'digest-' + worker + '-' + index,
          planDigestVersion: 2,
        });
      }
    `, 'utf8');

    const writers = Array.from(
      { length: PROCESS_COUNT },
      (_, workerIndex) => startBarrierWriter(workerScript, storeBundle, workerIndex),
    );
    await Promise.all(writers.map((writer) => writer.ready));
    for (const writer of writers) writer.release();
    await Promise.all(writers.map((writer) => writer.completion));

    const expected = PROCESS_COUNT * RECORDS_PER_PROCESS;
    const dbPath = join(root, '.deckent', 'runtime', 'run-flow-store', 'run-flow-authority.sqlite');
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      const count = db.prepare(`
        SELECT COUNT(*) AS count FROM run_flow_records
        WHERE kind = 'plan' AND flow_id = 'shared-flow'
      `).get() as { count: number };
      const ordinal = db.prepare(`
        SELECT COUNT(DISTINCT ordinal) AS count, MIN(ordinal) AS minimum, MAX(ordinal) AS maximum
        FROM run_flow_records WHERE kind = 'plan' AND flow_id = 'shared-flow'
      `).get() as { count: number; minimum: number; maximum: number };
      expect(count.count).toBe(expected);
      expect(ordinal).toEqual({ count: expected, minimum: 1, maximum: expected });
    } finally {
      db.close();
    }

    const projectionPath = join(
      root,
      '.deckent',
      'runtime',
      'run-flow-store',
      'shared-flow.plan.jsonl',
    );
    const projection = readFileSync(projectionPath, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { revision: number });
    expect(projection).toHaveLength(expected);
    expect(new Set(projection.map((record) => record.revision)).size).toBe(expected);
    expect(loadPlannedSprint(root, 'shared-flow')?.flowId).toBe('shared-flow');
    expect(listFlowIds(root)).toEqual(['shared-flow']);
  }, PROCESS_TIMEOUT_MS + 15_000);
});
