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
import { loadGatewayAccess } from '../../connectors/gateway/gateway-access.js';
import { loadProjectRegistry } from '../../connectors/gateway/project-registry.js';

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

export async function handleGatewayPairList(opts: { lang?: string; print?: (s: string) => void } = {}): Promise<void> {
  const lang = getLanguage(opts.lang);
  const print = opts.print ?? ((s: string): void => console.log(s));
  const access = await loadGatewayAccess();
  const pending = access.listPairings();
  if (pending.length === 0) { print(getMessage('gateway.pair_list_empty', lang)); return; }
  for (const p of pending) print(getMessage('gateway.pair_list_row', lang, { code: p.code, chatKey: p.chatKey, requestedAt: p.requestedAt }));
}

export async function handleGatewayPairApprove(opts: { code: string; project: string; lang?: string; print?: (s: string) => void }): Promise<void> {
  const lang = getLanguage(opts.lang);
  const print = opts.print ?? ((s: string): void => console.log(s));
  const access = await loadGatewayAccess();
  const projects = await loadProjectRegistry();
  const projectPath = projects.resolve(opts.project)?.path ?? opts.project;
  const res = await access.approvePairing(opts.code, projectPath);
  print(res
    ? getMessage('gateway.pair_approved', lang, { chatKey: res.chatKey, project: opts.project })
    : getMessage('gateway.pair_unknown_code', lang, { code: opts.code }));
}

export async function handleGatewayPairReject(opts: { code: string; lang?: string; print?: (s: string) => void }): Promise<void> {
  const lang = getLanguage(opts.lang);
  const print = opts.print ?? ((s: string): void => console.log(s));
  const access = await loadGatewayAccess();
  const ok = await access.rejectPairing(opts.code);
  print(ok ? getMessage('gateway.pair_rejected', lang, { code: opts.code }) : getMessage('gateway.pair_unknown_code', lang, { code: opts.code }));
}

export function registerGateway(program: Command): void {
  const lang = getLanguage(undefined);
  const cmd = program.command('gateway').description(getMessage('gateway.group_desc', lang));

  cmd.command('listen')
    .description(getMessage('cli.gateway.listen.desc', lang))
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
    .description(getMessage('cli.gateway.start.desc', lang))
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
    .description(getMessage('cli.gateway.stop.desc', lang))
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
    .description(getMessage('cli.gateway.status.desc', lang))
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

  const pair = cmd.command('pair').description(getMessage('gateway.pair_usage', getLanguage(undefined)));
  pair.command('list').description(getMessage('cli.gateway.pair.list.desc', lang)).option('--lang <code>', 'Language override (en|tr)')
    .action(async (opts: { lang?: string }) => { await handleGatewayPairList(opts); });
  pair.command('approve <code> <project>').description(getMessage('cli.gateway.pair.approve.desc', lang)).option('--lang <code>', 'Language override (en|tr)')
    .action(async (code: string, project: string, opts: { lang?: string }) => { await handleGatewayPairApprove({ code, project, lang: opts.lang }); });
  pair.command('reject <code>').description(getMessage('cli.gateway.pair.reject.desc', lang)).option('--lang <code>', 'Language override (en|tr)')
    .action(async (code: string, opts: { lang?: string }) => { await handleGatewayPairReject({ code, lang: opts.lang }); });

  // Hidden child entry — spawned by the supervisor for per-project runtime, not for direct use.
  program.command('gateway-runtime', { hidden: true })
    .description(getMessage('gateway.runtime_desc', getLanguage(undefined)))
    .requiredOption('--project <path>', 'Bound project root')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { project: string; lang?: string }) => {
      runGatewayRuntimeChild({ projectPath: opts.project, lang: opts.lang });
    });
}
