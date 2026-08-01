/**
 * tests/orchestra/cleanup-state-truth.test.ts — W0-TRUTH (#491)
 *
 * Live lie (2026-07-06): after sprint-375 closed, `.dashboard` (auditor's final
 * scan with garbage progress) and `.deckent/ci-baseline.json` (testCount:0)
 * survived forever — `deckent status` kept rendering a ghost sprint and a
 * "Baseline 0 tests" line hours after close. Per-sprint display artifacts must
 * die with the sprint.
 *
 * Contract: lifecycle cleanup('sprint-end') removes `.dashboard` +
 * `.deckent/ci-baseline.json`; 'spawn-fail' preserves both (forensics).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../../src/orchestra/tmux.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/tmux.js')>();
  return { ...actual, listWorkers: vi.fn(() => []), killWorker: vi.fn(), killSession: vi.fn() };
});

import { cleanup } from '../../src/orchestra/sprint-lifecycle.js';
import { SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint } from '../../src/core/types.js';

function makeSprint(): Sprint {
  return {
    id: 'sprint-999', number: 999,
    status: SprintStatus.COMPLETE, phase: SprintPhase.COMPLETE,
    tasks: [], workers: [],
  } as unknown as Sprint;
}

describe('W0 cleanup state-truth — per-sprint display artifacts die with the sprint', () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `w0-cleanup-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(join(root, '.dashboard'), JSON.stringify({ sprint: { id: 'sprint-999' }, progress: { done: 0, active: 2, blocked: 0, total: 8 } }));
    writeFileSync(join(root, '.deckent', 'ci-baseline.json'), JSON.stringify({ sprintId: 'sprint-999', baseline: { testCount: 0 } }));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("cleanup('sprint-end') removes .dashboard and ci-baseline.json", () => {
    cleanup(root, makeSprint(), undefined, 'sprint-end');
    expect(existsSync(join(root, '.dashboard'))).toBe(false);
    expect(existsSync(join(root, '.deckent', 'ci-baseline.json'))).toBe(false);
  });

  it("cleanup('sprint-end') removes only the settled sprint's task artifacts", () => {
    const owned = join(root, '.tasks', 'task-999-004.result');
    const foreign = join(root, '.tasks', 'task-xv-independent.result');
    writeFileSync(owned, '{}');
    writeFileSync(foreign, '{}');

    cleanup(root, makeSprint(), undefined, 'sprint-end');

    expect(existsSync(owned)).toBe(false);
    expect(existsSync(foreign)).toBe(true);
  });

  it("cleanup('sprint-end') retires only the settled sprint's process-suffixed temp residue", () => {
    const owned = join(root, '.tasks', 'task-999-004.landing-proposal.json.tmp.276');
    const foreign = join(root, '.tasks', 'task-998-004.landing-proposal.json.tmp.277');
    writeFileSync(owned, '{partial');
    writeFileSync(foreign, '{other-run');

    cleanup(root, makeSprint(), undefined, 'sprint-end');

    expect(existsSync(owned)).toBe(false);
    expect(existsSync(foreign)).toBe(true);
  });

  it("cleanup('spawn-fail') preserves both for post-mortem", () => {
    cleanup(root, makeSprint(), undefined, 'spawn-fail');
    expect(existsSync(join(root, '.dashboard'))).toBe(true);
    expect(existsSync(join(root, '.deckent', 'ci-baseline.json'))).toBe(true);
  });

  it("cleanup('sprint-end') removes legacy locks but preserves execution authority", () => {
    const locks = join(root, '.locks');
    mkdirSync(locks, { recursive: true });
    writeFileSync(join(locks, 'src__legacy.lock'), '{}');
    writeFileSync(join(locks, 'src__spawn.spawnlock'), '{}');
    writeFileSync(join(locks, 'execution-lock-authority.sqlite3'), 'authority');
    writeFileSync(join(locks, 'execution-lock-authority.sentinel.json'), '{}');
    const projection = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.executionlock';
    writeFileSync(join(locks, projection), '{}');

    cleanup(root, makeSprint(), undefined, 'sprint-end');

    expect(existsSync(join(locks, 'src__legacy.lock'))).toBe(false);
    expect(existsSync(join(locks, 'src__spawn.spawnlock'))).toBe(false);
    expect(existsSync(join(locks, 'execution-lock-authority.sqlite3'))).toBe(true);
    expect(existsSync(join(locks, 'execution-lock-authority.sentinel.json'))).toBe(true);
    expect(existsSync(join(locks, projection))).toBe(true);
  });

  it("cleanup('sprint-end') clears a dead coordinator sprint.lock", () => {
    writeFileSync(
      join(root, '.deckent', 'sprint.lock'),
      JSON.stringify({
        pid: 2_147_483_647,
        sprintId: 'sprint-999',
        env: 'test',
        acquiredAt: new Date().toISOString(),
      }),
    );

    cleanup(root, makeSprint(), undefined, 'sprint-end');

    expect(existsSync(join(root, '.deckent', 'sprint.lock'))).toBe(false);
  });

  it("cleanup('sprint-end') preserves another live process sprint.lock", () => {
    writeFileSync(
      join(root, '.deckent', 'sprint.lock'),
      JSON.stringify({
        pid: process.ppid,
        sprintId: 'sprint-other',
        env: 'test',
        acquiredAt: new Date().toISOString(),
      }),
    );

    cleanup(root, makeSprint(), undefined, 'sprint-end');

    expect(existsSync(join(root, '.deckent', 'sprint.lock'))).toBe(true);
  });
});
