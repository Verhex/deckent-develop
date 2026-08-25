import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { archivePromptFiles } from '../../orchestra/spawn-backend-docker.js';
import { cleanTasksArchive } from '../../orchestra/sprint-docs-updater.js';
import { runRetention } from '../../core/sprint-file-retention.js';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import type { Task, Sprint } from '../../core/types.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../core/types.js';
import {
  TASKS_DIR, LOCKS_DIR, BRAIN_DIR, MEMORY_DB_FILE,
  TMUX_SESSION_NAME, PROJECT_CONFIG_PATH,
} from '../../core/constants.js';
import { MemoryStore } from '../../core/memory-store.js';
import { cleanup, runDecay } from '../../orchestra/brain.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { pruneExpiredNervousPending } from '../../core/pending-approvals.js';
import { isExecutionLockAuthorityArtifactName } from '../../core/file-lock.js';
import {
  readCanonicalRunStatus,
  type CanonicalRunStatus,
} from '../../core/run-status-authority.js';
import { cleanupSprintMetadata } from '../../orchestra/sprint-controller.js';
import { classifyTaskArtifact } from '../../core/task-artifact-classifier.js';
import {
  projectTerminalPublicationStatus,
  type TerminalPublicationStatus,
} from '../../core/sprint-terminal-publication-status.js';
import { publishCanonicalRunStatusReadModel } from '../../core/run-status-read-model.js';
import { DeckentError } from '../../core/errors.js';
import { archiveTaskArtifacts } from '../../core/sprint-archive.js';
import {
  applyRuntimeHygiene,
  planRuntimeHygiene,
  readRuntimeHygieneReceipt,
  type RuntimeHygieneApplyResult,
  type RuntimeHygieneFamily,
  type RuntimeHygienePlan,
} from '../../core/runtime-hygiene.js';

const RUNTIME_HYGIENE_FAMILIES = [
  'recent-work', 'jobs', 'evaluations', 'run-flows', 'logs',
] as const satisfies readonly RuntimeHygieneFamily[];

interface RuntimeHygieneCleanupOptions {
  readonly history?: boolean;
  readonly apply?: boolean;
  readonly planDigest?: string;
  readonly json?: boolean;
  readonly dryRun?: boolean;
}

interface RuntimeHygieneProjection {
  readonly version: 1;
  readonly operation: 'runtime-hygiene';
  readonly mode: 'plan' | 'apply' | 'hold';
  readonly planDigest?: string;
  readonly reasonCode?: string;
  readonly inventory?: { readonly families: number; readonly count: number; readonly bytes: number };
  readonly candidates?: { readonly count: number; readonly bytes: number };
  readonly counters?: RuntimeHygienePlan['counters'];
  readonly receipt?: {
    readonly state: RuntimeHygieneApplyResult['receiptState'];
    readonly status: RuntimeHygieneApplyResult['receipt']['status'];
  };
  readonly outcomes?: readonly {
    readonly family: RuntimeHygieneFamily;
    readonly attempted: number;
    readonly retired: number;
    readonly retiredBytes: number;
    readonly failures: number;
  }[];
}

function sumRuntimeHygieneCounters(
  plan: RuntimeHygienePlan,
  field: 'inventoryCount' | 'inventoryBytes' | 'candidateCount' | 'candidateBytes',
): number {
  return RUNTIME_HYGIENE_FAMILIES.reduce((sum, family) => sum + plan.counters[family][field], 0);
}

/** Public, path-free machine projection for the CLI JSON surface. */
export function projectRuntimeHygienePlan(plan: RuntimeHygienePlan): RuntimeHygieneProjection {
  return {
    version: 1, operation: 'runtime-hygiene', mode: 'plan', planDigest: plan.planDigest,
    inventory: {
      families: RUNTIME_HYGIENE_FAMILIES.length,
      count: sumRuntimeHygieneCounters(plan, 'inventoryCount'),
      bytes: sumRuntimeHygieneCounters(plan, 'inventoryBytes'),
    },
    candidates: {
      count: sumRuntimeHygieneCounters(plan, 'candidateCount'),
      bytes: sumRuntimeHygieneCounters(plan, 'candidateBytes'),
    },
    counters: plan.counters,
  };
}

/** Public, path-free projection of durable apply evidence. */
export function projectRuntimeHygieneApply(
  plan: Pick<RuntimeHygienePlan, 'planDigest'>,
  result: RuntimeHygieneApplyResult,
): RuntimeHygieneProjection {
  return {
    version: 1, operation: 'runtime-hygiene', mode: 'apply', planDigest: plan.planDigest,
    counters: result.receipt.counters,
    receipt: { state: result.receiptState, status: result.receipt.status },
    outcomes: result.receipt.outcomes.map(outcome => ({
      family: outcome.family,
      attempted: outcome.attempted,
      retired: outcome.retired,
      retiredBytes: outcome.retiredBytes,
      failures: outcome.failures.length,
    })),
  };
}

function runtimeHygieneReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/(?:^|\b)(RUNTIME_HYGIENE_[A-Z_]+)/u)?.[1] ?? 'RUNTIME_HYGIENE_FAILED';
}

function printRuntimeHygieneProjection(projection: RuntimeHygieneProjection): void {
  process.stdout.write(`${JSON.stringify(projection)}\n`);
}

function renderRuntimeHygienePlan(plan: RuntimeHygienePlan, lang: string): void {
  print(getMessage('runtime_hygiene.inventory', lang, {
    families: String(RUNTIME_HYGIENE_FAMILIES.length),
    count: String(sumRuntimeHygieneCounters(plan, 'inventoryCount')),
    bytes: String(sumRuntimeHygieneCounters(plan, 'inventoryBytes')),
  }));
  print(getMessage('runtime_hygiene.plan', lang, {
    count: String(sumRuntimeHygieneCounters(plan, 'candidateCount')),
    bytes: String(sumRuntimeHygieneCounters(plan, 'candidateBytes')),
  }));
  print(`Plan digest: ${plan.planDigest}`);
}

function renderRuntimeHygieneApply(result: RuntimeHygieneApplyResult, lang: string): void {
  for (const outcome of result.receipt.outcomes) {
    print(getMessage('runtime_hygiene.retire', lang, {
      family: outcome.family,
      count: String(outcome.retired),
      bytes: String(outcome.retiredBytes),
    }));
  }
  print(getMessage('runtime_hygiene.receipt', lang, {
    receiptState: result.receiptState,
    status: result.receipt.status,
  }));
  print(getMessage('runtime_hygiene.summary', lang, {
    families: String(result.receipt.outcomes.length),
    attempted: String(result.receipt.outcomes.reduce((sum, item) => sum + item.attempted, 0)),
    retired: String(result.receipt.outcomes.reduce((sum, item) => sum + item.retired, 0)),
    failures: String(result.receipt.outcomes.reduce((sum, item) => sum + item.failures.length, 0)),
  }));
}

export function cleanupAuthorityHoldReason(
  authority: CanonicalRunStatus,
  terminalPublication?: TerminalPublicationStatus,
): string | null {
  if (authority.active || authority.coordinator === 'alive') {
    return 'coordinator-active';
  }
  if (authority.coordinator === 'unknown') {
    return 'coordinator-ownership-unknown';
  }
  if (
    authority.resumable
    || authority.lifecycle === 'PAUSED'
    || authority.lifecycle === 'ORPHANED'
  ) {
    return `run-${authority.lifecycle.toLowerCase()}`;
  }
  if (authority.lifecycle === 'COMPLETE' || authority.lifecycle === 'ABORTED') {
    if (terminalPublication?.state !== 'receipt-observed' || !terminalPublication.receipt) {
      return 'terminal-receipt-required';
    }
    if (terminalPublication.receipt.terminalOutcome !== authority.lifecycle) {
      return 'terminal-outcome-mismatch';
    }
  }
  return null;
}

/** DB-first memory entry count — replaces legacy countBrainLines. */
function getMemoryEntryCount(projectRoot: string): number {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return 0;
  try {
    const store = new MemoryStore(dbPath);
    try { return store.totalCount(); }
    finally { store.close(); }
  } catch { return 0; }
}

/** C) Read project-specific tmux session name from config — avoids killing other projects' sessions. */
function getProjectSessionName(root: string): string {
  try {
    const configPath = join(root, PROJECT_CONFIG_PATH);
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { tmux_session?: string };
      if (config.tmux_session) return config.tmux_session;
    }
  } catch { /* use default */ }
  return TMUX_SESSION_NAME;
}

/** §2.4 — Copy one owned task artifact to archiveDir and byte-verify it. */
export function archiveLogFileWithVerify(liveLogPath: string, archiveDir: string, content: Buffer): boolean {
  try {
    mkdirSync(archiveDir, { recursive: true });
    let archivePath = join(archiveDir, basename(liveLogPath));
    if (existsSync(archivePath)) {
      const existing = readFileSync(archivePath) as Buffer;
      if (existing.equals(content)) return true;
      const digest = createHash('sha256').update(content).digest('hex').slice(0, 16);
      const conflictsDir = join(archiveDir, 'conflicts');
      mkdirSync(conflictsDir, { recursive: true });
      archivePath = join(conflictsDir, `${basename(liveLogPath)}.${digest}`);
      if (existsSync(archivePath)) return (readFileSync(archivePath) as Buffer).equals(content);
    }
    writeFileSync(archivePath, content, { flag: 'wx' });
    const archived = readFileSync(archivePath) as Buffer;
    return archived.equals(content);
  } catch {
    return false;
  }
}

/** D) Ensure .brain/archive/ has a git-track exception in .gitignore. */
function ensureArchiveGitignore(root: string): void {
  const gitignorePath = join(root, '.gitignore');
  if (!existsSync(gitignorePath)) return;
  try {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.includes('!.brain/archive/')) return;
    const lines = content.split('\n');
    const archiveIdx = lines.findIndex(l => l.trim() === '.brain/archive/');
    if (archiveIdx !== -1) {
      lines.splice(archiveIdx + 1, 0, '!.brain/archive/');
    } else {
      lines.push('!.brain/archive/');
    }
    writeFileSync(gitignorePath, lines.join('\n'), 'utf-8');
  } catch { /* skip if unreadable/unwritable */ }
}

export function registerCleanup(program: Command): void {
  const registerLang = getLangFromConfig(resolveProjectRoot());
  program
    .command('cleanup')
    .description(getMessage('cli.cleanup.desc', getLanguage(undefined)))
    .option('--decay', 'Force run memory decay (compress .brain/ files)')
    .option('--dry-run', 'Preview what would be deleted without actually deleting')
    .option('--history', 'Plan bounded runtime-history hygiene (dry-run by default)')
    .option('--apply', 'Apply a runtime-history hygiene plan')
    .option('--plan-digest <digest>', 'Exact runtime-history plan digest required by --apply')
    .option('--json', 'Emit one path-free runtime-history JSON projection')
    .option('--sprint <id>', getMessage('cleanup.sprint_option', registerLang))
    .action((opts: RuntimeHygieneCleanupOptions & { decay?: boolean; sprint?: string }) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);
      // --json contract: human prose never reaches stdout in json mode; every
      // narrative line below goes through this guard (670-004 closure).
      const say = (message: string): void => { if (!opts.json) print(message); };
      const tasksDir = join(root, TASKS_DIR);
      const authority = readCanonicalRunStatus(root);
      const requestedSprintId = opts.sprint?.trim();
      if (requestedSprintId && !/^sprint-\d+$/u.test(requestedSprintId)) {
        printError(new Error(getMessage('cleanup.authority_hold', lang, {
          sprintId: requestedSprintId,
          reason: 'invalid-sprint-id',
        })));
        process.exitCode = 1;
        return;
      }
      if (opts.history) {
        const hold = (reasonCode: string): void => {
          if (opts.json) {
            printRuntimeHygieneProjection({
              version: 1, operation: 'runtime-hygiene', mode: 'hold', reasonCode,
            });
          } else {
            printError(new Error(getMessage('runtime_hygiene.hold', lang, { reasonCode })));
          }
          process.exitCode = 1;
        };

        if (opts.apply && opts.dryRun) { hold('APPLY_DRY_RUN_CONFLICT'); return; }
        if (!opts.apply && opts.planDigest !== undefined) { hold('PLAN_DIGEST_REQUIRES_APPLY'); return; }
        if (opts.apply && !opts.planDigest?.trim()) { hold('PLAN_DIGEST_REQUIRED'); return; }

        try {
          if (opts.apply) {
            const authorityHold = cleanupAuthorityHoldReason(
              authority,
              projectTerminalPublicationStatus(root, authority),
            );
            if (authorityHold) {
              hold(`AUTHORITY_${authorityHold.toUpperCase().replace(/-/gu, '_')}`);
              return;
            }
            const requestedDigest = opts.planDigest!.trim();
            const existing = readRuntimeHygieneReceipt(root, requestedDigest);
            if (existing) {
              if (opts.json) {
                printRuntimeHygieneProjection(projectRuntimeHygieneApply(
                  { planDigest: requestedDigest },
                  existing,
                ));
              } else {
                renderRuntimeHygieneApply(existing, lang);
              }
              if (existing.receipt.status === 'partial') process.exitCode = 1;
              return;
            }
          }
          const selectedSprints = requestedSprintId
            ? [requestedSprintId]
            : authority.sprintId && !authority.active ? [authority.sprintId] : [];
          const currentSprints = authority.active && authority.sprintId ? [authority.sprintId] : [];
          // Retention is day-granular; pin the clock so a preview digest can be
          // supplied unchanged to a same-day exact-CAS apply invocation.
          const now = new Date();
          now.setUTCHours(0, 0, 0, 0);
          const plan = planRuntimeHygiene(root, {
            sprintIds: selectedSprints,
            currentSprintIds: currentSprints,
            now,
          });

          if (!opts.apply) {
            if (opts.json) printRuntimeHygieneProjection(projectRuntimeHygienePlan(plan));
            else renderRuntimeHygienePlan(plan, lang);
            return;
          }
          if (opts.planDigest!.trim() !== plan.planDigest) { hold('PLAN_DIGEST_MISMATCH'); return; }
          const result = applyRuntimeHygiene(plan);
          if (opts.json) printRuntimeHygieneProjection(projectRuntimeHygieneApply(plan, result));
          else renderRuntimeHygieneApply(result, lang);
          if (result.receipt.status === 'partial') process.exitCode = 1;
        } catch (error) {
          hold(runtimeHygieneReason(error));
        }
        return;
      }
      // Runtime-hygiene mutation switches are never aliases for the legacy,
      // destructive cleanup path. Require the explicit surface selector.
      if (opts.apply || opts.planDigest !== undefined || opts.json) {
        const reasonCode = 'HISTORY_SELECTOR_REQUIRED';
        printError(new Error(getMessage('runtime_hygiene.hold', lang, { reasonCode })));
        process.exitCode = 1;
        return;
      }
      if (
        requestedSprintId
        && authority.sprintId
        && authority.sprintId !== requestedSprintId
        && authority.lifecycle !== 'IDLE'
      ) {
        printError(new Error(getMessage('cleanup.authority_hold', lang, {
          sprintId: requestedSprintId,
          reason: `authority-owned-by-${authority.sprintId}`,
        })));
        process.exitCode = 1;
        return;
      }
      const terminalPublication = projectTerminalPublicationStatus(root, authority);
      const holdReason = cleanupAuthorityHoldReason(authority, terminalPublication);
      if (holdReason) {
        printError(new Error(getMessage('cleanup.authority_hold', lang, {
          sprintId: authority.sprintId ?? 'unknown',
          reason: holdReason,
        })));
        process.exitCode = 1;
        return;
      }
      const targetSprintId = requestedSprintId ?? authority.sprintId;
      let taskIdPrefix = targetSprintId?.match(/^sprint-(\d+)$/u)?.[1];
      taskIdPrefix = taskIdPrefix ? `${taskIdPrefix}-` : undefined;
      const ownsTaskArtifact = (file: string): boolean => taskIdPrefix === undefined
        || file.startsWith(`task-${taskIdPrefix}`);
      const ownsPromptArtifact = (file: string): boolean => taskIdPrefix === undefined
        || file.startsWith(`.prompt-${taskIdPrefix}`)
        || file.startsWith(`.worker-${taskIdPrefix}`);

      if (opts.dryRun) {
        const locksDir = join(root, LOCKS_DIR);
        // A) Single readdirSync pass — eliminates double scan
        const allTaskFiles = existsSync(tasksDir) ? (readdirSync(tasksDir) as string[]) : [];
        const taskFiles = allTaskFiles.filter(
          f => ownsTaskArtifact(f) && /\.(json|plan|hb|result|paused|log|timeout)$/.test(f),
        );
        const promptFiles = allTaskFiles.filter(
          f => ownsPromptArtifact(f) && (f.startsWith('.prompt-') || f.startsWith('.worker-')),
        );
        const lockFiles = existsSync(locksDir)
          ? (readdirSync(locksDir) as string[]).filter(
            file => !isExecutionLockAuthorityArtifactName(file),
          )
          : [];

        say(getMessage('cleanup.dry_run.archive_header', lang));
        for (const file of promptFiles) say(getMessage('cleanup.dry_run.prompt', lang, { file }));
        say(getMessage('cleanup.dry_run.delete_header', lang));
        for (const file of taskFiles) say(getMessage('cleanup.dry_run.task', lang, { file }));
        for (const file of lockFiles) say(getMessage('cleanup.dry_run.lock', lang, { file }));
        say(getMessage('cleanup.dry_run.task_count', lang, { count: String(taskFiles.length) }));
        say(getMessage('cleanup.dry_run.lock_count', lang, { count: String(lockFiles.length) }));
        say(getMessage('cleanup.dry_run.prompt_count', lang, { count: String(promptFiles.length) }));
        say(getMessage('cleanup.dry_run.tmux', lang));
        say(getMessage('cleanup.dry_run.reconcile', lang));
        say(getMessage('cleanup.dry_run.execute', lang));
        return;
      }

      try {
        // --decay + normal cleanup combo: run decay first, then continue to normal cleanup
        // Read memory config from project config (sync)
        let decayMemoryBudget = 900;
        let decayAfterSprints = 8;
        let promptArchiveRetention = 5;
        try {
          const cfgPath = join(root, PROJECT_CONFIG_PATH);
          if (existsSync(cfgPath)) {
            const rawCfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as { memory_budget?: number; decay_after_sprints?: number; prompt_archive_retention?: number };
            if (typeof rawCfg.memory_budget === 'number') decayMemoryBudget = rawCfg.memory_budget;
            if (typeof rawCfg.decay_after_sprints === 'number') decayAfterSprints = rawCfg.decay_after_sprints;
            if (typeof rawCfg.prompt_archive_retention === 'number') promptArchiveRetention = rawCfg.prompt_archive_retention;
          }
        } catch { /* use defaults */ }
        if (opts.decay) {
          const result = runDecay(root, 'sprint-cleanup', { force: true, memoryBudget: decayMemoryBudget, decaySprints: decayAfterSprints });
          say(getMessage('cleanup.decay_complete', lang, {
            before: String(result.linesBefore),
            after: String(result.linesAfter),
          }));
          if (result.archivedSprints.length > 0) {
            say(getMessage('cleanup.archived_sprints', lang, {
              sprints: result.archivedSprints.join(', '),
            }));
          }
          if (result.removedDebtCount > 0 || result.removedPatternCount > 0) {
            say(getMessage('cleanup.removed_items', lang, {
              debt: String(result.removedDebtCount),
              patterns: String(result.removedPatternCount),
            }));
          }
          // NOTE: intentionally fall through to normal cleanup (no early return)
        }

        const tasks: Task[] = [];
        if (existsSync(tasksDir)) {
          const files = readdirSync(tasksDir).filter(
            (f) => f.startsWith('task-') && f.endsWith('.json'),
          );
          for (const f of files) {
            try {
              const content = readFileSync(join(tasksDir, f), 'utf-8');
              const classification = classifyTaskArtifact(f, content);
              if (classification.kind !== 'task-record') continue;
              const task = JSON.parse(content) as Task;
              const belongsToRun = targetSprintId === null
                || task.sprintId === targetSprintId
                || (taskIdPrefix !== undefined && task.id.startsWith(taskIdPrefix));
              if (task.id === classification.taskId && belongsToRun) tasks.push(task);
            } catch {
              // skip malformed task files
            }
          }
        }

        // Active lock guard: warn if any tasks are still EXECUTING
        const executingTasks = tasks.filter(t => t.status === TaskStatus.EXECUTING || t.status === TaskStatus.CLAIMED);
        if (executingTasks.length > 0) {
          const ids = executingTasks.map(t => t.id).join(', ');
          say(`Warning: ${executingTasks.length} task(s) are still active (${ids}). Their locks will be released.`);
        }

        // B) Build sprint from real task data — not a synthetic placeholder
        let sprintId: string | undefined = targetSprintId ?? undefined;
        const selectedSprintNumber = sprintId?.match(/^(?:sprint-)?(\d+)$/u)?.[1];
        let sprintNumber = selectedSprintNumber ? parseInt(selectedSprintNumber, 10) : 0;

        // First: check sprint-state.json for active sprint info
        const sprintStatePath = join(root, '.deckent', 'sprint-state.json');
        if (!sprintId && existsSync(sprintStatePath)) {
          try {
            const state = JSON.parse(readFileSync(sprintStatePath, 'utf-8')) as { sprintId?: string };
            if (state.sprintId) {
              sprintId = state.sprintId;
              const m = state.sprintId.match(/(\d+)$/);
              if (m?.[1]) sprintNumber = parseInt(m[1], 10);
            }
          } catch { /* fall through */ }
        }

        // Fallback: derive sprint ID from the tasks themselves
        if (!sprintId && tasks.length > 0) {
          const taskSprintId = tasks[0]?.sprintId;
          if (taskSprintId) {
            sprintId = taskSprintId;
            const m = taskSprintId.match(/(\d+)$/);
            if (m?.[1]) sprintNumber = parseInt(m[1], 10);
          }
        }
        if (!taskIdPrefix && sprintId) {
          const derivedSprintNumber = sprintId.match(/^sprint-(\d+)$/u)?.[1];
          taskIdPrefix = derivedSprintNumber ? `${derivedSprintNumber}-` : undefined;
        }

        const sprint: Sprint = {
          id: sprintId ?? `cleanup-${Date.now()}`,
          number: sprintNumber,
          status: SprintStatus.COMPLETE,
          phase: SprintPhase.COMPLETE,
          tasks,
          workers: [],
        };

        // Compute archiveSprintId before cleanup so §2.4 and §E both use it
        const archiveSprintId = sprintId ?? `sprint-${sprintNumber || Date.now()}`;

        // §2.4 — Archive every owned task artifact with byte verification
        // before live deletion. An archive failure restores that exact file;
        // foreign-run evidence never enters this run's archive.
        const archiveFailures: string[] = [];
        if (targetSprintId && existsSync(tasksDir)) {
          const archivalSuffix = /\.(?:json|plan|hb|result|paused|log|timeout|partial-result)$/u;
          const ownedArtifacts = (readdirSync(tasksDir) as string[]).filter(
            name => ownsTaskArtifact(name) && archivalSuffix.test(name),
          );
          const settlement = archiveTaskArtifacts(root, archiveSprintId, {
            archive: ownedArtifacts,
            preserve: [],
            sweepResidue: false,
          });
          archiveFailures.push(...settlement.failures);
        }
        if (archiveFailures.length > 0) {
          throw new DeckentError('E_CLEANUP_ARCHIVE_HOLD', getMessage('cleanup.archive_hold', lang, {
            count: String(archiveFailures.length),
            files: archiveFailures.slice(0, 5).join(', '),
          }));
        }

        cleanup(root, sprint);
        // Once quiescence was proven above, retire only this run's mutable
        // lifecycle projections. Immutable job/receipt/forensic archives stay.
        if (sprintId) cleanupSprintMetadata(root, sprintId);

        // E) Archive .prompt-* files into the canonical sprint namespace.
        const archiveResult = archivePromptFiles(
          tasksDir,
          archiveSprintId,
          promptArchiveRetention,
          taskIdPrefix ?? undefined,
        );
        if (archiveResult.archived > 0) {
          say(getMessage('cleanup.prompts_archived', lang, {
            count: String(archiveResult.archived),
            sprintId: archiveSprintId,
          }));
        }

        // F) Reconcile legacy `.tasks/archive/` staging; immutable evidence is
        // never deleted by this compatibility pass.
        const tasksArchiveCleaned = cleanTasksArchive(root, promptArchiveRetention);
        if (tasksArchiveCleaned > 0) {
          say(getMessage('cleanup.legacy_archives_consolidated', lang, {
            count: String(tasksArchiveCleaned),
          }));
        }

        // G) Sprint file retention — clean counters, migrate forensic, enforce keep_last_n + size_cap
        try {
          let retentionConfig: Record<string, unknown> = {};
          try {
            const cfgPath = join(root, PROJECT_CONFIG_PATH);
            if (existsSync(cfgPath)) {
              const raw = JSON.parse(readFileSync(cfgPath, 'utf-8')) as { sprint_file_retention?: Record<string, unknown> };
              if (raw?.sprint_file_retention) retentionConfig = raw.sprint_file_retention;
            }
          } catch { /* use defaults */ }

          const retResult = runRetention(root, sprintId ?? null, retentionConfig);
          if (retResult.countersDeleted.length > 0) {
            say(`Deleted ${retResult.countersDeleted.length} counter file(s) (-seq, -checkpoint-seq)`);
          }
          if (retResult.forensicMoved.length > 0) {
            say(`Moved ${retResult.forensicMoved.length} forensic file(s) → docs/audits/`);
          }
          if (retResult.archived.length > 0) {
            say(`Archived ${retResult.archived.length} sprint file(s) (retention: keep_last_n=${retentionConfig.keep_last_n ?? 10})`);
          }
        } catch (error) {
          // Retention may already have published immutable bytes. Hiding a
          // manifest reconciliation failure would leave canonical evidence
          // untracked, so the cleanup command must stop with the typed cause.
          throw error;
        }

        // C) Kill only this project's tmux session — not a hardcoded global name
        const sessionName = getProjectSessionName(root);
        try {
          spawnSync('tmux', ['kill-session', '-t', sessionName], { encoding: 'utf-8' });
        } catch { /* session may not exist */ }

        // D) Ensure .brain/archive/ is git-tracked (not excluded by .gitignore)
        ensureArchiveGitignore(root);

        // ─── W0-TRUTH (#491): stale display-state dies with the cleanup ─────
        // `deckent status` must never render a ghost sprint after a cleanup:
        // remove the auditor's last `.dashboard` snapshot + the per-sprint
        // ci-baseline, clear sprint-state/active pointers, and prune parked
        // nervous approvals whose own timeout deadline has passed. Fail-soft.
        for (const stale of ['.dashboard', join('.deckent', 'ci-baseline.json'), join('.deckent', 'sprint-state.json'), join('.deckent', 'sprint-active.json')]) {
          try { unlinkSync(join(root, stale)); } catch { /* absent is fine */ }
        }
        try {
          const prunedIds = pruneExpiredNervousPending(root, Date.now());
          if (prunedIds.length > 0) say(getMessage('cleanup.pruned_expired_approvals', lang, { count: String(prunedIds.length) }));
        } catch { /* fail-soft */ }

        // Cleanup retires the final run identity. Publish IDLE only after the
        // owned lifecycle files are gone; unresolved provider observations are
        // retained as forensic HOLD evidence rather than counted as active.
        publishCanonicalRunStatusReadModel(root);

        // Only print cleanup.complete when not in decay mode (decay already showed its own summary)
        if (!opts.decay) {
          say(getMessage('cleanup.complete', lang, { count: String(tasks.length) }));
        }

        // Budget warning: check .brain/ size after cleanup
        const brainLines = getMemoryEntryCount(root);
        if (brainLines > decayMemoryBudget) {
          say(`\nWarning: .brain/ has ${brainLines} lines (budget: ${decayMemoryBudget}). Run \`deckent cleanup --decay\` to reduce memory.`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
