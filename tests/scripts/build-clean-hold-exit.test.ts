import { execFileSync, spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const temporaryRoots: string[] = [];

type CleanHoldEnvelope = {
  code: string;
  decision: string;
  reasons: Array<{ detailCode?: string }>;
};

function archiveHead(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-clean-hold-exit-'));
  temporaryRoots.push(root);
  execFileSync(
    '/bin/bash',
    [
      '-c',
      'git -C "$1" archive --format=tar HEAD | tar -x -C "$2"',
      'archive-head',
      REPO_ROOT,
      root,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return root;
}

function runClean(root: string): Promise<{
  exitCode: number | null;
  stderr: string;
}> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['scripts/clean.mjs'], {
      cwd: root,
      env: {
        ...process.env,
        DECKENT_TEST_HERMETICITY: '0',
        VITEST: 'false',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', rejectPromise);
    child.once('close', exitCode => resolvePromise({ exitCode, stderr }));
  });
}

function parseHold(stderr: string): CleanHoldEnvelope {
  return JSON.parse(stderr.trim()) as CleanHoldEnvelope;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('clean HOLD subprocess exit contract from archived HEAD', () => {
  it('exits 1 with typed missing-authority HOLD for sentinel-only state', async () => {
    const root = archiveHead();
    mkdirSync(join(root, '.locks'), { recursive: true });
    writeFileSync(
      join(root, '.locks', 'execution-lock-authority.sentinel.json'),
      JSON.stringify({
        schemaVersion: 1,
        authorityEpoch: '10000000-0000-4000-8000-000000000001',
        createdAt: '2026-07-27T00:00:00.000Z',
      }),
      'utf8',
    );

    const result = await runClean(root);
    const envelope = parseHold(result.stderr);

    expect(result.exitCode).toBe(1);
    expect(envelope).toEqual(expect.objectContaining({
      decision: 'HOLD',
      code: 'E_CLEAN_ACTIVE_EXECUTION_HOLD',
    }));
    expect(envelope.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ detailCode: 'AUTHORITY_STATE_MISSING' }),
    ]));
  });

  it('exits 1 with typed missing-authority HOLD for database-only state', async () => {
    const root = archiveHead();
    mkdirSync(join(root, '.locks'), { recursive: true });
    new Database(
      join(root, '.locks', 'execution-lock-authority.sqlite3'),
    ).close();

    const result = await runClean(root);
    const envelope = parseHold(result.stderr);

    expect(result.exitCode).toBe(1);
    expect(envelope).toEqual(expect.objectContaining({
      decision: 'HOLD',
      code: 'E_CLEAN_ACTIVE_EXECUTION_HOLD',
    }));
    expect(envelope.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ detailCode: 'AUTHORITY_STATE_MISSING' }),
    ]));
  });
});
