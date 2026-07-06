import { readFileSync, existsSync, readdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DashboardState, Task } from '../../core/types.js';
import { DASHBOARD_FILE, TASKS_DIR, DECKENT_DIR } from '../../core/constants.js';
import { print, printError, formatDashboard, formatTable, formatHumanStatus, formatStandaloneStatus, isNoColor, stripAnsi , isDashboardOrphaned } from '../helpers/output.js';
import type { CIBaseline, CIReport } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { getCurrentSprintId } from '../../monitor/sprint-state.js';
import { formatStatus, resolveOutputMode } from '../../core/output-formatter.js';
import { eventBus } from '../../orchestra/event-bus.js';
import { StatusRenderer } from '../helpers/status-renderer.js';
import { readPendingApprovals } from '../../core/pending-approvals.js';
import { hideCursor, showCursor, clearScreen } from '../helpers/ansi.js';

interface StatusOpts {
  watch?: boolean;
  follow?: boolean;
  json?: boolean;
  verbose?: boolean;
  raw?: boolean;
  noColor?: boolean;
  graph?: boolean;
  mode?: string;
}

/**
 * Load Mermaid dependency graph from disk.
 * File-system based to avoid ADR-008 import cycle (status.ts must not import orchestra/).
 * Returns null if no persisted graph exists.
 */
export function loadDepGraphForSprint(root: string, sprintId: string): string | null {
  const mmdPath = join(root, DECKENT_DIR, `${sprintId}-depgraph.mmd`);
  if (!existsSync(mmdPath)) return null;
  try {
    return readFileSync(mmdPath, 'utf-8');
  } catch {
    return null;
  }
}

interface SprintMeta {
  title?: string;
  startedAt?: string;
}

function readCIData(root: string, sprintId?: string): { baseline?: CIBaseline; report?: CIReport } {
  let baseline: CIBaseline | undefined;
  const baselinePath = join(root, '.deckent', 'ci-baseline.json');
  if (existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as CIBaseline;
    } catch { /* ignore malformed */ }
  }

  let report: CIReport | undefined;
  if (sprintId) {
    const reportPath = join(root, '.brain', `ci-report-${sprintId}.json`);
    if (existsSync(reportPath)) {
      try {
        report = JSON.parse(readFileSync(reportPath, 'utf-8')) as CIReport;
      } catch { /* ignore malformed */ }
    }
  }

  return { baseline, report };
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

/**
 * Read and format the Worker Comms section for `deckent status`.
 * Returns null when worker_comms is disabled or config is unreadable (section hidden, no regression).
 * File-system based to avoid ADR-008 import cycle (matches loadDepGraphForSprint pattern).
 */
export function buildWorkerCommsSection(root: string, lang: string): string | null {
  // Check config — only render when worker_comms.enabled = true
  try {
    const configPath = join(root, '.deckent', 'config.json');
    if (!existsSync(configPath)) return null;
    const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { worker_comms?: { enabled?: boolean } };
    if (!cfg.worker_comms?.enabled) return null;
  } catch {
    return null;
  }

  // Read shared memory entries from .tasks/shared/*.json
  const sharedDir = join(root, '.tasks', 'shared');
  const sharedEntries: Array<{ key: string; writerId: string }> = [];
  if (existsSync(sharedDir)) {
    try {
      const files = readdirSync(sharedDir).filter(f => typeof f === 'string' && (f as string).endsWith('.json'));
      for (const file of files) {
        try {
          const raw = JSON.parse(readFileSync(join(sharedDir, file as string), 'utf-8')) as {
            writerId?: unknown; writtenAt?: string; ttlMs?: number;
          };
          if (!raw?.writerId || typeof raw.writerId !== 'string') continue;
          if (raw.ttlMs !== undefined && raw.writtenAt) {
            const age = Date.now() - new Date(raw.writtenAt).getTime();
            if (age > raw.ttlMs) continue;
          }
          sharedEntries.push({ key: (file as string).replace(/\.json$/, ''), writerId: raw.writerId });
        } catch { /* skip malformed */ }
      }
    } catch { /* ignore dir read error */ }
  }

  // Read handoff counts from .tasks/handoffs/*.json
  const handoffsDir = join(root, '.tasks', 'handoffs');
  let pending = 0, executed = 0;
  if (existsSync(handoffsDir)) {
    try {
      const files = readdirSync(handoffsDir).filter(f => typeof f === 'string' && (f as string).endsWith('.json'));
      for (const file of files) {
        try {
          const h = JSON.parse(readFileSync(join(handoffsDir, file as string), 'utf-8')) as { status?: string };
          if (h?.status === 'pending') pending++;
          else executed++;
        } catch { /* skip malformed */ }
      }
    } catch { /* ignore dir read error */ }
  }

  // Format section
  const lines: string[] = [];
  lines.push(getMessage('status.worker_comms.header', lang));
  if (sharedEntries.length === 0) {
    lines.push('  ' + getMessage('status.worker_comms.no_shared', lang));
  } else {
    lines.push('  ' + getMessage('status.worker_comms.shared_keys', lang).replace('{count}', String(sharedEntries.length)));
    for (const e of sharedEntries.slice(-5)) {
      lines.push(`    - ${e.key} (by ${e.writerId})`);
    }
  }
  const totalHandoffs = pending + executed;
  if (totalHandoffs > 0) {
    lines.push(
      '  ' + getMessage('status.worker_comms.handoffs', lang)
        .replace('{pending}', String(pending))
        .replace('{executed}', String(executed)),
    );
  }
  return lines.join('\n');
}

/**
 * W4 — render the cross-surface "Pending approvals" section from the durable hub
 * (readPendingApprovals). Independent of sprint state: a parked nervous approval
 * surfaces in `deckent status` with the EXACT accept command, so the operator
 * never has to guess what to run. Returns null when nothing is parked.
 */
export function buildPendingApprovalsSection(root: string, lang: string): string | null {
  const pending = readPendingApprovals(root);
  if (pending.length === 0) return null;
  const lines: string[] = [getMessage('status.pending_approvals.header', lang, { count: String(pending.length) })];
  for (const p of pending.slice(0, 5)) {
    lines.push(`  ⏳ ${p.title}  →  ${p.acceptCommand}`);
  }
  if (pending.length > 5) {
    lines.push('  ' + getMessage('status.pending_approvals.more', lang, { count: String(pending.length - 5) }));
  }
  return lines.join('\n');
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show the current sprint dashboard')
    .option('--watch', 'Auto-refresh every 2 seconds')
    .option('-f, --follow', 'Follow mode: snapshot + live event tail')
    .option('--json', 'Output raw JSON instead of formatted dashboard')
    .option('--raw', 'Show legacy raw dashboard (box format)')
    .option('--verbose', 'Show detailed agent and skill assignment info')
    .option('--no-color', 'Disable colored output')
    .option('--graph', 'Display dependency graph as Mermaid diagram')
    .option('--mode <mode>', 'Output render mode: explainatory | standart | verbose | json')
    .action((opts: StatusOpts) => {
      const root = resolveProjectRoot();
      const dashPath = join(root, DASHBOARD_FILE);
      const lang = getLangFromRoot(root);

      // --follow: live event-driven refresh using EventBus
      if (opts.follow) {
        const renderer = new StatusRenderer({
          projectRoot: root,
          noColor: opts.noColor ?? isNoColor(),
        });

        const sprintId = getCurrentSprintId(root);

        // Initial render
        process.stdout.write(hideCursor() + clearScreen());
        const initial = renderer.snapshot();
        process.stdout.write(initial);

        // Subscribe to event bus for live updates
        let unsubscribe: (() => void) | undefined;
        if (sprintId) {
          // Start watching the JSONL event file for cross-process events
          eventBus.watchFile(root, sprintId);

          unsubscribe = eventBus.subscribe(sprintId, undefined, () => {
            const next = renderer.snapshot();
            renderer.redraw(next);
          });
        }

        // Also poll as fallback (in case events are missed)
        const fallbackTimer = setInterval(() => {
          const next = renderer.snapshot();
          renderer.redraw(next);
        }, 5000);

        const cleanup = (): void => {
          unsubscribe?.();
          eventBus.unwatchAll();
          clearInterval(fallbackTimer);
          process.stdout.write(showCursor() + '\n');
          process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        return;
      }

      // --graph: display Mermaid dependency graph (reads .deckent/sprint-NNN-depgraph.mmd)
      // Checked before dashboard existence so it works even when no dashboard is active.
      if (opts.graph) {
        const sprintId = getCurrentSprintId(root);
        if (!sprintId) {
          output('No active sprint found — cannot display dependency graph.');
          return;
        }
        const mmd = loadDepGraphForSprint(root, sprintId);
        if (!mmd) {
          output(`No dependency graph found for ${sprintId}.\nRun a sprint with dependencies to generate the graph.`);
          return;
        }
        output(`\n--- Dependency Graph (${sprintId}) ---\n`);
        output(mmd);
        output('\n--- End of Dependency Graph ---');
        return;
      }

      // (A) Standalone mode: if no dashboard, try task files
      if (!existsSync(dashPath)) {
        const tasks = loadTaskFiles(root);
        if (tasks.length > 0) {
          // Use canonical sprint-state.json as source of truth; fall back to task file scan
          const sprintId = getCurrentSprintId(root) ?? detectSprintId(tasks);
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
            const commsStandalone = buildWorkerCommsSection(root, lang);
            if (commsStandalone) output(commsStandalone);
          }
          return;
        }
        print(getMessage('status.no_active_sprint', lang));
        const pendingNoSprint = buildPendingApprovalsSection(root, lang);
        if (pendingNoSprint) print(pendingNoSprint);
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
              const ci = readCIData(root, state.sprint.id);
              output(formatHumanStatus({
                dashboard: state,
                tasks,
                sprintTitle: meta.title,
                sprintStartedAt: meta.startedAt,
                projectRoot: root,
                verbose: opts.verbose,
                ciBaseline: ci.baseline,
                ciReport: ci.report,
              }));
              const commsWatch = buildWorkerCommsSection(root, lang);
              if (commsWatch) output(commsWatch);
              const pendingWatch = buildPendingApprovalsSection(root, lang);
              if (pendingWatch) output(pendingWatch);
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
        // ─── W0-TRUTH (#491) orphan-gate ─────────────────────────────
        // Crash-case: an ACTIVE-shaped .dashboard whose writer died must not be
        // presented as live. Stale + no live sprint + no task files → honest
        // no-sprint view (the COMPLETE case is handled inside formatHumanStatus).
        if (!opts.json && !opts.raw && isDashboardOrphaned(state, {
          hasLiveSprint: getCurrentSprintId(root) !== null,
          hasTasks: loadTaskFiles(root).length > 0,
          nowMs: Date.now(),
        })) {
          print(getMessage('status.no_active_sprint', lang));
          const pendingOrphan = buildPendingApprovalsSection(root, lang);
          if (pendingOrphan) print(pendingOrphan);
          return;
        }
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
          const ci = readCIData(root, state.sprint.id);

          // --mode flag: use output-formatter if mode is specified
          if (opts.mode) {
            const resolvedMode = resolveOutputMode(opts.mode);
            const formatterData = {
              sprintId: state.sprint.id,
              phase: state.sprint.phase as string | undefined,
              totalTasks: state.progress?.total ?? tasks.length,
              completedTasks: state.progress?.done ?? 0,
              failedTasks: tasks.filter(t => (t.status as string) === 'NO_GO').length,
              techDebtTasks: tasks.filter(t => ((t as unknown as Record<string, unknown>)['evaluationDecision'] as string) === 'GO_WITH_TECH_DEBT').length,
              activeWorkers: state.agents?.length ?? 0,
            };
            output(formatStatus(formatterData, resolvedMode));
            if (opts.verbose) {
              output(formatAgentAssignments(tasks, true));
              output(formatSkillAssignments(tasks, true));
            }
            const commsMode = buildWorkerCommsSection(root, lang);
            if (commsMode) output(commsMode);
          } else {
            output(formatHumanStatus({
              dashboard: state,
              tasks,
              sprintTitle: meta.title,
              sprintStartedAt: meta.startedAt,
              projectRoot: root,
              verbose: opts.verbose,
              ciBaseline: ci.baseline,
              ciReport: ci.report,
            }));
            if (opts.verbose) {
              output(formatAgentAssignments(tasks, true));
              output(formatSkillAssignments(tasks, true));
            }
            const commsDefault = buildWorkerCommsSection(root, lang);
            if (commsDefault) output(commsDefault);
            const pendingDefault = buildPendingApprovalsSection(root, lang);
            if (pendingDefault) output(pendingDefault);
          }
        }
      } catch (error) {
        printError(new Error(getMessage('status.dashboard_read_failed', lang)));
        process.exitCode = 1;
      }
    });
}
