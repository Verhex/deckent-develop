/**
 * init-wizard.ts — Interactive prompts, format helpers, and display functions.
 *
 * All UI-facing functions that format output for the user during `deckent init`
 * live here.  Pure functions (no filesystem writes).
 *
 * Split from init.ts (Sprint 144 Task 1).
 */

import { getMessage } from '../helpers/messages.js';
import { PROVIDER_PACKAGES } from '../../core/provider-packages.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface DetectedSetup {
  nodeVersion?: string;
  providers: Array<{ name: string; available: boolean; authMethod?: string; version?: string }>;
  stack?: { language?: string; framework?: string; testFramework?: string };
}

export interface SetupStep {
  label: string;
  done: boolean;
}

// ─── Capitalize Helper ──────────────────────────────────────────────

export function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Format Functions ───────────────────────────────────────────────

export function formatWelcomeBanner(): string {
  return '\nWelcome to Deckent!\n';
}

export function formatDetectedSetup(setup: DetectedSetup): string {
  const lines: string[] = ['I detected your setup:'];

  if (setup.nodeVersion) {
    lines.push(`  → Node.js ${setup.nodeVersion}`);
  }

  for (const p of setup.providers) {
    if (p.available) {
      const auth = p.authMethod ? ` (${p.authMethod})` : '';
      const ver = p.version ? ` v${p.version}` : '';
      lines.push(`  → ${capitalize(p.name)} CLI${ver}${auth}`);
    } else {
      lines.push(`  → ${capitalize(p.name)} — Not configured`);
    }
  }

  if (setup.stack) {
    const parts: string[] = [];
    if (setup.stack.language && setup.stack.language !== 'unknown') parts.push(capitalize(setup.stack.language));
    if (setup.stack.framework && setup.stack.framework !== 'unknown' && setup.stack.framework !== 'none') parts.push(capitalize(setup.stack.framework));
    if (parts.length > 0) {
      lines.push(`  → Project: ${parts.join(' + ')} (detected from package.json)`);
    }
  }

  return lines.join('\n');
}

export function formatSetupProgress(steps: SetupStep[]): string {
  const lines: string[] = ['', 'Setting up your AI development team...'];
  for (const step of steps) {
    const icon = step.done ? '  ✓' : '  ·';
    lines.push(`${icon} ${step.label}`);
  }
  return lines.join('\n');
}

export function formatNextSteps(language: string): string {
  if (language === 'tr') {
    return [
      '',
      'Hazırsınız! Sonraki adımlar:',
      '  1. Hedeflerinizi yazın:  deckent set-directives "Kullanıcı doğrulama ekle"',
      '  2. Sprint planlayın:     deckent plan',
      '  3. Çalışmaya başlayın:   deckent start',
      '',
      'Ya da doğrudan ne yapılacağını söyleyin:',
      '  deckent start "Express API\'ye JWT authentication ekle"',
      '',
      'Otomasyon (opsiyonel · varsayılan KAPALI · insan-onaylı · güvenli):',
      '  • Otonom backlog:   deckent autonomous enable  →  deckent autonomous start',
      '  • Proaktif gözetim: deckent nervous enable     →  deckent nervous',
    ].join('\n');
  }
  return [
    '',
    "You're ready! Here's what to do next:",
    '  1. Write your goals:  deckent set-directives "Add user authentication"',
    '  2. Plan the sprint:   deckent plan',
    '  3. Start working:     deckent start',
    '',
    'Or just tell me what to build:',
    '  deckent start "Add JWT authentication to the Express API"',
    '',
    'Automation (optional · default OFF · human-approved · safe):',
    '  • Autonomous backlog:  deckent autonomous enable  →  deckent autonomous start',
    '  • Proactive oversight: deckent nervous enable     →  deckent nervous',
  ].join('\n');
}

/**
 * Detect system locale from environment variables or Intl API.
 * Returns a 2-letter language code (e.g. 'en', 'tr').
 */
export function detectSystemLanguage(): string {
  // Try LANG env var first (e.g. "tr_TR.UTF-8")
  const langEnv = process.env['LANG'] ?? process.env['LANGUAGE'] ?? process.env['LC_ALL'] ?? process.env['LC_MESSAGES'];
  if (langEnv) {
    const match = /^([a-z]{2})/i.exec(langEnv);
    if (match) return match[1]!.toLowerCase();
  }
  // Try Intl API
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const parts = locale.split('-');
    if (parts[0]) return parts[0].toLowerCase();
  } catch {
    // Intl not available
  }
  return 'en';
}

/**
 * Format recommendation reasons for display after auto-detect.
 */
export function formatRecommendations(reasons: string[]): string {
  if (reasons.length === 0) return '';
  const lines = ['', 'Recommendation reasons:'];
  for (const reason of reasons) {
    lines.push(`  → ${reason}`);
  }
  return lines.join('\n');
}

/**
 * Build setup steps array for the progress display.
 */
export function buildSetupSteps(
  availableProviderNames: string[],
  detectedAnalysis?: { language?: string; framework?: string },
): SetupStep[] {
  const steps: SetupStep[] = [
    { label: 'Created .deckent/ configuration', done: true },
    { label: 'Created .brain/ memory system', done: true },
    { label: `Set up ${availableProviderNames[0] ? capitalize(availableProviderNames[0]) : 'Claude'} as brain (Opus), workers (Sonnet)`, done: true },
  ];
  if (availableProviderNames.length > 1) {
    steps.push({ label: `Enabled ${capitalize(availableProviderNames[1]!)} as secondary worker provider`, done: true });
  }
  if (detectedAnalysis) {
    const stackParts: string[] = [];
    if (detectedAnalysis.language && detectedAnalysis.language !== 'unknown') stackParts.push(capitalize(detectedAnalysis.language));
    if (detectedAnalysis.framework && detectedAnalysis.framework !== 'unknown' && (detectedAnalysis.framework as string) !== 'none') stackParts.push(capitalize(detectedAnalysis.framework));
    if (stackParts.length > 0) {
      steps.push({ label: `Detected project stack: ${stackParts.join(' + ')}`, done: true });
    }
  }
  return steps;
}

/**
 * Build DetectedSetup from providers and analysis for display.
 */
export function buildDetectedSetup(
  providers: Array<{ name: string; available: boolean; authMethod?: string; version?: string }>,
  detectedAnalysis?: { language?: string; framework?: string; testFramework?: string },
): DetectedSetup {
  return {
    nodeVersion: process.version,
    providers: providers.map(p => ({ name: p.name, available: p.available, authMethod: p.authMethod, version: p.version })),
    stack: detectedAnalysis ? { language: detectedAnalysis.language, framework: detectedAnalysis.framework, testFramework: detectedAnalysis.testFramework } : undefined,
  };
}

// ─── Init Outcome Contract (RC2-A / INIT-01, Sprint 412 Task 412-001) ────────
//
// `deckent init` used to print "You're ready!" and exit 0 unconditionally, even
// with no provider CLI and no doctor evidence of a usable setup — a dishonest
// READY for a brand-new user. This section defines a three-state, honestly-
// reported outcome. Pure classification + formatting only; init.ts wires it to
// the real provider/doctor results and process.exitCode.

export type InitOutcome = 'READY' | 'SETUP_INCOMPLETE' | 'FAILED';

export interface InitBlocker {
  /** Machine-stable id (e.g. 'no-provider', 'doctor:Node.js') for tests/tooling. */
  id: string;
  /** Plain-language reason this blocks actual usage. */
  reason: string;
  /** ONE-LINE exact remediation, including a runnable command example. */
  remediation: string;
}

export interface InitOutcomeResult {
  outcome: InitOutcome;
  blockers: InitBlocker[];
}

/** Failed-doctor-check shape needed to build blockers (subset of DoctorResult['checks'] entries). */
export interface FailedDoctorCheckInput {
  name: string;
  message: string;
}

export interface InitUsageBlockerInput {
  /** Count of AI provider CLIs detected as available (any auth method). */
  availableProviderCount: number;
  /** Required doctor checks still failing AFTER auto-provisioning was attempted. */
  failedRequiredDoctorChecks: FailedDoctorCheckInput[];
  /** Set when the doctor-verification step itself threw — readiness could not be confirmed. */
  doctorVerificationError?: string;
}

/**
 * Build the ordered list of usage blockers from real provider/doctor evidence.
 * Empty result -> nothing blocks usage (candidate for READY). Pure — no fs/process access.
 *
 * Note: "no provider CLI" and "no auth" collapse into a single 'no-provider' blocker.
 * `core/provider.ts` detection only proves CLI *presence*, not live session/auth state
 * (that is the separate PSL-6 `probeProviderAuth` probe, intentionally not wired into
 * init's flow by this task — see task 412-001 notes); an authenticated-state gap that a
 * REQUIRED doctor check can actually catch is covered by the doctor-check blocker below.
 */
export function buildInitUsageBlockers(input: InitUsageBlockerInput, lang: string): InitBlocker[] {
  const blockers: InitBlocker[] = [];

  if (input.availableProviderCount === 0) {
    blockers.push({
      id: 'no-provider',
      reason: getMessage('init.outcome_blocker_no_provider', lang),
      remediation: getMessage('init.outcome_remediation_no_provider', lang, {
        cmd: `${PROVIDER_PACKAGES.claude.installHint} && claude login`,
      }),
    });
  }

  for (const check of input.failedRequiredDoctorChecks) {
    blockers.push({
      id: `doctor:${check.name}`,
      reason: getMessage('init.outcome_blocker_doctor_check', lang, { name: check.name, message: check.message }),
      remediation: getMessage('init.outcome_remediation_doctor_check', lang),
    });
  }

  if (input.doctorVerificationError) {
    blockers.push({
      id: 'doctor-verification-failed',
      reason: getMessage('init.outcome_blocker_doctor_verification_failed', lang, { error: input.doctorVerificationError }),
      remediation: getMessage('init.outcome_remediation_doctor_verification_failed', lang),
    });
  }

  return blockers;
}

/** FAILED wins over everything (an init step actually threw); otherwise blockers decide. */
export function classifyInitOutcome(hadFatalFailure: boolean, blockers: InitBlocker[]): InitOutcome {
  if (hadFatalFailure) return 'FAILED';
  return blockers.length > 0 ? 'SETUP_INCOMPLETE' : 'READY';
}

/** Exit code for the three-state contract: READY=0, SETUP_INCOMPLETE=2, FAILED=1. */
export function initOutcomeExitCode(outcome: InitOutcome): number {
  switch (outcome) {
    case 'READY': return 0;
    case 'SETUP_INCOMPLETE': return 2;
    case 'FAILED': return 1;
  }
}

/**
 * Render the outcome block printed at the END of `deckent init` output: the
 * literal state token (language-independent, for scripts/tests) plus a
 * localized explanation, and — for SETUP_INCOMPLETE — the blocker/remediation
 * list. SETUP_INCOMPLETE NEVER uses "You're ready" language.
 */
export function formatInitOutcomeBlock(result: InitOutcomeResult, lang: string): string {
  const lines: string[] = ['', getMessage('init.outcome_header', lang, { outcome: result.outcome })];

  if (result.outcome === 'READY') {
    lines.push(getMessage('init.outcome_ready_message', lang));
  } else if (result.outcome === 'SETUP_INCOMPLETE') {
    lines.push(getMessage('init.outcome_setup_incomplete_message', lang));
    lines.push(getMessage('init.outcome_blockers_header', lang));
    const fixLabel = getMessage('init.outcome_fix_label', lang);
    result.blockers.forEach((blocker, i) => {
      lines.push(`  ${i + 1}. ${blocker.reason}`);
      lines.push(`     ${fixLabel}: ${blocker.remediation}`);
    });
  } else {
    lines.push(getMessage('init.outcome_failed_message', lang));
  }

  return lines.join('\n');
}
