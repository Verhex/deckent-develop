// ─── `deckent connect` — Diagnostic-only connection report (TERM-CONNECT,
// Sprint 354 Task 354-009) ───────────────────────────────────────────────
//
// Wraps the pure `/connect` wizard core (helpers/connect-wizard.ts, Sprint 353
// Task 353-010) into a real CLI command. Every probe wired here
// (`createDefaultConnectProbes`) reads existing, disk-verified helpers —
// provider-auth-probe.ts, doctor-checks.ts, mcp-attach.ts, wizard.ts — nothing
// is reinvented. `detectRuntime` + `planConnectSteps` are pure functions that
// only ever READ state through those probes; this command prints the result
// and the suggested steps as text — it never executes `step.command` itself.
// That makes the entire command salt-teşhis (diagnostic-only, no mutation).
//
// Registration: this module only exports `registerConnect`. Wiring it into
// the root `program` (index.ts) is a separate task — do not import this from
// index.ts here.

import type { Command } from 'commander';
import {
  detectRuntime,
  planConnectSteps,
  createDefaultConnectProbes,
  CONNECT_PROVIDERS,
  type ConnectProviderName,
  type ConnectStep,
  type ConnectTarget,
  type RuntimeDetection,
} from '../helpers/connect-wizard.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';

export interface ConnectCommandOptions {
  provider?: string;
  json?: boolean;
}

/** Machine-readable shape printed by `--json`. */
export interface ConnectJsonReport {
  target: ConnectTarget;
  detection: RuntimeDetection;
  steps: ConnectStep[];
}

export function isConnectProviderName(value: string): value is ConnectProviderName {
  return (CONNECT_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Turns CLI flags into a {@link ConnectTarget}. Returns an `error` string
 * (never throws) when `--provider` names something outside `CONNECT_PROVIDERS`
 * — the caller reports it and exits non-zero instead of crashing.
 */
export function resolveConnectTarget(opts: ConnectCommandOptions): ConnectTarget | { error: string } {
  if (opts.provider === undefined) return { kind: 'all' };
  if (!isConnectProviderName(opts.provider)) {
    return { error: `Unknown provider "${opts.provider}" — expected one of: ${CONNECT_PROVIDERS.join(', ')}` };
  }
  return { kind: 'provider', provider: opts.provider };
}

function formatConnectStep(step: ConnectStep, lang: string): string {
  const description = getMessage(step.descriptionKey, lang, step.descriptionParams);
  const commandSuffix = step.command.length > 0 ? ` — ${step.command.join(' ')}` : '';
  return `  [${step.risk}] ${description}${commandSuffix}`;
}

function formatProviderLine(p: RuntimeDetection['providers'][number]): string {
  const cliLabel = p.cliAvailable ? 'OK' : 'MISSING';
  const authLabel = p.authState === 'logged-in' ? 'logged-in' : p.authState === 'logged-out' ? 'logged-out' : 'unknown';
  const version = p.version ? ` v${p.version}` : '';
  return `  ${cliLabel} ${p.name}${version} — ${authLabel}`;
}

function formatMcpLine(m: RuntimeDetection['mcp'][number]): string {
  const label = !m.supported ? 'N/A' : m.attached ? 'OK' : 'MISSING';
  const reason = m.reason ? ` (${m.reason})` : '';
  return `  ${label} ${m.host} — tools: ${m.toolCount}${reason}`;
}

/**
 * Human-readable connect report. Step descriptions reuse the existing
 * `connect.step.*` i18n keys (messages.ts); structural section headers stay
 * plain English (messages.ts is outside this task's write scope, so no new
 * keys can be added here — see docImpact note in the .result file).
 */
export function formatConnectReport(detection: RuntimeDetection, steps: ConnectStep[], lang: string): string {
  const lines: string[] = [];
  lines.push('Deckent Connect');
  lines.push('');

  lines.push('Providers:');
  for (const p of detection.providers) lines.push(formatProviderLine(p));
  lines.push('');

  lines.push('MCP Attach:');
  for (const m of detection.mcp) lines.push(formatMcpLine(m));
  lines.push('');

  lines.push(`IDE: ${detection.ide.environment}`);
  lines.push(`Shell: ${detection.winShell.shell}${detection.winShell.isWindows ? ' (Windows)' : ''}`);
  lines.push('');

  if (steps.length === 0) {
    lines.push('Status: fully connected — no action needed.');
  } else {
    lines.push(`Suggested steps (${steps.length}) — diagnostic only, nothing was run automatically:`);
    for (const step of steps) lines.push(formatConnectStep(step, lang));
  }

  return lines.join('\n');
}

export function registerConnect(program: Command): void {
  program
    .command('connect')
    .description('Diagnose provider/MCP/IDE/shell connection status (read-only — no changes are made)')
    .option('--provider <name>', `Scope the report to a single provider (${CONNECT_PROVIDERS.join('|')})`)
    .option('--json', 'Output the report as JSON')
    .action(async (opts: ConnectCommandOptions) => {
      const target = resolveConnectTarget(opts);
      if ('error' in target) {
        printError(target.error);
        process.exitCode = 1;
        return;
      }

      let root: string;
      try {
        root = resolveProjectRoot();
      } catch {
        root = process.cwd();
      }
      const lang = getLangFromConfig(root);

      const probes = createDefaultConnectProbes(root);
      const detection = await detectRuntime(probes);
      const steps = planConnectSteps(detection, target);

      if (opts.json) {
        const report: ConnectJsonReport = { target, detection, steps };
        print(JSON.stringify(report, null, 2));
      } else {
        print(formatConnectReport(detection, steps, lang));
      }

      if (steps.length > 0) {
        process.exitCode = 1;
      }
    });
}
