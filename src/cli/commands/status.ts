import { readFileSync, existsSync, readdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DashboardState, Task } from '../../core/types.js';
import { DASHBOARD_FILE, TASKS_DIR } from '../../core/constants.js';
import { print, printError, formatDashboard, formatTable, formatHumanStatus, formatStandaloneStatus, isNoColor, stripAnsi } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';

interface StatusOpts {
  watch?: boolean;
  json?: boolean;
  verbose?: boolean;
  raw?: boolean;
  noColor?: boolean;
}

interface SprintMeta {
  title?: string;
  startedAt?: string;
}

function readSprintMeta(root: string, _sprintId: string): SprintMeta {
  const result: SprintMeta = {};

  // Extract title from DIRECTIVES.md — tolerant regex
  try {
    const directivesPath = join(root, 'DIRECTIVES.md');
    if (existsSync(directivesPath)) {
      const content = readFileSync(directivesPath, 'utf-8');
      // Match various formats:
      // # DIRECTIVES — Sprint 040 (Title)
      // # DIRECTIVES — Sprint 040: Title
      // # DIRECTIVES: Sprint 040 — Title
      // # Sprint 040 — Title
      const titleMatch = content.match(
        /^#\s+(?:DIRECTIVES\s*[—:\-]\s*)?Sprint\s+\d+\s*[—:(]\s*([^)\n]+)/m,
      );
      if (titleMatch?.[1]) {
        result.title = titleMatch[1].replace(/\)\s*$/, '').trim();
      }
    }
  } catch {
    // ignore
  }

  // Read startedAt from config
  try {
    const configPath = join(root, '.deckent', 'config.json');
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { sprint_started_at?: string };
      if (cfg.sprint_started_at) {
        result.startedAt = cfg.sprint_started_at;
      }
    }
  } catch {
    // ignore
  }

  return result;
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

/**
 * Detect sprint ID from task files when no dashboard is available.
 */
function detectSprintId(tasks: Task[]): string | undefined {
  for (const t of tasks) {
    if (t.sprintId) return t.sprintId;
  }
  return undefined;
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

/** Output helper that respects NO_COLOR */
function output(message: string): void {
  print(isNoColor() ? stripAnsi(message) : message);
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show the current sprint dashboard')
    .option('--watch', 'Auto-refresh every 2 seconds')
    .option('--json', 'Output raw JSON instead of formatted dashboard')
    .option('--raw', 'Show legacy raw dashboard (box format)')
    .option('--verbose', 'Show detailed agent and skill assignment info')
    .option('--no-color', 'Disable colored output')
    .action((opts: StatusOpts) => {
      const root = resolveProjectRoot();
      const dashPath = join(root, DASHBOARD_FILE);
      const lang = getLangFromRoot(root);

      // (A) Standalone mode: if no dashboard, try task files
      if (!existsSync(dashPath)) {
        const tasks = loadTaskFiles(root);
        if (tasks.length > 0) {
          const sprintId = detectSprintId(tasks);
          if (opts.json) {
            const standaloneData = {
              standalone: true,
              sprintId,
              tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status, model: t.model })),
              ...(opts.verbose ? { agents: tasks.map(t => ({ taskId: t.id, agent: t.assignedAgent ?? 'generic', skills: t.assignedSkills ?? [] })) } : {}),
            };
            output(JSON.stringify(standaloneData, null, 2));
          } else {
            output(formatStandaloneStatus(tasks, sprintId));
          }
          return;
        }
        print(getMessage('status.no_active_sprint', lang));
        return;
      }

      if (opts.watch) {
        const render = (): void => {
          const state = readDashboard(dashPath);
          if (state) {
            process.stdout.write('\x1Bc'); // clear screen
            if (opts.json) {
              const jsonData = opts.verbose
                ? { ...state, _verbose: { agents: loadTaskFiles(root).map(t => ({ id: t.id, agent: t.assignedAgent, skills: t.assignedSkills })) } }
                : state;
              output(JSON.stringify(jsonData, null, 2));
            } else if (opts.raw) {
              output(formatDashboard(state));
            } else {
              const tasks = loadTaskFiles(root);
              const meta = readSprintMeta(root, state.sprint.id);
              output(formatHumanStatus({
                dashboard: state,
                tasks,
                sprintTitle: meta.title,
                sprintStartedAt: meta.startedAt,
                projectRoot: root,
                verbose: opts.verbose,
              }));
            }
          }
        };
        render();

        // (D) Use fs.watch when available, fallback to setInterval
        let cleanup: () => void;
        try {
          const watcher = watch(dashPath, { persistent: true }, () => {
            render();
          });
          // Also set a fallback interval for resilience
          const timer = setInterval(render, 5000);
          cleanup = (): void => {
            watcher.close();
            clearInterval(timer);
            process.exit(0);
          };
        } catch {
          // Fallback to polling if fs.watch fails
          const timer = setInterval(render, 2000);
          cleanup = (): void => { clearInterval(timer); process.exit(0); };
        }
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        return;
      }

      try {
        const rawData = readFileSync(dashPath, 'utf-8');
        const state = JSON.parse(rawData) as DashboardState;
        if (opts.json) {
          // (E) --json + --verbose: include agent/skill info
          const tasks = loadTaskFiles(root);
          const jsonData = opts.verbose
            ? { ...state, _verbose: { agents: tasks.map(t => ({ id: t.id, agent: t.assignedAgent ?? 'generic', skills: t.assignedSkills ?? [] })) } }
            : state;
          output(JSON.stringify(jsonData, null, 2));
        } else if (opts.raw) {
          output(formatDashboard(state));
          // Show agent and skill assignments in raw mode
          const tasks = loadTaskFiles(root);
          if (tasks.length > 0) {
            output(formatAgentAssignments(tasks, !!opts.verbose));
            output(formatSkillAssignments(tasks, !!opts.verbose));
          }
        } else {
          // Human-friendly output (default)
          const tasks = loadTaskFiles(root);
          const meta = readSprintMeta(root, state.sprint.id);
          output(formatHumanStatus({
            dashboard: state,
            tasks,
            sprintTitle: meta.title,
            sprintStartedAt: meta.startedAt,
            projectRoot: root,
            verbose: opts.verbose,
          }));
          if (opts.verbose) {
            output(formatAgentAssignments(tasks, true));
            output(formatSkillAssignments(tasks, true));
          }
        }
      } catch (error) {
        printError(new Error(getMessage('status.dashboard_read_failed', lang)));
        process.exitCode = 1;
      }
    });
}
