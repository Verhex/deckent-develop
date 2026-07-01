// ─── /connect Wizard Core (TERM-CONNECT, Sprint 353 Task 353-010) ──────────
//
// Pure core for the `/connect` runtime wizard: `detectRuntime(probes)` reads
// the environment through injected probes and `planConnectSteps(detection,
// target)` turns that snapshot into a deterministic action list. Neither
// function performs I/O of its own — every external signal (provider CLI
// presence/auth, MCP attach status, IDE, Windows shell) is supplied by a
// caller-provided probe, so this module never spawns a process or reads a
// file directly. UI wiring (rendering, approval flow, actually running a
// step) is an explicit follow-up.
//
// Reuse, not reinvention (disk-verify):
//   - providerAuth default → probeProviderAuth (core/provider-auth-probe.ts),
//     the GAP-4 fix that distinguishes "CLI installed" from "actually logged
//     in" for claude/codex/gemini.
//   - providerDiagnostics default → runProviderDiagnostics
//     (cli/commands/doctor-checks.ts), which wraps the provider adapters for
//     binary presence + version.
//   - mcpAttach default → detectAttachStatus, and attach-step commands via
//     getAttachCommand (cli/helpers/mcp-attach.ts).
//   - ide default → detectIDEEnvironment (cli/helpers/wizard.ts).
//   - winShell default → isRunningInWSL (cli/commands/doctor-checks.ts) plus
//     a small new env-based shell classifier (no existing helper covers the
//     powershell/cmd/gitbash distinction).
//   - install-step commands → planInstall (core/provisioner.ts), the single
//     source of truth for npm-global package names; already pure (no exec).

import { platform as osPlatform } from 'node:os';
import {
  probeProviderAuth,
  type AuthProbeState,
} from '../../core/provider-auth-probe.js';
import { planInstall } from '../../core/provisioner.js';
import type { ProviderAvailabilityDetail } from '../../core/provider.js';
import {
  runProviderDiagnostics,
  isRunningInWSL,
} from '../commands/doctor-checks.js';
import {
  detectAttachStatus,
  getAttachCommand,
  type McpHost,
  type McpAttachStatus,
} from './mcp-attach.js';
import {
  detectIDEEnvironment,
  type IDEEnvironment,
} from './wizard.js';

// ─── Public Types ────────────────────────────────────────────────────────

/** The three CLI-backed providers the connect wizard understands (mirrors {@link McpHost}). */
export type ConnectProviderName = McpHost;

/** Fixed iteration order — every detection/plan array is built from this tuple, never `Object.keys`. */
export const CONNECT_PROVIDERS: readonly ConnectProviderName[] = ['claude', 'codex', 'gemini'];

export interface ConnectProviderDetection {
  name: ConnectProviderName;
  /** CLI binary found in PATH (from provider diagnostics — distinct from auth). */
  cliAvailable: boolean;
  version?: string;
  /** Real session state, not "binary installed" (GAP-4 fix via provider-auth-probe). */
  authState: AuthProbeState;
  authDetail?: string;
}

export interface ConnectMcpDetection {
  host: ConnectProviderName;
  /** Host CLI exposes an `mcp` subcommand at all. */
  supported: boolean;
  /** `deckent` already registered with this host. */
  attached: boolean;
  toolCount: number;
  reason?: string;
}

export interface ConnectIdeDetection {
  environment: IDEEnvironment;
}

export type ConnectShellKind = 'wsl' | 'powershell' | 'cmd' | 'gitbash' | 'posix';

export interface ConnectWinShellDetection {
  isWindows: boolean;
  isWSL: boolean;
  shell: ConnectShellKind;
}

export interface RuntimeDetection {
  providers: ConnectProviderDetection[];
  mcp: ConnectMcpDetection[];
  ide: ConnectIdeDetection;
  winShell: ConnectWinShellDetection;
}

/**
 * Injectable seam bag for {@link detectRuntime}. Every probe is a plain
 * function so tests can supply deterministic fakes — the real defaults
 * (see {@link createDefaultConnectProbes}) are the only place actual CLI
 * exec / file reads happen, and those live in the reused helpers above.
 */
export interface ConnectRuntimeProbes {
  /** CLI binary presence + version for all three providers in one call. */
  providerDiagnostics: () => Promise<ProviderAvailabilityDetail[]>;
  /** Real session state for a single provider. */
  providerAuth: (provider: ConnectProviderName) => Promise<{ state: AuthProbeState; detail?: string }>;
  /** MCP attach status for a single host. */
  mcpAttach: (host: ConnectProviderName) => McpAttachStatus;
  /** Detected IDE environment. */
  ide: () => IDEEnvironment;
  /** Windows shell classification. */
  winShell: () => ConnectWinShellDetection;
}

export type ConnectTargetKind = 'provider' | 'mcp' | 'ide' | 'winShell' | 'all';

/** What the wizard run should act on. `provider`/`mcp` require a `provider`. */
export interface ConnectTarget {
  kind: ConnectTargetKind;
  provider?: ConnectProviderName;
}

export type ConnectStepRisk = 'info' | 'safe' | 'caution';

export interface ConnectStep {
  /** Argv form (no shell interpolation) — empty array means advisory-only, no command to run. */
  command: string[];
  /** i18n key resolved by the UI layer via getMessage(); this module never emits literal text. */
  descriptionKey: string;
  descriptionParams?: Record<string, string>;
  risk: ConnectStepRisk;
}

// ─── detectRuntime ───────────────────────────────────────────────────────

export async function detectRuntime(probes: ConnectRuntimeProbes): Promise<RuntimeDetection> {
  const diagnostics = await probes.providerDiagnostics();
  const diagByName = new Map(diagnostics.map((d) => [d.name, d]));

  const authResults = await Promise.all(
    CONNECT_PROVIDERS.map((name) => probes.providerAuth(name)),
  );

  const providers: ConnectProviderDetection[] = CONNECT_PROVIDERS.map((name, i) => {
    const diag = diagByName.get(name);
    const auth = authResults[i]!;
    return {
      name,
      cliAvailable: diag?.binaryFound ?? false,
      version: diag?.version,
      authState: auth.state,
      authDetail: auth.detail,
    };
  });

  const mcp: ConnectMcpDetection[] = CONNECT_PROVIDERS.map((host) => {
    const status = probes.mcpAttach(host);
    return {
      host,
      supported: status.supported,
      attached: status.attached,
      toolCount: status.toolCount,
      reason: status.reason,
    };
  });

  return {
    providers,
    mcp,
    ide: { environment: probes.ide() },
    winShell: probes.winShell(),
  };
}

// ─── planConnectSteps ────────────────────────────────────────────────────

/**
 * Login commands mirror the exact "run: X" hints already embedded in
 * {@link probeProviderAuth}'s `detail` text (provider-auth-probe.ts) — not
 * invented here, just given a runnable argv shape.
 */
const PROVIDER_LOGIN_COMMAND: Record<ConnectProviderName, string[]> = {
  claude: ['claude'],
  codex: ['codex', 'login'],
  gemini: ['gemini'],
};

function planProviderSteps(p: ConnectProviderDetection): ConnectStep[] {
  if (!p.cliAvailable) {
    const plan = planInstall(p.name);
    return [{
      command: [plan.command, ...plan.args],
      descriptionKey: 'connect.step.install_cli',
      descriptionParams: { provider: p.name, instruction: plan.instruction },
      risk: 'caution',
    }];
  }
  if (p.authState !== 'logged-in') {
    return [{
      command: PROVIDER_LOGIN_COMMAND[p.name],
      descriptionKey: 'connect.step.login',
      descriptionParams: { provider: p.name },
      risk: 'caution',
    }];
  }
  return [];
}

function planMcpSteps(m: ConnectMcpDetection): ConnectStep[] {
  if (!m.supported) {
    return [{
      command: [],
      descriptionKey: 'connect.step.mcp_unsupported',
      descriptionParams: { host: m.host },
      risk: 'info',
    }];
  }
  if (!m.attached) {
    const cmd = getAttachCommand(m.host);
    if (!cmd) return [];
    return [{
      command: [cmd.add.cmd, ...cmd.add.args],
      descriptionKey: 'connect.step.attach_mcp',
      descriptionParams: { host: m.host },
      risk: 'safe',
    }];
  }
  return [];
}

function planIdeSteps(ide: ConnectIdeDetection): ConnectStep[] {
  switch (ide.environment) {
    case 'claude-code':
      return [];
    case 'cursor':
      return [{
        command: ['deckent', 'init', '--cursor'],
        descriptionKey: 'connect.step.ide_cursor_setup',
        risk: 'safe',
      }];
    case 'terminal':
      return [{
        command: [],
        descriptionKey: 'connect.step.ide_terminal_guidance',
        risk: 'info',
      }];
  }
}

function planWinShellSteps(winShell: ConnectWinShellDetection): ConnectStep[] {
  if (winShell.isWindows && !winShell.isWSL) {
    return [{
      command: ['wsl', '--install'],
      descriptionKey: 'connect.step.wsl_recommended',
      descriptionParams: { shell: winShell.shell },
      risk: 'caution',
    }];
  }
  return [];
}

export function planConnectSteps(detection: RuntimeDetection, target: ConnectTarget): ConnectStep[] {
  switch (target.kind) {
    case 'provider': {
      const p = detection.providers.find((entry) => entry.name === target.provider);
      return p ? planProviderSteps(p) : [];
    }
    case 'mcp': {
      const m = detection.mcp.find((entry) => entry.host === target.provider);
      return m ? planMcpSteps(m) : [];
    }
    case 'ide':
      return planIdeSteps(detection.ide);
    case 'winShell':
      return planWinShellSteps(detection.winShell);
    case 'all': {
      const steps: ConnectStep[] = [];
      for (const p of detection.providers) steps.push(...planProviderSteps(p));
      for (const m of detection.mcp) steps.push(...planMcpSteps(m));
      steps.push(...planIdeSteps(detection.ide));
      steps.push(...planWinShellSteps(detection.winShell));
      return steps;
    }
  }
}

// ─── Windows Shell Classification ───────────────────────────────────────

/**
 * Env-based shell classifier — no existing helper covers this distinction.
 * Pure and fully injectable (platform/env/isWSL all passed in), unlike a
 * `ComSpec`/`$PSVersionTable` probe would be. WSL wins over the raw platform
 * check since `os.platform()` reports `'linux'` inside WSL2 but the host is
 * still Windows for install/shell guidance purposes.
 */
export function detectWinShell(
  platformName: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  isWSL: boolean,
): ConnectWinShellDetection {
  if (isWSL) return { isWindows: true, isWSL: true, shell: 'wsl' };
  if (platformName !== 'win32') return { isWindows: false, isWSL: false, shell: 'posix' };
  if (typeof env['MSYSTEM'] === 'string' && env['MSYSTEM'].length > 0) {
    return { isWindows: true, isWSL: false, shell: 'gitbash' };
  }
  if (typeof env['PSModulePath'] === 'string' && env['PSModulePath'].length > 0) {
    return { isWindows: true, isWSL: false, shell: 'powershell' };
  }
  return { isWindows: true, isWSL: false, shell: 'cmd' };
}

// ─── Default Probes (real wiring for future UI callers) ────────────────

/**
 * Wires the real reused helpers into a {@link ConnectRuntimeProbes}. Not
 * used by this module's own tests (which inject fakes) — this is the
 * production seam a future `/connect` command handler wires up.
 */
export function createDefaultConnectProbes(root: string): ConnectRuntimeProbes {
  return {
    providerDiagnostics: () => runProviderDiagnostics(root),
    providerAuth: (provider) => probeProviderAuth(provider),
    mcpAttach: (host) => detectAttachStatus(host),
    ide: () => detectIDEEnvironment(root),
    winShell: () => detectWinShell(osPlatform(), process.env, isRunningInWSL()),
  };
}
