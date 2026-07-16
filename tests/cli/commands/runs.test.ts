// F-3 — `deckent runs` CLI command: inbox list + operator stale-run sweep.
//
// Hermetic: a tmpdir project root (chdir'd into — resolveProjectRoot() is cwd)
// with real run-flow-store fixtures drives the REAL command action through
// commander parseAsync; stdout is captured via a process.stdout.write spy
// (same harness as archive-debt.test.ts). No gitignored local state is read.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { registerRuns } from '../../../src/cli/commands/runs.js';
import { getRunFlowCoordinator, _resetRunFlowCoordinatorsForTests } from '../../../src/orchestra/run-flow-coordinator-registry.js';
import { saveApprovedSnapshot, saveRunHandle } from '../../../src/core/run-flow-store.js';

const ORIG_CWD = process.cwd();

let root: string;
let stdout: string[];
let stdoutSpy: { mockRestore(): void };

/** A real pre-698 legacy `do` flow: snapshot + pid-less handle, no event log. */
function legacyDoFlow(flowId: string): void {
  const startedAt = '2026-07-14T11:16:15.483Z';
  saveApprovedSnapshot(root, {
    flowId, revision: 1, planDigest: 'd-1',
    approvedBy: { id: 'u' }, approvedAt: startedAt,
    sprint: { id: flowId, tasks: [] } as never,
  });
  saveRunHandle(root, {
    flowId, revision: 1, planDigest: 'd-1',
    handle: { flowId, jobId: `j-${flowId}`, logRef: 'log' },
    startedAt,
  });
}

async function run(args: string[] = []): Promise<string> {
  const program = new Command();
  program.exitOverride();
  registerRuns(program);
  try {
    await program.parseAsync(['node', 'test', 'runs', ...args]);
  } catch (err) {
    if (!(err instanceof Error && err.message.includes('commander.'))) throw err;
  }
  return stdout.join('');
}

describe('deckent runs — CLI inbox + --close-stale (F-3)', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'runs-cli-'));
    process.chdir(root);
    _resetRunFlowCoordinatorsForTests();
    stdout = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((d) => {
      stdout.push(String(d));
      return true;
    });
  });

  afterEach(() => {
    stdoutSpy?.mockRestore();
    process.chdir(ORIG_CWD);
    _resetRunFlowCoordinatorsForTests();
    rmSync(root, { recursive: true, force: true });
  });

  it('bare `runs` on an empty project prints the empty notice', async () => {
    const out = await run();
    expect(out).toContain('No runs yet');
  });

  it('bare `runs` lists a phantom legacy flow honestly as running (unverified)', async () => {
    legacyDoFlow('c1b050ab-71aa-48b0-bd20-c2810eb6eafb');
    const out = await run();
    expect(out).toContain('c1b050ab · running (unverified)');
  });

  it('`runs --close-stale` is a DRY-RUN: reports the candidate, writes nothing', async () => {
    legacyDoFlow('c1b050ab-71aa-48b0-bd20-c2810eb6eafb');
    const out = await run(['--close-stale']);
    expect(out).toContain('Stale runs that would be closed (1):');
    expect(out).toContain('c1b050ab · unverifiable (no pid recorded) → cancelled');
    expect(out).toContain('--close-stale --yes');
    // nothing written — a fresh coordinator still derives DETACHED_RUNNING
    _resetRunFlowCoordinatorsForTests();
    expect(getRunFlowCoordinator(root).getFlow('c1b050ab-71aa-48b0-bd20-c2810eb6eafb').state).toBe('DETACHED_RUNNING');
  });

  it('`runs --close-stale --yes` durably closes and the trailing list shows cancelled', async () => {
    legacyDoFlow('c1b050ab-71aa-48b0-bd20-c2810eb6eafb');
    const out = await run(['--close-stale', '--yes']);
    expect(out).toContain('Closed 1 stale run(s):');
    expect(out).toContain('c1b050ab · cancelled');
    _resetRunFlowCoordinatorsForTests();
    expect(getRunFlowCoordinator(root).getFlow('c1b050ab-71aa-48b0-bd20-c2810eb6eafb').state).toBe('CANCELLED');
  });

  it('`runs --close-stale` with nothing stale says so', async () => {
    const out = await run(['--close-stale']);
    expect(out).toContain('No stale runs');
  });

  it('`runs <n>` prints the rich detail — real start from the handle, humanized (F-3b)', async () => {
    legacyDoFlow('c1b050ab-71aa-48b0-bd20-c2810eb6eafb');
    const out = await run(['1']);
    expect(out).toContain('Run c1b050ab · running (unverified)');
    expect(out).toContain('  id: c1b050ab-71aa-48b0-bd20-c2810eb6eafb');
    expect(out).toContain('liveness: unverified');
    // real start (the handle's startedAt), humanized "YYYY-MM-DD HH:mm (…)"
    expect(out).toMatch(/ {2}started: \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(/);
  });

  it('`runs <out-of-range>` prints the honest not-found', async () => {
    legacyDoFlow('c1b050ab-71aa-48b0-bd20-c2810eb6eafb');
    const out = await run(['9']);
    expect(out).toContain('No run #9');
  });

  it('a flow whose jobs-dir record is terminal is NEVER offered for closure (execution truth wins)', async () => {
    legacyDoFlow('11e0d0ab-71aa-48b0-bd20-c2810eb6eafb');
    const jobsDir = join(root, '.deckent', 'runtime', 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    writeFileSync(
      join(jobsDir, 'sprint-900.json'),
      JSON.stringify({
        status: 'COMPLETE',
        sprintId: 'sprint-900',
        metrics: { totalTasks: 3, done: 3, techDebt: 0, noGo: 0 },
        completionRecord: { flowId: '11e0d0ab-71aa-48b0-bd20-c2810eb6eafb' },
      }),
    );
    const out = await run(['--close-stale', '--yes']);
    expect(out).toContain('No stale runs');
    expect(out).toContain('11e0d0ab · completed');
    _resetRunFlowCoordinatorsForTests();
    // durable store untouched — the jobs record is the display truth, not a closure licence
    expect(getRunFlowCoordinator(root).getFlow('11e0d0ab-71aa-48b0-bd20-c2810eb6eafb').state).toBe('DETACHED_RUNNING');
  });
});
