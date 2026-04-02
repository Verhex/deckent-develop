/**
 * Heartbeat Daemon — Proactive task runner
 *
 * Reads `.deckent/HEARTBEAT.md` and executes unchecked tasks periodically.
 * Results are appended to `.brain/heartbeat-log.md`.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { DECKENT_DIR, BRAIN_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';

// ─── Constants ─────────────────────────────────────────────────────

const HEARTBEAT_FILE = 'HEARTBEAT.md';
const HEARTBEAT_LOG = 'heartbeat-log.md';
const PID_FILE = 'heartbeat.pid';

const DEFAULT_HEARTBEAT_TEMPLATE = `# Heartbeat Tasks
- [ ] tsc --noEmit
- [ ] npx vitest run --reporter=verbose 2>&1 | tail -5
`;

// ─── Types ─────────────────────────────────────────────────────────

interface HeartbeatTaskEntry {
  /** The raw line from HEARTBEAT.md */
  line: string;
  /** The shell command to execute */
  command: string;
  /** Whether this task is already completed (checked) */
  done: boolean;
}

export interface HeartbeatRunResult {
  /** Total tasks found in HEARTBEAT.md */
  total: number;
  /** Tasks executed this run */
  executed: number;
  /** Tasks that passed (exit code 0) */
  passed: number;
  /** Tasks that failed (non-zero exit code) */
  failed: number;
  /** Per-task results */
  details: Array<{ command: string; success: boolean; output: string }>;
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Parse HEARTBEAT.md lines into task entries.
 * Lines matching `- [ ] <command>` are pending tasks.
 * Lines matching `- [x] <command>` are completed (skipped).
 */
function parseHeartbeatTasks(content: string): HeartbeatTaskEntry[] {
  const entries: HeartbeatTaskEntry[] = [];
  for (const line of content.split('\n')) {
    const pendingMatch = line.match(/^- \[ \] (.+)$/);
    if (pendingMatch && pendingMatch[1]) {
      entries.push({ line, command: pendingMatch[1].trim(), done: false });
      continue;
    }
    const doneMatch = line.match(/^- \[x\] (.+)$/i);
    if (doneMatch && doneMatch[1]) {
      entries.push({ line, command: doneMatch[1].trim(), done: true });
    }
  }
  return entries;
}

function ensureHeartbeatFile(projectRoot: string): string {
  const filePath = join(projectRoot, DECKENT_DIR, HEARTBEAT_FILE);
  if (!existsSync(filePath)) {
    mkdirSync(join(projectRoot, DECKENT_DIR), { recursive: true });
    writeFileSync(filePath, DEFAULT_HEARTBEAT_TEMPLATE, 'utf-8');
  }
  return filePath;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

// ─── Core ──────────────────────────────────────────────────────────

/**
 * Execute a single heartbeat cycle: read tasks, run pending ones, log results.
 */
export function runHeartbeat(projectRoot: string): HeartbeatRunResult {
  const heartbeatPath = ensureHeartbeatFile(projectRoot);
  const content = readFileSync(heartbeatPath, 'utf-8');
  const tasks = parseHeartbeatTasks(content);

  const pendingTasks = tasks.filter(t => !t.done);
  const result: HeartbeatRunResult = {
    total: tasks.length,
    executed: 0,
    passed: 0,
    failed: 0,
    details: [],
  };

  const logPath = join(projectRoot, BRAIN_DIR, HEARTBEAT_LOG);
  mkdirSync(join(projectRoot, BRAIN_DIR), { recursive: true });

  const timestamp = formatTimestamp();
  appendFileSync(logPath, `\n## Heartbeat — ${timestamp}\n\n`, 'utf-8');

  for (const task of pendingTasks) {
    result.executed++;
    let output = '';
    let success = false;

    try {
      output = execSync(task.command, {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 120_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      success = true;
      result.passed++;
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      output = execErr.stdout ?? execErr.stderr ?? execErr.message ?? 'Unknown error';
      result.failed++;
      debugLog('heartbeat-daemon', err);
    }

    const statusIcon = success ? '✅' : '❌';
    const truncatedOutput = output.length > 500 ? output.slice(-500) : output;
    appendFileSync(
      logPath,
      `- ${statusIcon} \`${task.command}\`\n\`\`\`\n${truncatedOutput.trim()}\n\`\`\`\n\n`,
      'utf-8',
    );

    result.details.push({ command: task.command, success, output: truncatedOutput.trim() });
  }

  return result;
}

// ─── Daemon ────────────────────────────────────────────────────────

export class HeartbeatDaemon {
  private readonly projectRoot: string;
  private readonly intervalMinutes: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(projectRoot: string, intervalMinutes: number = 30) {
    this.projectRoot = projectRoot;
    this.intervalMinutes = intervalMinutes;
  }

  /** Start the daemon loop. Runs an immediate heartbeat then repeats on interval. */
  start(): HeartbeatRunResult {
    const firstResult = runHeartbeat(this.projectRoot);

    this.timer = setInterval(() => {
      try {
        runHeartbeat(this.projectRoot);
      } catch (err: unknown) {
        debugLog('heartbeat-daemon-interval', err);
      }
    }, this.intervalMinutes * 60_000);

    // Write PID file so --stop can find the process
    this.writePidFile();

    return firstResult;
  }

  /** Stop the daemon loop. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.removePidFile();
  }

  /** Check if the daemon timer is active. */
  get running(): boolean {
    return this.timer !== null;
  }

  private writePidFile(): void {
    const pidPath = join(this.projectRoot, DECKENT_DIR, PID_FILE);
    try {
      writeFileSync(pidPath, String(process.pid), 'utf-8');
    } catch {
      /* best-effort */
    }
  }

  private removePidFile(): void {
    const pidPath = join(this.projectRoot, DECKENT_DIR, PID_FILE);
    try {
      if (existsSync(pidPath)) unlinkSync(pidPath);
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Read PID from heartbeat.pid file. Returns null if not found or stale.
 */
export function readDaemonPid(projectRoot: string): number | null {
  const pidPath = join(projectRoot, DECKENT_DIR, PID_FILE);
  if (!existsSync(pidPath)) return null;
  try {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    if (isNaN(pid)) return null;
    // Check if process is alive
    process.kill(pid, 0);
    return pid;
  } catch {
    // Process not running or permission denied — remove stale PID
    try {
      unlinkSync(pidPath);
    } catch { /* ignore */ }
    return null;
  }
}

/**
 * Stop a running daemon by sending SIGTERM to the PID in heartbeat.pid.
 * Returns true if a process was signaled, false if none found.
 */
export function stopDaemonByPid(projectRoot: string): boolean {
  const pid = readDaemonPid(projectRoot);
  if (pid === null) return false;
  try {
    process.kill(pid, 'SIGTERM');
    // Remove PID file
    const pidPath = join(projectRoot, DECKENT_DIR, PID_FILE);
    if (existsSync(pidPath)) unlinkSync(pidPath);
    return true;
  } catch {
    return false;
  }
}
