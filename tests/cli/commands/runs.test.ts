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
import { spawn } from 'node:child_process';

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

  it('583/N1: `runs <prefix> --diff` prints the run\'s unified footprint from the recorded base', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const gexec = promisify(execFile);
    await gexec('git', ['init', '-q'], { cwd: root });
    await gexec('git', ['config', 'user.email', 't@t'], { cwd: root });
    await gexec('git', ['config', 'user.name', 't'], { cwd: root });
    writeFileSync(join(root, 'hello.txt'), 'one\n');
    await gexec('git', ['add', '.'], { cwd: root });
    await gexec('git', ['commit', '-q', '-m', 'base'], { cwd: root });
    const base = (await gexec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

    saveRunHandle(root, {
      flowId: 'dddd9999-71aa-48b0-bd20-c2810eb6eafb', revision: 1, planDigest: 'd-1',
      handle: { flowId: 'dddd9999-71aa-48b0-bd20-c2810eb6eafb', jobId: 'j', logRef: 'l' },
      startedAt: '2026-07-17T10:00:00.000Z', gitBase: base,
    });
    saveApprovedSnapshot(root, {
      flowId: 'dddd9999-71aa-48b0-bd20-c2810eb6eafb', revision: 1, planDigest: 'd-1',
      approvedBy: { id: 'u' }, approvedAt: '2026-07-17T10:00:00.000Z',
      sprint: { id: 's', tasks: [] } as never,
    });
    writeFileSync(join(root, 'hello.txt'), 'one\ntwo\n');

    const out = await run(['dddd9999', '--diff']);
    expect(out).toContain('Diff — 1 file(s)');
    expect(out).toContain(`base ${base.slice(0, 12)}`);
    expect(out).toContain('+two');
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

  // ─── 583/N4 — `runs <n> --commit`: the post-run incele→commit flow ────────

  /** Async git helper (spawnSync FORBIDDEN — hermeticity rule). */
  function gitRun(cwd: string, args: string[]): Promise<{ code: number; stdout: string }> {
    return new Promise((resolve) => {
      const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      child.stdout?.on('data', (d: Buffer) => { out += String(d); });
      child.on('error', () => resolve({ code: -1, stdout: out }));
      child.on('close', (code) => resolve({ code: code ?? -1, stdout: out }));
    });
  }

  async function initGitWithBaseline(): Promise<void> {
    expect((await gitRun(root, ['init', '--quiet', '-b', 'main'])).code).toBe(0);
    await gitRun(root, ['config', '--local', 'core.hooksPath', '/dev/null']);
    await gitRun(root, ['config', '--local', 'commit.gpgsign', 'false']);
    // Repo-local identity — the service commits with the plain process env.
    await gitRun(root, ['config', '--local', 'user.name', 'test']);
    await gitRun(root, ['config', '--local', 'user.email', 'test@example.com']);
    // Real projects gitignore deckent's runtime dirs (deckent init writes
    // this) — without it the harness's own store files (.deckent/…) would
    // count as untracked changes and poison the clean/1-file expectations.
    writeFileSync(join(root, '.gitignore'), '.deckent/\n.tasks/\n.brain/\n', 'utf-8');
    writeFileSync(join(root, 'base.txt'), 'baseline\n', 'utf-8');
    await gitRun(root, ['add', 'base.txt', '.gitignore']);
    expect((await gitRun(root, ['commit', '--quiet', '--no-gpg-sign', '-m', 'baseline'])).code).toBe(0);
  }

  /** A COMPLETED (terminal) flow with a proposal-borne intent. */
  function completedFlow(flowId: string, intentSummary: string): void {
    appendProposalToCompletionChain({ root, flowId, proposal: { intentSummary } });
  }

  it('`--commit` on a non-terminal run is refused honestly (commit is a post-run step)', async () => {
    await initGitWithBaseline();
    legacyDoFlow('cccc0001-71aa-48b0-bd20-c2810eb6eafb'); // phantom-running, no closure
    await run(['cccc0001', '--commit']);
    expect(stderr.join('')).toContain('commit is a post-run step');
    expect(process.exitCode).toBe(1);
  });

  it('`--commit` with a clean tree says so and commits nothing', async () => {
    await initGitWithBaseline();
    completedFlow('dddd0001-71aa-48b0-bd20-c2810eb6eafb', 'add auth');
    const out = await run(['dddd0001', '--commit']);
    expect(out).toContain('Working tree clean');
  });

  it('`--commit --yes` shows the proposal and lands a REAL commit (intent subject + deckent-run trailer)', async () => {
    await initGitWithBaseline();
    const flowId = 'eeee0001-71aa-48b0-bd20-c2810eb6eafb';
    completedFlow(flowId, 'add auth flow');
    writeFileSync(join(root, 'auth.ts'), 'export const auth = 1;\n', 'utf-8');

    const out = await run(['eeee0001', '--commit', '--yes']);
    expect(out).toContain('Commit proposal — 1 file(s)');
    expect(out).toContain('auth.ts');
    expect(out).toContain('add auth flow');
    expect(out).toMatch(/Committed [0-9a-f]{7,}\./);

    const subject = await gitRun(root, ['log', '-n1', '--pretty=%s']);
    expect(subject.stdout.trim()).toBe('add auth flow');
    const body = await gitRun(root, ['log', '-n1', '--pretty=%b']);
    expect(body.stdout).toContain(`deckent-run: ${flowId}`);
  });

  it('`--commit --yes --message` overrides the suggested message', async () => {
    await initGitWithBaseline();
    completedFlow('abab0001-71aa-48b0-bd20-c2810eb6eafb', 'ignored intent');
    writeFileSync(join(root, 'x.txt'), 'x\n', 'utf-8');

    await run(['abab0001', '--commit', '--yes', '--message', 'chore: custom seal']);
    const subject = await gitRun(root, ['log', '-n1', '--pretty=%s']);
    expect(subject.stdout.trim()).toBe('chore: custom seal');
  });

  it('non-interactive without --yes prints the hint and touches NOTHING (no stage, no commit)', async () => {
    await initGitWithBaseline();
    completedFlow('baba0001-71aa-48b0-bd20-c2810eb6eafb', 'goal');
    writeFileSync(join(root, 'y.txt'), 'y\n', 'utf-8');

    const out = await run(['baba0001', '--commit']); // vitest stdin has no TTY
    expect(out).toContain('--yes');
    const staged = await gitRun(root, ['diff', '--staged', '--name-only']);
    expect(staged.stdout.trim()).toBe('');
    const subject = await gitRun(root, ['log', '-n1', '--pretty=%s']);
    expect(subject.stdout.trim()).toBe('baseline');
  });

  it('`--commit` outside a git repository answers honestly', async () => {
    completedFlow('caca0001-71aa-48b0-bd20-c2810eb6eafb', 'goal');
    const out = await run(['caca0001', '--commit']);
    expect(out).toContain('not a git repository');
  });
});
