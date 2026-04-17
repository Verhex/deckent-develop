/**
 * doctor-format.ts — All formatting/display functions for `deckent doctor`.
 *
 * Extracted from doctor.ts (Sprint 144 God Object Split).
 * Handles human-friendly output, provider health, system profile display.
 */
import type { DoctorResult, SystemProfile } from '../../core/types.js';
import type { DetectedProvider } from '../../core/provider.js';
import type { HealthCheckResult } from '../../orchestra/connector.js';
import type { CIBaseline, CIReport } from '../helpers/output.js';
import { formatCIHealthSection } from '../helpers/output.js';
import { detectEnvironment } from '../../core/environment.js';
import { loadDeckSecrets, validateDeckFile, KNOWN_DECK_KEYS } from '../../core/deck-file.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface HumanDoctorInput {
  result: DoctorResult;
  providers: DetectedProvider[];
  brainLines: number;
  brainBudget: number;
  lastSprintId: string | null;
  debtItems: { total: number; critical: number };
  projectRoot?: string;
  connectorHealthResults?: HealthCheckResult[];
  ciBaseline?: CIBaseline;
  ciReports?: CIReport[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getProviderHint(name: string): string {
  switch (name) {
    case 'gemini': return ' (set GOOGLE_API_KEY to enable)';
    case 'codex': return ' (set OPENAI_API_KEY to enable)';
    case 'claude': return ' (install Claude CLI: npm i -g @anthropic-ai/claude-code)';
    default: return '';
  }
}

// ─── Label Computations ─────────────────────────────────────────────

export function getMemoryHealthLabel(pct: number): string {
  if (pct > 100) return 'OVER BUDGET';
  if (pct >= 80) return 'high';
  if (pct >= 50) return 'moderate';
  return 'healthy';
}

export function getProviderSummary(providers: DetectedProvider[]): string {
  const ready = providers.filter(p => p.available).length;
  const total = providers.length;
  return `${ready}/${total} providers ready`;
}

export function getReadinessLabel(result: DoctorResult, brainLines: number, brainBudget: number): string {
  const failedRequired = result.checks.filter(c => c.required && !c.passed);
  if (failedRequired.length > 0) return 'NOT READY';
  if (brainLines > brainBudget) return 'READY (with warnings)';
  const failedOptional = result.checks.filter(c => !c.required && !c.passed);
  if (failedOptional.length > 0) return 'READY (with warnings)';
  return 'READY';
}

export function getProviderInstallHint(name: string): string {
  switch (name) {
    case 'claude': return 'install: npm i -g @anthropic-ai/claude-code';
    case 'codex': return 'install: npm i -g @openai/codex';
    case 'gemini': return 'install: npm i -g @google/gemini-cli';
    default: return '';
  }
}

export function getProviderTips(providers: DetectedProvider[]): string[] {
  const tips: string[] = [];
  for (const p of providers) {
    if (!p.available) {
      switch (p.name) {
        case 'gemini':
          tips.push('Set GOOGLE_API_KEY to enable Gemini as a worker provider.');
          break;
        case 'codex':
          tips.push('Set OPENAI_API_KEY to enable Codex as a worker provider.');
          break;
        case 'claude':
          tips.push('Install Claude CLI (npm i -g @anthropic-ai/claude-code) to enable Claude as a provider.');
          break;
      }
    }
  }
  return tips;
}

// ─── Connector / Provider Health ────────────────────────────────────

export function buildConnectorHealthResults(providers: DetectedProvider[]): HealthCheckResult[] {
  return providers.map(p => ({
    provider: p.name,
    available: p.available,
    authStatus: (p.authMethod !== 'none' ? 'ok' : 'missing') as HealthCheckResult['authStatus'],
    cliVersion: p.version ?? null,
    error: null,
  }));
}

export function getDeckFileStatus(root: string): string {
  const secrets = loadDeckSecrets(root);
  const totalKeys = KNOWN_DECK_KEYS.length;

  if (Object.keys(secrets).length === 0) {
    return '.deck file not found or empty';
  }

  const configuredCount = KNOWN_DECK_KEYS.filter(
    key => secrets[key] !== undefined && secrets[key] !== ''
  ).length;

  const validation = validateDeckFile(secrets);
  const validLabel = validation.valid ? '' : ' (has errors)';

  return `.deck file found, ${configuredCount}/${totalKeys} keys configured${validLabel}`;
}

export function formatConnectorHealthLines(
  results: HealthCheckResult[],
  root: string,
): string[] {
  const lines: string[] = ['Provider Health:'];

  for (const r of results) {
    const versionStr = r.cliVersion ? ` ${r.cliVersion}` : '';
    if (r.available && r.authStatus === 'ok') {
      const authLabel = r.provider === 'claude' ? 'session auth active' : 'API key configured';
      lines.push(`  [PASS] ${capitalize(r.provider)} CLI${versionStr} — ${authLabel}`);
    } else if (!r.available) {
      const hint = getProviderInstallHint(r.provider);
      const msg = hint ? `not installed — ${hint}` : 'not available';
      lines.push(`  [WARN] ${capitalize(r.provider)} CLI — ${msg}`);
    } else {
      lines.push(`  [WARN] ${capitalize(r.provider)} CLI${versionStr} — auth missing`);
    }
  }

  const deckStatus = getDeckFileStatus(root);
  const deckIcon = deckStatus.includes('not found') ? '[WARN]' : '[PASS]';
  lines.push(`  ${deckIcon} .deck file — ${deckStatus}`);

  const env = detectEnvironment();
  lines.push(`  [PASS] Environment — ${env} detected`);

  return lines;
}

export function formatProviderHealthSection(
  providers: DetectedProvider[],
  root: string,
): string[] {
  const lines: string[] = [];

  lines.push('Provider Health:');

  for (const p of providers) {
    const version = p.version ? ` v${p.version}` : '';
    if (p.available) {
      const authLabel = p.authMethod === 'session'
        ? 'session auth active'
        : p.authMethod === 'api_key'
          ? 'API key configured'
          : '';
      const authSuffix = authLabel ? ` — ${authLabel}` : '';
      lines.push(`  OK ${capitalize(p.name)} CLI${version}${authSuffix}`);
    } else {
      const hint = getProviderHint(p.name);
      lines.push(`  FAIL ${capitalize(p.name)} — not available${hint}`);
    }
  }

  const deckStatus = getDeckFileStatus(root);
  const deckIcon = deckStatus.includes('not found') ? 'WARN' : 'OK';
  lines.push(`  ${deckIcon} ${deckStatus}`);

  const env = detectEnvironment();
  lines.push(`  OK Environment: ${env} detected`);

  return lines;
}

// ─── Human-Friendly Doctor Output ───────────────────────────────────

export function formatHumanDoctor(input: HumanDoctorInput): string {
  const { result, providers, brainLines, brainBudget, lastSprintId, debtItems } = input;
  const lines: string[] = [];

  lines.push('Deckent Health Check');
  lines.push('');

  // --- Your System ---
  lines.push('Your System:');

  const systemCheckNames = ['Platform', 'Node.js', 'git', 'tmux', 'Claude CLI'];
  for (const check of result.checks) {
    if (systemCheckNames.includes(check.name)) {
      const icon = check.passed ? 'OK' : 'FAIL';
      lines.push(`  ${icon} ${check.name} \u2014 ${check.message}`);
    }
  }

  for (const p of providers) {
    const version = p.version ? ` v${p.version}` : '';
    if (p.available) {
      const auth = p.authMethod === 'session' ? 'session auth' : p.authMethod === 'api_key' ? 'API key set' : '';
      const authLabel = auth ? ` (${auth})` : '';
      lines.push(`  OK ${capitalize(p.name)} CLI${version} \u2014 Ready${authLabel}`);
    } else {
      const hint = getProviderHint(p.name);
      lines.push(`  SKIP ${capitalize(p.name)} \u2014 Not configured${hint}`);
    }
  }

  lines.push(`  ${getProviderSummary(providers)}`);

  lines.push('');

  // --- Your Project ---
  lines.push('Your Project:');

  const projectCheckNames = ['Workspace', 'Brain Dir', 'Directives'];
  for (const check of result.checks) {
    if (projectCheckNames.includes(check.name)) {
      const icon = check.passed ? 'OK' : 'FAIL';
      lines.push(`  ${icon} ${check.name} \u2014 ${check.message}`);
    }
  }

  const memPct = Math.round((brainLines / brainBudget) * 100);
  const memHealth = getMemoryHealthLabel(memPct);
  const memIcon = brainLines <= brainBudget ? 'OK' : 'FAIL';
  lines.push(`  ${memIcon} Memory: ${brainLines}/${brainBudget} lines (${memPct}% \u2014 ${memHealth})`);

  if (lastSprintId) {
    lines.push(`  OK Last sprint: ${lastSprintId} (completed)`);
  }

  if (debtItems.total > 0) {
    if (debtItems.critical > 0) {
      lines.push(`  Warning ${debtItems.critical} critical + ${debtItems.total - debtItems.critical} open debt items (run \`deckent status --debt\`)`);
    } else {
      lines.push(`  Warning ${debtItems.total} open debt items (run \`deckent status --debt\`)`);
    }
  }

  const lockCheck = result.checks.find(c => c.name === 'Locks');
  if (lockCheck && !lockCheck.passed) {
    lines.push(`  Warning ${lockCheck.message}`);
  }

  lines.push('');

  // --- System Health ---
  lines.push('System Health:');

  const openDebtCount = debtItems.total;
  if (openDebtCount > 0) {
    lines.push(`  Debt: ${openDebtCount} open item(s)${debtItems.critical > 0 ? ` (${debtItems.critical} critical)` : ''}`);
  } else {
    lines.push('  Debt: 0 open items');
  }

  if (lastSprintId) {
    const sprintNum = lastSprintId.replace('sprint-', '');
    lines.push(`  Sprints: ${sprintNum} completed (last: ${lastSprintId})`);
  } else {
    lines.push('  Sprints: none yet');
  }

  lines.push('');

  // --- CI Health ---
  const hasValidCIReports = input.ciReports && input.ciReports.length > 0 && input.ciReports.some(r => r.delta);
  const hasValidCIBaseline = input.ciBaseline?.baseline !== undefined;
  if (hasValidCIReports || hasValidCIBaseline) {
    const ciLines = formatCIHealthSection(input.ciReports ?? [], input.ciBaseline);
    lines.push(...ciLines);
    lines.push('');
  }

  // --- Provider Health ---
  if (input.projectRoot) {
    if (input.connectorHealthResults) {
      const healthLines = formatConnectorHealthLines(input.connectorHealthResults, input.projectRoot);
      lines.push(...healthLines);
    } else {
      const providerHealthLines = formatProviderHealthSection(providers, input.projectRoot);
      lines.push(...providerHealthLines);
    }
    lines.push('');
  }

  // --- Readiness ---
  const readiness = getReadinessLabel(result, brainLines, brainBudget);
  lines.push(`Status: ${readiness}`);
  lines.push('');

  // --- Recommendation ---
  lines.push('Recommendation:');

  const failedRequired = result.checks.filter(c => c.required && !c.passed);
  if (failedRequired.length > 0) {
    lines.push(`  Fix ${failedRequired.length} required issue${failedRequired.length > 1 ? 's' : ''} before starting a sprint.`);
    for (const c of failedRequired) {
      lines.push(`  \u2192 ${c.name}: ${c.message}`);
    }
  } else {
    lines.push('  Everything looks good! You can start a new sprint with `deckent start`.');
  }

  const tips = getProviderTips(providers);
  for (const tip of tips) {
    lines.push(`  Tip: ${tip}`);
  }

  if (brainLines > brainBudget) {
    lines.push('  Tip: Run `deckent cleanup --decay` to reduce memory usage.');
  }

  return lines.join('\n');
}

// ─── System Profile ─────────────────────────────────────────────────

export function formatSystemProfile(profile: SystemProfile, subscription?: string): string {
  const totalGB = (profile.totalMemMB / 1024).toFixed(1);
  const freeGB = (profile.freeMemMB / 1024).toFixed(1);
  const inner = 54;
  const top = `\u2554${'\u2550'.repeat(inner)}\u2557`;
  const bot = `\u255A${'\u2550'.repeat(inner)}\u255D`;
  const row = (content: string): string => {
    const padded = content.length >= inner - 2
      ? content.slice(0, inner - 2)
      : content + ' '.repeat(inner - 2 - content.length);
    return `\u2551 ${padded} \u2551`;
  };

  const lines = [
    top,
    row('System Profile'),
    row(`CPU: ${profile.cpuCores} cores  RAM: ${totalGB} GB (${freeGB} GB free)  Workers: ${profile.recommendedMaxWorkers}`),
  ];

  if (subscription !== undefined) {
    lines.push(row(`Subscription: ${subscription}`));
  }

  lines.push(bot);
  return lines.join('\n');
}
