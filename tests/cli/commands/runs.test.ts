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

import { registerRuns, executeInboxDecision } from '../../../src/cli/commands/runs.js';
import { getRunFlowCoordinator, _resetRunFlowCoordinatorsForTests } from '../../../src/orchestra/run-flow-coordinator-registry.js';
import { saveApprovedSnapshot, saveRunHandle, savePlannedSprint } from '../../../src/core/run-flow-store.js';
import { appendProposalToCompletionChain } from '../../orchestra/run-flow-coordinator-harness.js';

const ORIG_CWD = process.cwd();

let root: string;
let stdout: string[];
let stderr: string[];
let stdoutSpy: { mockRestore(): void };
let stderrSpy: { mockRestore(): void };

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
    stderr = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((d) => {
      stdout.push(String(d));
      return true;
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((d) => {
      stderr.push(String(d));
      return true;
    });
  });

  afterEach(() => {
    stdoutSpy?.mockRestore();
    stderrSpy?.mockRestore();
    process.chdir(ORIG_CWD);
    _resetRunFlowCoordinatorsForTests();
    rmSync(root, { recursive: true, force: true });
    // decide-refusal paths set a non-zero exitCode — never leak it into vitest
    process.exitCode = 0;
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

  // ─── SURF-6 — `runs <n> --approve|--reject|--start` (cross-surface decide) ──

  /** A flow durably at AWAITING_APPROVAL (real event log via the store) whose
   *  planned sprint is persisted — exactly what a Desktop propose leaves on
   *  disk for the terminal operator to decide on. */
  function awaitingApprovalFlow(flowId: string): void {
    appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });
    savePlannedSprint(root, flowId, {
      revision: 1,
      sprint: { id: `sprint-${flowId}`, tasks: [] },
    });
  }

  it('`runs <n> --approve` approves the Desktop-proposed flow and shows the daemon-truth detail', async () => {
    awaitingApprovalFlow('aaaa0001-71aa-48b0-bd20-c2810eb6eafb');
    const out = await run(['1', '--approve']);
    expect(out).toContain('Approved — revision 1 · digest digest-harne');
    expect(out).toContain('· approved'); // the epilogue detail re-reads the durable store
    _resetRunFlowCoordinatorsForTests();
    expect(getRunFlowCoordinator(root).getFlow('aaaa0001-71aa-48b0-bd20-c2810eb6eafb').state).toBe('APPROVED');
  });

  it('`runs <n> --reject --reason` cancels durably and echoes the reason', async () => {
    awaitingApprovalFlow('aaaa0002-71aa-48b0-bd20-c2810eb6eafb');
    const out = await run(['1', '--reject', '--reason', 'not in scope']);
    expect(out).toContain('Rejected — not in scope');
    expect(out).toContain('· cancelled');
    _resetRunFlowCoordinatorsForTests();
    expect(getRunFlowCoordinator(root).getFlow('aaaa0002-71aa-48b0-bd20-c2810eb6eafb').state).toBe('CANCELLED');
  });

  it('`--approve --reject` together is an honest flag-conflict error', async () => {
    awaitingApprovalFlow('aaaa0003-71aa-48b0-bd20-c2810eb6eafb');
    await run(['1', '--approve', '--reject']);
    expect(stderr.join('')).toContain('--approve and --reject are mutually exclusive');
    expect(process.exitCode).toBe(1);
  });

  it('`--reason` without `--reject` is refused', async () => {
    awaitingApprovalFlow('aaaa0004-71aa-48b0-bd20-c2810eb6eafb');
    await run(['1', '--reason', 'why']);
    expect(stderr.join('')).toContain('--reason is only valid with --reject');
    expect(process.exitCode).toBe(1);
  });

  it('decide flags without a run number are refused with the usage hint', async () => {
    await run(['--approve']);
    expect(stderr.join('')).toContain('Decision flags need a run number');
    expect(process.exitCode).toBe(1);
  });

  it('decide flags with an out-of-range number print the honest not-found', async () => {
    awaitingApprovalFlow('aaaa0005-71aa-48b0-bd20-c2810eb6eafb');
    await run(['9', '--approve']);
    expect(stderr.join('')).toContain('No run #9');
    expect(process.exitCode).toBe(1);
  });

  it('`--approve` on a flow with no live preview fails honestly via the shared service', async () => {
    // legacy snapshot+handle flow (no event log → no preview to approve)
    legacyDoFlow('aaaa0006-71aa-48b0-bd20-c2810eb6eafb');
    await run(['1', '--approve']);
    expect(stderr.join('')).toContain('no live preview to approve');
    expect(process.exitCode).toBe(1);
  });

  it('`runs <flowId-prefix>` (no decide flag) shows the rich DETAIL too — the handoff handle works read-only', async () => {
    awaitingApprovalFlow('eeee0001-71aa-48b0-bd20-c2810eb6eafb');
    const out = await run(['eeee0001']);
    expect(out).toContain('  id: eeee0001-71aa-48b0-bd20-c2810eb6eafb');
    expect(out).toContain('digest: digest-harness');
  });

  it('decide accepts a unique flowId PREFIX (stable cross-surface handle; row numbers shift on re-sort)', async () => {
    awaitingApprovalFlow('cccc0001-71aa-48b0-bd20-c2810eb6eafb');
    const out = await run(['cccc0001', '--approve']);
    expect(out).toContain('Approved — revision 1');
    _resetRunFlowCoordinatorsForTests();
    expect(getRunFlowCoordinator(root).getFlow('cccc0001-71aa-48b0-bd20-c2810eb6eafb').state).toBe('APPROVED');
  });

  it('an AMBIGUOUS flowId prefix is an honest not-found, never a guess', async () => {
    awaitingApprovalFlow('dddd0001-71aa-48b0-bd20-c2810eb6eafb');
    awaitingApprovalFlow('dddd0002-71aa-48b0-bd20-c2810eb6eafb');
    await run(['dddd', '--approve']);
    expect(stderr.join('')).toContain('No run #dddd');
    expect(process.exitCode).toBe(1);
    _resetRunFlowCoordinatorsForTests();
    for (const id of ['dddd0001-71aa-48b0-bd20-c2810eb6eafb', 'dddd0002-71aa-48b0-bd20-c2810eb6eafb']) {
      expect(getRunFlowCoordinator(root).getFlow(id).state).toBe('AWAITING_APPROVAL');
    }
  });

  it('SURF-6 kuyruk-D: approving a gate-FAIL plan prints the honest gate warning first', async () => {
    const flowId = 'ffff0001-71aa-48b0-bd20-c2810eb6eafb';
    appendProposalToCompletionChain({
      root, flowId, through: 'PREVIEW_READY',
      preview: { gateResult: 'fail', gateFindings: ['[SAN-1] scope-satisfiability: docs/X.md not writable', '[SAN-1] second finding'] },
    });
    savePlannedSprint(root, flowId, { revision: 1, sprint: { id: `sprint-${flowId}`, tasks: [] } });

    const out = await run(['ffff0001', '--approve']);
    expect(out).toContain('Warning: the plan gate is FAIL (2 blocking finding(s))');
    expect(out).toContain('Approved — revision 1');
  });

  it('executeInboxDecision (REPL-card glue): approve/reject return the localized outcome line', () => {
    awaitingApprovalFlow('bbbb0001-71aa-48b0-bd20-c2810eb6eafb');
    expect(executeInboxDecision(root, 'bbbb0001-71aa-48b0-bd20-c2810eb6eafb', 'approve', 'en'))
      .toBe('Approved — revision 1 · digest digest-harne');
    _resetRunFlowCoordinatorsForTests();

    awaitingApprovalFlow('bbbb0002-71aa-48b0-bd20-c2810eb6eafb');
    expect(executeInboxDecision(root, 'bbbb0002-71aa-48b0-bd20-c2810eb6eafb', 'reject', 'en')).toBe('Rejected.');
  });

  it('executeInboxDecision NEVER throws — a refusal comes back as an honest Error: line', () => {
    legacyDoFlow('bbbb0003-71aa-48b0-bd20-c2810eb6eafb'); // no live preview
    const line = executeInboxDecision(root, 'bbbb0003-71aa-48b0-bd20-c2810eb6eafb', 'approve', 'en');
    expect(line).toContain('Error:');
    expect(line).toContain('no live preview to approve');
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
