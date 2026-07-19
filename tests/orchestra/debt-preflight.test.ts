import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DebtPriority } from '../../src/core/types.js';
import type { DebtItem } from '../../src/core/types.js';
import {
  COMPLETION_CLAIM_RE,
  extractVerifyCommands,
  preflightCriticalDebt,
  defaultCommandRunner,
  type CommandRun,
  type CommandRunner,
  type ExtractedCommand,
} from '../../src/orchestra/debt-preflight.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDebt(overrides: Partial<DebtItem> = {}): DebtItem {
  return {
    id: 'debt-445-017-fix',
    description: 'Task evaluated as GO_WITH_TECH_DEBT. Notes: generic note.',
    originTaskId: '445-017-fix',
    originSprintId: 'sprint-445',
    priority: DebtPriority.CRITICAL,
    sprintsOpen: 4,
    resolved: false,
    createdAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

function greenRunner(calls: ExtractedCommand[] = []): CommandRunner {
  return (cmd) => {
    calls.push(cmd);
    return Promise.resolve<CommandRun>({ display: cmd.display, ok: true, exitCode: 0, timedOut: false, durationMs: 5 });
  };
}

// ─── COMPLETION_CLAIM_RE — pinned to live debt-note shapes ──────────

describe('COMPLETION_CLAIM_RE', () => {
  it('matches the live sprint-433/445/449 completion-report shapes', () => {
    // debt-433-001-fix: "The working tree already carries 433-001's diff … I re-verified this diff line-by-line"
    expect(COMPLETION_CLAIM_RE.test('The working tree already carries the diff. I re-verified it line-by-line.')).toBe(true);
    // debt-445-017-fix: "No new edit was made this round … still present … re-verified correct"
    expect(COMPLETION_CLAIM_RE.test('No new edit was made this round -- prior blocks are still present, unreverted.')).toBe(true);
    // debt-445-013-fix: "REAL (non-provisional) v3 capabilities blocks … are authored and verified."
    expect(COMPLETION_CLAIM_RE.test('The v3 capabilities blocks are authored and verified.')).toBe(true);
    // debt-449-008-fix: "No file changes needed — the sibling worker … already left a complete, correct test file"
    expect(COMPLETION_CLAIM_RE.test('No file changes needed — the prior worker already left a complete test file.')).toBe(true);
  });

  it('does NOT match a note describing genuinely remaining work', () => {
    expect(COMPLETION_CLAIM_RE.test('The i18n keys for the status command still need to be added; the tr side is missing.')).toBe(false);
    expect(COMPLETION_CLAIM_RE.test('Coverage is below threshold and two edge cases remain untested.')).toBe(false);
  });
});

// ─── extractVerifyCommands (pure) ────────────────────────────────────

describe('extractVerifyCommands()', () => {
  it('extracts tsc, npm run lint, and a vitest file command from prose', () => {
    const cmds = extractVerifyCommands(
      'Re-verified: (1) `npx tsc --noEmit` -> exit 0. (2) npm run lint clean. (3) npx vitest run tests/cli/run-rename-smoke.test.ts: all 7 pass.',
    );
    expect(cmds.map(c => c.display)).toEqual([
      'npx tsc --noEmit',
      'npm run lint',
      'npx vitest run tests/cli/run-rename-smoke.test.ts',
    ]);
  });

  it('strips the trailing prose punctuation of the live 449-008 shape (path followed by colon)', () => {
    const cmds = extractVerifyCommands('Check 2 — npx vitest run tests/cli/run-rename-smoke.test.ts:');
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.args).toEqual(['vitest', 'run', 'tests/cli/run-rename-smoke.test.ts']);
  });

  it('accepts multiple consecutive test paths and stops at the first prose token', () => {
    const cmds = extractVerifyCommands('ran npx vitest run tests/a/x.test.ts tests/b/y.test.ts and everything passed');
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.args).toEqual(['vitest', 'run', 'tests/a/x.test.ts', 'tests/b/y.test.ts']);
  });

  it('never extracts prose, flags, traversal, or shell-metacharacter tokens', () => {
    // "and" is prose (no slash / test marker) → no command at all
    expect(extractVerifyCommands('npx vitest run and then it was fine')).toEqual([]);
    // leading-dash flag stops extraction before any path
    expect(extractVerifyCommands('npx vitest run --coverage tests/a.test.ts')).toEqual([]);
    // traversal is rejected
    expect(extractVerifyCommands('npx vitest run ../../etc/passwd')).toEqual([]);
    // shell metacharacters break the token → rejected by the allowlist
    expect(extractVerifyCommands('npx vitest run tests/a.test.ts;rm -rf /')).toEqual([]);
    // lint variants are NOT the plain lint script
    expect(extractVerifyCommands('npm run lint:adr was green')).toEqual([]);
  });

  it('dedups repeated mentions of the same command', () => {
    const cmds = extractVerifyCommands('`npx tsc --noEmit` clean; later npx tsc --noEmit again clean.');
    expect(cmds).toHaveLength(1);
  });
});

// ─── preflightCriticalDebt (hermetic — injected runner) ─────────────

describe('preflightCriticalDebt()', () => {
  const CLAIM_AND_EVIDENCE =
    'No new edit was made this round — re-verified correct: `npx tsc --noEmit` -> exit 0 and npx vitest run tests/cli/x.test.ts green.';

  // Hermetic fixture root: the vitest evidence path in CLAIM_AND_EVIDENCE exists
  // here, so existence-gated tests are deterministic on a fresh checkout.
  let fixtureRoot: string;
  beforeAll(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'debt-preflight-'));
    await mkdir(join(fixtureRoot, 'tests/cli'), { recursive: true });
    await writeFile(join(fixtureRoot, 'tests/cli/x.test.ts'), '// fixture\n');
  });
  afterAll(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  it('verifies + marks resolvable a claim-bearing debt whose evidence runs green', async () => {
    const calls: ExtractedCommand[] = [];
    const result = await preflightCriticalDebt(fixtureRoot, [makeDebt({ description: CLAIM_AND_EVIDENCE })], {
      runner: greenRunner(calls),
    });
    expect(result.items).toEqual([expect.objectContaining({ debtId: 'debt-445-017-fix', verdict: 'verified-resolved' })]);
    expect(result.verifiedIds.has('debt-445-017-fix')).toBe(true);
    expect(result.annotations.size).toBe(0);
    expect(calls).toHaveLength(2); // tsc + vitest both ran
  });

  it('keeps a debt whose evidence is red, stops at the first red, and annotates the failure', async () => {
    let n = 0;
    const runner: CommandRunner = (cmd) => {
      n++;
      return Promise.resolve({ display: cmd.display, ok: false, exitCode: 1, timedOut: false, durationMs: 5 });
    };
    const result = await preflightCriticalDebt('/tmp/nowhere', [makeDebt({ description: CLAIM_AND_EVIDENCE })], { runner });
    expect(result.items[0]?.verdict).toBe('evidence-red');
    expect(result.verifiedIds.size).toBe(0);
    expect(n).toBe(1); // first red settles it
    const note = result.annotations.get('debt-445-017-fix');
    expect(note).toContain('FAILED');
    expect(note).toContain('npx tsc --noEmit');
  });

  it('reports timeout distinctly in the annotation', async () => {
    const runner: CommandRunner = (cmd) =>
      Promise.resolve({ display: cmd.display, ok: false, exitCode: null, timedOut: true, durationMs: 99 });
    const result = await preflightCriticalDebt('/tmp/nowhere', [makeDebt({ description: CLAIM_AND_EVIDENCE })], { runner });
    expect(result.annotations.get('debt-445-017-fix')).toContain('timeout');
  });

  it('claim without extractable evidence → no-evidence, kept, runner never called', async () => {
    const calls: ExtractedCommand[] = [];
    const result = await preflightCriticalDebt(
      '/tmp/nowhere',
      [makeDebt({ description: 'The blocks are authored and verified; everything matches the spec.' })],
      { runner: greenRunner(calls) },
    );
    expect(result.items[0]?.verdict).toBe('no-evidence');
    expect(result.verifiedIds.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('no completion claim → no-claim, never runs commands even if the note names some', async () => {
    const calls: ExtractedCommand[] = [];
    const result = await preflightCriticalDebt(
      '/tmp/nowhere',
      [makeDebt({ description: 'Remaining work: make `npx tsc --noEmit` pass again; it currently errors.' })],
      { runner: greenRunner(calls) },
    );
    expect(result.items[0]?.verdict).toBe('no-claim');
    expect(calls).toHaveLength(0);
  });

  it('skips non-critical and already-resolved debts entirely', async () => {
    const calls: ExtractedCommand[] = [];
    const result = await preflightCriticalDebt(
      '/tmp/nowhere',
      [
        makeDebt({ id: 'debt-a', priority: DebtPriority.NORMAL, description: CLAIM_AND_EVIDENCE }),
        makeDebt({ id: 'debt-b', resolved: true, description: CLAIM_AND_EVIDENCE }),
      ],
      { runner: greenRunner(calls) },
    );
    expect(result.items).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('vanished evidence path → stale-evidence: never auto-closed, annotation says re-point (live 445-013/017 shape)', async () => {
    const calls: ExtractedCommand[] = [];
    const result = await preflightCriticalDebt(
      fixtureRoot,
      [makeDebt({ description: 'Still present and re-verified: `npx tsc --noEmit` clean; npx vitest run tests/core/routing3/ green.' })],
      { runner: greenRunner(calls) },
    );
    expect(result.items[0]?.verdict).toBe('stale-evidence');
    expect(result.verifiedIds.size).toBe(0);
    expect(calls.map(c => c.display)).toEqual(['npx tsc --noEmit']); // vanished path never spawned
    const note = result.annotations.get('debt-445-017-fix');
    expect(note).toContain('no longer exist');
    expect(note).toContain('tests/core/routing3/');
    expect(note).toContain('RE-POINT');
  });

  it('memoizes identical commands across debts — tsc named in 3 notes runs once', async () => {
    const calls: ExtractedCommand[] = [];
    const note = 'Re-verified — `npx tsc --noEmit` exit 0.';
    const result = await preflightCriticalDebt(
      '/tmp/nowhere',
      [makeDebt({ id: 'debt-1', description: note }), makeDebt({ id: 'debt-2', description: note }), makeDebt({ id: 'debt-3', description: note })],
      { runner: greenRunner(calls) },
    );
    expect(result.verifiedIds.size).toBe(3);
    expect(calls).toHaveLength(1);
  });

  it('exhausted time budget keeps the debt with an UNVERIFIED annotation (fail-open, never auto-close)', async () => {
    const result = await preflightCriticalDebt('/tmp/nowhere', [makeDebt({ description: CLAIM_AND_EVIDENCE })], {
      runner: greenRunner(),
      totalBudgetMs: 0,
    });
    expect(result.items[0]?.verdict).toBe('budget-exhausted');
    expect(result.verifiedIds.size).toBe(0);
    expect(result.annotations.get('debt-445-017-fix')).toContain('UNVERIFIED');
  });
});

// ─── planSprint wiring — dryRun regression (sprint-450 canlı-dersi) ─
// generatePlanPreview HER ZAMAN dryRun:true çağırır ve run_flow_v2'de o plan
// exact-snapshot olarak koşturulur — preflight dryRun'da da KOŞMALI. Spawn'sız
// pin: kanıt-yolu tmp-root'ta yok → stale-evidence annotation'ı injected
// fix-task açıklamasına düşer (hiçbir komut doğmadan preflight'ın çalıştığının
// kanıtı).

describe('planSprint wiring — preflight runs under dryRun:true', () => {
  it('stale-evidence annotation reaches the injected fix task in a dryRun plan', async () => {
    const { mkdirSync, rmSync, writeFileSync } = await import('node:fs');
    const root = join(tmpdir(), `preflight-dryrun-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(root, '.brain'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ mode: 'max_plan', modes: {} }), 'utf8');
    try {
      const { planSprint } = await import('../../src/orchestra/sprint-planner.js');
      const config = {
        mode: 'max_plan',
        activeModeConfig: {
          max_workers: 4, brain_model: 'opus', default_model: 'sonnet',
          haiku_allowed: false, brain_planning: 'structured',
        },
        modes: {},
        language: 'en', projectName: 'test-project', projectRoot: root,
        version: '1.0.0',
      } as any;
      const context = {
        directives: '## Task 1: Simple fix\n- Scope: src/core/\n',
        memory: '', retro: '', patterns: '', decisions: '', existingTasks: [],
        projectState: { gitStatus: '', fileTree: [] },
        debt: [makeDebt({
          id: 'debt-dryrun-pin',
          description: 'Re-verified correct — npx vitest run tests/does/not/exist.test.ts was green.',
        })],
      } as any;
      const sprint = await planSprint(root, config, context,
        { size: 'full', maxWorkers: 4, modelConstraint: null, reason: 'test' } as any,
        { mode: 'structured', dryRun: true });
      const fixTask = sprint.tasks.find(t => t.isPriorityFix);
      expect(fixTask).toBeDefined();
      expect(fixTask!.description).toContain('RE-POINT');
      expect(fixTask!.description).toContain('tests/does/not/exist.test.ts');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── defaultCommandRunner (real async spawn, hermetic) ──────────────

describe('defaultCommandRunner()', () => {
  const nodeCmd = (code: string): ExtractedCommand => ({
    bin: process.execPath,
    args: ['-e', code],
    display: `node -e ${code}`,
  });

  it('reports ok:true for exit 0 and ok:false with the exit code otherwise', async () => {
    const ok = await defaultCommandRunner(nodeCmd('process.exit(0)'), process.cwd(), 30_000);
    expect(ok.ok).toBe(true);
    expect(ok.exitCode).toBe(0);

    const bad = await defaultCommandRunner(nodeCmd('process.exit(3)'), process.cwd(), 30_000);
    expect(bad.ok).toBe(false);
    expect(bad.exitCode).toBe(3);
  });

  it('kills and reports timedOut when the command exceeds its timeout', async () => {
    const run = await defaultCommandRunner(nodeCmd('setTimeout(() => {}, 60000)'), process.cwd(), 300);
    expect(run.ok).toBe(false);
    expect(run.timedOut).toBe(true);
  });

  it('reports ok:false (not a throw) for an unspawnable binary', async () => {
    const run = await defaultCommandRunner(
      { bin: '/nonexistent-bin-deckent-test', args: [], display: 'nonexistent' },
      process.cwd(),
      5_000,
    );
    expect(run.ok).toBe(false);
    expect(run.timedOut).toBe(false);
  });
});
