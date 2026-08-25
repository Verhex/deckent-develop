import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createElement } from 'react';
import { render } from 'ink';
import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { DECKENT_DIR, DECKENT_VERSION } from '../../core/constants.js';
import { runWizard } from '../helpers/wizard.js';
import type { WizardStep } from '../helpers/wizard.js';
import { detectProjectStack } from '../../core/stack-detector.js';
import { PROVIDER_PACKAGES } from '../../core/provider-packages.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import {
  runOnboardingWizard,
  type OnboardingWizardResult,
  type OnboardingConfigWritePlan,
} from '../helpers/onboarding-wizard.js';
import {
  OnboardingWizardView,
  buildProviderDetectRows,
  buildAuthStatusRows,
  buildMcpInfoRows,
  buildSummaryRows,
  type OnboardingUiContext,
  type OnboardingLabelResolver,
  type OnboardingInfoRow,
  type OnboardingRowTone,
} from '../repl/onboarding-ui.js';
import {
  dryRunOnboardingApply,
  applyOnboardingPlan,
  type OnboardingApplyReport,
  type OnboardingApplyResult,
  type OnboardingApplyFieldChange,
} from '../helpers/onboarding-apply.js';
import { cliContractMessage } from '../helpers/message-catalog/cli-run.js';

// ─── Helpers ────────────────────────────────────────────────────────

export function detectClaudeCli(): { available: boolean; version: string } {
  try {
    const result = spawnSync('claude', ['--version'], { encoding: 'utf-8', timeout: 5_000, shell: process.platform === 'win32' });
    if (result.status === 0 && !result.error) {
      return { available: true, version: result.stdout.trim() };
    }
  } catch {
    // ignore
  }
  return { available: false, version: '' };
}

export interface ProviderStatus {
  codex: { available: boolean; reason: string };
  gemini: { available: boolean; reason: string };
}

/**
 * Detect whether Codex (OpenAI) and Gemini providers are available.
 * Codex: OPENAI_API_KEY env var present.
 * Gemini: GOOGLE_API_KEY env var present.
 */
export function detectProviders(): ProviderStatus {
  const openaiKey = process.env['OPENAI_API_KEY'];
  const googleKey = process.env['GOOGLE_API_KEY'];

  return {
    codex: {
      available: !!openaiKey,
      reason: openaiKey ? 'OPENAI_API_KEY detected' : 'OPENAI_API_KEY not set',
    },
    gemini: {
      available: !!googleKey,
      reason: googleKey ? 'GOOGLE_API_KEY detected' : 'GOOGLE_API_KEY not set',
    },
  };
}

export function detectProjectInfo(root: string): {
  name: string;
  hasPackageJson: boolean;
  hasTsConfig: boolean;
  hasGitIgnore: boolean;
  language: string;
  framework: string;
  testFramework: string;
} {
  let name = 'unknown';
  let hasPackageJson = false;
  let hasTsConfig = false;
  const hasGitIgnore = existsSync(join(root, '.gitignore'));
  let language = 'unknown';
  let framework = '';
  let testFramework = '';

  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    hasPackageJson = true;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string };
      name = pkg.name ?? 'unknown';
    } catch {
      // ignore
    }
  }

  if (existsSync(join(root, 'tsconfig.json'))) {
    hasTsConfig = true;
    language = 'TypeScript';
  } else if (hasPackageJson) {
    language = 'JavaScript';
  }

  // Use richer stack detection if available
  try {
    const stack = detectProjectStack(root);
    if (stack.language) language = stack.language;
    if (stack.framework) framework = stack.framework;
    if (stack.testFramework) testFramework = stack.testFramework;
  } catch {
    // fall through with basic detection
  }

  return { name, hasPackageJson, hasTsConfig, hasGitIgnore, language, framework, testFramework };
}

export function buildOnboardSteps(projectName: string): WizardStep[] {
  return [
    {
      id: 'language',
      prompt: 'Select language / Dil secin',
      type: 'select',
      choices: [
        { label: 'English', value: 'en' },
        { label: 'Turkce', value: 'tr' },
      ],
      default: 'en',
    },
    {
      id: 'mode',
      prompt: 'Select working mode',
      type: 'select',
      choices: [
        { label: 'performance (premium tier, max power)', value: 'performance' },
        { label: 'balanced (standard brain + premium workers)', value: 'balanced' },
        { label: 'economic (standard tier, cost-efficient)', value: 'economic' },
        { label: 'api (pay-per-use, premium brain + standard workers)', value: 'api' },
      ],
      default: 'performance',
    },
    {
      id: 'runInit',
      prompt: `Run deckent init for "${projectName}"?`,
      type: 'confirm',
      default: true,
    },
  ];
}

export async function runOnboard(root: string, opts: { nonInteractive?: boolean; force?: boolean }): Promise<void> {
  // 1. Welcome message
  print('');
  print('=== Welcome to deckent ===');
  print(`Version: ${DECKENT_VERSION}`);
  print('');

  // 2. Detect Claude subscription
  const claude = detectClaudeCli();
  if (claude.available) {
    print(`Claude CLI: v${claude.version}`);
  } else {
    print(`Claude CLI: not found — install with: ${PROVIDER_PACKAGES.claude.installHint}`);
  }

  // 3. Provider detection
  const providers = detectProviders();
  print(`Codex (OpenAI): ${providers.codex.available ? 'available' : 'not available'} — ${providers.codex.reason}`);
  print(`Gemini (Google): ${providers.gemini.available ? 'available' : 'not available'} — ${providers.gemini.reason}`);
  print('');

  // 4. System profile
  const profile = getSystemProfile();
  print(`System: ${profile.cpuCores} CPU cores, ${(profile.totalMemMB / 1024).toFixed(1)} GB RAM`);
  print(`Recommended workers: ${profile.recommendedMaxWorkers}`);
  print('');

  // 5. Project analysis (richer stack detection)
  const project = detectProjectInfo(root);
  print(`Project: ${project.name}`);
  print(`Language: ${project.language}`);
  if (project.framework) print(`Framework: ${project.framework}`);
  if (project.testFramework) print(`Test framework: ${project.testFramework}`);
  print(`package.json: ${project.hasPackageJson ? 'found' : 'not found'}`);
  print(`tsconfig.json: ${project.hasTsConfig ? 'found' : 'not found'}`);
  print('');

  // 6. Already initialized check
  const alreadyInitialized = existsSync(join(root, DECKENT_DIR));
  if (alreadyInitialized && !opts.force) {
    print('Workspace: .deckent/ already exists (use --force to re-run onboarding)');
  } else if (alreadyInitialized && opts.force) {
    print('Workspace: .deckent/ already exists — force re-init requested');
  }

  // 7. Wizard steps
  const steps = buildOnboardSteps(project.name);
  const answers = await runWizard(steps, { nonInteractive: opts.nonInteractive });

  // 8. Run deckent init if requested, passing language and mode as args
  const shouldInit = answers['runInit'] === true && (!alreadyInitialized || opts.force);
  if (shouldInit) {
    const language = String(answers['language'] ?? 'en');
    const mode = String(answers['mode'] ?? 'performance');

    const initArgs = ['deckent', 'init', '--force'];
    if (language && language !== 'en') {
      initArgs.push('--language', language);
    }
    if (mode) {
      initArgs.push('--mode', mode);
    }

    const initResult = spawnSync('npx', initArgs, {
      cwd: root,
      encoding: 'utf-8',
      stdio: 'inherit',
      timeout: 30_000,
    });
    if (initResult.status === 0) {
      print('Initialization complete.');
    } else {
      print('Initialization skipped (run manually: deckent init).');
    }
  } else if (alreadyInitialized && !opts.force) {
    print('Skipped init: workspace already exists.');
  }

  // 9. Ready message
  print('');
  print('Ready! Next steps:');
  print('  1. Edit DIRECTIVES.md with your sprint goals');
  print('  2. Run: deckent start');
  print('');
}

// ─── ONB-ENTRY-WIRE (Sprint 363 Task 363-005) ──────────────────────────────
//
// Wires the 361-009 onboarding machine (helpers/onboarding-wizard.ts,
// `runOnboardingWizard`) and the 362-011 Ink UI (repl/onboarding-ui.tsx,
// `OnboardingWizardView`) into `deckent onboard`, alongside the pre-existing
// stub flow above (`runOnboard`/`buildOnboardSteps`), which stays untouched
// as the fallback for `--non-interactive` / non-TTY invocations — preserving
// prior behavior for its two existing test files (out of this task's write
// scope). Two new paths:
//   - `--plan-only` (+ `--json`): the non-interactive, hermetic CI/test path
//     — runs the machine once and prints the resulting plan. Read-only: no
//     config.json write, no `deckent init` spawn.
//   - TTY (no `--plan-only`, no `--non-interactive`, stdin is a TTY): mounts
//     the Ink `OnboardingWizardView` card flow via `react`'s `createElement`
//     (no JSX — this file is `.ts`, not `.tsx`).
// Actually persisting the confirmed plan to disk is explicitly out of this
// task's scope (NO-GO guard: real write must never be the default) — the
// `OnboardingConfigWritePlan` stays `applied: false` by contract; the Ink
// flow's apply-confirm reports that nothing was written and stops.

/** `[OK]` / `[WARN]` / `[--]` prefix per row tone — mirrors `connect.ts`'s bracket-marker convention. */
function onboardingToneMarker(tone: OnboardingRowTone): string {
  return tone === 'ok' ? '[OK]' : tone === 'warn' ? '[WARN]' : '[--]';
}

/**
 * Text report for `--plan-only` (non-JSON). Reuses the 362-011 Ink UI's own
 * pure row-builders (`buildProviderDetectRows`/`buildAuthStatusRows`/
 * `buildMcpInfoRows`/`buildSummaryRows`) — no formatting logic is reinvented
 * here, only getMessage-resolved text + tone markers laid out as sections.
 */
export function formatOnboardingPlanReport(result: OnboardingWizardResult, lang: string): string {
  const lines: string[] = [getMessage('onboarding.plan.title', lang), ''];

  const section = (titleKey: string, rows: readonly OnboardingInfoRow[]): void => {
    lines.push(getMessage(titleKey, lang));
    for (const row of rows) {
      lines.push(`  ${onboardingToneMarker(row.tone)} ${getMessage(row.labelKey, lang, row.labelParams)}`);
    }
    lines.push('');
  };

  section('onboarding.plan.section.providers', buildProviderDetectRows(result.providers));
  section('onboarding.plan.section.auth', buildAuthStatusRows(result.providers));
  section('onboarding.plan.section.mcp', buildMcpInfoRows(result.mcp));
  section(
    'onboarding.plan.section.summary',
    buildSummaryRows({ workspace: result.workspace, providerSelection: result.providerSelection, plan: result.configPlan }),
  );

  return lines.join('\n').trimEnd();
}

/**
 * `--plan-only` — the non-interactive CI/test path. Runs the 361-009 machine
 * once with real (read-only) probes and prints the resulting plan. Never
 * prompts, never writes config.json, never spawns `deckent init`.
 */
export async function runOnboardPlanOnly(root: string, opts: { json?: boolean } = {}): Promise<void> {
  const lang = getLangFromConfig(root);
  const project = detectProjectInfo(root);
  const result = await runOnboardingWizard({ projectRoot: root, language: lang, projectName: project.name });

  if (opts.json) {
    print(JSON.stringify(result, null, 2));
  } else {
    print(formatOnboardingPlanReport(result, lang));
  }
}

/**
 * TTY interactive path — mounts the 362-011 Ink UI over one upfront machine
 * run. `onApply` never performs a real write (out of scope, see module doc
 * above): it just lets the component's own "applied" screen render, then
 * prints an explicit "nothing was written" notice once unmounted so the
 * plan-preview nature of this flow is never ambiguous to the user.
 */
export async function runOnboardInkFlow(root: string): Promise<void> {
  const lang = getLangFromConfig(root);
  const project = detectProjectInfo(root);
  const wizard = await runOnboardingWizard({ projectRoot: root, language: lang, projectName: project.name });

  const context: OnboardingUiContext = {
    projectRoot: root,
    platform: process.platform,
    env: process.env,
    language: lang,
    projectName: project.name,
  };
  const resolveLabel: OnboardingLabelResolver = (key, params) => getMessage(key, lang, params);

  let unmountApp: (() => void) | null = null;
  let applied = false;

  const element = createElement(OnboardingWizardView, {
    wizard,
    context,
    resolveLabel,
    onApply: (_plan: OnboardingConfigWritePlan) => {
      applied = true;
      setTimeout(() => unmountApp?.(), 150);
    },
    onCancel: () => {
      setTimeout(() => unmountApp?.(), 150);
    },
  });

  const { unmount, waitUntilExit } = render(element);
  unmountApp = unmount;
  await waitUntilExit();

  if (applied) {
    print(getMessage('onboarding.plan.not_applied', lang));
  }
}

// ─── ONB-APPLY-WIRE (Sprint 367 Task 367-005) ──────────────────────────────
//
// Wires 366-006's onboarding-apply.ts (plan→apply, atomic, reversible report,
// dry-run parity) into `deckent onboard` — the piece 363-005 explicitly left
// out ("Actually persisting the confirmed plan to disk is explicitly out of
// this task's scope", see `runOnboardInkFlow` above). This is an ADDITIVE
// path behind new `--apply` / `--dry-run` / `--yes` flags: it never changes
// the pre-existing TTY-Ink flow's `onApply` (still a no-write preview-confirm,
// per its own tests) nor the pre-existing non-interactive stub flow
// (`runOnboard`, which still spawns `deckent init` — untouched, out of this
// task's scope per its own NO-GO guard on init.ts). Project-scope only: the
// wizard's workspace-scope question is never overridden to 'global' here.

/** Renders a `previous → new` value for the apply report; `undefined` gets an honest i18n label rather than the literal string "undefined". */
function formatOnboardingApplyValue(value: unknown, lang: string): string {
  if (value === undefined) return getMessage('onboarding.apply.value_none', lang);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Shared "before/after" field-change section for both the dry-run preview and the post-apply report — one implementation, so the two texts can never drift apart (mirrors dry-run/apply parity itself). */
function formatOnboardingApplyFieldChanges(
  fieldChanges: readonly OnboardingApplyFieldChange[],
  lang: string,
): string[] {
  const changed = fieldChanges.filter((c) => c.changed);
  if (changed.length === 0) {
    return [getMessage('onboarding.apply.no_changes', lang)];
  }
  return [
    getMessage('onboarding.apply.section.changes', lang),
    ...changed.map(
      (c) =>
        `  ${getMessage('onboarding.apply.field_change', lang, {
          key: c.key,
          previous: formatOnboardingApplyValue(c.previousValue, lang),
          next: formatOnboardingApplyValue(c.newValue, lang),
        })}`,
    ),
  ];
}

/** Read-only preview report (`--dry-run`): what applying the plan WOULD change, never written. */
export function formatOnboardingApplyPreview(report: OnboardingApplyReport, lang: string): string {
  const lines: string[] = [
    getMessage('onboarding.apply.preview.title', lang),
    '',
    getMessage('onboarding.ui.summary.config_path', lang, { path: report.configPath }),
    '',
    ...formatOnboardingApplyFieldChanges(report.fieldChanges, lang),
  ];
  return lines.join('\n').trimEnd();
}

/** Post-apply report: the same before/after field list, now confirmed written + verified. */
export function formatOnboardingApplyResult(result: OnboardingApplyResult, lang: string): string {
  const lines: string[] = [
    getMessage('onboarding.apply.result.title', lang),
    '',
    getMessage('onboarding.ui.summary.config_path', lang, { path: result.configPath }),
    '',
    ...formatOnboardingApplyFieldChanges(result.fieldChanges, lang),
    '',
    getMessage('onboarding.apply.applied', lang, { path: result.configPath }),
  ];
  if (!result.verified) {
    lines.push(
      getMessage('onboarding.apply.verification_failed', lang, {
        errors: result.verificationErrors.join('; '),
      }),
    );
  }
  return lines.join('\n').trimEnd();
}

/** Injectable stdin/stdout seam so the confirmation prompt is hermetically testable with a fake input stream (mirrors `WizardOpts`). */
export interface OnboardingApplyFlowOptions {
  dryRun?: boolean;
  autoYes?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/** The "onay" (confirm) step — a single reused `runWizard` confirm question, same readline machinery `runOnboard`'s own steps already use. */
async function confirmOnboardingApply(
  configPath: string,
  lang: string,
  io: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream },
): Promise<boolean> {
  const answers = await runWizard(
    [
      {
        id: 'confirmApply',
        prompt: getMessage('onboarding.apply.confirm_prompt', lang, { path: configPath }),
        type: 'confirm',
        default: false,
      },
    ],
    { input: io.input, output: io.output },
  );
  return answers['confirmApply'] === true;
}

/**
 * plan-göster → onay → apply → öncesi-değer raporu. Runs the wizard once
 * (project-scope), shows the resulting plan, then either previews (`dryRun`),
 * or confirms (unless `autoYes`) and applies via `applyOnboardingPlan`,
 * printing the before/after report either way.
 */
export async function runOnboardApply(root: string, opts: OnboardingApplyFlowOptions = {}): Promise<void> {
  const lang = getLangFromConfig(root);
  const project = detectProjectInfo(root);
  const wizard = await runOnboardingWizard({ projectRoot: root, language: lang, projectName: project.name });
  const plan = wizard.configPlan;

  print(formatOnboardingPlanReport(wizard, lang));

  const preview = dryRunOnboardingApply(plan);

  if (opts.dryRun) {
    print(formatOnboardingApplyPreview(preview, lang));
    print(getMessage('onboarding.apply.dry_run_notice', lang));
    return;
  }

  const confirmed =
    opts.autoYes === true
      ? true
      : await confirmOnboardingApply(plan.configPath, lang, { input: opts.input, output: opts.output });

  if (!confirmed) {
    print(getMessage('onboarding.apply.cancelled', lang));
    return;
  }

  const result = applyOnboardingPlan(plan);
  print(formatOnboardingApplyResult(result, lang));
}

export function registerOnboard(program: Command): void {
  const helpLang = getLanguage(undefined);
  program
    .command('onboard')
    .description(getMessage('cli.onboard.desc', getLanguage(undefined)))
    .option('--non-interactive', cliContractMessage('cliContract.onboard.opt.non_interactive', helpLang))
    .option('--force', cliContractMessage('cliContract.onboard.opt.force', helpLang))
    .option('--plan-only', cliContractMessage('cliContract.onboard.opt.plan_only', helpLang))
    .option('--json', cliContractMessage('cliContract.onboard.opt.json', helpLang))
    .option('--apply', cliContractMessage('cliContract.onboard.opt.apply', helpLang))
    .option('--dry-run', cliContractMessage('cliContract.onboard.opt.dry_run', helpLang))
    .option('-y, --yes', cliContractMessage('cliContract.onboard.opt.yes', helpLang))
    .action(async (opts: {
      nonInteractive?: boolean;
      force?: boolean;
      planOnly?: boolean;
      json?: boolean;
      apply?: boolean;
      dryRun?: boolean;
      yes?: boolean;
    }) => {
      let root: string;
      try {
        root = resolveProjectRoot();
      } catch {
        root = process.cwd();
      }

      if (opts.planOnly) {
        await runOnboardPlanOnly(root, { json: opts.json });
        return;
      }

      if (opts.apply || opts.dryRun || opts.yes) {
        await runOnboardApply(root, { dryRun: !!opts.dryRun, autoYes: !!opts.yes });
        return;
      }

      // Auto-detect non-interactive if stdin is not a TTY
      const isNonInteractive = opts.nonInteractive || !process.stdin.isTTY;
      if (!isNonInteractive) {
        await runOnboardInkFlow(root);
        return;
      }
      await runOnboard(root, { nonInteractive: isNonInteractive, force: opts.force });
    });
}
