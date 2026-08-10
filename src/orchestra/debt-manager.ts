// ─── Debt Management ───────────────────────────────────────────────
// Extracted from brain.ts — debt resolution, escalation, cross-dependencies
import { writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateScopeGate, applyScopeResolutions } from '../core/scope-gate.js';
import { TaskStatus, TaskEvaluation } from '../core/types.js';
import type {
  Task, TaskResult, Sprint, DecayResult,
} from '../core/types.js';
import type { ModelType } from '../core/task-types.js';
import {
  BRAIN_DIR, TASKS_DIR,
  MEMORY_DB_FILE,
  DEBT_HIGH_PRIORITY_SPRINTS, DEBT_CRITICAL_SPRINTS,
} from '../core/constants.js';
import { updateTaskStatus, releaseAllLocks } from '../agents/worker.js';
import { MemoryStore } from '../core/memory-store.js';
import type { MemoryEntryV2, CreateEntryInput } from '../core/memory-types.js';
import { extractSprintFromDebtId } from '../core/memory-import.js';
import { readJsonSafe, debugLog } from '../core/utils.js';
import { getAgentRole } from '../core/agent-role-contract.js';
import { classifyFixFailure } from './fix-failure-classification.js';
import { buildReplanProposal } from './replan-proposal.js';
import { writeEvent } from './event-stream.js';
import { resolveTaskLineageRootId } from '../core/task-lineage.js';
import { resolveFixRepairAuthority } from './fix-repair-authority.js';
import type {
  FixRepairAuthorityInput, FixRepairEvidence, FixRepairAuthorityResult,
} from './fix-repair-authority.js';

// ═══ Internal Helpers ══════════════════════════════════════════════

/**
 * sprint-399 SAN-2 wiring (verification-doc N4): a FIX task inherits the original
 * task's scope VERBATIM — including any typo path (397-007-fix inherited
 * `tests/cli/error-handling-unification.test.ts` unchanged). Re-run the scope gate's
 * suggestion-resolution over the inherited filesWrite and adopt provable fixes.
 * Advisory-only at this layer: fix creation happens MID-SPRINT, so an unresolved
 * suspect must never hard-fail the fix cascade (it just stays as-is, like today).
 */
function regateInheritedScope(
  projectRoot: string,
  fixTaskId: string,
  scope: Task['scope'],
): Task['scope'] {
  const writes = scope?.filesWrite ?? [];
  if (writes.length === 0) return scope;
  try {
    const ls = spawnSync('git', ['ls-files'], {
      cwd: projectRoot, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, timeout: 5000,
    });
    if (ls.status !== 0 || typeof ls.stdout !== 'string') return scope;
    const gate = evaluateScopeGate({
      tasks: [{ id: fixTaskId, scope: scope ?? {} }],
      trackedFiles: ls.stdout.split('\n').filter(Boolean),
      resolveSuggestions: true,
      acknowledgeScopePaths: true, // never block mid-sprint fix creation
    });
    if (!gate.resolutions || gate.resolutions.length === 0) return scope;
    const { filesWrite, applied } = applyScopeResolutions(fixTaskId, writes, gate.resolutions);
    if (applied.length === 0) return scope;
    console.warn(
      `Fix-cascade scope re-gate (${fixTaskId}): ${applied
        .map(r => `${r.path} → ${r.appliedAction === 'dropped' ? 'dropped' : r.replacement}`)
        .join('; ')}`,
    );
    return { ...scope, filesWrite };
  } catch {
    return scope; // fail-open: inherited scope is used unchanged
  }
}

/**
 * Count the attempts in this task's fix lineage that ended as a NO_GO changing
 * nothing. Host-measured from the persisted results — the caller never asks a
 * worker whether its task is possible, it counts what the lineage actually did.
 *
 * The lineage is the id chain `<root>`, `<root>-fix`, `<root>-fix-fix`, … so the
 * root's own result is included: two zero-diff NO_GOs across the chain already
 * prove that re-running this definition produces nothing.
 */
function countZeroDiffAttempts(projectRoot: string, taskId: string): number {
  // The fix chain is a pure id suffix (`<root>-fix`, `<root>-fix-fix`, …), so the
  // root is recoverable from the id alone. resolveTaskLineageRootId needs the live
  // Task map, which this counter deliberately does not depend on: it reads only
  // persisted results.
  const root = taskId.replace(/(?:-fix)+$/u, '');
  let count = 0;
  let id = root;
  // Bounded by the fix chain itself: each hop appends one `-fix` suffix, and the
  // retry budget caps that chain long before this loop could run away.
  for (let depth = 0; depth <= 8; depth++) {
    const past = readJsonSafe<TaskResult>(join(projectRoot, TASKS_DIR, `task-${id}.result`));
    if (past
      && past.selfAssessment === 'NO_GO'
      && (past.filesChanged?.length ?? 0) === 0
      && (past.linesAdded ?? 0) === 0
    ) count++;
    id = `${id}-fix`;
  }
  return count;
}

/** The repair-authority lineage a task already carried BEFORE this FIX round. */
export interface FixOriginalAcceptance {
  readonly taskId: string;
  readonly state: 'accepted' | 'hold' | 'none';
  readonly authorityFingerprint?: string;
  readonly filesRead: readonly string[];
  readonly filesWrite: readonly string[];
}

/**
 * Read the repair-authority record already persisted on `taskId`'s own task
 * JSON (written when it was itself created as a fix). A fix-of-a-fix carries
 * that prior lineage forward as `priorImpossibleFingerprints` input instead
 * of recursively re-deriving it — one bounded disk read, no re-prompting.
 */
function readOriginalAcceptance(projectRoot: string, taskId: string): FixOriginalAcceptance {
  const priorPayload = readJsonSafe<{
    repairAuthority?: {
      state?: string;
      authorityFingerprint?: string;
      filesRead?: string[];
      filesWrite?: string[];
    };
  }>(join(projectRoot, TASKS_DIR, `task-${taskId}.json`));
  const prior = priorPayload?.repairAuthority;
  if (!prior || (prior.state !== 'accepted' && prior.state !== 'hold')) {
    return { taskId, state: 'none', filesRead: [], filesWrite: [] };
  }
  return {
    taskId,
    state: prior.state,
    authorityFingerprint: prior.authorityFingerprint,
    filesRead: prior.filesRead ?? [],
    filesWrite: prior.filesWrite ?? [],
  };
}

/** Persisted FIX repair-authority review — backed by {@link resolveFixRepairAuthority}. */
export interface FixRepairAuthorityReview {
  readonly state: 'accepted' | 'hold';
  readonly holdReason?: 'unresolved_requirements' | 'repeated_impossible_fingerprint';
  readonly authorityFingerprint: string;
  readonly inheritedFilesRead: readonly string[];
  readonly inheritedFilesWrite: readonly string[];
  readonly filesRead: readonly string[];
  readonly filesWrite: readonly string[];
  readonly addedReadPaths: readonly string[];
  readonly addedWritePaths: readonly string[];
  readonly evidenceWritePaths: readonly string[];
  readonly unresolvedFindings: FixRepairAuthorityResult['unresolvedFindings'];
  readonly unresolvedPromptFindings: readonly string[];
  readonly originalAcceptance: FixOriginalAcceptance;
}

/**
 * Wire the typed {@link resolveFixRepairAuthority} resolver into FIX
 * creation. Reviews BOTH the inherited filesRead and filesWrite surface (not
 * write-only), carries forward the prior repair lineage from
 * `readOriginalAcceptance` as the repeated-fingerprint input, and returns the
 * exact fingerprinted authority to persist on the fix task.
 *
 * Worker-authored prose is evidence for diagnosis, never scope authority.
 * Until a host-authored typed scope-amendment receipt exists, FIX inherits the
 * approved scope exactly: notes cannot grant a path and cannot create a
 * birth-time PAUSED trap.
 */
function buildFixRepairAuthority(
  projectRoot: string,
  task: Task,
  _result: TaskResult,
): FixRepairAuthorityReview {
  const reviewedDirectories = task.scope?.directories ?? [];
  const inheritedFilesRead = [...new Set(task.scope?.filesRead ?? [])].sort();
  const inheritedFilesWrite = [...new Set(task.scope?.filesWrite ?? [])].sort();
  const evidenceWritePaths: string[] = [];
  const failureEvidence: FixRepairEvidence[] = [];
  const trackedPaths: string[] = [];
  const originalAcceptance = readOriginalAcceptance(projectRoot, task.id);
  const priorImpossibleFingerprints = originalAcceptance.state === 'hold'
    && originalAcceptance.authorityFingerprint
    ? [originalAcceptance.authorityFingerprint]
    : [];

  const input: FixRepairAuthorityInput = {
    reviewedDirectories,
    inheritedFilesRead,
    inheritedFilesWrite,
    failureEvidence,
    trackedPaths,
    priorImpossibleFingerprints,
  };
  const resolved = resolveFixRepairAuthority(input);
  const unresolvedPromptFindings = resolved.unresolvedFindings.map(finding =>
    finding.path
      ? `repair evidence path lacks reviewed ${finding.access ?? 'access'} authority (${finding.code}): ${finding.path}`
      : `repair authority finding: ${finding.code}`,
  );

  return {
    state: resolved.state,
    holdReason: resolved.state === 'hold' ? resolved.reason : undefined,
    authorityFingerprint: resolved.authorityFingerprint,
    inheritedFilesRead: resolved.inheritedFilesRead,
    inheritedFilesWrite: resolved.inheritedFilesWrite,
    filesRead: resolved.filesRead,
    filesWrite: resolved.filesWrite,
    addedReadPaths: resolved.addedReadPaths,
    addedWritePaths: resolved.addedWritePaths,
    evidenceWritePaths,
    unresolvedFindings: resolved.unresolvedFindings,
    unresolvedPromptFindings,
    originalAcceptance,
  };
}

/**
 * Open the Memory V2 SQLite DB if it exists. Returns null when the DB
 * file is absent (pure V1 project) or cannot be opened.
 */
function getMemoryStore(projectRoot: string): MemoryStore | null {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  try {
    if (!existsSync(dbPath)) return null;
    return new MemoryStore(dbPath);
  } catch { return null; }
}

/**
 * Convert a MemoryEntryV2 row back into a CreateEntryInput that can be
 * passed to `store.upsert()`. Tags are NOT round-tripped here because
 * upsert re-derives them; callers should supply tags separately if needed.
 */
function debtEntryToInput(entry: MemoryEntryV2): CreateEntryInput {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    content: entry.content,
    source: entry.source,
    summary: entry.summary ?? undefined,
    status: entry.status,
    priority: entry.priority,
    sprint_id: entry.sprint_id ?? undefined,
    sprint_num: entry.sprint_num,
    tags: entry.tag_text ? entry.tag_text.split(' ').filter(Boolean) : [],
    metadata: JSON.parse(entry.metadata || '{}') as Record<string, unknown>,
  };
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Cascade-skip detector — the SINGLE source of truth `handleEvaluation`'s
 * direct-fix gate and `handleCrossDependencies`' cross-fix gate both consult
 * (SCHED6-COMP, sprint-427 task 427-010: "debt-manager'ın cascade-kaynaklı
 * debt kaydı tek-yoldan"). A never-dispatched cascade-skip (`cascadeSkipped:
 * true` — see task-types.ts) must never be recognized differently by the two
 * gates, whether the `TaskResult` they inspect arrives as an in-memory
 * parameter (`handleEvaluation`) or is re-read from disk
 * (`handleCrossDependencies`) — one shared predicate means the two gates
 * cannot drift apart and independently double-record a fix/xfix for the same
 * synthetic skip.
 */
function isCascadeSkippedResult(result: TaskResult | null | undefined): boolean {
  return result?.cascadeSkipped === true;
}

function getSprintNumber(sprintId: string): number {
  const match = sprintId.match(/sprint-(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : 0;
}

/**
 * Origin of a debt-ledger entry: 'evaluator' when Brain's rubric verdict is
 * itself GO_WITH_TECH_DEBT, 'self' when Brain promoted the task to DONE but
 * the worker's own selfAssessment was GO_WITH_TECH_DEBT (354-011 —
 * evaluateWithRubric's numeric score can outweigh a worker's honest debt
 * declaration; that self-knowledge must still reach the ledger).
 */
type DebtSource = 'evaluator' | 'self';

/**
 * Insert a debt-ledger row for a task, keyed by `debt-${task.id}` (idempotent
 * — a pre-existing row with the same id is never duplicated). Shared by both
 * the evaluator-driven and worker-self-driven GO_WITH_TECH_DEBT paths in
 * {@link handleEvaluation} so the two sources produce an identical record
 * shape, differing only in `metadata.debtSource`.
 */
function recordDebtEntry(
  projectRoot: string,
  task: Task,
  result: TaskResult,
  source: DebtSource,
): void {
  const debtId = `debt-${task.id}`;

  // B10: a debt entry must always be sprint-associated. `task.sprintId` is
  // optional — when it is absent, derive the sprint from the NNN-MMM task
  // id so sprint-range queries, escalation and decay never miss the entry
  // (a NULL sprint_id column was the Memory V2 debt-row defect).
  const debtSprint = task.sprintId
    ? { sprint_id: task.sprintId, sprint_num: getSprintNumber(task.sprintId) }
    : extractSprintFromDebtId(debtId) ?? { sprint_id: '', sprint_num: 0 };

  const store = getMemoryStore(projectRoot);
  if (!store) return; // No DB available — debt entry skipped (Memory V2 DB required)
  try {
    if (store.getById(debtId)) return;

    // Sprint 364 (364-001): a TIMEOUT_WITH_WORK result is NOT tech debt. The
    // worker was killed mid-execution; result-evaluator reconciled the partial
    // diff to GO_WITH_TECH_DEBT (the files were ACCEPTED into the tree) and
    // `result.notes` is the generic orchestration string ("Worker timeout/killed
    // … git diff shows N files … reconcile via Spurious NO_GO helper"), not a
    // described code defect. Recording it with the default 'standard' class +
    // verbatim note produced a phantom debt (debt-361-001-fix) — unactionable,
    // escalated to CRITICAL, and respawning a no-op fix task every sprint. Class
    // it 'timeout-partial' (injectCriticalDebtTasks skips it, like
    // 'verified-no-result') and give it an honest ledger title/content instead of
    // the raw timeout string.
    const isTimeoutPartial = (result.selfAssessment as string) === 'TIMEOUT_WITH_WORK';
    const evalLabel = source === 'self'
      ? 'Task evaluated as DONE, but worker self-assessed GO_WITH_TECH_DEBT'
      : 'Task evaluated as GO_WITH_TECH_DEBT';
    const title = isTimeoutPartial
      ? `Timeout-partial from ${task.id}: worker killed mid-execution, work accepted`
      : `Tech debt from ${task.id}: ${result.notes}`;
    const content = isTimeoutPartial
      ? `Worker for ${task.id} was killed mid-execution (TIMEOUT_WITH_WORK); reconciliation `
        + `accepted the partial diff into the tree (GO_WITH_TECH_DEBT). There is no described `
        + `code defect to fix, so no forced follow-up is injected — any genuine incompleteness `
        + `resurfaces later as a concrete, actionable failure. Original worker note: ${result.notes}`
      : `${evalLabel}. Notes: ${result.notes}`;
    store.insert({
      id: debtId,
      type: 'debt',
      title: title.slice(0, 80),
      content,
      source: 'brain',
      status: 'active',
      priority: 'normal',
      sprint_id: debtSprint.sprint_id,
      sprint_num: debtSprint.sprint_num,
      tags: isTimeoutPartial ? ['debt', task.id, 'timeout-partial'] : ['debt', task.id],
      metadata: {
        originTaskId: task.id,
        originSprintId: debtSprint.sprint_id,
        sprintsOpen: 0,
        debtSource: source,
        // 362-001: producer-side wiring for the Sprint 179 W1-1 scope-inheritance
        // feature. `injectCriticalDebtTasks` (and the sprint-planner debt mapper)
        // READ `meta.originScope`/`meta.class`, but this — the runtime debt
        // producer — never WROTE them, so every persisted debt fell back to the
        // broad `src/` fallback scope ("No origin scope on debt …"). Persist the
        // origin task's writable surface so the auto-injected fix task targets the
        // correct area instead of all of `src/`. `class` defaults to 'standard';
        // the honest-closure `verified-no-result` classification is a separate
        // Brain-level lifecycle concern (see 362-001 result notes) and is not set
        // here. NOTE: additive only — retroactively unaffects rows already written
        // without originScope.
        class: isTimeoutPartial ? 'timeout-partial' : 'standard',
        originScope: {
          directories: [...(task.scope?.directories ?? [])],
          filesWrite: [...(task.scope?.filesWrite ?? [])],
        },
      },
    });
  } finally {
    store.close();
  }
}

// ═══ Fresh-Eyes Rotation (Sprint 156 Task 012) ═════════════════════
// When a task fails (NO_GO), the fix worker should bring a "fresh
// perspective" — different model tier and different agent specialty.
// This reduces the chance that the same blind spot repeats on retry.


/**
 * Agent rotation map — pairs agents whose perspectives complement each other.
 * The retry agent should differ from the original to catch what the first agent missed.
 */
const AGENT_FRESH_EYES_MAP: Readonly<Record<string, string>> = Object.freeze({
  architect: 'code-reviewer',
  'architecture-planner': 'code-reviewer',
  'bug-fixer': 'code-reviewer',
  'code-reviewer': 'bug-fixer',
  'test-writer': 'bug-fixer',
  'doc-writer': 'code-reviewer',
  'security-auditor': 'code-reviewer',
  refactorer: 'bug-fixer',
  'api-builder': 'code-reviewer',
  'performance-analyzer': 'bug-fixer',
  'ci-guardian': 'bug-fixer',
  'accessibility-auditor': 'code-reviewer',
  'data-engineer': 'bug-fixer',
  'devops-engineer': 'code-reviewer',
  'frontend-designer': 'code-reviewer',
  'migration-specialist': 'code-reviewer',
});

const DEFAULT_FRESH_EYES_AGENT = 'code-reviewer';

/**
 * Strategy descriptor describing what rotation was applied to a fix task.
 * Persisted to the fix task JSON as `rotationStrategy` for observability.
 */
export interface FreshEyesRotationStrategy {
  enabled: true;
  originalModel: ModelType;
  rotatedModel: ModelType;
  originalAgent: string;
  rotatedAgent: string;
  /** Companion skill ids added on top of the fresh-eyes agent rotation */
  addedSkills: string[];
  rationale: string;
}

/**
 * Return the model to use for a fix-retry. The model is preserved (identity):
 * a failed task's retry is HARDER than the original, so downgrading the model
 * (the old opus→sonnet→haiku map, C-03) was reverse logic. Fresh perspective
 * on a retry comes from agent rotation (rotateAgentForFix), not a weaker model.
 * @param model - The original task's model
 * @returns The same model (unchanged)
 */
export function rotateModelForFix(model: ModelType): ModelType {
  return model;
}

/**
 * Rotate an agent to its fresh-eyes counterpart.
 * - Known agent: looked up in AGENT_FRESH_EYES_MAP
 * - Unknown / generic / undefined: defaults to 'code-reviewer'
 */
export function rotateAgentForFix(agent: string | undefined | null): string {
  if (!agent || agent === 'generic') return DEFAULT_FRESH_EYES_AGENT;
  return AGENT_FRESH_EYES_MAP[agent] ?? DEFAULT_FRESH_EYES_AGENT;
}

/**
 * Select the fix agent based on the original task's type and failure mode.
 *
 * Instead of always rotating to a fresh-eyes counterpart (which sends a test
 * failure to bug-fixer), this maps the task type to the most appropriate
 * specialist. Exit-no-result (crashed worker) re-runs with the original agent
 * rather than introducing unnecessary rotation.
 *
 * @param task - The failing original task
 * @param exitedWithoutResult - True when the worker produced no output at all
 * @returns Agent id to assign to the fix task
 */
export function selectFixAgent(task: Task, exitedWithoutResult: boolean): string {
  const originalAgent = task.assignedAgent ?? '';

  if (exitedWithoutResult) {
    return originalAgent || DEFAULT_FRESH_EYES_AGENT;
  }

  // Sprint 210 Task 7 + 211 hygiene: classify by AGENT + SKILL signals only.
  // Title-keyword matching was too aggressive — a generic "Test task" title
  // tripped isTestTask and suppressed the fresh-eyes rotation that the
  // fresh-eyes contract (rotateAgentForFix) requires. Agent/skill are the
  // authoritative routing signals; title is noisy free-text.
  const skills = task.assignedSkills ?? [];

  const isTestTask =
    originalAgent === 'ci-guardian' ||
    skills.includes('ci-testing');

  const isDocTask =
    originalAgent === 'doc-writer' ||
    skills.includes('documentation-writer');

  // bug-fixer originals stay put — already a debug specialist, no fresh-eyes
  // rotation needed (rotating a bug-fixer to code-reviewer loses debug focus).
  const isBugTask = originalAgent === 'bug-fixer';

  if (isTestTask) return originalAgent || 'ci-guardian';
  if (isDocTask) return 'doc-writer';
  if (isBugTask) return 'bug-fixer';
  // Everything else gets a fresh lens only when that persona can actually
  // produce the requested repair. Reviewer/analyst personas are valid
  // evaluators but impossible FIX workers; route those retries to the canonical
  // implementation-capable repair persona.
  const rotated = rotateAgentForFix(originalAgent);
  const rotatedRole = getAgentRole({ id: rotated });
  return rotatedRole === 'implementer' ? rotated : 'bug-fixer';
}

/**
 * Compute the additional companion skills to inject alongside a rotated agent.
 * For architect → code-reviewer, we add a bug-fixer-flavored skill to ensure
 * the fix worker has a debug-first mindset (matches DIRECTIVES intent
 * "code-reviewer+bug-fixer").
 */
function companionSkillsForRotation(originalAgent: string | undefined | null): string[] {
  if (!originalAgent) return [];
  if (originalAgent === 'architect' || originalAgent === 'architecture-planner') {
    return ['code-simplifier'];
  }
  if (originalAgent === 'security-auditor') return ['code-simplifier'];
  return [];
}

/**
 * Build a rotation strategy descriptor for a failed task.
 * Pure function — does not mutate the input task.
 *
 * @param originalTask - Task being retried (its model + assignedAgent define the "original" side)
 * @returns Strategy descriptor with rotated model, agent, and companion skills
 */
export function applyFreshEyesRotation(originalTask: Task): FreshEyesRotationStrategy {
  const originalModel = originalTask.model;
  const originalAgent = originalTask.assignedAgent ?? 'generic';
  const rotatedModel = rotateModelForFix(originalModel);
  const rotatedAgent = rotateAgentForFix(originalAgent);
  const addedSkills = companionSkillsForRotation(originalAgent);
  const rationale =
    `Fresh-eyes rotation: ${originalModel}→${rotatedModel}, ${originalAgent}→${rotatedAgent}`
    + (addedSkills.length > 0 ? ` (+skills: ${addedSkills.join(',')})` : '');
  return {
    enabled: true,
    originalModel,
    rotatedModel,
    originalAgent,
    rotatedAgent,
    addedSkills,
    rationale,
  };
}

// ═══ Exported Functions ════════════════════════════════════════════

/**
 * Handle a task evaluation result by updating task status, releasing locks,
 * and creating debt items or fix tasks as needed.
 * - DONE: marks task done, releases locks; if the worker itself
 *   self-assessed GO_WITH_TECH_DEBT (rubric promoted it to DONE), still
 *   records a debt-ledger entry (354-011) so that self-knowledge isn't lost
 * - GO_WITH_TECH_DEBT: marks done, releases locks, adds debt entry
 * - NO_GO: marks no-go, creates a priority fix task
 * @param projectRoot - Project root directory
 * @param task - The evaluated task
 * @param evaluation - The evaluation outcome
 * @param result - The worker's task result
 */
export function handleEvaluation(
  projectRoot: string,
  task: Task,
  evaluation: TaskEvaluation,
  result: TaskResult,
  policy: { allowPriorityFixCreation?: boolean } = {},
): void {
  const workerId = task.assignedWorker ?? `w-${task.id}`;

  if (evaluation === TaskEvaluation.DONE) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.DONE);
    releaseAllLocks(projectRoot, workerId);

    // 354-011: evaluateWithRubric's numeric score can promote a task to DONE
    // even when the worker itself declared GO_WITH_TECH_DEBT (e.g. sprint-352
    // 005/010/012 — rubric 89.33 → DONE while selfAssessment stayed
    // GO_WITH_TECH_DEBT). That self-declared debt — scope conflicts, deferred
    // follow-ups, named residual gaps — is invisible to the numeric rubric and
    // must still reach the ledger, or it is silently lost. Brain's DONE
    // verdict is not overridden here — only the ledger gap closes.
    if (result.selfAssessment === 'GO_WITH_TECH_DEBT') {
      recordDebtEntry(projectRoot, task, result, 'self');
    }
    return;
  }

  if (evaluation === TaskEvaluation.GO_WITH_TECH_DEBT) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.DONE);
    releaseAllLocks(projectRoot, workerId);
    recordDebtEntry(projectRoot, task, result, 'evaluator');
    return;
  }

  if (evaluation === TaskEvaluation.DEFERRED || evaluation === TaskEvaluation.NOT_DISPATCHED) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.PAUSED);
    releaseAllLocks(projectRoot, workerId);
    debugLog(
      'handleEvaluation:parked',
      `task=${task.id} evaluation=${evaluation}; PAUSED without debt or priority FIX`,
    );
    return;
  }

  // NO_GO — keep locks, create fix task
  updateTaskStatus(projectRoot, task.id, TaskStatus.NO_GO);

  // born-610 (advisor P0): a cascade-skipped dependent was NEVER dispatched —
  // its synthetic NO_GO means "dead upstream", not "this work failed". Spawning
  // a dependencies:[] fix here would run the work ON TOP of the unreviewed MRR/
  // NO_GO foundation the skip exists to avoid (and xfix fan-out would amplify
  // it). Same principle as the NOT_DISPATCHED blame-fix exemption
  // (sprint-phases.ts). Status is already NO_GO; the retry belongs to the NEXT
  // sprint, after the upstream is reviewed/fixed.
  if (isCascadeSkippedResult(result)) {
    debugLog('handleEvaluation:cascadeSkipExempt', `task=${task.id} — no fix task for a never-dispatched skip`);
    return;
  }

  // A NO_GO on the final admitted FIX attempt is terminal for this run. The
  // caller owns the configured retry budget and passes this explicit gate so
  // handleEvaluation cannot mint an unbounded `-fix-fix-...` chain. Release
  // the completed worker's locks and park the exhausted attempt as typed
  // PAUSED. The evaluation ledger still retains NO_GO, while task status
  // prevents recovery from treating the failed attempt as dispatchable or
  // complete.
  if (policy.allowPriorityFixCreation === false) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.PAUSED);
    releaseAllLocks(projectRoot, workerId);
    debugLog(
      'handleEvaluation:fixBudgetExhausted',
      `task=${task.id} — retry authority exhausted; PAUSED without creating another priority fix`,
    );
    return;
  }

  // ── Failure classification decides the route (owner decision 2026-08-10) ──
  // A retry is right when the ENVIRONMENT failed and wrong when the task or its
  // scope is what broke. Until this gate existed, every NO_GO that was not a
  // cascade-skip or a budget exhaustion became a same-scope re-run: sprint-496
  // re-ran a scope contradiction three times for ~210k tokens and collected the
  // same honest NO_GO each round. The decision lives here, in Deckent, so it is
  // identical whichever provider backs the Brain — the model is left with the
  // CONTENT of a fix, never the choice of whether re-running can possibly work.
  //
  // Dispositions that need a changed scope or a re-planned task have no automatic
  // path yet, so they park as typed PAUSED for an operator/Brain decision rather
  // than silently degrading into the retry this gate exists to prevent. That is
  // the conservative direction: fewer fix tasks, more honest stops.
  const failureClass = classifyFixFailure({
    result,
    exitCode: (result as { exitCode?: number | null } | null | undefined)?.exitCode ?? null,
    priorZeroDiffAttempts: countZeroDiffAttempts(projectRoot, task.id),
  });
  if (!failureClass.allowsFixTask) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.PAUSED);
    releaseAllLocks(projectRoot, workerId);
    // The stop carries WHAT the task would need, so the owner is not left
    // reconstructing it by hand. Naming a path here is evidence, never a grant:
    // fix-repair-authority refuses to let worker prose widen scope and ADR-G-020
    // keeps write authority host-controlled, so the proposal states the case and
    // the decision stays with the owner.
    const proposal = buildReplanProposal({
      taskId: task.id,
      classification: failureClass,
      scope: task.scope,
      result,
    });
    if (proposal) {
      try {
        writeFileSync(
          join(projectRoot, TASKS_DIR, `task-${task.id}.replan-proposal.json`),
          `${JSON.stringify(proposal, null, 2)}\n`,
        );
      } catch (e) { debugLog('handleEvaluation:replanProposalWrite', e); }
    }
    try {
      writeEvent(projectRoot, task.sprintId ?? '', 'brain', 'user', 'BRAIN→USER:FIX_ROUTE_ESCALATED', {
        taskId: task.id,
        disposition: failureClass.disposition,
        code: failureClass.code,
        reason: failureClass.reason,
        ...(proposal
          ? {
              requiresNewAuthority: proposal.requiresNewAuthority,
              requestedPaths: proposal.requestedPaths.map(p => p.path),
              decisionRequired: proposal.decisionRequired,
            }
          : {}),
      });
    } catch (e) { debugLog('handleEvaluation:fixRouteEvent', e); }
    debugLog(
      'handleEvaluation:fixRouteEscalated',
      `task=${task.id} — ${failureClass.code}: ${failureClass.reason}`,
    );
    return;
  }

  // ── Sprint 165 Task 1 — Bug X: honest-gate violation classification ──
  // Worker-crashed and dishonest-done-stub NO_GOs need explicit FIX
  // context. Notes prefixed with "[honest-gate]" come from the gate in
  // result-evaluator.ts / sprint-phases.ts. Surface the violation code
  // in the fix reason so the FIX worker knows it must perform real work
  // (not just trust the previous .result).
  const honestGateMatch = /\[honest-gate\]\s+([A-Z_-]+(?:[-_][a-z-]+)?|[a-z][a-z-]+):/i.exec(result.notes ?? '');
  const honestGateViolation = honestGateMatch?.[1];

  // D-3: Build enriched fix context with specific failure details
  const fixReasonParts: string[] = [`Task ${task.id} evaluated as NO_GO`];
  if (honestGateViolation) {
    fixReasonParts.push(`honest-gate violation: ${honestGateViolation}`);
  }
  if (result.rubricScores) {
    const rs = result.rubricScores;
    if (typeof rs.correctness === 'number') fixReasonParts.push(`correctness=${rs.correctness}`);
    if (typeof rs.test_coverage === 'number') fixReasonParts.push(`test_coverage=${rs.test_coverage}`);
    if (typeof rs.scope_compliance === 'number') fixReasonParts.push(`scope_compliance=${rs.scope_compliance}`);
  }
  if (!result.testsPassed) fixReasonParts.push('tests failed');
  if ((result.filesChanged?.length ?? 0) === 0) fixReasonParts.push('no files changed');
  if ((result.linesAdded ?? 0) === 0) fixReasonParts.push('zero lines added — worker may have crashed');
  const enrichedReason = fixReasonParts.join('; ');

  // Sprint 210 Task 6 — FIX prompt enrichment ([[feedback_fix_prompt_quality]])
  // The fix worker MUST receive the originalDescription + NO_GO reason + concrete
  // fix guidance so it knows WHAT the task was and HOW to recover. Previously the
  // `=== Task ===` block reached the worker empty and the only context was
  // "Original worker notes: exited without result" — worker had no idea what to do.
  const originalTaskDescription = (task.description ?? '').trim();
  const originalDescriptionBlock = originalTaskDescription.length > 0
    ? originalTaskDescription.slice(0, 2000)
    : '(original task description unavailable)';

  const fixSections: string[] = [
    `Priority fix for NO_GO task ${task.id}.`,
    `## Original Task\n${originalDescriptionBlock}`,
    `## NO_GO Reason\n${enrichedReason}`,
  ];
  if (result.notes) {
    fixSections.push(`## Original Worker Notes\n${result.notes.slice(0, 500)}`);
  }
  if (result.rubricScores) {
    const rs = result.rubricScores;
    fixSections.push(`## Rubric\ncorrectness=${rs.correctness ?? '?'}, test_coverage=${rs.test_coverage ?? '?'}, scope_compliance=${rs.scope_compliance ?? '?'}`);
  }
  fixSections.push(
    `## Scope\nExpected directories: ${(task.scope?.directories ?? []).join(', ')}\nFiles that should change: ${(task.scope?.filesWrite ?? []).join(', ')}`,
    '## Fix Guidance\n1. Re-read the Original Task section above — your fix MUST satisfy its goCriteria.\n2. Run the Kanıt verification commands from the original task before declaring DONE.\n3. Do NOT inflate selfAssessment — if root-cause is unclear write NO_GO with details.\n4. Stay within Scope above — Auditor will flag any out-of-scope writes.',
  );
  const fixDescription = fixSections.join('\n\n');

  // ── Fix Agent Selection (Sprint 210 Task 7) ─────────────────────
  // Select the fix agent based on original task type — test tasks keep
  // a test-focused agent, doc tasks get doc-writer, bug tasks get
  // bug-fixer, exit-no-result re-runs with the original agent.
  // Model rotation remains via applyFreshEyesRotation (unchanged).
  const rotationStrategy = applyFreshEyesRotation(task);
  const exitedWithoutResult = (result.filesChanged?.length ?? 0) === 0 && (result.linesAdded ?? 0) === 0;
  const fixAgent = selectFixAgent(task, exitedWithoutResult);
  const rotatedSkills = Array.from(new Set([
    ...(task.assignedSkills ?? []),
    ...rotationStrategy.addedSkills,
  ]));
  const repairAuthority = buildFixRepairAuthority(projectRoot, task, result);

  const fixTask: Task = {
    id: `${task.id}-fix`,
    title: `Fix: ${task.title}`,
    description: fixDescription,
    model: rotationStrategy.rotatedModel,
    forceModel: rotationStrategy.rotatedModel,
    effort: task.effort,
    priority: 'CRITICAL',
    reason: enrichedReason,
    scope: regateInheritedScope(projectRoot, `${task.id}-fix`, {
      ...task.scope,
      filesRead: [...repairAuthority.filesRead],
      filesWrite: [...repairAuthority.filesWrite],
    }),
    dependencies: [],
    goNogo: task.goNogo,
    status: TaskStatus.PENDING,
    type: task.type,
    sprintId: task.sprintId,
    isPriorityFix: true,
    fixForTaskId: task.id,
    assignedAgent: fixAgent,
    forceAgent: fixAgent,
    assignedSkills: rotatedSkills,
    // RCPT-2 (temiz-oda-5 ölçümü): do NOT promote auto-assigned skills to
    // forceSkills. The forced-skill guard treats forceSkills as an OPERATOR
    // directive and refuses (fail-closed) when a skill's SKILL.md cannot be
    // resolved — a temp/auto skill inherited that severity and burned the FIX
    // budget. Only the parent's genuine forceSkills carry the operator
    // contract; an unresolvable auto skill falls back to the documented
    // silent-drop.
    ...(task.forceSkills !== undefined && task.forceSkills.length > 0
      ? { forceSkills: [...task.forceSkills] }
      : {}),
    createdAt: now(),
  };

  if (repairAuthority.state === 'hold') {
    fixTask.status = TaskStatus.PAUSED;
  }

  // rotationStrategy lives on the JSON payload but is not part of the
  // formal Task interface (kept out of core/ per task scope). Spread
  // through an unknown-cast so TS doesn't widen Task with this field.
  const fixTaskPayload: unknown = {
    ...fixTask,
    rotationStrategy,
    repairAuthority,
  };

  mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });
  writeFileSync(
    join(projectRoot, TASKS_DIR, `task-${fixTask.id}.json`),
    JSON.stringify(fixTaskPayload, null, 2),
    'utf-8',
  );
}

/**
 * Detect and create fix tasks for cross-dependency failures.
 * When a NO_GO task depends on a completed task, a cross-fix task is created
 * for the dependency to investigate whether it caused the failure.
 * @param projectRoot - Project root directory
 * @param sprint - The current sprint with all tasks
 * @param evaluations - Map of task ID to evaluation result
 * @returns Array of newly created cross-fix tasks
 */
export function handleCrossDependencies(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
): Task[] {
  const fixTasks: Task[] = [];
  const noGoTasks = sprint.tasks.filter(t => evaluations.get(t.id) === TaskEvaluation.NO_GO);
  const tasksById = new Map(sprint.tasks.map(task => [task.id, task]));
  const tasksPath = join(projectRoot, TASKS_DIR);
  try {
    for (const file of readdirSync(tasksPath)) {
      if (!file.startsWith('task-') || !file.endsWith('.json')) continue;
      const persisted = readJsonSafe<Task>(join(tasksPath, file));
      if (!persisted || (persisted.sprintId !== undefined && persisted.sprintId !== sprint.id)) continue;
      tasksById.set(persisted.id, persisted);
    }
  } catch {
    // An absent task directory simply means no repair lineage has been born.
  }
  const repairRoots = new Set(
    [...tasksById.values()]
      .filter(task => task.fixForTaskId !== undefined)
      .map(task => resolveTaskLineageRootId(task, tasksById)),
  );

  for (const noGoTask of noGoTasks) {
    // born-610 (advisor P0): a cascade-skipped NO_GO carries zero evidence about
    // its DONE dependencies — it never ran. Cross-blaming them ("may be caused
    // by") from a synthetic skip is pure fan-out noise (born-624 family).
    const noGoResult = readJsonSafe<TaskResult>(
      join(projectRoot, TASKS_DIR, `task-${noGoTask.id}.result`),
    );
    if (isCascadeSkippedResult(noGoResult)) continue;
    // A direct fix is the first recovery authority for an observed task
    // failure. Do not concurrently blame and rewrite its already-successful
    // dependencies while that direct fix is still pending: that creates
    // redundant xfix work, overlapping write scopes, and ambiguous causality.
    // A later FIX cycle may consider dependency repair only after the direct
    // attempt has produced terminal evidence.
    const directFixPath =
      join(projectRoot, TASKS_DIR, `task-${noGoTask.id}-fix.json`);
    if (existsSync(directFixPath)) continue;
    for (const depId of noGoTask.dependencies) {
      const depEval = evaluations.get(depId);
      if (depEval === TaskEvaluation.DONE || depEval === TaskEvaluation.GO_WITH_TECH_DEBT) {
        const depTask = sprint.tasks.find(t => t.id === depId);
        if (!depTask) continue;
        // Cross-fix is an alternative diagnosis attempt, never a successor to
        // an already-born direct/FIX-FIX lineage. Rewriting a DONE dependency
        // while another repair for the same root exists caused overlapping
        // scopes and let a late xfix spoil an already-settled logical task.
        if (repairRoots.has(depId)) continue;
        if (existsSync(join(projectRoot, TASKS_DIR, `task-${depId}-xfix.json`))) continue;

        // Apply fresh-eyes rotation to cross-fix tasks too — same retry
        // rationale as the direct NO_GO fix path.
        const rotationStrategy = applyFreshEyesRotation(depTask);
        const rotatedSkills = Array.from(new Set([
          ...(depTask.assignedSkills ?? []),
          ...rotationStrategy.addedSkills,
        ]));

        const fixTask: Task = {
          id: `${depId}-xfix`,
          title: `Cross-fix: ${depTask.title}`,
          description: `Cross-dependency fix: ${noGoTask.id} (NO_GO) depends on ${depId}`,
          model: rotationStrategy.rotatedModel,
          forceModel: rotationStrategy.rotatedModel,
          effort: depTask.effort,
          priority: 'CRITICAL',
          reason: `Cross-dependency: ${noGoTask.id} failed, may be caused by ${depId}`,
          scope: regateInheritedScope(projectRoot, `${depId}-xfix`, depTask.scope),
          dependencies: [],
          goNogo: depTask.goNogo,
          status: TaskStatus.PENDING,
          type: depTask.type,
          sprintId: depTask.sprintId,
          isPriorityFix: true,
          fixForTaskId: depId,
          assignedAgent: rotationStrategy.rotatedAgent,
          forceAgent: rotationStrategy.rotatedAgent,
          assignedSkills: rotatedSkills,
          // RCPT-2: same rule as the primary fix-task site above — no auto→force promotion.
          ...(depTask.forceSkills !== undefined && depTask.forceSkills.length > 0
            ? { forceSkills: [...depTask.forceSkills] }
            : {}),
          createdAt: now(),
        };
        fixTasks.push(fixTask);
        tasksById.set(fixTask.id, fixTask);
        repairRoots.add(depId);

        const fixTaskPayload: unknown = {
          ...fixTask,
          rotationStrategy,
        };

        mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });
        writeFileSync(
          join(projectRoot, TASKS_DIR, `task-${fixTask.id}.json`),
          JSON.stringify(fixTaskPayload, null, 2),
          'utf-8',
        );
      }
    }
  }
  return fixTasks;
}

/**
 * Escalate open debt items by incrementing sprintsOpen and promoting priority.
 * Items open >= 3 sprints become HIGH, items open >= 5 sprints become CRITICAL.
 * @param projectRoot - Project root directory
 */
export function escalateDebt(projectRoot: string): void {
  // ── Memory V2: DB-first ────────────────────────────────────────
  const store = getMemoryStore(projectRoot);
  if (store) {
    try {
      const debts = store.getByType('debt').filter(d => d.status !== 'resolved');
      for (const debt of debts) {
        const meta = JSON.parse(debt.metadata || '{}') as Record<string, unknown>;
        const sprintsOpen = (typeof meta.sprintsOpen === 'number' ? meta.sprintsOpen : 0) + 1;
        let newPriority = debt.priority;
        if (sprintsOpen >= DEBT_CRITICAL_SPRINTS && debt.priority !== 'critical') newPriority = 'critical';
        else if (sprintsOpen >= DEBT_HIGH_PRIORITY_SPRINTS && debt.priority === 'normal') newPriority = 'high';
        store.upsert({
          ...debtEntryToInput(debt),
          priority: newPriority,
          metadata: { ...meta, sprintsOpen },
        }, 'brain');
      }
    } finally { store.close(); }
    return;
  }
  // No DB available — escalation skipped
}

/**
 * Mark a debt item as resolved in the given sprint.
 * @param projectRoot - Project root directory
 * @param debtId - The debt item ID to resolve (e.g., "debt-037-001")
 * @param resolvedInSprintId - Sprint ID where the debt was resolved
 * @returns true if the item was found and resolved, false otherwise
 */
export function resolveDebt(projectRoot: string, debtId: string, resolvedInSprintId: string): boolean {
  // ── Memory V2: DB-first ────────────────────────────────────────
  const store = getMemoryStore(projectRoot);
  if (store) {
    try {
      const entry = store.getById(debtId);
      if (!entry || entry.status === 'resolved') return false;
      const meta = JSON.parse(entry.metadata || '{}') as Record<string, unknown>;
      store.upsert({
        ...debtEntryToInput(entry),
        status: 'resolved',
        metadata: { ...meta, resolvedInSprintId },
      }, 'brain');
      return true;
    } finally { store.close(); }
  }

  // No DB available — resolve skipped
  return false;
}

// ═══ Archive ═══════════════════════════════════════════════════════

/**
 * Archive all resolved debt items to .brain/archive/DEBT-ARCHIVE.md.
 * Moves resolved records out of DEBT.md into a separate archive file,
 * keeping only open (unresolved) items in the active debt table.
 * @param projectRoot - Project root directory
 * @returns Number of items archived
 */
export function archiveResolvedDebt(projectRoot: string): number {
  // ── Memory V2: DB-first ────────────────────────────────────────
  // In V2 resolved debts are already soft-deleted via status='resolved'.
  // "Archiving" in the DB sense means nothing needs to move — the entry
  // stays in place and is excluded from active queries.  We just count
  // how many are resolved for the caller's reporting.
  const store = getMemoryStore(projectRoot);
  if (store) {
    try {
      const resolved = store.getByType('debt').filter(d => d.status === 'resolved');
      return resolved.length;
    } finally { store.close(); }
  }

  // No DB available — archive returns 0
  return 0;
}

// ═══ Decay ═════════════════════════════════════════════════════════

/**
 * Files in .brain/ that are permanent and must never be decayed.
 * These are excluded from the "decayable" line count used for budget decisions.
 *
 * @deprecated since Sprint 179 (W3-6). Memory V2 enforces decay exemption at
 * the entry level via `type='identity'` / `type='adr'` (see auditBrainBudget).
 * The path-based set is retained for V1↔V2 hybrid installs but is no longer
 * the canonical mechanism. New code should not consult this set; legacy
 * tests still depend on its membership for backward compatibility.
 *
 * Legacy V1 paths: DECISIONS.md, PROJECT-IDENTITY.md
 * Memory V2 export paths: exports/decisions.md, exports/summary.md,
 * exports/memory.md, exports/debt.md
 */
export const DECAY_EXEMPT = new Set([
  // Legacy V1 (retained for backward compat — V1 projects without memory.db)
  'DECISIONS.md',
  'PROJECT-IDENTITY.md',
  // Memory V2 auto-generated exports (read-only snapshots, regenerated from DB)
  'exports/decisions.md',
  'exports/summary.md',
  'exports/memory.md',
  'exports/debt.md',
]);

/**
 * Result of a brain budget audit — shows decayable vs permanent line accounting.
 */
export interface BrainBudgetAudit {
  /** Lines in decayable files (MEMORY.md, DEBT.md, PATTERNS.md, sprint logs, etc.) */
  decayableLines: number;
  /** Lines in permanent exempt files (DECISIONS.md, PROJECT-IDENTITY.md) */
  permanentLines: number;
  /** Total lines across all .brain/ files */
  totalLines: number;
  /** Budget status: OK if decayable <= budget, OVER otherwise */
  status: 'OK' | 'OVER';
}

/**
 * Audit .brain/ directory against memory budget.
 * Separates permanent (DECAY_EXEMPT) files from decayable files for accurate accounting.
 * @param projectRoot - Project root directory
 * @param budget - Memory budget in lines (default 900)
 * @returns Audit result with decayable/permanent/total counts and status
 */
export function auditBrainBudget(projectRoot: string, budget = 900): BrainBudgetAudit {
  // ── Memory V2: DB-first ────────────────────────────────────────
  const store = getMemoryStore(projectRoot);
  if (store) {
    try {
      const total = store.totalCount();
      // Identity entries map to DECAY_EXEMPT files in V1
      const exempt = store.getByType('identity').length
        + store.getByType('adr').length;
      const decayable = total - exempt;
      return {
        status: decayable > budget ? 'OVER' : 'OK',
        totalLines: total,
        permanentLines: exempt,
        decayableLines: decayable,
      };
    } finally { store.close(); }
  }

  // No DB available — report OK (empty project)
  return { decayableLines: 0, permanentLines: 0, totalLines: 0, status: 'OK' };
}

export interface RunDecayOptions {
  memoryBudget?: number;
  /**
   * Decay retention window — entries older than `currentSprint - decaySprints` are
   * candidates for soft-delete (excluding decay_exempt entries like ADRs).
   *
   * Callers MUST pass `config.decay_after_sprints` so user config (default 20) is
   * honored. The `8` fallback below is ONLY for callers that have no config access
   * (legacy compat). Silently dropping a configured value of 20 to the hardcoded 8
   * is the Sprint 232 PRIMARY memory-loss bug — do not regress.
   */
  decaySprints?: number;
  force?: boolean;
}

/**
 * Run the brain memory decay process to keep .brain/ within budget.
 * Removes resolved patterns, resolved debt (with retention window),
 * archives old sprint logs, and trims MEMORY.md if needed.
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint ID for retention calculations
 * @param opts - Optional settings; force=true runs decay even under budget.
 *   `opts.decaySprints` MUST be wired from `config.decay_after_sprints` by the
 *   caller; the hardcoded `8` fallback is only used when undefined.
 * @returns Summary of what was removed and the before/after line counts
 */
export function runDecay(projectRoot: string, sprintId: string, opts?: RunDecayOptions): DecayResult {
  const budget = opts?.memoryBudget ?? 900;
  // Honor caller-provided config.decay_after_sprints; fall back to 8 only when
  // explicitly undefined (legacy callers without config access).
  const decaySprints = opts?.decaySprints ?? 8;

  // ── Memory V2: DB-first ────────────────────────────────────────
  const store = getMemoryStore(projectRoot);
  if (store) {
    try {
      const currentNum = getSprintNumber(sprintId);
      const totalBefore = store.totalCount();
      const shouldRun = opts?.force || totalBefore > budget;
      if (!shouldRun) {
        return { linesBefore: totalBefore, linesAfter: totalBefore, archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0 };
      }
      store.decay(currentNum, decaySprints);
      const totalAfter = store.totalCount();
      return {
        linesBefore: totalBefore,
        linesAfter: totalAfter,
        archivedSprints: [],
        removedDebtCount: 0,
        removedPatternCount: 0,
      };
    } finally { store.close(); }
  }

  // No DB available — decay is a no-op
  return { linesBefore: 0, linesAfter: 0, archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0 };
}

/**
 * Backward-compatible alias for runDecay. Runs decay without force option.
 * @param projectRoot - Project root directory
 * @param currentSprintId - Current sprint ID for retention calculations
 */
export function decay(projectRoot: string, currentSprintId: string): void {
  runDecay(projectRoot, currentSprintId);
}
