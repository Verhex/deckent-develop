import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import type { Task, Sprint } from '../../core/types.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../core/types.js';
import {
  TASKS_DIR, LOCKS_DIR,
  TMUX_SESSION_NAME, PROJECT_CONFIG_PATH,
} from '../../core/constants.js';
import { countBrainLines } from '../../core/utils.js';
import { cleanup, runDecay } from '../../orchestra/brain.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { getLangFromConfig } from '../helpers/config-reader.js';

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
  program
    .command('cleanup')
    .description('Clean up after a sprint')
    .option('--decay', 'Force run memory decay (compress .brain/ files)')
    .option('--dry-run', 'Preview what would be deleted without actually deleting')
    .action((opts: { decay?: boolean; dryRun?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);
      const tasksDir = join(root, TASKS_DIR);

      if (opts.dryRun) {
        const locksDir = join(root, LOCKS_DIR);
        // A) Single readdirSync pass — eliminates double scan
        const allTaskFiles = existsSync(tasksDir) ? (readdirSync(tasksDir) as string[]) : [];
        const taskFiles = allTaskFiles.filter(f => /\.(json|plan|hb|result|paused|log)$/.test(f));
        const promptFiles = allTaskFiles.filter(f => f.startsWith('.prompt-'));
        const lockFiles = existsSync(locksDir) ? (readdirSync(locksDir) as string[]) : [];

        print('[dry-run] Would delete:');
        for (const f of taskFiles) print(`  task: ${f}`);
        for (const f of lockFiles) print(`  lock: ${f}`);
        for (const f of promptFiles) print(`  prompt: ${f}`);
        print(`  ${taskFiles.length} task file(s)`);
        print(`  ${lockFiles.length} lock file(s)`);
        print(`  ${promptFiles.length} prompt file(s)`);
        print('  tmux session: deckent-orchestra');
        print('\nRun without --dry-run to execute.');
        return;
      }

      try {
        // --decay + normal cleanup combo: run decay first, then continue to normal cleanup
        // Read memory config from project config (sync)
        let decayMemoryBudget = 900;
        let decayAfterSprints = 8;
        try {
          const cfgPath = join(root, PROJECT_CONFIG_PATH);
          if (existsSync(cfgPath)) {
            const rawCfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as { memory_budget?: number; decay_after_sprints?: number };
            if (typeof rawCfg.memory_budget === 'number') decayMemoryBudget = rawCfg.memory_budget;
            if (typeof rawCfg.decay_after_sprints === 'number') decayAfterSprints = rawCfg.decay_after_sprints;
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
              const task = JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as Task;
              tasks.push(task);
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
        let sprintId: string | undefined;
        let sprintNumber = 0;

        // First: check sprint-state.json for active sprint info
        const sprintStatePath = join(root, '.deckent', 'sprint-state.json');
        if (existsSync(sprintStatePath)) {
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

        const sprint: Sprint = {
          id: sprintId ?? `cleanup-${Date.now()}`,
          number: sprintNumber,
          status: SprintStatus.COMPLETE,
          phase: SprintPhase.COMPLETE,
          tasks,
          workers: [],
        };

        cleanup(root, sprint);

        // C) Kill only this project's tmux session — not a hardcoded global name
        const sessionName = getProjectSessionName(root);
        try {
          spawnSync('tmux', ['kill-session', '-t', sessionName], { encoding: 'utf-8' });
        } catch { /* session may not exist */ }

        // D) Ensure .brain/archive/ is git-tracked (not excluded by .gitignore)
        ensureArchiveGitignore(root);

        // Only print cleanup.complete when not in decay mode (decay already showed its own summary)
        if (!opts.decay) {
          print(getMessage('cleanup.complete', lang, { count: String(tasks.length) }));
        }

        // Budget warning: check .brain/ size after cleanup
        const brainLines = countBrainLines(root);
        if (brainLines > decayMemoryBudget) {
          print(`\nWarning: .brain/ has ${brainLines} lines (budget: ${decayMemoryBudget}). Run \`deckent cleanup --decay\` to reduce memory.`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
