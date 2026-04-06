import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { DECKENT_DIR, DECKENT_VERSION } from '../../core/constants.js';
import { runWizard } from '../helpers/wizard.js';
import type { WizardStep } from '../helpers/wizard.js';
import { detectProjectStack } from '../../core/stack-detector.js';

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
    print('Claude CLI: not found — install with: npm install -g @anthropic-ai/claude-code');
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

export function registerOnboard(program: Command): void {
  program
    .command('onboard')
    .description('Run the onboarding wizard')
    .option('--non-interactive', 'Skip interactive prompts, use defaults')
    .option('--force', 'Re-run onboarding even if already initialized')
    .action(async (opts: { nonInteractive?: boolean; force?: boolean }) => {
      let root: string;
      try {
        root = resolveProjectRoot();
      } catch {
        root = process.cwd();
      }
      // Auto-detect non-interactive if stdin is not a TTY
      const isNonInteractive = opts.nonInteractive || !process.stdin.isTTY;
      await runOnboard(root, { nonInteractive: isNonInteractive, force: opts.force });
    });
}
