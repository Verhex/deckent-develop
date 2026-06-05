// ═══ bot-daemon — always-on bot process management (§4G) ═════════════
//
// `deckent bot start` runs the inbound listener detached so it survives terminal
// close (an always-on conversational + approval head). stop/status manage it by a
// `.deckent/bot.pid` file. NOTE: a detached process does NOT survive a reboot or a
// crash — that needs an OS supervisor (systemd/pm2). This is "always-on while the
// machine is up", not "survives reboot"; the CLI says so honestly.

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPidAlive } from '../core/pid-liveness.js';

const BOT_PID_FILE = 'bot.pid';

function botPidPath(root: string): string {
  return join(root, '.deckent', BOT_PID_FILE);
}

/** Write the listener's pid (default: this process) to the bot pidfile. */
export function writeBotPid(root: string, pid: number = process.pid): void {
  const path = botPidPath(root);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, String(pid), 'utf-8');
  } catch {
    // non-fatal — status/stop degrade gracefully without a pidfile
  }
}

/** Read the bot pid if a live process holds it; clean a stale pidfile and return null. */
export function readBotPid(root: string): number | null {
  const path = botPidPath(root);
  if (!existsSync(path)) return null;
  try {
    const pid = parseInt(readFileSync(path, 'utf-8').trim(), 10);
    if (Number.isNaN(pid)) return null;
    if (isPidAlive(pid)) return pid;
    try { unlinkSync(path); } catch { /* non-fatal */ }
    return null;
  } catch {
    return null;
  }
}

/** Remove the bot pidfile (called by the listener on clean shutdown). */
export function clearBotPid(root: string): void {
  try {
    const path = botPidPath(root);
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // non-fatal
  }
}

export type StopBotResult = { status: 'stopped'; pid: number } | { status: 'not-running' };

/** Stop a running bot daemon via SIGTERM. */
export function stopBot(root: string): StopBotResult {
  const pid = readBotPid(root);
  if (pid === null) return { status: 'not-running' };
  try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
  return { status: 'stopped', pid };
}

export type StartBotResult =
  | { status: 'already-running'; pid: number }
  | { status: 'started'; pid: number }
  | { status: 'spawn-failed' };

export interface StartBotDaemonOptions {
  /** Inject the detached spawn for tests; returns the child pid or null. Default: real spawn. */
  spawnFn?: (root: string) => number | null;
}

/** Start the listener as a detached background daemon (no-op if already running). */
export function startBotDaemon(root: string, opts: StartBotDaemonOptions = {}): StartBotResult {
  const existing = readBotPid(root);
  if (existing !== null) return { status: 'already-running', pid: existing };

  const spawnFn = opts.spawnFn ?? defaultDetachedSpawn;
  const pid = spawnFn(root);
  if (pid == null) return { status: 'spawn-failed' };
  return { status: 'started', pid };
}

/** Resolve dist/cli/entry.js relative to this compiled module. */
function entryPath(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/connectors
  return join(here, '..', 'cli', 'entry.js');
}

/** Spawn `node dist/cli/entry.js bot listen` detached; subscription auth (no API key). */
function defaultDetachedSpawn(root: string): number | null {
  try {
    const env = { ...process.env };
    // Force subscription auth in the daemon (matches how the bot is run) so a
    // stray ANTHROPIC_API_KEY can't silently switch to billed API mode.
    delete env['ANTHROPIC_API_KEY'];
    const child = spawn(process.execPath, [entryPath(), 'bot', 'listen'], {
      detached: true,
      stdio: 'ignore',
      cwd: root,
      env,
    });
    child.unref();
    return child.pid ?? null;
  } catch {
    return null;
  }
}
