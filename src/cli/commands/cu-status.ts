// src/cli/commands/cu-status.ts
// ═══ `deckent cu-status` — TOOL-CU's first Tier-1 CLI surface (Sprint 374, Task 374-002) ═══
//
// Reports the `computer_use` flag state honestly: disabled (default-off) ->
// "disabled + how to enable" (no probing, matching negotiateComputerUseCapabilities's
// own flag-off short-circuit); enabled -> a real per-capability availability table via
// the existing dilim-2 negotiator (src/core/computer-use-platform.ts, Sprint 370).
//
// The command-prober passed to negotiateComputerUseCapabilities is REAL at runtime
// (a synchronous `command -v` / `where` existence check) and FAKE in tests (an
// injected function) — the negotiator itself stays impl-free per its own contract.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import {
  COMPUTER_USE_ACTION_KINDS,
  resolveComputerUseAvailability,
  type ComputerUseConfig,
} from '../../core/computer-use-contract.js';
import {
  negotiateComputerUseCapabilities,
  isKnownComputerUsePlatform,
  type ComputerUseCapabilityMatrix,
  type ComputerUsePlatform,
  type CommandProber,
} from '../../core/computer-use-platform.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { print } from '../helpers/output.js';
import { getMessage } from '../helpers/messages.js';

// ─── Platform Detection (self-contained mirror — see computer-use-platform.ts's own
// header for why this does NOT import connectors/capabilities/platform.ts: that module
// lives outside this task's read scope, and core/computer-use-platform.ts already
// establishes the "structurally independent mirror, not a cross-module import"
// convention for this exact platform-id union) ────────────────────────────────────

/** Same WSL signal doctor.ts's `isRunningInWSL` uses (env vars + /proc/version sniff). */
function isWSLHost(): boolean {
  if (process.env['WSL_DISTRO_NAME'] !== undefined || process.env['WSL_INTEROP'] !== undefined) {
    return true;
  }
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf-8'));
  } catch {
    return false;
  }
}

/** Maps the live host onto a known `ComputerUsePlatform`, or `null` for an unsupported host
 *  (negotiateComputerUseCapabilities already handles an unknown platform string honestly). */
export function detectCuPlatform(): ComputerUsePlatform | null {
  const p = process.platform;
  if (p === 'win32') return 'win32';
  if (p === 'darwin') return 'darwin';
  if (p === 'linux') return isWSLHost() ? 'wsl' : 'linux';
  return null;
}

// ─── Real Command Prober ────────────────────────────────────────────────────

/**
 * Synchronous `command -v` (POSIX) / `where` (win32) existence check — the real
 * `CommandProber` this command hands to `negotiateComputerUseCapabilities` at runtime.
 * The tool name is passed as a positional shell argument (`$1`), never interpolated
 * into a shell string, so this stays injection-safe even though it invokes a shell.
 * Never throws — any spawn failure resolves to "not found".
 */
export function realCommandProber(command: string): boolean {
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('where', [command], { encoding: 'utf-8', windowsHide: true });
      return result.status === 0;
    }
    const result = spawnSync('sh', ['-c', 'command -v -- "$1"', 'sh', command], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

// ─── Report Shape ────────────────────────────────────────────────────────────

export interface CuStatusReport {
  enabled: boolean;
  /** Present whenever `enabled` is false — always a human-readable reason, never silent. */
  reason?: string;
  allowedCapabilities: string[];
  platform: string;
  platformKnown: boolean;
  capabilities: ComputerUseCapabilityMatrix;
}

/**
 * Pure report builder — no I/O. `reasonOverride` lets the caller surface a config-load
 * failure honestly instead of the generic "disabled" reason (the two are different facts:
 * "computer_use is off" vs. "we could not even read config").
 */
export function buildCuStatusReport(
  config: ComputerUseConfig | undefined,
  platform: string,
  prober: CommandProber,
  reasonOverride?: string,
): CuStatusReport {
  const flagResolution = resolveComputerUseAvailability(config);
  const capabilities = negotiateComputerUseCapabilities(platform, config, prober);
  return {
    enabled: flagResolution.available,
    reason: reasonOverride ?? flagResolution.reason,
    allowedCapabilities: flagResolution.allowedCapabilities,
    platform,
    platformKnown: isKnownComputerUsePlatform(platform),
    capabilities,
  };
}

// ─── Rendering ───────────────────────────────────────────────────────────────

export function formatCuStatusJson(report: CuStatusReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatCuStatusTable(report: CuStatusReport, lang: string): string[] {
  const lines: string[] = [getMessage('cuStatus.title', lang), ''];

  if (!report.enabled) {
    lines.push(getMessage('cuStatus.flag_disabled', lang, { reason: report.reason ?? '' }));
    lines.push('');
    lines.push(getMessage('cuStatus.how_to_enable', lang));
    return lines;
  }

  lines.push(getMessage('cuStatus.flag_enabled', lang));
  lines.push(
    getMessage(report.platformKnown ? 'cuStatus.platform_known' : 'cuStatus.platform_unsupported', lang, {
      platform: report.platform,
    }),
  );

  const allowedList = report.allowedCapabilities.length > 0
    ? report.allowedCapabilities.join(', ')
    : getMessage('cuStatus.allowed_capabilities_empty', lang);
  lines.push(getMessage('cuStatus.allowed_capabilities_line', lang, { list: allowedList }));

  lines.push('');
  lines.push(getMessage('cuStatus.capabilities_header', lang));
  for (const kind of COMPUTER_USE_ACTION_KINDS) {
    const cap = report.capabilities[kind];
    lines.push(
      cap.available
        ? getMessage('cuStatus.capability_available', lang, { kind })
        : getMessage('cuStatus.capability_unavailable', lang, { kind, reason: cap.reason ?? '' }),
    );
  }
  return lines;
}

// ─── Command Orchestration ────────────────────────────────────────────────────

export interface CuStatusOptions {
  json?: boolean;
}

/**
 * `deckent cu-status` orchestration. `prober`/`platform` are injectable (default to the
 * real implementations above) — the same DI convention as `runAuthProbes`'s `probeFn`
 * and `maybeFixWorkerImage`'s `spawnImpl` elsewhere in this codebase — so tests exercise
 * the full report + rendering pipeline with a fake prober and a fixed platform, never a
 * real subprocess spawn.
 *
 * Never throws and never sets a non-zero exit code: this is a status READ, not a gate —
 * even a "disabled" or "config failed to load" outcome is a normal, honest report.
 */
export async function runCuStatusCommand(
  opts: CuStatusOptions = {},
  prober: CommandProber = realCommandProber,
  platform: string = detectCuPlatform() ?? process.platform,
): Promise<void> {
  const root = resolveProjectRoot();
  const lang = getLangFromConfig(root);

  let config: ComputerUseConfig | undefined;
  let reasonOverride: string | undefined;
  try {
    const resolved = await loadConfig(root);
    config = resolved.computer_use;
  } catch (err) {
    reasonOverride = getMessage('cuStatus.config_load_error', lang, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const report = buildCuStatusReport(config, platform, prober, reasonOverride);

  if (opts.json) {
    print(formatCuStatusJson(report));
    return;
  }
  print(formatCuStatusTable(report, lang).join('\n'));
}

// ─── Commander Wiring ─────────────────────────────────────────────────────────

export function registerCuStatus(program: Command): void {
  program
    .command('cu-status')
    .description('Show computer-use (TOOL-CU) status: flag state + per-capability availability')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: CuStatusOptions) => {
      await runCuStatusCommand(cmdOpts);
    });
}
