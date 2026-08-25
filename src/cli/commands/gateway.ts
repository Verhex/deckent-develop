// src/cli/commands/gateway.ts
import type { Command } from 'commander';
import {
  getGovernanceMessage,
  governancePrerequisiteHelp,
  bindGovernanceArgumentDescriptions,
} from '../helpers/message-catalog/cli-governance.js';
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
import { ApprovalFileCasError } from '../../core/approval-file-cas.js';

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
  // The gateway bot token comes from the current project's config
  // (.deck-interpolated) as a bootstrap; a dedicated gateway .deck stays an
  // implementation detail. No token configured => the connector is honestly
  // reported as offline, never silently simulated.
  const cfg = await loadConfig(resolveProjectRoot());
  return cfg.notify_connectors?.telegram?.token ?? '';
}

export async function handleGatewayPairList(opts: { lang?: string; print?: (s: string) => void } = {}): Promise<void> {
  const lang = getLanguage(opts.lang);
  const print = opts.print ?? ((s: string): void => console.log(s));
  const access = await loadGatewayAccess();
  try {
    await access.sweepExpiredPairings();
  } catch (error) {
    const reason = error instanceof ApprovalFileCasError ? error.reasonCode : 'pairing-store-unavailable';
    print(getMessage('approvals.quarantined', lang, { id: 'pairings.json', reason }));
    return;
  }
  const pending = access.listPairings();
  if (pending.length === 0) { print(getMessage('gateway.pair_list_empty', lang)); return; }
  for (const p of pending) print(getMessage('gateway.pair_list_row', lang, { code: p.code, chatKey: p.chatKey, requestedAt: p.createdAt }));
}

export async function handleGatewayPairApprove(opts: { code: string; project: string; lang?: string; print?: (s: string) => void }): Promise<void> {
  const lang = getLanguage(opts.lang);
  const print = opts.print ?? ((s: string): void => console.log(s));
  const access = await loadGatewayAccess();
  const projects = await loadProjectRegistry();
  const projectPath = projects.resolve(opts.project)?.path ?? opts.project;
  try {
    const result = await access.decidePairing(opts.code, 'approve', { projectPath });
    switch (result.state) {
      case 'APPROVED':
        print(getMessage('gateway.pair_approved', lang, { chatKey: result.chatKey, project: opts.project }));
        return;
      case 'EXPIRED':
        print(getMessage('approvals.expired', lang, { id: result.pairingId, expiresAt: result.expiresAt }));
        return;
      case 'CLOSED':
        print(getMessage('approvals.late_decision', lang, { id: result.pairingId, state: result.terminalState }));
        return;
      case 'HOLD':
        print(getMessage('approvals.quarantined', lang, { id: opts.code, reason: result.reasonCode }));
        return;
      case 'NOT_FOUND':
      case 'REJECTED':
        print(getMessage('gateway.pair_unknown_code', lang, { code: opts.code }));
    }
  } catch (error) {
    const reason = error instanceof ApprovalFileCasError ? error.reasonCode : 'pairing-store-unavailable';
    print(getMessage('approvals.quarantined', lang, { id: opts.code, reason }));
  }
}

export async function handleGatewayPairReject(opts: { code: string; lang?: string; print?: (s: string) => void }): Promise<void> {
  const lang = getLanguage(opts.lang);
  const print = opts.print ?? ((s: string): void => console.log(s));
  const access = await loadGatewayAccess();
  try {
    const result = await access.decidePairing(opts.code, 'reject');
    switch (result.state) {
      case 'REJECTED':
        print(getMessage('gateway.pair_rejected', lang, { code: opts.code }));
        return;
      case 'EXPIRED':
        print(getMessage('approvals.expired', lang, { id: result.pairingId, expiresAt: result.expiresAt }));
        return;
      case 'CLOSED':
        print(getMessage('approvals.late_decision', lang, { id: result.pairingId, state: result.terminalState }));
        return;
      case 'HOLD':
        print(getMessage('approvals.quarantined', lang, { id: opts.code, reason: result.reasonCode }));
        return;
      case 'NOT_FOUND':
      case 'APPROVED':
        print(getMessage('gateway.pair_unknown_code', lang, { code: opts.code }));
    }
  } catch (error) {
    const reason = error instanceof ApprovalFileCasError ? error.reasonCode : 'pairing-store-unavailable';
    print(getMessage('approvals.quarantined', lang, { id: opts.code, reason }));
  }
}

export function registerGateway(program: Command): void {
  const lang = getLanguage(undefined);
  const cmd = program.command('gateway')
    .description(getMessage('gateway.group_desc', lang))
    .addHelpText('after', governancePrerequisiteHelp('connector-token', lang));

  cmd.command('listen')
    .description(getMessage('cli.gateway.listen.desc', lang))
    .addHelpText('after', governancePrerequisiteHelp('connector-token', lang))
    .option('--lang <code>', getGovernanceMessage('cli.governance.opt.lang', lang))
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
    .addHelpText('after', governancePrerequisiteHelp('connector-token', lang))
    .option('--lang <code>', getGovernanceMessage('cli.governance.opt.lang', lang))
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
    .option('--lang <code>', getGovernanceMessage('cli.governance.opt.lang', lang))
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
    .option('--lang <code>', getGovernanceMessage('cli.governance.opt.lang', lang))
    .action((opts: { lang?: string }) => {
      const l = getLanguage(opts.lang);
      const pid = readPid();
      console.log(
        pid !== null
          ? getMessage('gateway.daemon_status_running', l, { pid: String(pid) })
          : getMessage('gateway.daemon_not_running', l),
      );
    });

  // The parent's description is the PURPOSE of the pairing surface. The
  // usage text it used to carry is not a description — it is a usage block —
  // so it now renders in its own help section below the option list.
  const pair = cmd.command('pair')
    .description(getGovernanceMessage('cli.governance.gateway.pair.desc', lang))
    .addHelpText(
      'after',
      `\n${getGovernanceMessage('cli.governance.gateway.pair.usage_heading', lang)}\n`
      + `${getMessage('gateway.pair_usage', lang)}\n`,
    );
  pair.command('list').description(getMessage('cli.gateway.pair.list.desc', lang)).option('--lang <code>', getGovernanceMessage('cli.governance.opt.lang', lang))
    .action(async (opts: { lang?: string }) => { await handleGatewayPairList(opts); });
  bindGovernanceArgumentDescriptions(pair.command('approve <code> <project>'), lang, {
    code: 'cli.governance.gateway.arg.pair_code',
    project: 'cli.governance.gateway.arg.project',
  }).description(getMessage('cli.gateway.pair.approve.desc', lang)).option('--lang <code>', getGovernanceMessage('cli.governance.opt.lang', lang))
    .action(async (code: string, project: string, opts: { lang?: string }) => { await handleGatewayPairApprove({ code, project, lang: opts.lang }); });
  bindGovernanceArgumentDescriptions(pair.command('reject <code>'), lang, {
    code: 'cli.governance.gateway.arg.pair_code',
  }).description(getMessage('cli.gateway.pair.reject.desc', lang)).option('--lang <code>', getGovernanceMessage('cli.governance.opt.lang', lang))
    .action(async (code: string, opts: { lang?: string }) => { await handleGatewayPairReject({ code, lang: opts.lang }); });

  // Hidden child entry — spawned by the supervisor for per-project runtime, not for direct use.
  program.command('gateway-runtime', { hidden: true })
    .description(getMessage('gateway.runtime_desc', getLanguage(undefined)))
    .addHelpText('after', governancePrerequisiteHelp('connector-token', lang))
    .requiredOption('--project <path>', getGovernanceMessage('cli.governance.gateway.opt.project', lang))
    .option('--lang <code>', getGovernanceMessage('cli.governance.opt.lang', lang))
    .action((opts: { project: string; lang?: string }) => {
      runGatewayRuntimeChild({ projectPath: opts.project, lang: opts.lang });
    });
}
