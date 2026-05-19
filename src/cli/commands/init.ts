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

import { writeFileSync, existsSync } from 'node:fs';
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
import { getMessage } from '../helpers/messages.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { detectAvailableProviders } from '../../core/provider.js';
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
  writeClaudeRules,
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
    .action(async (options: { auto?: boolean; manual?: boolean; cursor?: boolean; claudeCode?: boolean; env?: string; allEnvs?: boolean; upgrade?: boolean; force?: boolean; repair?: boolean; yes?: boolean; install?: boolean }) => {
      const root = resolveProjectRoot();
      const failedSteps: Array<{ step: string; error: string }> = [];

      const writeFile = (filePath: string, content: string): void => {
        if (options.upgrade || !existsSync(filePath)) {
          writeFileSync(filePath, content);
        }
      };

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
        } catch { /* splash failure is non-fatal */ }

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
        createDirectories(root);

        // 4b. Clear stale caches
        clearStaleCaches(root);

        // 5. Config
        await writeConfig(root, mode, language, projectName);

        // 6. Stack detection
        let stackResult: FullStackResult = {
          language: 'unknown',
          framework: 'unknown',
          buildTool: 'unknown',
          testFramework: 'unknown',
          commands: { build: '', test: '', lint: '' },
        };
        let stackDetected = false;
        try {
          stackResult = detectFullStack(root);
          stackDetected = true;
        } catch { /* fallback to defaults */ }

        if (!detectedAnalysis) {
          try {
            detectedAnalysis = analyzeProject(root);
          } catch { /* non-fatal */ }
        }

        const { buildCmd: _buildCmd, testCmd, lintCmd } = writeStackAndDeckentFile(
          root, language, projectName, stackResult, stackDetected,
        );

        // 7. Agent files
        const detectedEnv = detectEnvironment();
        writeAgentFiles(root, detectedEnv, { force: options.force, allEnvs: options.allEnvs });

        // 7c. Multi-environment config
        const requestedEnvs = options.allEnvs
          ? [...ALL_ENV_NAMES]
          : options.env
            ? options.env.split(',').map(e => e.trim()).filter(e => ALL_ENV_NAMES.includes(e as typeof ALL_ENV_NAMES[number])) as typeof ALL_ENV_NAMES[number][]
            : [];
        writeMultiEnvConfig(root, projectName, requestedEnvs, stackResult, {
          upgrade: options.upgrade,
          force: options.force,
        });

        // 7d. Security files
        writeDeckSecurityFiles(root);

        // 8. Claude rules
        writeClaudeRules(root, writeFile, lintCmd, testCmd);

        // 9. DIRECTIVES.md
        writeDirectivesFile(root, language, stackResult, projectName);

        // 10. Brain files
        writeBrainFiles(root, projectName, mode, language, stackResult, detectedAnalysis);

        // 10d. i18n
        writeI18nFiles(root);

        // 11. .gitignore
        updateGitignore(root);

        // ── Provider detection & wizard ──────────────────────────────
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
        } catch { /* doctor failure is non-fatal */ }

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

        print(formatNextSteps(language));

        if (options.repair && failedSteps.length > 0) {
          print('\n  Failed steps:');
          for (const step of failedSteps) {
            print(`  ✗ ${step.step}: ${step.error}`);
          }
          print('\n  To retry: deckent init --upgrade');
        }
      } catch (error) {
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

