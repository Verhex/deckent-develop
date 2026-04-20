// ─── StatusRenderer — Box-Drawing TUI for `status --follow` ─────────
// Sprint 145 — Task 145-012 (base) + Task 145-018 (polish)
//
// Reads dashboard state + task files + config to render a live-updating
// box-drawing status UI. Backend-aware header (Docker/Tmux/Subprocess).
//
// Polish features (Task 145-018):
//   - Phase color coding (PLAN gray, EXECUTE blue, EVALUATE yellow, RETRO green)
//   - Worker status icon: 🟢 healthy / 🟡 warn / 🔴 stale
//   - Recent events icon map: ✅ RESULT-DONE, 🔁 SPAWN, ❌ NO_GO, ⚠ ALERT, 🔵 NOTIFY
//   - Progress bar gradient (filled region colored)
//   - Partial redraw — only changed lines redrawn
//   - Terminal width responsive — ASCII fallback below 60 cols
//   - Cost color: <50% green, 50-80% yellow, >80% red

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DASHBOARD_FILE, TASKS_DIR, DECKENT_DIR } from '../../core/constants.js';
import type { DashboardState, Task, AgentInfo } from '../../core/types.js';
import { AgentStatus } from '../../core/types.js';
import { clearScreen as ansiClearScreen, cursorTo, clearLine, color } from './ansi.js';

// ─── Types ──────────────────────────────────────────────────────────

interface RendererConfig {
  projectRoot: string;
  noColor?: boolean;
  /** Override terminal width (for testing). Defaults to process.stdout.columns */
  terminalWidth?: number;
}

interface SprintConfig {
  spawn_backend?: string;
  sprint_started_at?: string;
  max_workers?: number;
  sprint_hard_timeout?: number;
}

export interface RecentEvent {
  type: string;
  message: string;
  timestamp: string;
}

// ─── Box Drawing (Unicode vs ASCII fallback) ─────────────────────────

function getBoxWidth(terminalWidth: number): number {
  // Leave 2 chars for border + 1 char margin
  const maxWidth = Math.max(20, terminalWidth - 3);
  return Math.min(70, maxWidth);
}

function isUnicode(terminalWidth: number): boolean {
  return terminalWidth >= 60;
}

// ─── Phase Color ─────────────────────────────────────────────────────

export function phaseColor(phase: string, noColor: boolean): string {
  if (noColor) return phase;
  switch (phase) {
    case 'PLAN':      return color.gray(phase);
    case 'SPAWN':     return color.cyan(phase);
    case 'EXECUTE':   return color.blue(phase);
    case 'EVALUATE':  return color.yellow(phase);
    case 'FIX':       return color.yellow(phase);
    case 'RETRO':     return color.green(phase);
    case 'DECAY':     return color.dim(phase);
    case 'COMPLETE':  return color.green(phase);
    default:          return color.dim(phase);
  }
}

// ─── Worker Health Icon ───────────────────────────────────────────────

export function workerHealthIcon(agent: AgentInfo, now: Date = new Date()): string {
  if (!agent.lastHeartbeat) return '🔴';
  const ms = now.getTime() - new Date(agent.lastHeartbeat).getTime();
  if (ms < 2 * 60 * 1000)  return '🟢'; // < 2min: healthy
  if (ms < 5 * 60 * 1000)  return '🟡'; // 2-5min: warn
  return '🔴';                           // > 5min: stale
}

// ─── Recent Events Icon Map ───────────────────────────────────────────

export function eventIcon(eventType: string): string {
  const upper = eventType.toUpperCase();
  if (upper.includes('RESULT') && upper.includes('DONE')) return '✅';
  if (upper === 'SPAWN' || upper.includes('SPAWN'))       return '🔁';
  if (upper.includes('NO_GO') || upper.includes('NOGO'))  return '❌';
  if (upper.includes('ALERT'))                            return '⚠️';
  if (upper.includes('NOTIFY'))                           return '🔵';
  return '•';
}

// ─── Cost Color ──────────────────────────────────────────────────────

export function costColor(pct: number, text: string, noColor: boolean): string {
  if (noColor) return text;
  if (pct < 50) return color.green(text);
  if (pct < 80) return color.yellow(text);
  return color.red(text);
}

// ─── Progress Bar ─────────────────────────────────────────────────────

export function progressBar(
  done: number,
  total: number,
  width: number = 20,
  noColor: boolean = false,
): string {
  if (total === 0) return '░'.repeat(width);
  const ratio = Math.min(1, done / total);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const pct = Math.round(ratio * 100);
  const filledChars = '█'.repeat(filled);
  const emptyChars = '░'.repeat(empty);

  const coloredFilled = noColor
    ? filledChars
    : pct >= 80
      ? color.yellow(filledChars)
      : color.green(filledChars);

  return `${coloredFilled}${emptyChars}  ${done}/${total} (${pct}%)`;
}

// ─── Helpers ────────────────────────────────────────────────────────

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function pad(content: string, width: number): string {
  const stripped = stripAnsi(content);
  const padding = Math.max(0, width - stripped.length);
  return `${content}${' '.repeat(padding)}`;
}

function backendIcon(backend?: string): string {
  switch (backend) {
    case 'docker': return '🐳 Docker';
    case 'tmux': return '📟 Tmux';
    case 'subprocess': return '⚙️  Subprocess';
    default: return '🔧 Auto';
  }
}

function elapsed(startedAt?: string): string {
  if (!startedAt) return '?';
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 0) return '0m';
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatWorker(agent: AgentInfo, now: Date): string {
  const healthIcon = workerHealthIcon(agent, now);
  const taskId = agent.taskId ?? '—';
  return `${healthIcon} ${agent.id}: ${taskId}`;
}

// ─── StatusRenderer Class ───────────────────────────────────────────

export class StatusRenderer {
  private config: RendererConfig;
  private lastRenderLines: string[] = [];

  constructor(config: RendererConfig) {
    this.config = config;
  }

  /**
   * Resolve terminal width (respects override for testing).
   */
  private getTerminalWidth(): number {
    return this.config.terminalWidth ?? process.stdout.columns ?? 80;
  }

  /**
   * Build a box line for the current terminal width mode.
   */
  private boxLine(content: string, boxWidth: number, unicode: boolean): string {
    const padded = pad(content, boxWidth - 2);
    if (unicode) {
      return `│ ${padded} │`;
    } else {
      return `| ${padded} |`;
    }
  }

  /**
   * Read current state and render a full box-drawing snapshot.
   * Returns the rendered string (does NOT write to stdout).
   */
  snapshot(events: RecentEvent[] = [], now: Date = new Date()): string {
    const { noColor } = this.config;
    const dashboard = this.readDashboard();
    const tasks = this.readTasks();
    const sprintConfig = this.readSprintConfig();

    const termWidth = this.getTerminalWidth();
    const unicode = isUnicode(termWidth);
    const BOX_WIDTH = getBoxWidth(termWidth);

    const TOP    = unicode ? `╭${'─'.repeat(BOX_WIDTH)}╮` : `+${'-'.repeat(BOX_WIDTH)}+`;
    const BOTTOM = unicode ? `╰${'─'.repeat(BOX_WIDTH)}╯` : `+${'-'.repeat(BOX_WIDTH)}+`;
    const SEP    = unicode ? `├${'─'.repeat(BOX_WIDTH)}┤` : `+${'-'.repeat(BOX_WIDTH)}+`;
    const bl = (content: string) => this.boxLine(content, BOX_WIDTH, unicode);

    const lines: string[] = [];

    // ── Section 1: Header ──
    const sprintId = dashboard?.sprint.id ?? this.detectSprintId(tasks) ?? 'unknown';
    const phase = dashboard?.sprint.phase ?? 'IDLE';
    const phaseStr = phaseColor(String(phase), noColor ?? false);
    const backend = backendIcon(sprintConfig.spawn_backend);
    const workerCount = dashboard?.agents.length ?? 0;

    lines.push(TOP);
    lines.push(bl(`🚀 ${sprintId} — ${phaseStr} phase · ${backend} · ${workerCount} workers`));
    lines.push(SEP);

    // ── Section 2: Progress ──
    const done = dashboard?.progress.done ?? tasks.filter(t => t.status === 'DONE').length;
    const total = dashboard?.progress.total ?? tasks.length;
    const bar = progressBar(done, total, 20, noColor ?? false);
    const elapsedStr = elapsed(sprintConfig.sprint_started_at);
    const hardCap = sprintConfig.sprint_hard_timeout
      ? `${Math.round(sprintConfig.sprint_hard_timeout / 60_000)}m`
      : '—';

    lines.push(bl(`📊 Progress: ${bar}`));
    lines.push(bl(`⏱  Elapsed: ${elapsedStr} · Hard cap: ${hardCap}`));
    lines.push(SEP);

    // ── Section 3: Active Workers ──
    const agents = dashboard?.agents ?? [];
    const activeAgents = agents.filter(a => a.status !== AgentStatus.IDLE);
    if (activeAgents.length > 0) {
      lines.push(bl(`👷 Active Workers (${activeAgents.length}):`));
      for (const agent of activeAgents.slice(0, 5)) {
        lines.push(bl(`   ${formatWorker(agent, now)}`));
      }
      if (activeAgents.length > 5) {
        lines.push(bl(`   ... and ${activeAgents.length - 5} more`));
      }
    } else {
      lines.push(bl('👷 Active Workers: none'));
    }
    lines.push(SEP);

    // ── Section 4: Recent Events ──
    if (events.length > 0) {
      lines.push(bl(`📝 Recent Events (${events.length}):`));
      for (const ev of events.slice(-5)) {
        const icon = eventIcon(ev.type);
        lines.push(bl(`   ${icon} ${ev.type}: ${ev.message}`));
      }
    } else {
      lines.push(bl('📝 Recent Events: none'));
    }
    lines.push(SEP);

    // ── Section 5: Footer (Alerts / NO_GO) ──
    const alertCount = dashboard?.alerts.length ?? 0;
    const noGoCount = tasks.filter(t => t.status === 'NO_GO').length;
    lines.push(bl(`⚠  Alerts: ${alertCount} · 🎯 NO_GO: ${noGoCount}`));
    lines.push(BOTTOM);

    const output = lines.join('\n');
    return (noColor ?? false) ? stripAnsi(output) : output;
  }

  /**
   * Render cost indicator with appropriate color.
   */
  renderCost(usedPct: number, label: string): string {
    return costColor(usedPct, label, this.config.noColor ?? false);
  }

  /**
   * Clear screen and write new content to stdout.
   */
  redraw(content: string): void {
    process.stdout.write(ansiClearScreen() + content);
  }

  /**
   * Partial redraw — only write lines that changed since last render.
   * Uses cursor positioning to avoid full screen flicker.
   * Returns the number of lines redrawn.
   */
  partialRedraw(content: string): number {
    const nextLines = content.split('\n');
    const prevLines = this.lastRenderLines;

    if (prevLines.length === 0) {
      // First render: full write
      process.stdout.write(ansiClearScreen() + content);
      this.lastRenderLines = nextLines;
      return nextLines.length;
    }

    let redrawnCount = 0;
    const maxLen = Math.max(prevLines.length, nextLines.length);

    for (let i = 0; i < maxLen; i++) {
      const prev = prevLines[i] ?? '';
      const next = nextLines[i] ?? '';
      if (prev !== next) {
        // Move cursor to line i (0-indexed row), col 0
        process.stdout.write(cursorTo(0, i) + clearLine() + next);
        redrawnCount++;
      }
    }

    this.lastRenderLines = nextLines;
    return redrawnCount;
  }

  /**
   * Reset partial redraw state (call when doing a full redraw).
   */
  resetRedrawState(): void {
    this.lastRenderLines = [];
  }

  // ── Private readers ───────────────────────────────────────────────

  private readDashboard(): DashboardState | null {
    const dashPath = join(this.config.projectRoot, DASHBOARD_FILE);
    if (!existsSync(dashPath)) return null;
    try {
      return JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
    } catch {
      return null;
    }
  }

  private readTasks(): Task[] {
    const tasksDir = join(this.config.projectRoot, TASKS_DIR);
    if (!existsSync(tasksDir)) return [];
    const files = readdirSync(tasksDir).filter(
      f => f.startsWith('task-') && f.endsWith('.json'),
    );
    const tasks: Task[] = [];
    for (const f of files) {
      try {
        tasks.push(JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as Task);
      } catch {
        // skip malformed
      }
    }
    return tasks;
  }

  private readSprintConfig(): SprintConfig {
    const configPath = join(this.config.projectRoot, DECKENT_DIR, 'config.json');
    if (!existsSync(configPath)) return {};
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8')) as SprintConfig;
    } catch {
      return {};
    }
  }

  private detectSprintId(tasks: Task[]): string | undefined {
    for (const t of tasks) {
      if (t.sprintId) return t.sprintId;
    }
    return undefined;
  }
}
