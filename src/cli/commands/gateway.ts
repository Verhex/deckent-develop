// src/cli/commands/gateway.ts
import type { Command } from 'commander';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { isPidAlive } from '../../core/pid-liveness.js';
import { gatewayPidPath } from '../../connectors/gateway/gateway-paths.js';
import { startGatewayListen, runGatewayRuntimeChild } from '../../connectors/gateway/gateway-daemon.js';
import { loadConfig } from '../../core/config.js';
import { resolveProjectRoot } from '../helpers/process.js';

function writePid(pid = process.pid): void {
  const p = gatewayPidPath();
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, String(pid), 'utf-8');
  } catch {
    // non-fatal — status/stop degrade gracefully without a pidfile
  }
}

function readPid(): number | null {
  const p = gatewayPidPath();
  if (!existsSync(p)) return null;
  try {
    const pid = parseInt(readFileSync(p, 'utf-8').trim(), 10);
    if (Number.isNaN(pid)) return null;
    if (isPidAlive(pid)) return pid;
    try { unlinkSync(p); } catch { /* non-fatal */ }
    return null;
  } catch {
    return null;
  }
}

function clearPid(): void {
  try {
    const p = gatewayPidPath();
    if (existsSync(p)) unlinkSync(p);
  } catch {
    // non-fatal
  }
}

function entryPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'entry.js');
}

async function resolveGatewayToken(): Promise<string> {
  // G1: gateway bot token comes from the current project's config (.deck-interpolated)
  // as a bootstrap; a dedicated gateway .deck is an impl detail (spec §5.1).
  const cfg = await loadConfig(resolveProjectRoot());
  return cfg.notify_connectors?.telegram?.token ?? '';
}

export function registerGateway(program: Command): void {
  const lang = getLanguage(undefined);
  const cmd = program.command('gateway').description(getMessage('gateway.group_desc', lang));

  cmd.command('listen')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (opts: { lang?: string }) => {
      const l = getLanguage(opts.lang);
      const token = await resolveGatewayToken();
      const handle = await startGatewayListen({ lang: l, gatewayToken: token });
      if (handle.active.length === 0) {
        console.log(getMessage('gateway.listen_none', l));
        return;
      }
      writePid();
      process.on('exit', clearPid);
      // The daemon's waitForSignal loop will call handle.dispose when SIGINT/SIGTERM fires.
    });

  cmd.command('start')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { lang?: string }) => {
      const l = getLanguage(opts.lang);
      const existing = readPid();
      if (existing !== null) {
        console.log(getMessage('gateway.daemon_already', l, { pid: String(existing) }));
        return;
      }
      const child = spawn(process.execPath, [entryPath(), 'gateway', 'listen'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      console.log(getMessage('gateway.daemon_started', l, { pid: String(child.pid ?? 0) }));
      console.log(getMessage('gateway.daemon_reboot_note', l));
    });

  cmd.command('stop')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { lang?: string }) => {
      const l = getLanguage(opts.lang);
      const pid = readPid();
      if (pid === null) {
        console.log(getMessage('gateway.daemon_not_running', l));
        return;
      }
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
      clearPid();
      console.log(getMessage('gateway.daemon_stopped', l, { pid: String(pid) }));
    });

  cmd.command('status')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { lang?: string }) => {
      const l = getLanguage(opts.lang);
      const pid = readPid();
      console.log(
        pid !== null
          ? getMessage('gateway.daemon_status_running', l, { pid: String(pid) })
          : getMessage('gateway.daemon_not_running', l),
      );
    });

  // Hidden child entry — spawned by the supervisor for per-project runtime, not for direct use.
  program.command('gateway-runtime', { hidden: true })
    .requiredOption('--project <path>', 'Bound project root')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { project: string; lang?: string }) => {
      runGatewayRuntimeChild({ projectPath: opts.project, lang: opts.lang });
    });
}
