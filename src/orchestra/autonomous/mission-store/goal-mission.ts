import type {
  Mission, MissionStore, NewWorkItem, WorkItem,
} from './mission-types.js';

/** Type-2 (goal) mission specification — "run until the goal is reached". */
export interface GoalMissionSpec {
  id: string;
  title: string;
  /** The goal statement the loop works toward. */
  goal: string;
  /** Optional acceptance criteria (evaluated by the injected `accept`). */
  acceptance?: string;
  tenant?: string;
  deliverTo?: string;
}

/**
 * Outcome of a single goal-loop step.
 *
 * Note: the original directive lists `authored | accepted | exhausted`. The
 * "open work-item present → no-op" case needs an honest distinct outcome rather
 * than forcing one of the action verbs, so `waiting` is added for that no-op.
 */
export type GoalAdvanceOutcome = 'authored' | 'accepted' | 'exhausted' | 'waiting';

/** Injected dependencies for one goal-loop step. */
export interface GoalAdvanceDeps {
  /** Plan the next work-items for the goal given the prior items. Empty ⇒ nothing more to do. */
  author(goal: string, priorItems: WorkItem[]): Promise<NewWorkItem[]>;
  /** Decide whether the goal is reached given the (settled) items. */
  accept(goal: string, items: WorkItem[]): Promise<boolean>;
  /**
   * Infinite-loop guard — maximum cumulative work-items the goal may author
   * before being force-exhausted. Defaults to `Infinity` (rely on `author`
   * eventually returning `[]`).
   */
  maxRounds?: number;
}

/**
 * Real-world bindings for the goal-loop, named for what they actually are in
 * production: a `planner` (e.g. realPlannerComplete-style — turns a goal +
 * prior work into the next batch of work-items) and an `accepter` (an
 * LLM/Brain-eval that decides whether the goal is reached). {@link buildGoalDeps}
 * adapts these onto the loop's generic {@link GoalAdvanceDeps} surface
 * (`author`/`accept`) consumed by {@link advanceGoalMission}.
 */
export interface GoalDeps {
  /** Real planner — produce the next work-items for the goal given prior items. */
  planner(goal: string, priorItems: WorkItem[]): Promise<NewWorkItem[]>;
  /** Real acceptance evaluator (LLM / Brain-eval) — is the goal reached? */
  accepter(goal: string, items: WorkItem[]): Promise<boolean>;
  /** Infinite-loop guard, forwarded verbatim to {@link advanceGoalMission}. */
  maxRounds?: number;
}

/**
 * Inject-based adapter: bind a real `planner`/`accepter` (the production
 * functions, wired at the composition root) onto the loop's `author`/`accept`
 * interface. Intentionally thin — it exists so the live engine and the tests
 * share ONE seam: production passes the real planner + Brain-eval; tests pass
 * fakes. Keeping the names distinct (planner/accepter vs author/accept) lets the
 * loop stay domain-agnostic while the call-site reads in real-world terms.
 */
export function buildGoalDeps(deps: GoalDeps): GoalAdvanceDeps {
  return {
    author: (goal, priorItems) => deps.planner(goal, priorItems),
    accept: (goal, items) => deps.accepter(goal, items),
    ...(deps.maxRounds !== undefined ? { maxRounds: deps.maxRounds } : {}),
  };
}

/**
 * Type-2: create a `kind='goal'` mission (renderAs `goal`). The goal + acceptance
 * are persisted in the mission spec; the loop is driven by {@link advanceGoalMission}.
 */
export function createGoalMission(store: MissionStore, spec: GoalMissionSpec): Mission {
  return store.createMission({
    id: spec.id,
    kind: 'goal',
    title: spec.title,
    tenant: spec.tenant,
    deliverTo: spec.deliverTo,
    renderAs: 'goal',
    spec: { goal: spec.goal, acceptance: spec.acceptance ?? null },
  });
}

function readGoal(mission: Mission): string {
  const g = mission.spec?.goal;
  return typeof g === 'string' ? g : '';
}

/**
 * Drive ONE step of the goal-loop. The scheduler runs the work-items; this fn
 * advances rounds at the boundary where all items have settled.
 *
 * - open (pending/running) item present → `'waiting'` (no-op; scheduler still working).
 * - else `author` produces next work-items → enqueue them → `'authored'`.
 * - else `accept` true  → mission `completed` → `'accepted'`.
 * - else (no new work, not accepted) → mission `failed` → `'exhausted'`.
 * - maxRounds guard tripped → mission `failed` → `'exhausted'`.
 */
export async function advanceGoalMission(
  store: MissionStore,
  missionId: string,
  deps: GoalAdvanceDeps,
): Promise<GoalAdvanceOutcome> {
  const mission = store.getMission(missionId);
  if (!mission) throw new Error(`goal mission not found: ${missionId}`);

  const all = store.listItems(missionId);
  const open = all.filter((i) => i.status === 'pending' || i.status === 'running');
  if (open.length > 0) return 'waiting';

  const goal = readGoal(mission);

  // Infinite-loop guard: bound cumulative authored work-items.
  const maxRounds = deps.maxRounds ?? Infinity;
  if (all.length >= maxRounds) {
    store.updateMissionStatus(missionId, 'failed', {
      ok: false,
      reason: 'goal not reached, max rounds exhausted',
    });
    return 'exhausted';
  }

  // Ask the planner for the next batch of work.
  const next = await deps.author(goal, all);
  if (next.length > 0) {
    for (const item of next) {
      // Stamp missionId — author cannot know it on round-0 (priorItems is empty).
      store.enqueueItem({ ...item, missionId });
    }
    return 'authored';
  }

  // No further work — decide acceptance.
  const accepted = await deps.accept(goal, all);
  if (accepted) {
    store.updateMissionStatus(missionId, 'completed', { ok: true });
    return 'accepted';
  }

  store.updateMissionStatus(missionId, 'failed', {
    ok: false,
    reason: 'goal not reached, no further work',
  });
  return 'exhausted';
}
