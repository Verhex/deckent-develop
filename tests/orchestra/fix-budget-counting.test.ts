/**
 * FIX-budget contract pin (sprint-524 · 524-009).
 *
 * The observation that opened this row was a real run whose FIX budget was
 * exhausted after a single wave — read as a counting bug. Measured code-truth
 * says otherwise, and this file pins the ACTUAL contract so nobody re-litigates
 * it from memory:
 *
 *   1. The budget is a count of ADMITTED FIX ROUNDS, not of executed fixes.
 *      `runFixPhase` (src/orchestra/sprint-phases.ts) says so in-code — "Each
 *      loop consumes one admitted FIX round" — and enforces it by marking every
 *      SELECTED fix id in `attemptedFixIds` BEFORE `spawnWorkers` is awaited.
 *      A fix left in the wave's overflow queue is therefore admitted, spent and
 *      unreachable: it is published as `queued-not-dispatched`, never dispatched
 *      by this phase, and can never be re-admitted in a later round.
 *
 *   2. Depth selection is not the phase's own invention — it lives in
 *      `src/core/task-lineage.ts` (`selectPendingFixTasks` /
 *      `resolveFixAttemptDepth`): depth ≤ maxFixRetries, one attempt per logical
 *      root, parent must already be terminal, shallow depth first.
 *
 *   3. The post-FIX pause is a SEPARATE gate over planned root tasks
 *      (`evaluateFixCircuitBreaker`, driven by `applyCascadeCircuitBreaker`).
 *      Fix attempts are not pushed into `sprint.tasks`, so a root whose only
 *      repair was admitted-but-never-executed is still FAILED when the admitted
 *      rounds run out, and the breaker pauses.
 *
 * This is a PIN, not a proposal: no production behaviour changes here. Whether
 * admitted-vs-executed counting *should* stay is an owner decision, recorded in
 * the .result notes — not silently rewritten by a test.
 *
 * Hermetic: pure functions + in-memory task fixtures + source-text asserts
 * (tests/orchestra precedent: surf0-flowid-seam-pin.test.ts). No spawn, no fs
 * writes, no timers.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateFixCircuitBreaker,
  resolveFixAncestorIds,
  resolveFixAttemptDepth,
  selectPendingFixTasks,
} from '../../src/core/task-lineage.js';
import { DEFAULT_FIX_CIRCUIT_BREAKER_CONFIG } from '../../src/core/config-types.js';
import { TaskEvaluation, TaskStatus, type Task } from '../../src/core/types.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const phasesSrc = readFileSync(join(REPO, 'src/orchestra/sprint-phases.ts'), 'utf-8');

// The runFixPhase round loop, sliced from its own documented comment to the
// wave hand-off, so the ordering asserts below cannot accidentally match some
// other phase's code.
const roundLoopStart = phasesSrc.indexOf('// Each loop consumes one admitted FIX round.');
const roundLoopEnd = phasesSrc.indexOf('const fixPhaseTimeout', roundLoopStart);
const roundLoopSrc = phasesSrc.slice(roundLoopStart, roundLoopEnd);

function task(id: string, status: TaskStatus, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: id,
    model: 'test-model',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'fix-budget-pin',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status,
    sprintId: 'sprint-524',
    ...overrides,
  };
}

function fixAttempt(id: string, parentId: string, status = TaskStatus.PENDING): Task {
  return task(id, status, { isPriorityFix: true, fixForTaskId: parentId });
}

/** What the simulated dispatcher did with an admitted fix attempt. */
type Disposition = 'executed-no-go' | 'executed-done' | 'deferred';

interface AdmittedRoundOutcome {
  /** Rounds that actually consumed budget (a round selecting nothing breaks out). */
  readonly roundsConsumed: number;
  readonly admittedPerRound: readonly (readonly string[])[];
  readonly executed: readonly string[];
  /** Admitted, slot spent, never dispatched — the overflow-queue population. */
  readonly strandedPending: readonly string[];
}

/**
 * Mirror of the `runFixPhase` round loop (src/orchestra/sprint-phases.ts):
 * re-scan → `selectPendingFixTasks` → root-ancestor filter → mark every selected
 * id attempted → dispatch. The attempted-marking deliberately happens BEFORE the
 * dispatch callback, exactly as the phase marks before awaiting `spawnWorkers`;
 * the source-pin block below fails if that order is ever inverted in production.
 */
function runAdmittedFixRounds(
  store: Map<string, Task>,
  plannedRootIds: ReadonlySet<string>,
  maxFixRetries: number,
  dispatch: (fixTask: Task, round: number) => Disposition,
): AdmittedRoundOutcome {
  const attemptedFixIds = new Set<string>();
  const admittedPerRound: string[][] = [];
  const executed: string[] = [];

  for (let fixRound = 1; fixRound <= maxFixRetries; fixRound += 1) {
    const allTasks = [...store.values()];
    const taskIndex = new Map(allTasks.map(t => [t.id, t]));
    const fixTasks = [...selectPendingFixTasks(allTasks, maxFixRetries, attemptedFixIds)]
      .filter(fixTask =>
        resolveFixAncestorIds(fixTask, taskIndex).some(ancestorId =>
          plannedRootIds.has(ancestorId),
        ),
      );
    if (fixTasks.length === 0) break;

    // ← the contract: admission spends the slot, dispatch has not happened yet.
    for (const fixTask of fixTasks) attemptedFixIds.add(fixTask.id);
    admittedPerRound.push(fixTasks.map(t => t.id));

    for (const fixTask of fixTasks) {
      const disposition = dispatch(fixTask, fixRound);
      if (disposition === 'deferred') continue;
      executed.push(fixTask.id);
      if (disposition === 'executed-done') {
        store.set(fixTask.id, { ...fixTask, status: TaskStatus.DONE });
        continue;
      }
      // A NO_GO fix settles terminal and mints its own `-fix` child, which the
      // NEXT scan picks up inside the same run (handleEvaluation's behaviour).
      store.set(fixTask.id, { ...fixTask, status: TaskStatus.NO_GO });
      const childId = `${fixTask.id}-fix`;
      store.set(childId, fixAttempt(childId, fixTask.id));
    }
  }

  const strandedPending = [...store.values()]
    .filter(t => t.isPriorityFix === true && t.status === TaskStatus.PENDING)
    .map(t => t.id)
    .sort();

  return {
    roundsConsumed: admittedPerRound.length,
    admittedPerRound,
    executed,
    strandedPending,
  };
}

describe('FIX budget counts admitted rounds, not executed fixes', () => {
  it('spends the slot on an admitted-but-deferred fix, which can never be re-admitted', () => {
    const store = new Map<string, Task>([
      ['A', task('A', TaskStatus.NO_GO)],
      ['B', task('B', TaskStatus.NO_GO)],
      ['A-fix', fixAttempt('A-fix', 'A')],
      ['B-fix', fixAttempt('B-fix', 'B')],
    ]);

    // Both admitted fixes land in the wave's overflow queue: admitted, published
    // as queued-not-dispatched, never run by this phase.
    const outcome = runAdmittedFixRounds(store, new Set(['A', 'B']), 2, () => 'deferred');

    expect(outcome.admittedPerRound).toEqual([['A-fix', 'B-fix']]);
    expect(outcome.executed).toEqual([]);
    // Round 1 consumed a slot for zero executed repair work; round 2 found
    // nothing selectable because both ids are already in `attemptedFixIds`.
    expect(outcome.roundsConsumed).toBe(1);
    expect(outcome.strandedPending).toEqual(['A-fix', 'B-fix']);

    // The exclusion is the mechanism, and it is task-lineage's, not the phase's:
    // a still-PENDING attempt that was already admitted is not a candidate.
    const allTasks = [...store.values()];
    expect(selectPendingFixTasks(allTasks, 2, new Set(['A-fix', 'B-fix']))).toEqual([]);
    expect(selectPendingFixTasks(allTasks, 2).map(t => t.id)).toEqual(['A-fix', 'B-fix']);
  });

  it('lets a deferred sibling strand while the executed lineage burns the rest of the budget', () => {
    const store = new Map<string, Task>([
      ['A', task('A', TaskStatus.NO_GO)],
      ['B', task('B', TaskStatus.NO_GO)],
      ['A-fix', fixAttempt('A-fix', 'A')],
      ['B-fix', fixAttempt('B-fix', 'B')],
    ]);

    const outcome = runAdmittedFixRounds(store, new Set(['A', 'B']), 2, fixTask =>
      fixTask.id.startsWith('B') ? 'deferred' : 'executed-no-go',
    );

    expect(outcome.admittedPerRound).toEqual([['A-fix', 'B-fix'], ['A-fix-fix']]);
    expect(outcome.executed).toEqual(['A-fix', 'A-fix-fix']);
    expect(outcome.roundsConsumed).toBe(2);
    // B never ran once, yet the budget is gone: its own admitted round was
    // spent in round 1 and the depth-2 child of A consumed the last one.
    expect(outcome.strandedPending).toEqual(['A-fix-fix-fix', 'B-fix']);
  });

  it('caps an executing lineage at exactly max_fix_retries admitted rounds', () => {
    const store = new Map<string, Task>([
      ['A', task('A', TaskStatus.NO_GO)],
      ['A-fix', fixAttempt('A-fix', 'A')],
    ]);

    const outcome = runAdmittedFixRounds(store, new Set(['A']), 2, () => 'executed-no-go');

    expect(outcome.admittedPerRound).toEqual([['A-fix'], ['A-fix-fix']]);
    expect(outcome.roundsConsumed).toBe(2);
    // The depth-3 child exists on disk but is out of budget AND out of depth.
    expect(outcome.strandedPending).toEqual(['A-fix-fix-fix']);
    const allTasks = [...store.values()];
    expect(resolveFixAttemptDepth(store.get('A-fix-fix-fix')!, new Map(allTasks.map(t => [t.id, t]))))
      .toBe(3);
    expect(selectPendingFixTasks(allTasks, 2).map(t => t.id)).toEqual([]);
  });

  it('admits nothing at all when the budget is zero', () => {
    const store = new Map<string, Task>([
      ['A', task('A', TaskStatus.NO_GO)],
      ['A-fix', fixAttempt('A-fix', 'A')],
    ]);

    const outcome = runAdmittedFixRounds(store, new Set(['A']), 0, () => 'executed-done');

    expect(outcome.roundsConsumed).toBe(0);
    expect(outcome.executed).toEqual([]);
    expect(selectPendingFixTasks([...store.values()], 0)).toEqual([]);
  });
});

describe('depth selection follows task-lineage, not the phase', () => {
  const tasksById = (tasks: readonly Task[]) => new Map(tasks.map(t => [t.id, t]));

  it('counts depth by explicit fixForTaskId authority', () => {
    const tasks = [
      task('A', TaskStatus.NO_GO),
      fixAttempt('A-fix', 'A', TaskStatus.NO_GO),
      fixAttempt('A-fix-fix', 'A-fix'),
    ];
    const index = tasksById(tasks);

    expect(resolveFixAttemptDepth(tasks[0]!, index)).toBe(0);
    expect(resolveFixAttemptDepth(tasks[1]!, index)).toBe(1);
    expect(resolveFixAttemptDepth(tasks[2]!, index)).toBe(2);
  });

  it('gates admission on depth <= maxFixRetries', () => {
    const tasks = [
      task('A', TaskStatus.NO_GO),
      fixAttempt('A-fix', 'A', TaskStatus.NO_GO),
      fixAttempt('A-fix-fix', 'A-fix', TaskStatus.NO_GO),
      fixAttempt('A-fix-fix-fix', 'A-fix-fix'),
    ];

    expect(selectPendingFixTasks(tasks, 3).map(t => t.id)).toEqual(['A-fix-fix-fix']);
    expect(selectPendingFixTasks(tasks, 2).map(t => t.id)).toEqual([]);
  });

  it('admits at most one attempt per logical root, shallowest depth first', () => {
    const tasks = [
      task('A', TaskStatus.NO_GO),
      task('B', TaskStatus.NO_GO),
      fixAttempt('A-fix', 'A', TaskStatus.NO_GO),
      fixAttempt('A-fix-fix', 'A-fix'),
      fixAttempt('B-fix', 'B'),
    ];

    // B's depth-1 attempt sorts ahead of A's depth-2 attempt, and A's already
    // settled `A-fix` is not a second row for the same logical root.
    expect(selectPendingFixTasks(tasks, 3).map(t => t.id)).toEqual(['B-fix', 'A-fix-fix']);
  });

  it('refuses to admit a child while its parent attempt is still in flight', () => {
    const inFlight = [
      task('A', TaskStatus.NO_GO),
      fixAttempt('A-fix', 'A', TaskStatus.EXECUTING),
      fixAttempt('A-fix-fix', 'A-fix'),
    ];
    expect(selectPendingFixTasks(inFlight, 3)).toEqual([]);

    const settled = inFlight.map(t =>
      t.id === 'A-fix' ? { ...t, status: TaskStatus.NO_GO } : t,
    );
    expect(selectPendingFixTasks(settled, 3).map(t => t.id)).toEqual(['A-fix-fix']);
  });
});

describe('the post-FIX pause fires when the admitted rounds run out', () => {
  // Fix attempts are never pushed into `sprint.tasks` (only sprint-spawner's
  // retryTask is), so applyCascadeCircuitBreaker hands the breaker the planned
  // ROOTS. A root whose only repair was admitted-but-deferred is still NO_GO.
  const plannedRoots = [task('A', TaskStatus.NO_GO), task('B', TaskStatus.NO_GO)];

  it('pauses when every planned root is left unresolved by the spent budget', () => {
    const decision = evaluateFixCircuitBreaker(
      plannedRoots,
      new Map([['A', TaskEvaluation.NO_GO], ['B', TaskEvaluation.NO_GO]]),
      DEFAULT_FIX_CIRCUIT_BREAKER_CONFIG,
    );

    expect(decision.shouldPause).toBe(true);
    expect(decision.unresolvedTaskIds).toEqual(['A', 'B']);
    expect(decision.unresolvedRatioPercent).toBe(100);
    // The absolute gate scales down for a small run: ceil(2 * 50%) = 1.
    expect(decision.effectiveCountThreshold).toBe(1);
  });

  it('does not pause when the surviving repairs kept the ratio under policy', () => {
    const roots = [
      task('A', TaskStatus.NO_GO),
      task('B', TaskStatus.DONE),
      task('C', TaskStatus.DONE),
      task('D', TaskStatus.DONE),
    ];
    const decision = evaluateFixCircuitBreaker(
      roots,
      new Map([
        ['A', TaskEvaluation.NO_GO],
        ['B', TaskEvaluation.DONE],
        ['C', TaskEvaluation.DONE],
        ['D', TaskEvaluation.DONE],
      ]),
      DEFAULT_FIX_CIRCUIT_BREAKER_CONFIG,
    );

    expect(decision.shouldPause).toBe(false);
    expect(decision.unresolvedRatioPercent).toBe(25);
  });

  it('keeps the only %-shaped knob on the pause gate, not on the budget', () => {
    // `min_unresolved_ratio_percent` governs PAUSE. There is no percentage
    // anywhere in the FIX-round budget: see the source pin below.
    expect(DEFAULT_FIX_CIRCUIT_BREAKER_CONFIG.min_unresolved_ratio_percent).toBe(50);
    expect(DEFAULT_FIX_CIRCUIT_BREAKER_CONFIG.max_unresolved_tasks).toBe(5);
  });
});

describe('the production source still documents this exact contract', () => {
  it('derives the budget as an integer round count with no percentage term', () => {
    const derivationStart = phasesSrc.indexOf('const maxFixRetries =');
    expect(derivationStart).toBeGreaterThan(-1);
    const derivationSrc = phasesSrc.slice(derivationStart, phasesSrc.indexOf(';', derivationStart));

    expect(derivationSrc).toMatch(/Math\.max\(0, Math\.floor\(config\.max_fix_retries \?\? 2\)\)/);
    expect(derivationSrc).toMatch(/config\.fix_phase_enabled === false/);
    expect(derivationSrc).not.toMatch(/percent|ratio|%/i);
  });

  it('still calls the budget "admitted FIX rounds" and loops on maxFixRetries', () => {
    expect(roundLoopStart).toBeGreaterThan(-1);
    expect(roundLoopEnd).toBeGreaterThan(roundLoopStart);
    expect(roundLoopSrc).toMatch(/Each loop consumes one admitted FIX round\./);
    expect(roundLoopSrc).toMatch(
      /for \(let fixRound = 1; fixRound <= maxFixRetries; fixRound \+= 1\)/,
    );
  });

  it('marks every selected fix attempted BEFORE the wave is spawned', () => {
    const markIndex = roundLoopSrc.indexOf('for (const task of fixTasks) attemptedFixIds.add(task.id);');
    const spawnIndex = roundLoopSrc.indexOf('await spawnWorkers(');
    expect(markIndex).toBeGreaterThan(-1);
    expect(spawnIndex).toBeGreaterThan(-1);
    // Invert this order and the budget silently becomes executed-round counting.
    expect(markIndex).toBeLessThan(spawnIndex);
  });

  it('publishes the undispatched remainder of an admitted wave instead of hiding it', () => {
    expect(phasesSrc).toMatch(/publishSchedulerSpawnSkips\(/);
    expect(phasesSrc).toMatch(/'queued-not-dispatched'/);
    expect(phasesSrc).toMatch(/this phase does not dispatch it/);
  });
});
