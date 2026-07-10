/**
 * init.ts — Thin router for `deckent init` command.
 *
 * Delegates to:
 * - init-templates.ts: content/template generators
 * - init-wizard.ts: format helpers, wizard types, language detection
 * - init-steps.ts: core filesystem operations
 *
 * Re-exports all public symbols for backward compatibility (ADR-012).
 * Split from 1566 LoC monolith (Sprint 144 Task 1).
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { PlanMode } from '../../core/types.js';
import { generateSetupRecommendation } from '../auto-setup.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { detectSubscription } from '../../core/subscription.js';
import { analyzeProject } from '../../core/analyzer.js';
import { showSplash } from '../helpers/splash.js';
import { detectEnvironment } from '../../core/environment.js';
import { detectFullStack } from '../../core/stack-detector.js';
import type { FullStackResult } from '../../core/stack-detector.js';
import { DECKENT_VERSION } from '../../core/constants.js';
import { promptText, promptSelect, promptConfirm } from '../helpers/prompt.js';
import {
  provisionMissing,
  resolveProvisionMode,
  collectMissingTools,
  planInstall,
} from '../../core/provisioner.js';
import { print, printError } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { detectAvailableProviders } from '../../core/provider.js';
import { DECKENT_DIR } from '../../core/constants.js';
import { DEFAULT_WORKER_IMAGE } from '../../core/worker-image-check.js';
import { handleImageBuild } from './image.js';
import type { ImageBuildOptions } from './image.js';
import {
  detectIDEEnvironment,
  getMCPGuidance,
  buildProviderWizardSteps,
  resolveProviderWizardResult,
  formatProviderAuthGuidance,
  runWizard,
} from '../helpers/wizard.js';
import type { ProviderName } from '../../core/task-types.js';
import { runDoctorChecks } from './doctor.js';

// ─── Sub-module imports ─────────────────────────────────────────────

import {
  formatWelcomeBanner,
  formatDetectedSetup,
  formatSetupProgress,
  formatNextSteps,
  formatRecommendations,
  detectSystemLanguage,
  buildSetupSteps,
  buildDetectedSetup,
} from './init-wizard.js';

import {
  createDirectories,
  clearStaleCaches,
  writeConfig,
  writeStackAndDeckentFile,
  writeAgentFiles,
  writeMultiEnvConfig,
  writeDeckSecurityFiles,
  writeRuleFiles,
  writeDirectivesFile,
  writeBrainFiles,
  writeI18nFiles,
  updateGitignore,
  writeProviderConfig,
  ALL_ENV_NAMES,
} from './init-steps.js';

// ─── Re-exports for backward compatibility ──────────────────────────

export {
  // init-wizard.ts
  formatWelcomeBanner,
  formatDetectedSetup,
  formatSetupProgress,
  formatNextSteps,
  formatRecommendations,
  detectSystemLanguage,
  capitalize,
} from './init-wizard.js';
export type { DetectedSetup, SetupStep } from './init-wizard.js';

export {
  // init-steps.ts
  ensureDir,
  writeIfNotExists,
  appendToGitignore,
  applyIdeAdapters,
  applyEnvConfig,
} from './init-steps.js';
export type { EnvName, IdeAdapterResult } from './init-steps.js';

export {
  // init-templates.ts
  generateCursorDeckentMd,
  generateVscodeMcpJson,
  generateToolsContent,
  generateDeckentContentTR,
  generateDeckentContentEN,
  generateDirectivesTemplateTR,
  generateDirectivesTemplateEN,
  generateQuickStartDoc,
  generateDirectivesGuideDoc,
  generateConfigReferenceDoc,
  generateBootContent,
} from './init-templates.js';

// ─── Opt-in worker-image build offer (F1-IMG-2) ─────────────────────
//
// Onboarding integration for the standalone `deckent image build` command
// (image.ts). After the core init steps, when docker is available and the
// worker image is absent, OFFER (opt-in only) to build it — delegating to the
// existing handleImageBuild (never re-implemented here). Honest-skip with an
// actionable message when docker is absent; never auto-build without opt-in;
// never block init on docker. CI / non-interactive / --no-image → no prompt,
// default skip (the heavy build stays opt-in; `deckent image build` remains the
// explicit unattended path).
//
// ADR-001 ESM .js imports + Node 24. ADR-010 Node built-ins only.

/** Outcome of the onboarding worker-image offer — surfaced for callers + tests. */
export type WorkerImageOfferOutcome =
  | 'opted-out' // --no-image / --yes / non-interactive → no prompt, no build
  | 'docker-absent' // docker unavailable → honest skip, init continues
  | 'image-present' // already built → silent skip
  | 'declined' // user said no at the opt-in prompt
  | 'built' // handleImageBuild succeeded (exit 0)
  | 'build-failed'; // handleImageBuild returned non-zero

export interface WorkerImageOfferOptions {
  /** Auto-accept CI flag (`init --yes`) — treated as "no prompt, default skip" (never auto-builds). */
  yes?: boolean;
  /** Explicit opt-out (`init --no-image`). */
  noImage?: boolean;
  /** Non-interactive context (no TTY / piped / CI) — never prompt. */
  nonInteractive?: boolean;
  /** Language code (en|tr). */
  lang?: string;
  /** Image tag override; defaults to config `worker_image` then DEFAULT_WORKER_IMAGE. */
  image?: string;
}

/** Injectable seams — defaults wire the real docker probes + handleImageBuild; tests inject mocks. */
export interface WorkerImageOfferSeams {
  /** Is the docker daemon available? Default: async `docker info` exit 0. */
  isDockerAvailable?: () => Promise<boolean>;
  /** Is the worker image already built locally? Default: async `docker image inspect <tag>` exit 0. */
  isWorkerImagePresent?: (image: string) => Promise<boolean>;
  /** Opt-in confirm prompt. Default: promptConfirm(msg, false). */
  confirm?: (message: string) => Promise<boolean>;
  /** Build delegate — defaults to handleImageBuild (image.ts); never re-implemented. */
  buildImage?: (opts: ImageBuildOptions) => Promise<number>;
}

interface ResolvedWorkerImagePlan {
  image: string;
  withCodex: boolean;
  withGemini: boolean;
}

/**
 * Resolve the image tag + provider build-args from the just-written project
 * config, mirroring the sibling helpers (init-steps.maybeProvisionDockerImage /
 * upgrade.reprovisionWorkerImageAfterUpgrade). Best-effort: any read/parse
 * failure falls back to DEFAULT_WORKER_IMAGE with claude-only build-args.
 */
function resolveWorkerImagePlan(root: string, imageOverride?: string): ResolvedWorkerImagePlan {
  let image = imageOverride?.trim() || DEFAULT_WORKER_IMAGE;
  let providers: string[] = [];
  try {
    const configPath = join(root, DECKENT_DIR, 'config.json');
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      if (!imageOverride) {
        const workerImage = cfg['worker_image'];
        if (typeof workerImage === 'string' && workerImage.trim()) image = workerImage.trim();
      }
      providers = [cfg['worker_provider'], cfg['brain_provider']].filter(
        (p): p is string => typeof p === 'string' && p.length > 0,
      );
    }
  } catch {
    /* defaults — never block init on a config read */
  }
  return {
    image,
    withCodex: providers.includes('codex'),
    withGemini: providers.includes('gemini'),
  };
}

/** Resolve docker daemon availability via async `docker info` (never spawnSync). */
function probeDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: boolean): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const child = nodeSpawn('docker', ['info'], { stdio: 'ignore' });
      child.on('error', () => done(false));
      child.on('close', (code) => done(code === 0));
    } catch {
      done(false);
    }
  });
}

/** Resolve worker-image presence via async `docker image inspect <tag>` (never spawnSync). */
function probeWorkerImagePresent(image: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: boolean): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const child = nodeSpawn('docker', ['image', 'inspect', image], { stdio: 'ignore' });
      child.on('error', () => done(false));
      child.on('close', (code) => done(code === 0));
    } catch {
      done(false);
    }
  });
}

/**
 * Offer (opt-in) to build the deckent-worker docker image during onboarding.
 *
 * Never throws and never blocks init: every docker problem resolves to an
 * honest skip outcome. Builds ONLY when interactive, docker is available, the
 * image is absent, and the user confirms. Delegates the actual build to the
 * existing {@link handleImageBuild} (image.ts) — the build is never
 * re-implemented here.
 */
export async function maybeOfferWorkerImageBuild(
  root: string,
  options: WorkerImageOfferOptions = {},
  seams: WorkerImageOfferSeams = {},
): Promise<WorkerImageOfferOutcome> {
  const lang = getLanguage(options.lang);

  // CI / non-interactive / explicit opt-out → never prompt, never auto-build.
  // A heavy multi-GB image build is opt-in only; `deckent image build` remains
  // the explicit unattended path.
  if (options.noImage || options.yes || options.nonInteractive) {
    return 'opted-out';
  }

  const isDockerAvailable = seams.isDockerAvailable ?? probeDockerAvailable;
  if (!(await isDockerAvailable())) {
    // Honest skip — never silent, never block init.
    // TODO(phase2): add i18n key init.worker_image_docker_absent (messages.ts owned by Task 10).
    print(
      '\n  Docker not found — skipped the isolated worker image. ' +
        'Install Docker and run `deckent image build` later to enable container workers.',
    );
    return 'docker-absent';
  }

  const plan = resolveWorkerImagePlan(root, options.image);

  const isWorkerImagePresent = seams.isWorkerImagePresent ?? probeWorkerImagePresent;
  if (await isWorkerImagePresent(plan.image)) {
    return 'image-present'; // already built — nothing to offer
  }

  // docker present + image absent → OPT-IN prompt.
  // TODO(phase2): add i18n key init.worker_image_offer (messages.ts owned by Task 10).
  const question = `  Build the isolated worker image (${plan.image}) now? (Docker)`;
  const confirm = seams.confirm ?? ((message: string) => promptConfirm(message, false));
  if (!(await confirm(question))) {
    print(`  ${getMessage('doctor.image_fix_declined', lang)}`);
    return 'declined';
  }

  const buildImage = seams.buildImage ?? handleImageBuild;
  const code = await buildImage({
    tag: plan.image,
    lang: options.lang,
    withCodex: plan.withCodex,
    withGemini: plan.withGemini,
  });
  return code === 0 ? 'built' : 'build-failed';
}

/** Normalize a caught value to a display message (for failedSteps reporting). */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─── registerInit — ADR-012 pattern ────────────────────────────────

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize a new Deckent project')
    .option('--auto', 'Auto-detect system, subscription, and project to generate recommendations')
    .option('--manual', 'Skip auto-detection, use interactive prompts only')
    .option('--cursor', 'Configure for Cursor IDE environment')
    .option('--claude-code', 'Configure for Claude Code environment (default)')
    .option('--env <envs>', 'Comma-separated environments to configure (codex,cursor,gemini,vscode,shell)')
    .option('--all-envs', 'Configure ALL environment configs')
    .option('--upgrade', 'Update existing files while preserving user customizations (merge strategy)')
    .option('--force', 'Force overwrite of existing env files without warning')
    .option('--repair', 'Show which init steps failed and how to fix them')
    .option('-y, --yes', 'Install all missing prerequisites without prompting (CI)')
    .option('--no-install', 'Detect missing prerequisites but never install them (legacy hint-only)')
    .option('--no-image', 'Skip the opt-in worker Docker image build offer (no prompt)')
    .action(async (options: { auto?: boolean; manual?: boolean; cursor?: boolean; claudeCode?: boolean; env?: string; allEnvs?: boolean; upgrade?: boolean; force?: boolean; repair?: boolean; yes?: boolean; install?: boolean; image?: boolean }) => {
      const root = resolveProjectRoot();
      const failedSteps: Array<{ step: string; error: string }> = [];
      let currentStep = 'startup';

      try {
        let mode: PlanMode;
        let language: string;
        let projectName: string;
        let detectedAnalysis: ReturnType<typeof analyzeProject> | undefined;

        const dirName = root.split(/[\\/]/).pop() ?? 'my-project';

        // Kraken splash (non-fatal)
        try {
          const splash = showSplash(DECKENT_VERSION);
          if (splash) print(splash);
        } catch (error) {
          failedSteps.push({ step: 'splash', error: toErrorMessage(error) });
        }

        print(formatWelcomeBanner());

        if (options.auto && !options.manual) {
          // Auto-detect mode
          const systemProfile = getSystemProfile();
          const subscription = detectSubscription();
          detectedAnalysis = analyzeProject(root);

          const recommendation = generateSetupRecommendation(
            systemProfile,
            subscription.detected,
            detectedAnalysis,
          );

          mode = recommendation.mode;
          language = detectSystemLanguage();
          projectName = dirName;

          const recommendationDisplay = formatRecommendations(recommendation.reasons);
          if (recommendationDisplay) print(recommendationDisplay);
        } else {
          // Interactive mode
          language = await promptSelect('Select language / Dil seçin:', [
            { label: 'English', value: 'en' },
            { label: 'Türkçe', value: 'tr' },
          ]);

          mode = await promptSelect<PlanMode>(getMessage('init.select_plan', language), [
            { label: 'Performance — 8 workers, premium tier brain + workers', value: 'performance' },
            { label: 'Balanced — 5 workers, standard brain + premium workers', value: 'balanced' },
            { label: 'Economic — 3 workers, standard tier only', value: 'economic' },
            { label: 'API (pay-as-you-go) — 10 workers, premium brain + standard workers', value: 'api' },
          ]);

          projectName = await promptText(getMessage('init.enter_project_name', language), dirName);
        }

        // 4. Create directories
        currentStep = 'create-directories';
        createDirectories(root);

        // 4b. Clear stale caches
        currentStep = 'clear-stale-caches';
        clearStaleCaches(root);

        // 5. Config
        currentStep = 'write-config';
        await writeConfig(root, mode, language, projectName);

        // 6. Stack detection
        let stackResult: FullStackResult = {
          language: 'unknown',
          framework: 'unknown',
          buildTool: 'unknown',
          testFramework: 'unknown',
          commands: { build: '', test: '', lint: '', typecheck: '' },
        };
        let stackDetected = false;
        currentStep = 'stack-detection';
        try {
          stackResult = detectFullStack(root);
          stackDetected = true;
        } catch (error) {
          failedSteps.push({ step: 'stack-detection', error: toErrorMessage(error) });
        }

        if (!detectedAnalysis) {
          try {
            detectedAnalysis = analyzeProject(root);
          } catch (error) {
            failedSteps.push({ step: 'project-analysis', error: toErrorMessage(error) });
          }
        }

        currentStep = 'write-stack-file';
        writeStackAndDeckentFile(root, language, projectName, stackResult, stackDetected);

        // 7. Agent files
        currentStep = 'write-agent-files';
        const detectedEnv = detectEnvironment();
        writeAgentFiles(root, detectedEnv, { force: options.force, allEnvs: options.allEnvs });

        // 7c. Multi-environment config
        currentStep = 'write-multi-env-config';
        const requestedEnvs = options.allEnvs
          ? [...ALL_ENV_NAMES]
          : options.env
            ? options.env.split(',').map(e => e.trim()).filter(e => ALL_ENV_NAMES.includes(e as typeof ALL_ENV_NAMES[number])) as typeof ALL_ENV_NAMES[number][]
            : [];
        writeMultiEnvConfig(root, requestedEnvs);

        // 7d. Security files
        currentStep = 'write-security-files';
        writeDeckSecurityFiles(root);

        // 8. Rule files — all supported providers (Claude/Codex/Gemini/Cursor)
        currentStep = 'write-rule-files';
        await writeRuleFiles(root);

        // 9. DIRECTIVES.md
        currentStep = 'write-directives-file';
        writeDirectivesFile(root, language, stackResult, projectName);

        // 10. Brain files
        currentStep = 'write-brain-files';
        writeBrainFiles(root, projectName, language, stackResult, detectedAnalysis);

        // 10d. i18n
        currentStep = 'write-i18n-files';
        writeI18nFiles(root);

        // 11. .gitignore
        currentStep = 'update-gitignore';
        updateGitignore(root);

        // ── Provider detection & wizard ──────────────────────────────
        currentStep = 'detect-providers';
        const providers = await detectAvailableProviders();

        print(formatDetectedSetup(buildDetectedSetup(providers, detectedAnalysis)));

        const availableProviderNames = providers.filter(p => p.available).map(p => p.name);
        print(formatSetupProgress(buildSetupSteps(availableProviderNames, detectedAnalysis)));

        const authGuidance = formatProviderAuthGuidance(providers);
        if (authGuidance.length > 0) {
          print('');
          for (const line of authGuidance) {
            print(line);
          }
        }

        // Provider selection
        currentStep = 'provider-wizard';
        const { autoConfig, steps: providerSteps } = buildProviderWizardSteps(providers);
        let providerConfig: { brain_provider: ProviderName; worker_provider: ProviderName; fallback_provider?: ProviderName };

        if (autoConfig) {
          providerConfig = autoConfig;
          if (autoConfig.selectedProviders.length === 1) {
            print(`\n  Auto-configured: ${autoConfig.selectedProviders[0]} (only available provider)`);
          }
        } else if (options.auto) {
          const availableProviders = providers.filter(p => p.available);
          const firstAvailable = availableProviders[0]!.name;
          providerConfig = {
            brain_provider: firstAvailable,
            worker_provider: firstAvailable,
          };
          if (availableProviders.length > 1) {
            providerConfig.fallback_provider = availableProviders[1]!.name;
          }
        } else {
          print('');
          const wizardResult = await runWizard(providerSteps, { nonInteractive: false });
          providerConfig = resolveProviderWizardResult(wizardResult, providers);
        }

        currentStep = 'write-provider-config';
        writeProviderConfig(root, mode, language, projectName, providerConfig);

        // 7e. Run deckent doctor + consent-based provisioning of missing tools
        try {
          const doctorResult = runDoctorChecks(root);
          const missing = collectMissingTools(providers, doctorResult.checks);
          if (missing.length > 0) {
            const mode = resolveProvisionMode({ yes: options.yes, noInstall: options.install === false });
            if (mode === 'no-install') {
              print(`\n  Missing prerequisites: ${missing.join(', ')} — run 'deckent doctor' for install hints`);
            } else {
              print(`\n  Missing prerequisites detected: ${missing.join(', ')}`);
              const provisionResults = await provisionMissing({
                missing,
                mode,
                confirm: async (tool, instruction) =>
                  promptConfirm(`  Install ${tool}? (${instruction})`, false),
                log: print,
              });
              for (const r of provisionResults) {
                if (r.status === 'installed') print(`  ✓ ${r.tool} installed`);
                else if (r.status === 'failed') print(`  ✗ ${r.tool} install failed: ${r.error}`);
                else if (r.reason === 'manual') print(`  → ${r.tool}: ${planInstall(r.tool).instruction}`);
                else print(`  • ${r.tool} skipped`);
              }
            }
          }
          // Re-verify after provisioning
          const finalDoctor = runDoctorChecks(root);
          if (!finalDoctor.ok) {
            const failedChecks = finalDoctor.checks.filter(c => c.required && !c.passed);
            print(`\n  Health check: ${failedChecks.length} issue(s) remaining — run 'deckent doctor' for details`);
          }
        } catch (error) {
          failedSteps.push({ step: 'doctor-checks', error: toErrorMessage(error) });
        }

        // ── IDE environment detection & MCP guidance ────────────────
        const ideEnv = options.cursor ? 'cursor' as const
          : options.claudeCode ? 'claude-code' as const
          : detectIDEEnvironment(root);
        const mcpGuidance = getMCPGuidance(ideEnv);
        print('');
        for (const line of mcpGuidance) {
          print(line);
        }

        print(`\n  Environment: ${detectedEnv}`);
        if (detectedEnv === 'codex') {
          print('  Created AGENTS.md for Codex integration');
        } else if (detectedEnv === 'gemini') {
          print('  Created GEMINI.md for Gemini integration');
        } else if (detectedEnv === 'cursor') {
          print('  Created .cursor/rules/deckent.mdc for Cursor integration');
        }

        // ── Opt-in worker Docker image build offer (F1-IMG-2) ────────
        // Additive, non-fatal: never blocks init, never auto-builds without
        // opt-in. CI / non-interactive / --no-image → silent default skip.
        try {
          await maybeOfferWorkerImageBuild(root, {
            yes: options.yes,
            noImage: options.image === false,
            nonInteractive: !process.stdin.isTTY,
            lang: language,
          });
        } catch (error) {
          failedSteps.push({ step: 'worker-image-build', error: toErrorMessage(error) });
        }

        print(formatNextSteps(language));

        if (options.repair && failedSteps.length > 0) {
          print('\n  Failed steps:');
          for (const step of failedSteps) {
            print(`  ✗ ${step.step}: ${step.error}`);
          }
          print('\n  To retry: deckent init --upgrade');
        }
      } catch (error) {
        failedSteps.push({ step: currentStep, error: toErrorMessage(error) });
        printError(error);
        print(`\n  Init failed. To retry after fixing the issue: deckent init --upgrade`);
        if (failedSteps.length > 0) {
          print('  Previously failed steps:');
          for (const step of failedSteps) {
            print(`  ✗ ${step.step}: ${step.error}`);
          }
        }
        process.exitCode = 1;
      }
    });
}

