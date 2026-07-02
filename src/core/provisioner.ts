// ─── Provisioner — consent-based, OS-aware tool installer ────────────────
// Closes the blueprint §3.4 gap: `deckent init`/`doctor` previously only
// *detected* missing prerequisites and printed hints. This module turns a
// detected gap into an actionable, consent-gated install.
//
// Security (companion to ADR-006 spawnSync pattern + spawn-safety.ts):
//   - Only npm-global installs are auto-executed, with array args and
//     shell:false (shell:true ONLY on win32 where npm resolves via a .cmd
//     wrapper, mirroring provider.ts:detectCliVersion).
//   - OS-package (tmux) and runtime (node) / docker installs are NEVER
//     auto-executed: they require sudo / privileged context, so they are
//     surfaced as an instruction string the user runs explicitly.
//   - The executable is checked against PROVISIONER_BIN_WHITELIST before
//     spawn — `sh`/`bash` are intentionally absent (no shell interpolation).

import { spawnSync } from 'node:child_process';
import { PROVIDER_PACKAGES } from './provider-packages.js';

export type ToolId = 'claude' | 'codex' | 'gemini' | 'tmux' | 'node' | 'docker';
export type LinuxPkgManager = 'apt' | 'dnf' | 'pacman';
export type InstallMethod = 'npm-global' | 'os-package' | 'manual';

export interface InstallPlan {
  tool: ToolId;
  method: InstallMethod;
  /** Binary to execute (npm-global only). For os-package/manual this is the
   *  suggested command but it is never auto-spawned. */
  command: string;
  args: string[];
  /** Human-facing instruction — shown as the consent hint and used verbatim
   *  for os-package/manual methods the user must run themselves. */
  instruction: string;
}

export interface PlanOptions {
  platform?: NodeJS.Platform;
  linuxPkgManager?: LinuxPkgManager;
}

export type SpawnResult = { status: number | null; stdout?: string; stderr?: string };
export type SpawnFn = (
  command: string,
  args: string[],
  opts: { shell: boolean; stdio?: unknown; timeout?: number; encoding?: string },
) => SpawnResult;

export interface InstallOptions extends PlanOptions {
  consent: boolean;
  spawn?: SpawnFn;
  log?: (msg: string) => void;
}

export type InstallResult =
  | { tool: ToolId; status: 'installed' }
  | { tool: ToolId; status: 'skipped'; reason: 'no-consent' | 'manual' }
  | { tool: ToolId; status: 'failed'; error: string };

/** Binaries the provisioner is permitted to spawn. Frozen; shell-free. */
export const PROVISIONER_BIN_WHITELIST: readonly string[] = Object.freeze(['npm']);

function tmuxInstruction(opts: PlanOptions): string {
  const platform = opts.platform ?? process.platform;
  if (platform === 'darwin') return 'brew install tmux';
  if (platform === 'linux') {
    switch (opts.linuxPkgManager) {
      case 'dnf': return 'sudo dnf install -y tmux';
      case 'pacman': return 'sudo pacman -S --noconfirm tmux';
      case 'apt':
      default: return 'sudo apt-get install -y tmux';
    }
  }
  return 'Install tmux for your platform (see https://github.com/tmux/tmux/wiki/Installing)';
}

export function planInstall(tool: ToolId, opts: PlanOptions = {}): InstallPlan {
  if (tool === 'claude' || tool === 'codex' || tool === 'gemini') {
    const pkg = PROVIDER_PACKAGES[tool].npmPkg;
    return {
      tool,
      method: 'npm-global',
      command: 'npm',
      args: ['install', '-g', pkg],
      instruction: `npm install -g ${pkg}`,
    };
  }
  if (tool === 'tmux') {
    const instruction = tmuxInstruction(opts);
    return { tool, method: 'os-package', command: 'tmux', args: [], instruction };
  }
  if (tool === 'node') {
    return {
      tool,
      method: 'manual',
      command: 'node',
      args: [],
      instruction: 'Install Node.js >= 18 (22 recommended) from https://nodejs.org or via nvm',
    };
  }
  // docker
  return {
    tool,
    method: 'manual',
    command: 'docker',
    args: [],
    instruction: 'Install Docker from https://docs.docker.com/get-docker/ (no safe silent auto-install)',
  };
}

const defaultSpawn: SpawnFn = (command, args, opts) =>
  spawnSync(command, args, {
    shell: opts.shell,
    stdio: (opts.stdio as 'inherit') ?? 'inherit',
    timeout: opts.timeout ?? 300_000,
    encoding: 'utf-8',
  }) as unknown as SpawnResult;

export async function installTool(tool: ToolId, opts: InstallOptions): Promise<InstallResult> {
  const plan = planInstall(tool, opts);
  if (!opts.consent) return { tool, status: 'skipped', reason: 'no-consent' };
  if (plan.method !== 'npm-global') {
    opts.log?.(`Manual step required for ${tool}: ${plan.instruction}`);
    return { tool, status: 'skipped', reason: 'manual' };
  }
  if (!PROVISIONER_BIN_WHITELIST.includes(plan.command)) {
    return { tool, status: 'failed', error: `command not allowed: ${plan.command}` };
  }
  const spawn = opts.spawn ?? defaultSpawn;
  // npm on Windows resolves through a .cmd wrapper that needs a shell to be
  // found in PATH; every POSIX platform stays shell-free (no sh -c).
  const isWindows = (opts.platform ?? process.platform) === 'win32';
  opts.log?.(`Installing ${tool}: ${plan.command} ${plan.args.join(' ')}`);
  const res = spawn(plan.command, plan.args, { shell: isWindows, stdio: 'inherit', timeout: 300_000 });
  if (res.status === 0) return { tool, status: 'installed' };
  const error = (res.stderr || res.stdout || `exit ${String(res.status)}`).toString().trim();
  return { tool, status: 'failed', error };
}

// ─── Orchestration — what `deckent init` / MCP init wires into ───────────

export type ProvisionMode = 'prompt' | 'yes' | 'no-install';

export interface ProvisionOptions extends PlanOptions {
  /** Tools detected as missing by doctor/provider checks. */
  missing: ToolId[];
  /** prompt = ask per tool; yes = install all (CI); no-install = legacy hint-only. */
  mode: ProvisionMode;
  /** Injected consent prompt (init.ts supplies a readline-backed impl). */
  confirm?: (tool: ToolId, instruction: string) => Promise<boolean>;
  /** Injected installer (defaults to installTool; overridable for tests). */
  install?: (tool: ToolId, opts: InstallOptions) => Promise<InstallResult>;
  spawn?: SpawnFn;
  log?: (msg: string) => void;
}

/** Map `deckent init` CLI flags to a provision mode. --no-install is the
 *  conservative default-preserving choice and wins over --yes. */
export function resolveProvisionMode(flags: { yes?: boolean; noInstall?: boolean }): ProvisionMode {
  if (flags.noInstall) return 'no-install';
  if (flags.yes) return 'yes';
  return 'prompt';
}

/** Doctor check `name` → provisionable ToolId. Names not present here
 *  (e.g. 'git') are intentionally not auto-provisioned. */
const DOCTOR_NAME_TO_TOOL: Readonly<Record<string, ToolId>> = Object.freeze({
  tmux: 'tmux',
  'Node.js': 'node',
  Docker: 'docker',
  'Claude CLI': 'claude',
});

/** Derive the set of provisionable missing tools from provider detection
 *  (claude/codex/gemini) plus failed doctor checks. Deduped. */
export function collectMissingTools(
  providers: ReadonlyArray<{ name: string; available: boolean }>,
  doctorChecks: ReadonlyArray<{ name: string; passed: boolean; required: boolean }>,
): ToolId[] {
  const set = new Set<ToolId>();
  for (const p of providers) {
    if (!p.available && (p.name === 'claude' || p.name === 'codex' || p.name === 'gemini')) {
      set.add(p.name);
    }
  }
  for (const c of doctorChecks) {
    if (c.passed) continue;
    const tool = DOCTOR_NAME_TO_TOOL[c.name];
    if (tool) set.add(tool);
  }
  return [...set];
}

export async function provisionMissing(opts: ProvisionOptions): Promise<InstallResult[]> {
  const doInstall = opts.install ?? installTool;
  const baseInstallOpts = {
    platform: opts.platform,
    linuxPkgManager: opts.linuxPkgManager,
    spawn: opts.spawn,
    log: opts.log,
  };
  const results: InstallResult[] = [];
  for (const tool of opts.missing) {
    const plan = planInstall(tool, opts);
    if (opts.mode === 'no-install') {
      results.push({
        tool,
        status: 'skipped',
        reason: plan.method === 'npm-global' ? 'no-consent' : 'manual',
      });
      continue;
    }
    if (opts.mode === 'yes') {
      results.push(await doInstall(tool, { consent: true, ...baseInstallOpts }));
      continue;
    }
    // prompt
    const consented = opts.confirm ? await opts.confirm(tool, plan.instruction) : false;
    if (!consented) {
      results.push({ tool, status: 'skipped', reason: 'no-consent' });
      continue;
    }
    results.push(await doInstall(tool, { consent: true, ...baseInstallOpts }));
  }
  return results;
}
