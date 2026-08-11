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
import { isPidAlive } from '../core/pid-liveness.js';
import { debugLog } from '../core/utils.js';
import { ValidationError } from '../core/validators.js';

// ─── Constants ─────────────────────────────────────────────────────

const HEARTBEAT_FILE = 'HEARTBEAT.md';
const HEARTBEAT_LOG = 'heartbeat-log.md';
const PID_FILE = 'heartbeat.pid';

/** Whitelist of allowed base commands for heartbeat execution */
const ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
  'ps', 'kill', 'wait', 'uptime', 'date',
  'tsc', 'npx', 'node', 'npm',
]);

/** Shell metacharacters that indicate injection attempts */
const SHELL_METACHAR_REGEX = /[;&|`$()]/;

/** Maximum timeout for heartbeat command execution (5 seconds) */
const HEARTBEAT_EXEC_TIMEOUT = 5_000;

/**
 * Recorded in place of a successful command's output when that command printed
 * nothing. A quiet tool (`tsc --noEmit` over a clean tree) exiting 0 with no
 * output is a *pass*, and must never be logged as an empty block that reads
 * like a lost or truncated run.
 */
export const EMPTY_SUCCESS_OUTPUT = '(no output — exit 0)';

/**
 * Default `HEARTBEAT.md` contents, written by {@link ensureHeartbeatFile} when
 * the file is absent.
 *
 * CONTRACT — every command here MUST pass {@link validateCommand}. The guard
 * rejects the shell metacharacters `;&|\`$()` because these strings are handed
 * to a real shell by `execSync`, so the template carries no pipes, no
 * redirections, no `&&`, and no command substitution. Two omissions are
 * deliberate:
 *
 * - No `| tail -5`. Truncation is already the runner's job (see the
 *   {@link runHeartbeat} log write), and a pipe would report the *last* stage's
 *   exit code — `tail` always succeeds — so a failing check would be recorded
 *   as a pass.
 * - No `2>&1`. {@link runHeartbeat} merges stderr into the recorded output on
 *   failure, so the redirect buys nothing and only trips the guard.
 *
 * `npx tsc` rather than a bare `tsc`: npx resolves the workspace-local binary
 * identically on macOS, Linux, and Windows, whereas a bare `tsc` silently
 * depends on a global install.
 */
export const DEFAULT_HEARTBEAT_TEMPLATE = `# Heartbeat Tasks
- [ ] npx tsc --noEmit
- [ ] npx vitest run --reporter=verbose
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
export function parseHeartbeatTasks(content: string): HeartbeatTaskEntry[] {
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

// ─── Command Validation ───────────────────────────────────────────

/**
 * Validates a command string before execution.
 * - Rejects empty commands and null bytes
 * - Rejects shell metacharacters that enable injection (;&|`$())
 * - Extracts the base command and checks it against ALLOWED_COMMANDS whitelist
 *
 * @param command - The raw command string from HEARTBEAT.md
 * @returns The validated command string (unchanged)
 * @throws {ValidationError} If the command fails any security check
 */
export function validateCommand(command: string): string {
  if (!command || command.trim().length === 0) {
    throw new ValidationError('Heartbeat command cannot be empty', 'INVALID_COMMAND');
  }

  if (command.includes('\0')) {
    throw new ValidationError('Heartbeat command must not contain null bytes', 'INVALID_COMMAND');
  }

  if (SHELL_METACHAR_REGEX.test(command)) {
    throw new ValidationError(
      `Shell metacharacter detected in heartbeat command: "${command}"`,
      'COMMAND_INJECTION',
    );
  }

  // Extract the base command (first token, strip path prefixes)
  const baseCommand = command.trim().split(/\s+/)[0]!;
  const commandName = baseCommand.split('/').pop()!;

  if (!ALLOWED_COMMANDS.has(commandName)) {
    throw new ValidationError(
      `Command not in whitelist: "${commandName}" (allowed: ${[...ALLOWED_COMMANDS].join(', ')})`,
      'COMMAND_NOT_ALLOWED',
    );
  }

  return command;
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
      validateCommand(task.command);
      // Exit semantics: execSync throws on ANY non-zero exit (and on timeout),
      // so reaching the line below IS the exit-0 signal. Commands are
      // pipe-free by contract (see DEFAULT_HEARTBEAT_TEMPLATE), which is what
      // keeps that exit code honest rather than the last pipeline stage's.
      const stdout = execSync(task.command, {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: HEARTBEAT_EXEC_TIMEOUT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Empty-success semantics: silence from a passing command is a pass.
      output = stdout.trim().length > 0 ? stdout : EMPTY_SUCCESS_OUTPUT;
      success = true;
      result.passed++;
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        output = `BLOCKED: ${err.message}`;
      } else {
        // Non-zero exit or timeout. The template carries no `2>&1`, so stdout
        // and stderr arrive separately — merge both non-empty streams instead
        // of letting an empty-string stdout mask stderr-only diagnostics.
        const execErr = err as { stdout?: string; stderr?: string; message?: string };
        const streams = [execErr.stdout, execErr.stderr].filter(
          (s): s is string => typeof s === 'string' && s.trim().length > 0,
        );
        output = streams.length > 0 ? streams.join('\n') : execErr.message ?? 'Unknown error';
      }
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
    } catch (e) {
      debugLog('HeartbeatDaemon:writePidFile', e);
    }
  }

  private removePidFile(): void {
    const pidPath = join(this.projectRoot, DECKENT_DIR, PID_FILE);
    try {
      if (existsSync(pidPath)) unlinkSync(pidPath);
    } catch (e) {
      debugLog('HeartbeatDaemon:removePidFile', e);
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
    if (isPidAlive(pid)) return pid;
    // Stale PID — remove file
    try {
      unlinkSync(pidPath);
    } catch (e2) { debugLog('readDaemonPid:unlinkSync', e2); }
    return null;
  } catch (e) {
    debugLog('readDaemonPid:read', e);
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
  } catch (e) {
    debugLog('stopDaemonByPid:kill', e);
    return false;
  }
}
