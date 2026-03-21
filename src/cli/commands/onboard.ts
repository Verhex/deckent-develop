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

// ─── Helpers ────────────────────────────────────────────────────────

export function detectClaudeCli(): { available: boolean; version: string } {
  try {
    const result = spawnSync('claude', ['--version'], { encoding: 'utf-8', timeout: 5_000 });
    if (result.status === 0 && !result.error) {
      return { available: true, version: result.stdout.trim() };
    }
  } catch {
    // ignore
  }
  return { available: false, version: '' };
}

export function detectProjectInfo(root: string): {
  name: string;
  hasPackageJson: boolean;
  hasTsConfig: boolean;
  hasGitIgnore: boolean;
  language: string;
} {
  let name = 'unknown';
  let hasPackageJson = false;
  let hasTsConfig = false;
  const hasGitIgnore = existsSync(join(root, '.gitignore'));
  let language = 'unknown';

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

  return { name, hasPackageJson, hasTsConfig, hasGitIgnore, language };
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
      prompt: 'Select plan mode',
      type: 'select',
      choices: [
        { label: 'max_plan (Max subscription, opus model)', value: 'max_plan' },
        { label: 'pro_plan (Pro subscription, sonnet model)', value: 'pro_plan' },
        { label: 'max5x_plan (Max 5x, high throughput)', value: 'max5x_plan' },
      ],
      default: 'max_plan',
    },
    {
      id: 'runInit',
      prompt: `Run deckent init for "${projectName}"?`,
      type: 'confirm',
      default: true,
    },
  ];
}

export async function runOnboard(root: string, opts: { nonInteractive?: boolean }): Promise<void> {
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

  // 3. System profile
  const profile = getSystemProfile();
  print(`System: ${profile.cpuCores} CPU cores, ${(profile.totalMemMB / 1024).toFixed(1)} GB RAM`);
  print(`Recommended workers: ${profile.recommendedMaxWorkers}`);
  print('');

  // 4. Project analysis
  const project = detectProjectInfo(root);
  print(`Project: ${project.name}`);
  print(`Language: ${project.language}`);
  print(`package.json: ${project.hasPackageJson ? 'found' : 'not found'}`);
  print(`tsconfig.json: ${project.hasTsConfig ? 'found' : 'not found'}`);
  print('');

  // 5. Config recommendation
  const alreadyInitialized = existsSync(join(root, DECKENT_DIR));
  if (alreadyInitialized) {
    print('Workspace: .deckent/ already exists');
  }

  // 6. Wizard steps
  const steps = buildOnboardSteps(project.name);
  const answers = await runWizard(steps, { nonInteractive: opts.nonInteractive });

  // 7. Run deckent init if requested
  if (answers['runInit'] === true && !alreadyInitialized) {
    const initResult = spawnSync('npx', ['deckent', 'init', '--force'], {
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
  } else if (alreadyInitialized) {
    print('Skipped init: workspace already exists.');
  }

  // 8. Ready message
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
    .action(async (opts: { nonInteractive?: boolean }) => {
      let root: string;
      try {
        root = resolveProjectRoot();
      } catch {
        root = process.cwd();
      }
      // Auto-detect non-interactive if stdin is not a TTY
      const isNonInteractive = opts.nonInteractive || !process.stdin.isTTY;
      await runOnboard(root, { nonInteractive: isNonInteractive });
    });
}
