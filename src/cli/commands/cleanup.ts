import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { archivePromptFiles } from '../../orchestra/spawn-backend-docker.js';
import { cleanTasksArchive } from '../../orchestra/sprint-docs-updater.js';
import { runRetention } from '../../core/sprint-file-retention.js';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import type { Task, Sprint } from '../../core/types.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../core/types.js';
import {
  TASKS_DIR, LOCKS_DIR, BRAIN_DIR, ARCHIVE_DIR, MEMORY_DB_FILE,
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
    const archivePath = join(archiveDir, basename(liveLogPath));
    writeFileSync(archivePath, content);
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
    .option('--sprint <id>', getMessage('cleanup.sprint_option', registerLang))
    .action((opts: { decay?: boolean; dryRun?: boolean; sprint?: string }) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);
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

        print('[dry-run] Would archive:');
        for (const f of promptFiles) print(`  prompt → archive: ${f}`);
        print('[dry-run] Would delete:');
        for (const f of taskFiles) print(`  task: ${f}`);
        for (const f of lockFiles) print(`  lock: ${f}`);
        print(`  ${taskFiles.length} task file(s) (includes .log, .timeout artifacts)`);
        print(`  ${lockFiles.length} lock file(s)`);
        print(`  ${promptFiles.length} prompt file(s) → archived to .tasks/archive/`);
        print('  tmux session: deckent-orchestra');
        print('  .tasks/archive/ retention policy will be applied');
        print('\nRun without --dry-run to execute.');
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
          print(getMessage('cleanup.decay_complete', lang, {
            before: String(result.linesBefore),
            after: String(result.linesAfter),
          }));
          if (result.archivedSprints.length > 0) {
            print(getMessage('cleanup.archived_sprints', lang, {
              sprints: result.archivedSprints.join(', '),
            }));
          }
          if (result.removedDebtCount > 0 || result.removedPatternCount > 0) {
            print(getMessage('cleanup.removed_items', lang, {
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
          print(`Warning: ${executingTasks.length} task(s) are still active (${ids}). Their locks will be released.`);
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
        const taskArchiveDir = join(root, BRAIN_DIR, ARCHIVE_DIR, 'sprints', `${archiveSprintId}-tasks`);
        const archiveFailures: string[] = [];
        if (targetSprintId && existsSync(tasksDir)) {
          const archivalSuffix = /\.(?:json|plan|hb|result|paused|log|timeout|partial-result)$/u;
          for (const artifactName of (readdirSync(tasksDir) as string[]).filter(
            name => ownsTaskArtifact(name) && archivalSuffix.test(name),
          )) {
            const liveArtifactPath = join(tasksDir, artifactName);
            try {
              const content = readFileSync(liveArtifactPath) as Buffer;
              const ok = archiveLogFileWithVerify(liveArtifactPath, taskArchiveDir, content);
              if (!ok) archiveFailures.push(artifactName);
            } catch { archiveFailures.push(artifactName); }
          }
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

        // E) Archive .prompt-* files to .tasks/archive/sprint-{id}/ before deleting
        // Prompt files persist during sprint for analysis — archived on cleanup with retention policy
        const archiveResult = archivePromptFiles(
          tasksDir,
          archiveSprintId,
          promptArchiveRetention,
          taskIdPrefix ?? undefined,
        );
        if (archiveResult.archived > 0) {
          print(`Archived ${archiveResult.archived} prompt file(s) → .tasks/archive/${archiveSprintId}/`);
        }
        if (archiveResult.cleaned > 0) {
          print(`Removed ${archiveResult.cleaned} prompt file(s) from old archive (retention: ${promptArchiveRetention} sprints)`);
        }

        // F) Apply .tasks/archive/ retention policy — remove sprint archive dirs beyond retention limit
        const tasksArchiveCleaned = cleanTasksArchive(root, promptArchiveRetention);
        if (tasksArchiveCleaned > 0) {
          print(`Removed ${tasksArchiveCleaned} old .tasks/archive/ dir(s) (retention: ${promptArchiveRetention} sprints)`);
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
            print(`Deleted ${retResult.countersDeleted.length} counter file(s) (-seq, -checkpoint-seq)`);
          }
          if (retResult.forensicMoved.length > 0) {
            print(`Moved ${retResult.forensicMoved.length} forensic file(s) → docs/audits/`);
          }
          if (retResult.archived.length > 0) {
            print(`Archived ${retResult.archived.length} sprint file(s) (retention: keep_last_n=${retentionConfig.keep_last_n ?? 10})`);
          }
        } catch { /* best-effort, non-blocking */ }

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
          if (prunedIds.length > 0) print(getMessage('cleanup.pruned_expired_approvals', lang, { count: String(prunedIds.length) }));
        } catch { /* fail-soft */ }

        // Cleanup retires the final run identity. Publish IDLE only after the
        // owned lifecycle files are gone; unresolved provider observations are
        // retained as forensic HOLD evidence rather than counted as active.
        publishCanonicalRunStatusReadModel(root);

        // Only print cleanup.complete when not in decay mode (decay already showed its own summary)
        if (!opts.decay) {
          print(getMessage('cleanup.complete', lang, { count: String(tasks.length) }));
        }

        // Budget warning: check .brain/ size after cleanup
        const brainLines = getMemoryEntryCount(root);
        if (brainLines > decayMemoryBudget) {
          print(`\nWarning: .brain/ has ${brainLines} lines (budget: ${decayMemoryBudget}). Run \`deckent cleanup --decay\` to reduce memory.`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
