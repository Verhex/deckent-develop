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
  type ConnectShellKind,
  type ConnectStep,
  type ConnectTarget,
  type RuntimeDetection,
} from '../helpers/connect-wizard.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { buildAuthStateReport, type AuthStateResult } from './doctor.js';

export interface ConnectCommandOptions {
  provider?: string;
  json?: boolean;
}

/** Machine-readable shape printed by `--json`. */
export interface ConnectJsonReport {
  target: ConnectTarget;
  detection: RuntimeDetection;
  steps: ConnectStep[];
  /** Config-based (env + .deck) auth state, no network — see buildAuthStateReport (368-002). */
  authState: AuthStateResult[];
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

// ─── Config-Based Auth State (PSL-6-DILIM, Sprint 369 Task 369-006) ─────────
//
// Wires 368-002's buildAuthStateReport (doctor.ts — env + .deck file only, no
// network, no CLI subprocess) into the connect wizard's own report. Distinct
// from the "Providers:" section above, which reflects a REAL session probe
// (probeProviderAuth via createDefaultConnectProbes) — this section answers
// the narrower "did the user configure a credential via deckent's own config
// channels" question. Reuses the existing `doctor.auth_state_*` i18n keys
// (already public, already cross-command per image.ts/init.ts precedent) for
// the 3-state line; only the missing-guidance hint below is new.

/** Guidance keys per provider — mirrors doctor.ts's private AUTH_STATE_ENV_KEYS
 * (primary/native key only, not every alias) and AUTH_STATE_DECK_KEYS. Those
 * maps are not exported from doctor.ts and this task's write scope excludes
 * doctor.ts, so a small local mirror (3 providers, same values) is the
 * surgical option here. */
const AUTH_STATE_GUIDANCE: Readonly<Record<string, { envKey: string; deckKey: string }>> = {
  claude: { envKey: 'ANTHROPIC_API_KEY', deckKey: 'DECKENT_CLAUDE_API_KEY' },
  codex: { envKey: 'OPENAI_API_KEY', deckKey: 'DECKENT_OPENAI_API_KEY' },
  gemini: { envKey: 'GEMINI_API_KEY', deckKey: 'DECKENT_GOOGLE_API_KEY' },
};

/**
 * Platform-appropriate example of how to set an env var — reuses the already-
 * detected `ConnectShellKind` (connect-wizard.ts) rather than inventing new
 * platform-detection code. `<value>` is a literal placeholder — this NEVER
 * embeds or requests a real secret value, only the variable NAME.
 */
function formatEnvSetExample(shell: ConnectShellKind, envKey: string): string {
  switch (shell) {
    case 'powershell': return `$env:${envKey} = "<value>"`;
    case 'cmd': return `set ${envKey}=<value>`;
    case 'wsl':
    case 'gitbash':
    case 'posix':
    default:
      return `export ${envKey}=<value>`;
  }
}

/** Render one provider's auth-state line, plus a guidance hint when missing. Never prints a secret value — only key NAMES. */
function formatAuthStateLine(r: AuthStateResult, shell: ConnectShellKind, lang: string): string[] {
  const key = r.state === 'connected'
    ? 'doctor.auth_state_connected'
    : r.state === 'missing'
      ? 'doctor.auth_state_missing'
      : 'doctor.auth_state_unknown';
  const lines = [`  ${getMessage(key, lang, { provider: r.provider })}`];

  const guidance = AUTH_STATE_GUIDANCE[r.provider];
  if (r.state === 'missing' && guidance) {
    const cmd = formatEnvSetExample(shell, guidance.envKey);
    lines.push(`    ${getMessage('connect.auth_state.hint', lang, {
      envKey: guidance.envKey,
      cmd,
      deckKey: guidance.deckKey,
    })}`);
  }
  return lines;
}

/** Render the full auth-state section, or `[]` when no report was supplied (keeps existing callers unaffected). */
function formatAuthStateSection(authState: AuthStateResult[], shell: ConnectShellKind, lang: string): string[] {
  if (authState.length === 0) return [];
  const lines: string[] = [getMessage('doctor.auth_state_header', lang)];
  for (const r of authState) lines.push(...formatAuthStateLine(r, shell, lang));
  return lines;
}

/**
 * Human-readable connect report. Step descriptions reuse the existing
 * `connect.step.*` i18n keys (messages.ts); structural section headers stay
 * plain English (messages.ts is outside this task's write scope, so no new
 * keys can be added here — see docImpact note in the .result file).
 */
export function formatConnectReport(
  detection: RuntimeDetection,
  steps: ConnectStep[],
  lang: string,
  authState: AuthStateResult[] = [],
): string {
  const lines: string[] = [];
  lines.push('Deckent Connect');
  lines.push('');

  lines.push('Providers:');
  for (const p of detection.providers) lines.push(formatProviderLine(p));
  lines.push('');

  const authStateLines = formatAuthStateSection(authState, detection.winShell.shell, lang);
  if (authStateLines.length > 0) {
    lines.push(...authStateLines);
    lines.push('');
  }

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
      const authState = buildAuthStateReport(root);

      if (opts.json) {
        const report: ConnectJsonReport = { target, detection, steps, authState };
        print(JSON.stringify(report, null, 2));
      } else {
        print(formatConnectReport(detection, steps, lang, authState));
      }

      if (steps.length > 0) {
        process.exitCode = 1;
      }
    });
}
