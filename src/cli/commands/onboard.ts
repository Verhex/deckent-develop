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
import { getMessage } from '../helpers/messages.js';
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

export function registerOnboard(program: Command): void {
  program
    .command('onboard')
    .description('Run the onboarding wizard')
    .option('--non-interactive', 'Skip interactive prompts, use defaults')
    .option('--force', 'Re-run onboarding even if already initialized')
    .option('--plan-only', 'Print the onboarding plan without prompting (non-interactive, CI/test path)')
    .option('--json', 'Output the --plan-only report as JSON')
    .action(async (opts: { nonInteractive?: boolean; force?: boolean; planOnly?: boolean; json?: boolean }) => {
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

      // Auto-detect non-interactive if stdin is not a TTY
      const isNonInteractive = opts.nonInteractive || !process.stdin.isTTY;
      if (!isNonInteractive) {
        await runOnboardInkFlow(root);
        return;
      }
      await runOnboard(root, { nonInteractive: isNonInteractive, force: opts.force });
    });
}
