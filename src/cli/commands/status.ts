import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DashboardState, Task } from '../../core/types.js';
import { DASHBOARD_FILE, TASKS_DIR } from '../../core/constants.js';
import { print, printError, formatDashboard, formatTable, formatHumanStatus } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';

interface StatusOpts {
  watch?: boolean;
  json?: boolean;
  verbose?: boolean;
  raw?: boolean;
}

interface SprintMeta {
  title?: string;
  startedAt?: string;
}

function readSprintMeta(root: string, _sprintId: string): SprintMeta {
  try {
    const directivesPath = join(root, 'DIRECTIVES.md');
    if (existsSync(directivesPath)) {
      const content = readFileSync(directivesPath, 'utf-8');
      // Extract title from first heading: # DIRECTIVES — Sprint 040 (Title)
      const titleMatch = content.match(/^#\s+DIRECTIVES\s*—\s*Sprint\s+\d+\s*\(([^)]+)\)/m);
      const title = titleMatch?.[1];
      return { title };
    }
  } catch {
    // ignore
  }

  // Try reading sprint config for startedAt
  try {
    const configPath = join(root, '.deckent', 'config.json');
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { sprint_started_at?: string };
      return { startedAt: cfg.sprint_started_at };
    }
  } catch {
    // ignore
  }

  return {};
}

function readDashboard(dashPath: string): DashboardState | null {
  if (!existsSync(dashPath)) return null;
  try {
    return JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
  } catch {
    return null;
  }
}

/**
 * Reads the language setting from the project config synchronously.
 * Falls back to 'en' if the config is missing or unreadable.
 */
export function getLangFromRoot(root: string): string {
  try {
    const configPath = join(root, '.deckent', 'config.json');
    if (!existsSync(configPath)) return 'en';
    const raw = readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw) as { language?: string };
    return cfg.language === 'tr' ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

export function loadTaskFiles(root: string): Task[] {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return [];
  const files = readdirSync(tasksDir).filter(
    (f) => f.startsWith('task-') && f.endsWith('.json'),
  );
  const tasks: Task[] = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as Task;
      tasks.push(data);
    } catch {
      // Skip malformed task files
    }
  }
  return tasks;
}

export function formatAgentAssignments(tasks: Task[], verbose: boolean): string {
  const lines: string[] = [];
  lines.push('\n--- Agent Assignments ---');
  const agentMap = new Map<string, string[]>();
  for (const t of tasks) {
    const agent = t.assignedAgent ?? 'generic';
    if (!agentMap.has(agent)) agentMap.set(agent, []);
    const agentTasks = agentMap.get(agent);
    if (agentTasks) agentTasks.push(t.id); // narrowed: set() called above
  }
  if (agentMap.size === 0) {
    lines.push('No agent assignments found.');
    return lines.join('\n');
  }
  if (verbose) {
    const headers = ['Agent', 'Tasks', 'Count'];
    const rows = Array.from(agentMap.entries()).map(([agent, taskIds]) => [
      agent,
      taskIds.join(', '),
      String(taskIds.length),
    ]);
    lines.push(formatTable(headers, rows));
  } else {
    for (const [agent, taskIds] of agentMap) {
      lines.push(`  ${agent}: ${taskIds.length} task(s)`);
    }
  }
  return lines.join('\n');
}

export function formatSkillAssignments(tasks: Task[], verbose: boolean): string {
  const lines: string[] = [];
  lines.push('\n--- Skill Assignments ---');
  const skillMap = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.assignedSkills && t.assignedSkills.length > 0) {
      for (const skill of t.assignedSkills) {
        if (!skillMap.has(skill)) skillMap.set(skill, []);
        const skillTasks = skillMap.get(skill);
        if (skillTasks) skillTasks.push(t.id); // narrowed: set() called above
      }
    }
  }
  if (skillMap.size === 0) {
    lines.push('No skill assignments found.');
    return lines.join('\n');
  }
  if (verbose) {
    const headers = ['Skill', 'Tasks', 'Count'];
    const rows = Array.from(skillMap.entries()).map(([skill, taskIds]) => [
      skill,
      taskIds.join(', '),
      String(taskIds.length),
    ]);
    lines.push(formatTable(headers, rows));
  } else {
    for (const [skill, taskIds] of skillMap) {
      lines.push(`  ${skill}: ${taskIds.length} task(s)`);
    }
  }
  return lines.join('\n');
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show the current sprint dashboard')
    .option('--watch', 'Auto-refresh every 2 seconds')
    .option('--json', 'Output raw JSON instead of formatted dashboard')
    .option('--raw', 'Show legacy raw dashboard (box format)')
    .option('--verbose', 'Show detailed agent and skill assignment info')
    .action((opts: StatusOpts) => {
      const root = resolveProjectRoot();
      const dashPath = join(root, DASHBOARD_FILE);
      const lang = getLangFromRoot(root);

      if (!existsSync(dashPath)) {
        print(getMessage('status.no_active_sprint', lang));
        return;
      }

      if (opts.watch) {
        const render = (): void => {
          const state = readDashboard(dashPath);
          if (state) {
            process.stdout.write('\x1Bc'); // clear screen
            if (opts.json) {
              print(JSON.stringify(state, null, 2));
            } else if (opts.raw) {
              print(formatDashboard(state));
            } else {
              const tasks = loadTaskFiles(root);
              const meta = readSprintMeta(root, state.sprint.id);
              print(formatHumanStatus({
                dashboard: state,
                tasks,
                sprintTitle: meta.title,
                sprintStartedAt: meta.startedAt,
              }));
            }
          }
        };
        render();
        const timer = setInterval(render, 2000);
        const cleanup = (): void => { clearInterval(timer); process.exit(0); };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        return;
      }

      try {
        const rawData = readFileSync(dashPath, 'utf-8');
        const state = JSON.parse(rawData) as DashboardState;
        if (opts.json) {
          print(JSON.stringify(state, null, 2));
        } else if (opts.raw) {
          print(formatDashboard(state));
          // Show agent and skill assignments in raw mode
          const tasks = loadTaskFiles(root);
          if (tasks.length > 0) {
            print(formatAgentAssignments(tasks, !!opts.verbose));
            print(formatSkillAssignments(tasks, !!opts.verbose));
          }
        } else {
          // Human-friendly output (default)
          const tasks = loadTaskFiles(root);
          const meta = readSprintMeta(root, state.sprint.id);
          print(formatHumanStatus({
            dashboard: state,
            tasks,
            sprintTitle: meta.title,
            sprintStartedAt: meta.startedAt,
          }));
          if (opts.verbose) {
            print(formatAgentAssignments(tasks, true));
            print(formatSkillAssignments(tasks, true));
          }
        }
      } catch (error) {
        printError(new Error(getMessage('status.dashboard_read_failed', lang)));
        process.exitCode = 1;
      }
    });
}
