import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import type { Command } from 'commander';
import type { PlanMode } from '../../core/types.js';
import { generateSetupRecommendation } from '../auto-setup.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { detectSubscription } from '../../core/subscription.js';
import { analyzeProject } from '../../core/analyzer.js';
import { showSplash } from '../helpers/splash.js';
import { detectEnvironment } from '../../core/environment.js';
import type { DetectedEnv } from '../../core/environment.js';
import { createDeckTemplate, ensureDeckGitignore } from '../../core/deck-file.js';
import { generateCodexConfig } from '../helpers/codex-config.js';
import { generateGeminiConfig } from '../helpers/gemini-config.js';
import { generateCursorConfig } from '../helpers/cursor-config.js';
import { generateAgentsMd, generateGeminiMd, generateCursorRules } from '../helpers/agent-templates.js';
import { detectFullStack } from '../../core/stack-detector.js';
import type { FullStackResult } from '../../core/stack-detector.js';
import { generateProjectConventionsSkill, getGeneratedContent, generateTempAgents } from '../../orchestra/temp-skill-generator.js';
import type { ProjectStack } from '../../core/skill-types.js';
import {
  DECKENT_DIR,
  BRAIN_DIR,
  TASKS_DIR,
  LOCKS_DIR,
  CLAUDE_RULES_DIR,
  WORKSPACE_DIR,
  PLUGINS_DIR,
  I18N_DIR,
  DASHBOARD_FILE,
  DIRECTIVES_FILE,
  AGENTS_FILE,
  CLAUDE_FILE,
  DECKENT_FILE,
  MEMORY_FILE,
  DECISIONS_FILE,
  DEBT_FILE,
  PATTERNS_FILE,
  RETRO_FILE,
  PROJECT_IDENTITY_FILE,
  DECKENT_VERSION,
} from '../../core/constants.js';
import { generateProjectIdentity } from '../../orchestra/sprint-reporter.js';
import { ensureDeckentImport } from '../../core/utils.js';
import { deepMerge } from '../../core/config.js';
import { promptText, promptSelect } from '../helpers/prompt.js';
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
import { getModePreset } from '../../core/mode-presets.js';
import { runDoctorChecks } from './doctor.js';
import { isDockerAvailable } from '../../orchestra/spawn-backend-docker.js';

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeIfNotExists(filePath: string, content: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, content);
  }
}

// ─── Human-Friendly Output Helpers ───────────────────────────────────

export interface DetectedSetup {
  nodeVersion?: string;
  providers: Array<{ name: string; available: boolean; authMethod?: string; version?: string }>;
  stack?: { language?: string; framework?: string; testFramework?: string };
}

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

export interface SetupStep {
  label: string;
  done: boolean;
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
  ].join('\n');
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generateToolsContent(root: string): string {
  const lines = ['# Tools\n'];
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (scripts) {
      for (const [name, cmd] of Object.entries(scripts)) {
        lines.push(`- **${name}**: \`${cmd}\``);
      }
    }
  } catch {
    lines.push('No package.json found. Add your build/test commands here.');
  }
  return lines.join('\n') + '\n';
}

function appendToGitignore(root: string, entries: string[]): void {
  const gitignorePath = join(root, '.gitignore');
  let existing = '';
  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, 'utf-8');
  }
  const linesToAdd = entries.filter((e) => !existing.includes(e));
  if (linesToAdd.length > 0) {
    const suffix = existing.endsWith('\n') || existing === '' ? '' : '\n';
    writeFileSync(gitignorePath, existing + suffix + linesToAdd.join('\n') + '\n');
  }
}

/** Valid environment names for --env flag */
export type EnvName = 'codex' | 'cursor' | 'gemini' | 'vscode' | 'shell';
const ALL_ENV_NAMES: EnvName[] = ['codex', 'cursor', 'gemini', 'vscode', 'shell'];

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

// ─── IDE Adapter Helpers ──────────────────────────────────────────────

/**
 * Generate content for .cursor/rules/deckent.md adapter.
 * Starts with @DECKENT.md reference (single-source principle, ADR-013).
 */
export function generateCursorDeckentMd(): string {
  return `@DECKENT.md

# Deckent — Cursor Integration

This project uses Deckent for AI agent orchestration.

## Workflow
1. \`deckent init\` — Initialize project
2. \`deckent set-directives\` — Set sprint goals in DIRECTIVES.md
3. \`deckent plan\` — Plan sprint tasks (mode: ai/structured/auto)
4. \`deckent start\` — Launch workers
5. \`deckent status\` — Monitor progress
6. \`deckent review\` — Evaluate results (GO/NO_GO/GO_WITH_TECH_DEBT)
7. \`deckent retro\` — Sprint retrospective
8. \`deckent cleanup\` — Archive and clean

## Rules
- Follow DIRECTIVES.md for sprint goals
- Respect file scope boundaries
- Run tests before reporting completion
- Brain is the ONLY orchestrator — workers never plan
`;
}

/**
 * Generate content for .vscode/mcp.json MCP registration.
 * Registers deckent MCP server so VS Code AI tools can discover it.
 */
export function generateVscodeMcpJson(): string {
  return JSON.stringify(
    {
      servers: {
        deckent: {
          command: 'npx',
          args: ['deckent', 'mcp'],
          env: {},
        },
      },
    },
    null,
    2,
  ) + '\n';
}

export interface IdeAdapterResult {
  path: string;
  action: 'created' | 'exists' | 'skipped';
}

/**
 * Auto-detect IDE directories and create Deckent adapter files.
 * Called automatically during `deckent init`.
 *
 * Detection rules:
 * - .cursor/ exists (or --all-envs) → create .cursor/rules/deckent.md
 * - .vscode/ exists (or --all-envs) → create .vscode/mcp.json if missing
 * - codex.md missing → ensure AGENTS.md has @DECKENT.md reference
 *
 * All adapters start with @DECKENT.md (single-source principle, ADR-013).
 */
export function applyIdeAdapters(
  root: string,
  opts: { force?: boolean; allEnvs?: boolean } = {},
): IdeAdapterResult[] {
  const results: IdeAdapterResult[] = [];

  // 1. Cursor: .cursor/ dir exists OR --all-envs flag
  const cursorDir = join(root, '.cursor');
  if (opts.allEnvs || existsSync(cursorDir)) {
    const rulesDir = join(cursorDir, 'rules');
    const adapterPath = join(rulesDir, 'deckent.md');
    if (!existsSync(adapterPath) || opts.force) {
      mkdirSync(rulesDir, { recursive: true });
      writeFileSync(adapterPath, generateCursorDeckentMd());
      results.push({ path: adapterPath, action: 'created' });
    } else {
      results.push({ path: adapterPath, action: 'exists' });
    }
  }

  // 2. VS Code: .vscode/ dir exists OR --all-envs flag
  const vscodeDir = join(root, '.vscode');
  if (opts.allEnvs || existsSync(vscodeDir)) {
    const mcpPath = join(vscodeDir, 'mcp.json');
    if (!existsSync(mcpPath) || opts.force) {
      mkdirSync(vscodeDir, { recursive: true });
      writeFileSync(mcpPath, generateVscodeMcpJson());
      results.push({ path: mcpPath, action: 'created' });
    } else {
      results.push({ path: mcpPath, action: 'exists' });
    }
  }

  // 3. Codex: if codex.md is absent, ensure AGENTS.md has @DECKENT.md reference
  const codexMdPath = join(root, 'codex.md');
  if (!existsSync(codexMdPath)) {
    const agentsPath = join(root, AGENTS_FILE);
    ensureDeckentImport(agentsPath);
    results.push({ path: agentsPath, action: 'created' });
  }

  return results;
}

/**
 * Apply multi-environment config for a single environment name.
 * Creates environment-specific files using stack-aware templates.
 */
export function applyEnvConfig(env: EnvName, root: string, projectInfo: { name: string; language: string; framework: string; commands: { build: string; test: string; lint: string } }): void {
  if (env === 'codex') {
    generateCodexConfig(root);
    writeFileSync(join(root, 'AGENTS.md'), generateAgentsMd(projectInfo));
  } else if (env === 'gemini') {
    generateGeminiConfig(root);
    writeFileSync(join(root, 'GEMINI.md'), generateGeminiMd(projectInfo));
  } else if (env === 'cursor') {
    generateCursorConfig(root);
    const cursorRulesDir = join(root, '.cursor', 'rules');
    mkdirSync(cursorRulesDir, { recursive: true });
    writeFileSync(join(cursorRulesDir, 'deckent.mdc'), generateCursorRules(projectInfo));
  }
  // vscode and shell: CLAUDE.md already handled by default flow
}

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
    .action(async (options: { auto?: boolean; manual?: boolean; cursor?: boolean; claudeCode?: boolean; env?: string; allEnvs?: boolean; upgrade?: boolean; force?: boolean; repair?: boolean }) => {
      const root = resolveProjectRoot();

      // Track step failures for error recovery
      const failedSteps: Array<{ step: string; error: string }> = [];

      // Helper: write file (respecting --upgrade flag)
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

        // Welcome banner
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
          // A) Detect language from system locale instead of hardcoding 'en'
          language = detectSystemLanguage();
          projectName = dirName;

          // B) Show recommendation reasons
          const recommendationDisplay = formatRecommendations(recommendation.reasons);
          if (recommendationDisplay) print(recommendationDisplay);
        } else {
          // Interactive mode (default or --manual)
          // Step 1: Language selection FIRST (bilingual label since language is unknown)
          language = await promptSelect('Select language / Dil seçin:', [
            { label: 'English', value: 'en' },
            { label: 'Türkçe', value: 'tr' },
          ]);

          // Step 2: Plan selection in selected language (tier-based labels)
          mode = await promptSelect<PlanMode>(getMessage('init.select_plan', language), [
            { label: 'Performance — 8 workers, premium tier brain + workers', value: 'performance' },
            { label: 'Balanced — 5 workers, standard brain + premium workers', value: 'balanced' },
            { label: 'Economic — 3 workers, standard tier only', value: 'economic' },
            { label: 'API (pay-as-you-go) — 10 workers, premium brain + standard workers', value: 'api' },
          ]);

          // Step 3: Project name in selected language
          projectName = await promptText(getMessage('init.enter_project_name', language), dirName);
        }

        // 4. Create directories
        ensureDir(join(root, DECKENT_DIR));
        ensureDir(join(root, WORKSPACE_DIR));
        ensureDir(join(root, BRAIN_DIR));
        ensureDir(join(root, BRAIN_DIR, 'sprints'));
        ensureDir(join(root, TASKS_DIR));
        ensureDir(join(root, LOCKS_DIR));
        ensureDir(join(root, CLAUDE_RULES_DIR));
        ensureDir(join(root, PLUGINS_DIR));
        ensureDir(join(root, I18N_DIR));

        // 4b. Clear stale caches on re-init (project-stack, ci-baseline)
        const staleCaches = ['project-stack.json', 'ci-baseline.json', 'safety-point.json'];
        for (const cache of staleCaches) {
          const cachePath = join(root, DECKENT_DIR, cache);
          if (existsSync(cachePath)) {
            try { writeFileSync(cachePath, '{}'); } catch { /* non-fatal */ }
          }
        }

        // 5. Config (merge — preserve existing fields)
        const configPath = join(root, DECKENT_DIR, 'config.json');
        const newConfig: Record<string, unknown> = { mode, language, projectName };
        // Apply tier-based model_strategy from mode preset
        const modePreset = getModePreset(mode);
        if (modePreset) {
          newConfig.model_strategy = modePreset.model_strategy;
        }
        // Auto-detect best spawn backend
        if (platform() === 'win32') {
          newConfig.spawn_backend = 'subprocess';
        } else if (!newConfig.spawn_backend) {
          // Detect Docker — if available, recommend it for isolated workers
          if (isDockerAvailable()) {
            newConfig.spawn_backend = 'docker';
            print('  ✓ Docker detected → spawn_backend: docker (isolated worker containers)');
            // Check if worker image exists
            const { spawnSync: sp } = await import('node:child_process');
            const imgCheck = sp('docker', ['images', '-q', 'deckent-worker:latest'], {
              encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'],
            });
            if (!(imgCheck.stdout?.trim())) {
              print('  ⚠ deckent-worker image not found — build with:');
              print('    docker build -f Dockerfile.worker -t deckent-worker:latest .');
            }
          }
        }
        if (existsSync(configPath)) {
          try {
            const existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
            const merged = deepMerge(existing, newConfig);
            writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');
          } catch {
            writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n');
          }
        } else {
          writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n');
        }

        // 6. Stack detection — ALWAYS run (not just --auto)
        let buildCmd = 'tsc';
        let testCmd = 'npx vitest run';
        let lintCmd = 'tsc --noEmit';
        let stackResult: FullStackResult = {
          language: 'unknown',
          framework: 'unknown',
          buildTool: 'unknown',
          testFramework: 'unknown',
          commands: { build: '', test: '', lint: '' },
        };
        try {
          stackResult = detectFullStack(root);
          // Empty string is valid (e.g. Python has no build step) — use explicit check
          if (stackResult.commands.build !== undefined) buildCmd = stackResult.commands.build || 'echo "no build step"';
          if (stackResult.commands.test) testCmd = stackResult.commands.test;
          if (stackResult.commands.lint) lintCmd = stackResult.commands.lint;
        } catch { /* fallback to defaults above */ }
        // Also run analyzeProject if not already done (--auto sets detectedAnalysis)
        if (!detectedAnalysis) {
          try {
            detectedAnalysis = analyzeProject(root);
          } catch { /* non-fatal */ }
        }

        const deckentContent = language === 'tr'
          ? generateDeckentContentTR(projectName, buildCmd, testCmd, lintCmd)
          : generateDeckentContentEN(projectName, buildCmd, testCmd, lintCmd);
        writeIfNotExists(join(root, DECKENT_FILE), deckentContent);

        // 7. Agent files — additive injection, never overwrite
        writeIfNotExists(join(root, AGENTS_FILE), `@${DECKENT_FILE}\n`);
        ensureDeckentImport(join(root, AGENTS_FILE));
        ensureDeckentImport(join(root, CLAUDE_FILE));

        // 7b. Environment-aware config files
        const detectedEnv: DetectedEnv = detectEnvironment();
        if (detectedEnv === 'codex') {
          const agentsMdContent = `# AGENTS.md — Deckent Integration
This project uses Deckent for AI agent orchestration.
## Sprint Instructions
- Read DIRECTIVES.md for current sprint goals
- Follow task scope boundaries strictly
- Write tests for all changes
## Project Context
@DECKENT.md
`;
          writeIfNotExists(join(root, AGENTS_FILE), agentsMdContent);
        } else if (detectedEnv === 'gemini') {
          const geminiMdContent = `# GEMINI.md — Deckent Integration
This project uses Deckent for AI agent orchestration.
## Context
@DECKENT.md
## Rules
- Follow DIRECTIVES.md for sprint goals
- Respect file scope boundaries
- Run tests before reporting completion
`;
          writeIfNotExists(join(root, 'GEMINI.md'), geminiMdContent);
        } else if (detectedEnv === 'cursor') {
          const cursorRulesDir = join(root, '.cursor', 'rules');
          const cursorRulePath = join(cursorRulesDir, 'deckent.mdc');
          if (!existsSync(cursorRulePath)) {
            mkdirSync(cursorRulesDir, { recursive: true });
            writeFileSync(cursorRulePath, `---
description: Deckent orchestration rules
globs: ["**/*"]
---
# Deckent Integration
@DECKENT.md
- Follow DIRECTIVES.md for sprint goals
- Respect file scope boundaries
- Run tests before reporting completion
`);
          }
        }

        // 7b2. IDE adapter auto-detection (directory-based)
        // Detects .cursor/ / .vscode/ directories and creates adapter files.
        // Independent of --env flag: runs for every init.
        try {
          const ideResults = applyIdeAdapters(root, { force: options.force, allEnvs: options.allEnvs });
          for (const r of ideResults) {
            if (r.action === 'created') {
              if (r.path.includes('.cursor')) {
                print('  Created .cursor/rules/deckent.md for Cursor integration');
              } else if (r.path.includes('.vscode')) {
                print('  Created .vscode/mcp.json for VS Code MCP registration');
              }
            }
          }
        } catch { /* non-fatal — IDE adapters are best-effort */ }

        // 7c. Multi-environment config (--env / --all-envs flags)
        const requestedEnvs: EnvName[] = options.allEnvs
          ? [...ALL_ENV_NAMES]
          : options.env
            ? options.env.split(',').map(e => e.trim()).filter(e => ALL_ENV_NAMES.includes(e as EnvName)) as EnvName[]
            : [];

        if (requestedEnvs.length > 0) {
          const envFileMap: Record<string, string> = {
            codex: join(root, 'AGENTS.md'),
            gemini: join(root, 'GEMINI.md'),
            cursor: join(root, '.cursor', 'rules', 'deckent.mdc'),
          };

          // C) Conflict detection: warn and skip if env files exist without --force or --upgrade
          const envsToApply: EnvName[] = [];
          for (const env of requestedEnvs) {
            const envFile = envFileMap[env];
            if (envFile && existsSync(envFile) && !options.upgrade && !options.force) {
              print(`  Warning: ${envFile} already exists. Overwrite? (use --force)`);
            } else {
              envsToApply.push(env);
            }
          }

          if (envsToApply.length > 0) {
            // Detect full stack for stack-aware templates
            let stackResult: FullStackResult;
            try {
              stackResult = detectFullStack(root);
            } catch {
              stackResult = {
                language: 'unknown',
                framework: 'unknown',
                buildTool: 'unknown',
                testFramework: 'unknown',
                commands: { build: '', test: '', lint: '' },
              };
            }

            const projectInfo = {
              name: projectName,
              language: stackResult.language,
              framework: stackResult.framework,
              commands: stackResult.commands,
            };

            for (const env of envsToApply) {
              applyEnvConfig(env, root, projectInfo);
            }
          }

          // Set multi_ide_mode if multiple envs requested
          if (requestedEnvs.length > 1) {
            const multiConfigPath = join(root, DECKENT_DIR, 'config.json');
            try {
              const existing = JSON.parse(readFileSync(multiConfigPath, 'utf-8')) as Record<string, unknown>;
              existing['multi_ide_mode'] = true;
              writeFileSync(multiConfigPath, JSON.stringify(existing, null, 2) + '\n');
            } catch {
              // Config not yet written — will be merged later
              writeFileSync(multiConfigPath, JSON.stringify({ multi_ide_mode: true }, null, 2) + '\n');
            }
          }
        }

        // 7d. Create .deck template + ensure .gitignore safety
        try {
          createDeckTemplate(root);
          ensureDeckGitignore(root);
        } catch { /* non-fatal */ }

        // 8. Claude rules (blueprint-quality templates with frontmatter)
        writeFile(
          join(root, CLAUDE_RULES_DIR, 'brain.md'),
          `---\npaths: [".tasks/*", ".brain/*", ".contracts/*"]\n---\n# Brain Rules\n- Always read DIRECTIVES.md first\n- Always check usage before planning\n- Plan mode required before execution\n- Write sprint plan as task JSON files in .tasks/\n- Assign model and effort per task with reason\n- Define scope (directories, filesRead, filesWrite) for each task\n- Define GO/NO-GO criteria for each task\n- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO\n- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix\n- Update MEMORY.md after every sprint (max 300 lines)\n- Write RETRO.md (overwrite, max 100 lines)\n- Trigger decay if .brain/ exceeds 900 lines\n- Sprint is NEVER left incomplete\n`,
        );
        writeFile(
          join(root, CLAUDE_RULES_DIR, 'auditor.md'),
          `---\npaths: [".dashboard", ".brain/PATTERNS.md"]\n---\n# Auditor Rules\n- NEVER write source code\n- Scan every 30 seconds\n- Read all heartbeat files → detect stale agents (>2min = alert)\n- Run git diff --stat → detect boundary violations\n- Check .locks/ → detect stale locks (>5min)\n- Detect circular dependencies / deadlocks\n- Overwrite .dashboard on every scan (never append)\n- Append new patterns to PATTERNS.md (never overwrite)\n- Write alerts for critical issues\n`,
        );
        writeFile(
          join(root, CLAUDE_RULES_DIR, 'worker-default.md'),
          `---\npaths: ["src/**", "tests/**"]\n---\n# Worker Rules\n- Read your task file first\n- Write plan before writing code\n- Check .locks/ before writing any file\n- Create and update heartbeat file (.tasks/task-{id}.hb)\n- Run lint before marking done (${lintCmd})\n- Run tests before marking done (${testCmd})\n- Coverage goal: minimum 80%\n- Document changes\n- Stay within your assigned scope\n- Write result file (.tasks/task-{id}.result) — REQUIRED\n`,
        );

        // 9. DIRECTIVES.md — stack-aware template with example task format
        const directivesContent = language === 'tr'
          ? generateDirectivesTemplateTR(stackResult, projectName)
          : generateDirectivesTemplateEN(stackResult, projectName);
        writeIfNotExists(join(root, DIRECTIVES_FILE), directivesContent);

        // 10. Brain files
        writeIfNotExists(join(root, BRAIN_DIR, MEMORY_FILE), '# Learned Patterns\n');
        writeIfNotExists(join(root, BRAIN_DIR, DECISIONS_FILE), '# Architecture Decisions\n');
        writeIfNotExists(join(root, BRAIN_DIR, DEBT_FILE), '# Tech Debt\n');
        writeIfNotExists(join(root, BRAIN_DIR, PATTERNS_FILE), '# Detected Patterns\n');
        writeIfNotExists(join(root, BRAIN_DIR, RETRO_FILE), '# Sprint Retrospective\n');

        // 10a. PROJECT-IDENTITY.md (permanent memory — never decayed)
        const identityLanguage = detectedAnalysis?.language ?? stackResult.language ?? 'unknown';
        const identityFramework = detectedAnalysis?.framework ?? stackResult.framework ?? 'unknown';
        const identityTestFramework = detectedAnalysis?.testFramework ?? stackResult.testFramework ?? 'unknown';
        const identityBuildTool = detectedAnalysis?.buildTool ?? stackResult.buildTool ?? 'unknown';
        try {
          writeIfNotExists(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), generateProjectIdentity({
            projectName,
            sprintId: 'sprint-000',
            totalSprints: 0,
            mode,
            language: identityLanguage,
            framework: identityFramework,
            testFramework: identityTestFramework,
            buildTool: identityBuildTool,
          }));
        } catch {
          // Non-fatal — create minimal identity
          writeIfNotExists(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), generateProjectIdentity({
            projectName,
            sprintId: 'sprint-000',
            totalSprints: 0,
            mode,
          }));
        }

        // 10a2. Workspace IDENTITY.md — referenced by DECKENT.md (@.deckent/workspace/IDENTITY.md)
        const runtimeName = identityLanguage.toLowerCase().includes('typescript') || identityLanguage.toLowerCase().includes('javascript')
          ? 'Node.js' : identityLanguage.toLowerCase().includes('python')
          ? 'Python' : identityLanguage.toLowerCase().includes('go')
          ? 'Go' : identityLanguage.toLowerCase().includes('rust')
          ? 'Rust' : identityLanguage.toLowerCase().includes('java')
          ? 'Java' : identityLanguage.toLowerCase().includes('c#') || identityLanguage.toLowerCase().includes('csharp')
          ? '.NET' : identityLanguage !== 'unknown' ? identityLanguage : 'unknown';
        const identityContent = `# Project Identity
Name: ${projectName}
Language: ${identityLanguage !== 'unknown' ? identityLanguage : '(not detected — update manually)'}
Framework: ${identityFramework !== 'unknown' && identityFramework !== 'none' ? identityFramework : '(not detected)'}
Test: ${identityTestFramework !== 'unknown' ? identityTestFramework : '(not detected)'}
Build: ${identityBuildTool !== 'unknown' ? identityBuildTool : '(not detected)'}
Runtime: ${runtimeName !== 'unknown' ? runtimeName : '(not detected)'}
Platform: ${platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'macOS' : 'Linux'}
`;
        writeIfNotExists(join(root, WORKSPACE_DIR, 'IDENTITY.md'), identityContent);

        // 10a3. TempSkill + TempAgent — project-specific skills/agents from stack detection
        if (identityLanguage !== 'unknown') {
          try {
            // Read dependencies from package.json / requirements.txt
            let deps: string[] = [];
            try {
              const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
              deps = Object.keys(pkg.dependencies ?? {}).concat(Object.keys(pkg.devDependencies ?? {}));
            } catch {
              try {
                const reqTxt = readFileSync(join(root, 'requirements.txt'), 'utf-8');
                deps = reqTxt.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('==')[0]!.split('>=')[0]!.trim());
              } catch { /* no deps file found */ }
            }

            const projectStack: ProjectStack = {
              language: identityLanguage,
              framework: identityFramework,
              dependencies: deps,
              buildTool: identityBuildTool,
              testFramework: identityTestFramework,
              detectedAt: new Date().toISOString(),
              detectedLanguages: stackResult.detectedLanguages,
            };

            // Generate project-conventions skill
            const conventionsSkill = generateProjectConventionsSkill({
              language: identityLanguage,
              framework: identityFramework,
              testFramework: identityTestFramework,
              buildTool: identityBuildTool,
              dependencies: deps,
            });
            const skillDir = join(root, DECKENT_DIR, 'skills', conventionsSkill.id);
            ensureDir(skillDir);
            writeIfNotExists(join(skillDir, 'manifest.json'), JSON.stringify(conventionsSkill, null, 2) + '\n');
            const skillContent = getGeneratedContent(conventionsSkill);
            if (skillContent) {
              writeIfNotExists(join(skillDir, 'SKILL.md'), skillContent);
            }

            // Generate temp agents based on stack
            const tempAgents = generateTempAgents(projectStack);
            for (const agent of tempAgents) {
              const agentDir = join(root, DECKENT_DIR, 'agents', agent.id);
              ensureDir(agentDir);
              writeIfNotExists(join(agentDir, 'agent.json'), JSON.stringify(agent, null, 2) + '\n');
            }
          } catch { /* non-fatal — temp skills/agents are best-effort */ }
        }

        // 10b. Workspace: TOOLS.md + BOOT.md
        writeIfNotExists(join(root, WORKSPACE_DIR, 'TOOLS.md'), generateToolsContent(root));
        writeIfNotExists(join(root, WORKSPACE_DIR, 'BOOT.md'), generateBootContent(language));

        // 10b2. .deckent/docs/ — user guides
        const docsDir = join(root, DECKENT_DIR, 'docs');
        ensureDir(docsDir);
        writeIfNotExists(join(docsDir, 'quick-start.md'), generateQuickStartDoc(language));
        writeIfNotExists(join(docsDir, 'directives-guide.md'), generateDirectivesGuideDoc(language));
        writeIfNotExists(join(docsDir, 'config-reference.md'), generateConfigReferenceDoc(language));

        // 10c. i18n
        const enMessages = {
          sprint_started: 'Sprint {id} started with {count} tasks',
          sprint_complete: 'Sprint {id} complete',
          task_done: 'Task {id}: DONE',
          task_nogo: 'Task {id}: NO_GO',
          plan_approved: 'Plan approved',
          plan_rejected: 'Plan rejected',
        };
        const trMessages = {
          sprint_started: 'Sprint {id} baslatildi, {count} gorev',
          sprint_complete: 'Sprint {id} tamamlandi',
          task_done: 'Gorev {id}: TAMAMLANDI',
          task_nogo: 'Gorev {id}: BASARISIZ',
          plan_approved: 'Plan onaylandi',
          plan_rejected: 'Plan reddedildi',
        };
        writeIfNotExists(join(root, I18N_DIR, 'en.json'), JSON.stringify(enMessages, null, 2) + '\n');
        writeIfNotExists(join(root, I18N_DIR, 'tr.json'), JSON.stringify(trMessages, null, 2) + '\n');

        // 11. .gitignore (no longer adds .deckent/ — it should be tracked)
        appendToGitignore(root, [
          TASKS_DIR + '/',
          LOCKS_DIR + '/',
          DASHBOARD_FILE,
          BRAIN_DIR + '/archive/',
        ]);

        // ── Provider detection & wizard ──────────────────────────────
        const providers = await detectAvailableProviders();

        // Show detected setup (human-friendly)
        const nodeVer = process.version;
        const detectedSetup: DetectedSetup = {
          nodeVersion: nodeVer,
          providers: providers.map(p => ({
            name: p.name,
            available: p.available,
            authMethod: p.authMethod,
            version: p.version,
          })),
          stack: detectedAnalysis ? {
            language: detectedAnalysis.language,
            framework: detectedAnalysis.framework,
            testFramework: detectedAnalysis.testFramework,
          } : undefined,
        };
        print(formatDetectedSetup(detectedSetup));

        // Show setup progress
        const availableProviderNames = providers.filter(p => p.available).map(p => p.name);
        const setupSteps: SetupStep[] = [
          { label: 'Created .deckent/ configuration', done: true },
          { label: 'Created .brain/ memory system', done: true },
          { label: `Set up ${availableProviderNames[0] ? capitalize(availableProviderNames[0]) : 'Claude'} as brain (Opus), workers (Sonnet)`, done: true },
        ];
        if (availableProviderNames.length > 1) {
          setupSteps.push({ label: `Enabled ${capitalize(availableProviderNames[1]!)} as secondary worker provider`, done: true });
        }
        if (detectedAnalysis) {
          const stackParts: string[] = [];
          if (detectedAnalysis.language && detectedAnalysis.language !== 'unknown') stackParts.push(capitalize(detectedAnalysis.language));
          if (detectedAnalysis.framework && detectedAnalysis.framework !== 'unknown' && (detectedAnalysis.framework as string) !== 'none') stackParts.push(capitalize(detectedAnalysis.framework));
          if (stackParts.length > 0) {
            setupSteps.push({ label: `Detected project stack: ${stackParts.join(' + ')}`, done: true });
          }
        }
        print(formatSetupProgress(setupSteps));

        // Show auth guidance for unavailable providers
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
          // Single or zero providers — auto-configured
          providerConfig = autoConfig;
          if (autoConfig.selectedProviders.length === 1) {
            print(`\n  Auto-configured: ${autoConfig.selectedProviders[0]} (only available provider)`);
          }
        } else if (options.auto) {
          // --auto mode with multiple providers: use first available as brain + worker, second as fallback
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
          // Interactive: run provider wizard
          print('');
          const wizardResult = await runWizard(providerSteps, { nonInteractive: false });
          providerConfig = resolveProviderWizardResult(wizardResult, providers);
        }

        // Write provider config to config.json (merge into existing or write fresh)
        const providerConfigPath = join(root, DECKENT_DIR, 'config.json');
        const providerMerge: Record<string, unknown> = {
          brain_provider: providerConfig.brain_provider,
          worker_provider: providerConfig.worker_provider,
        };
        if (providerConfig.fallback_provider) {
          providerMerge['fallback_provider'] = providerConfig.fallback_provider;
        }
        try {
          const existing = JSON.parse(readFileSync(providerConfigPath, 'utf-8')) as Record<string, unknown>;
          const merged = deepMerge(existing, providerMerge);
          writeFileSync(providerConfigPath, JSON.stringify(merged, null, 2) + '\n');
        } catch {
          // Config file not readable yet — write fresh with provider fields
          const freshConfig: Record<string, unknown> = { mode, language, projectName, ...providerMerge };
          writeFileSync(providerConfigPath, JSON.stringify(freshConfig, null, 2) + '\n');
        }

        // 7e. Run deckent doctor (provider health check)
        try {
          const doctorResult = runDoctorChecks(root);
          if (!doctorResult.ok) {
            const failedChecks = doctorResult.checks.filter(c => c.required && !c.passed);
            print(`\n  Health check: ${failedChecks.length} issue(s) found — run 'deckent doctor' for details`);
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

        // Show detected environment info
        print(`\n  Environment: ${detectedEnv}`);
        if (detectedEnv === 'codex') {
          print('  Created AGENTS.md for Codex integration');
        } else if (detectedEnv === 'gemini') {
          print('  Created GEMINI.md for Gemini integration');
        } else if (detectedEnv === 'cursor') {
          print('  Created .cursor/rules/deckent.mdc for Cursor integration');
        }

        // Human-friendly next steps (replaces old getMessage-based output)
        print(formatNextSteps(language));
        // F) --repair: show which steps failed and how to fix them
        if (options.repair && failedSteps.length > 0) {
          print('\n  Failed steps:');
          for (const step of failedSteps) {
            print(`  ✗ ${step.step}: ${step.error}`);
          }
          print('\n  To retry: deckent init --upgrade');
        }
      } catch (error) {
        // F) Error recovery — show which step failed with context
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

// ─── DIRECTIVES.md Templates ─────────────────────────────────────────

function getExampleSkill(stack: FullStackResult): string {
  const lang = stack.language?.toLowerCase() ?? '';
  if (lang.includes('typescript') || lang.includes('javascript')) return 'typescript-expert';
  if (lang.includes('python')) return 'testing-expert';
  if (lang.includes('go') || lang.includes('rust')) return 'testing-expert';
  return 'testing-expert';
}

function getExampleFiles(stack: FullStackResult): string {
  const lang = stack.language?.toLowerCase() ?? '';
  if (lang.includes('typescript') || lang.includes('javascript')) return 'src/index.ts, src/utils.ts';
  if (lang.includes('python')) return 'src/main.py, src/utils.py';
  if (lang.includes('go')) return 'cmd/main.go, internal/handler.go';
  if (lang.includes('rust')) return 'src/main.rs, src/lib.rs';
  return 'src/';
}

function generateDirectivesTemplateTR(stack: FullStackResult, projectName: string): string {
  const testCmd = stack.commands.test || 'npm test';
  const skill = getExampleSkill(stack);
  const files = getExampleFiles(stack);
  return `# DIRECTIVES — Sprint 001: ${projectName} İlk Sprint

## Goal: Projenizin ilk sprint hedefini buraya yazın. Örnek: "Kullanıcı authentication sistemi ekle" veya "API endpoint'lerini oluştur"

---

## Task 1: Örnek — Bu task'ı düzenleyin veya silin
- Model: sonnet
- Effort: normal
- Skills: ${skill}
- Files: ${files}
- Scope: src/

### Description
Bu örnek task'tır. Kendi hedefinize göre düzenleyin.

Her task şunları içermelidir:
- **Model:** opus (karmaşık), sonnet (genel), haiku (basit)
- **Effort:** low (<1 saat), normal (1-3 saat), high (3+ saat)
- **Skills:** Uzmanlık alanı (typescript-expert, testing-expert, vb.)
- **Files:** Değiştirilecek dosyalar
- **Scope:** İzin verilen dizinler

**Kanıt:** \`${testCmd}\` → tüm testler geçmeli

**Test:** 3+ test (temel davranış, edge case, hata durumu)

---

<!-- DIRECTIVES.md Kullanım Rehberi:
     1. Bu dosyayı düzenleyin — sprint hedefinizi ve task'larınızı yazın
     2. deckent plan — task'ları planlar
     3. deckent start — sprint'i başlatır
     Detaylı format rehberi: .deckent/docs/directives-guide.md -->
`;
}

function generateDirectivesTemplateEN(stack: FullStackResult, projectName: string): string {
  const testCmd = stack.commands.test || 'npm test';
  const skill = getExampleSkill(stack);
  const files = getExampleFiles(stack);
  return `# DIRECTIVES — Sprint 001: ${projectName} First Sprint

## Goal: Write your first sprint goal here. Example: "Add user authentication" or "Create API endpoints"

---

## Task 1: Example — Edit or delete this task
- Model: sonnet
- Effort: normal
- Skills: ${skill}
- Files: ${files}
- Scope: src/

### Description
This is an example task. Edit it to match your goals.

Each task should include:
- **Model:** opus (complex), sonnet (general), haiku (simple)
- **Effort:** low (<1 hour), normal (1-3 hours), high (3+ hours)
- **Skills:** Expertise area (typescript-expert, testing-expert, etc.)
- **Files:** Files to be modified
- **Scope:** Allowed directories

**Proof:** \`${testCmd}\` → all tests should pass

**Test:** 3+ tests (basic behavior, edge case, error handling)

---

<!-- DIRECTIVES.md Usage Guide:
     1. Edit this file — write your sprint goal and tasks
     2. deckent plan — plans the tasks
     3. deckent start — starts the sprint
     Detailed format guide: .deckent/docs/directives-guide.md -->
`;
}

// ─── DECKENT.md Templates ────────────────────────────────────────────

function generateDeckentContentTR(projectName: string, buildCmd: string, testCmd: string, lintCmd: string): string {
  return `# ${projectName} — Deckent Orchestrated

## Identity
@.deckent/workspace/IDENTITY.md

## Rules
- Brain is the ONLY orchestrator — workers never plan
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Sprint is NEVER left incomplete
- Memory budget: 900 lines max in .brain/

## Workflow
1. \`deckent init\` — Projeyi başlat
2. \`deckent set-directives\` — Sprint hedeflerini yaz (DIRECTIVES.md)
3. \`deckent plan\` — Task'ları planla (mode: ai/structured/auto)
4. \`deckent start\` — Worker'ları başlat
5. \`deckent status\` — İlerlemeyi izle
6. \`deckent review\` — Sonuçları değerlendir (GO/NO_GO/GO_WITH_TECH_DEBT)
7. \`deckent retro\` — Retrospektif oku
8. \`deckent cleanup\` — Temizle

## DIRECTIVES Format
Her task şu yapıda olmalı:
\`\`\`
## Task N: Başlık
- Model: opus/sonnet/haiku
- Effort: low/normal/high
- Skills: typescript-expert, testing-expert, vb.
- Files: değişecek dosyalar
- Scope: izin verilen dizinler
### Description
Detaylı açıklama...
\`\`\`
Detaylı rehber: .deckent/docs/directives-guide.md

## Providers
- Claude (varsayılan), Codex (OPENAI_API_KEY), Gemini (GOOGLE_API_KEY)
- Model eşdeğerleri: opus↔gpt-5↔gemini-2.5-pro, sonnet↔gpt-4.1↔gemini-2.5-flash

## Context
@DIRECTIVES.md
@.brain/MEMORY.md
@.contracts/api-surface.md

## Agent Roles
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Environment
Build: ${buildCmd}
Test: ${testCmd}
Lint: ${lintCmd}

## Boot
@.deckent/workspace/BOOT.md
`;
}

function generateDeckentContentEN(projectName: string, buildCmd: string, testCmd: string, lintCmd: string): string {
  return `# ${projectName} — Deckent Orchestrated

## Identity
@.deckent/workspace/IDENTITY.md

## Rules
- Brain is the ONLY orchestrator — workers never plan
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Sprint is NEVER left incomplete
- Memory budget: 900 lines max in .brain/

## Workflow
1. \`deckent init\` — Initialize project
2. \`deckent set-directives\` — Write sprint goals (DIRECTIVES.md)
3. \`deckent plan\` — Plan tasks (mode: ai/structured/auto)
4. \`deckent start\` — Launch workers
5. \`deckent status\` — Monitor progress
6. \`deckent review\` — Evaluate results (GO/NO_GO/GO_WITH_TECH_DEBT)
7. \`deckent retro\` — Read retrospective
8. \`deckent cleanup\` — Clean up

## DIRECTIVES Format
Each task should follow this structure:
\`\`\`
## Task N: Title
- Model: opus/sonnet/haiku
- Effort: low/normal/high
- Skills: typescript-expert, testing-expert, etc.
- Files: files to modify
- Scope: allowed directories
### Description
Detailed description...
\`\`\`
Detailed guide: .deckent/docs/directives-guide.md

## Providers
- Claude (default), Codex (OPENAI_API_KEY), Gemini (GOOGLE_API_KEY)
- Model equivalence: opus↔gpt-5↔gemini-2.5-pro, sonnet↔gpt-4.1↔gemini-2.5-flash

## Context
@DIRECTIVES.md
@.brain/MEMORY.md
@.contracts/api-surface.md

## Agent Roles
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Environment
Build: ${buildCmd}
Test: ${testCmd}
Lint: ${lintCmd}

## Boot
@.deckent/workspace/BOOT.md
`;
}

// ─── Docs Templates ──────────────────────────────────────────────────

function generateQuickStartDoc(lang: string): string {
  if (lang === 'tr') {
    return `# Hızlı Başlangıç — Deckent ile İlk Sprint

## 1. Hedeflerinizi Yazın
DIRECTIVES.md dosyasını düzenleyin veya CLI ile:
\`\`\`bash
deckent set-directives "Authentication sistemi ekle"
\`\`\`

## 2. Sprint Planlayın
\`\`\`bash
deckent plan
\`\`\`
Bu komut DIRECTIVES.md'yi okur ve task'ları planlar.
- \`--mode ai\` — AI ile akıllı planlama
- \`--mode structured\` — Kural tabanlı, hızlı

## 3. Çalışmaya Başlayın
\`\`\`bash
deckent start
\`\`\`
Worker'lar otomatik başlar ve task'ları uygular.

## 4. İlerlemeyi İzleyin
\`\`\`bash
deckent status --watch
\`\`\`

## 5. Sonuçları Değerlendirin
\`\`\`bash
deckent review    # GO / NO_GO / GO_WITH_TECH_DEBT
deckent retro     # Retrospektif ve öğrenimler
deckent cleanup   # Temizlik
\`\`\`

## Sorun Giderme
\`\`\`bash
deckent doctor    # Sağlık kontrolü
deckent kill --all  # Tüm worker'ları durdur
deckent cleanup   # Temizle ve yeniden başla
\`\`\`

## MCP Entegrasyonu
Claude Code, Cursor veya VS Code'da MCP server olarak kullanabilirsiniz:
\`\`\`bash
claude mcp add deckent -- npx deckent mcp
\`\`\`
`;
  }
  return `# Quick Start — Your First Sprint with Deckent

## 1. Write Your Goals
Edit DIRECTIVES.md or use the CLI:
\`\`\`bash
deckent set-directives "Add authentication system"
\`\`\`

## 2. Plan the Sprint
\`\`\`bash
deckent plan
\`\`\`
This reads DIRECTIVES.md and plans tasks.
- \`--mode ai\` — AI-powered smart planning
- \`--mode structured\` — Rule-based, fast

## 3. Start Working
\`\`\`bash
deckent start
\`\`\`
Workers start automatically and execute tasks.

## 4. Monitor Progress
\`\`\`bash
deckent status --watch
\`\`\`

## 5. Evaluate Results
\`\`\`bash
deckent review    # GO / NO_GO / GO_WITH_TECH_DEBT
deckent retro     # Retrospective and learnings
deckent cleanup   # Clean up
\`\`\`

## Troubleshooting
\`\`\`bash
deckent doctor      # Health check
deckent kill --all  # Stop all workers
deckent cleanup     # Clean up and restart
\`\`\`

## MCP Integration
Use as MCP server in Claude Code, Cursor, or VS Code:
\`\`\`bash
claude mcp add deckent -- npx deckent mcp
\`\`\`
`;
}

function generateDirectivesGuideDoc(lang: string): string {
  if (lang === 'tr') {
    return `# DIRECTIVES Format Rehberi

## Temel Yapı
\`\`\`markdown
# DIRECTIVES — Sprint NNN: Sprint Başlığı

## Goal: Sprint amacını bir paragrafta açıkla.

## Task 1: Task Başlığı
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts
- Scope: src/core/

### Description
Task'ın ne yapacağını detaylı açıkla.

**Kanıt:** \\\`grep "yeniOzellik" src/core/config.ts\\\` → eklendi
**Test:** 3+ test
\`\`\`

## Alan Açıklamaları

| Alan | Değerler | Açıklama |
|------|----------|----------|
| Model | opus, sonnet, haiku | AI modeli — opus: karmaşık, sonnet: genel, haiku: basit |
| Effort | low, normal, high | İş yükü — low: <1 saat, normal: 1-3 saat, high: 3+ saat |
| Skills | skill-id listesi | Uzmanlık alanı (virgülle ayır) |
| Files | dosya yolları | Değiştirilecek dosyalar |
| Scope | dizin yolları | Worker'ın erişebileceği dizinler |
| Kanıt | shell komutu | Tamamlanma kanıtı |
| Test | sayı + açıklama | Beklenen test sayısı ve kapsamı |

## Mevcut Skills
- typescript-expert, testing-expert, documentation-writer
- security-specialist, performance-optimizer, api-builder
- devops-engineer, database-migration, react-specialist
- python-expert, ci-testing

## İpuçları
- Her task bağımsız olmalı — birbirine bağımlı task'lar dependencies ile belirtin
- Scope dar tutun — worker sadece gerekli dizinlere erişsin
- Kanıt satırı spesifik olmalı — "testler geçmeli" yerine "grep X file → var" yazın
`;
  }
  return `# DIRECTIVES Format Guide

## Basic Structure
\`\`\`markdown
# DIRECTIVES — Sprint NNN: Sprint Title

## Goal: Describe the sprint goal in one paragraph.

## Task 1: Task Title
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts
- Scope: src/core/

### Description
Describe what the task will do in detail.

**Proof:** \\\`grep "newFeature" src/core/config.ts\\\` → added
**Test:** 3+ tests
\`\`\`

## Field Reference

| Field | Values | Description |
|-------|--------|-------------|
| Model | opus, sonnet, haiku | AI model — opus: complex, sonnet: general, haiku: simple |
| Effort | low, normal, high | Workload — low: <1h, normal: 1-3h, high: 3+h |
| Skills | skill-id list | Expertise area (comma-separated) |
| Files | file paths | Files to be modified |
| Scope | directory paths | Directories the worker can access |
| Proof | shell command | Completion proof |
| Test | count + description | Expected test count and scope |

## Available Skills
- typescript-expert, testing-expert, documentation-writer
- security-specialist, performance-optimizer, api-builder
- devops-engineer, database-migration, react-specialist
- python-expert, ci-testing

## Tips
- Each task should be independent — use dependencies for related tasks
- Keep scope narrow — workers should only access necessary directories
- Proof lines should be specific — use "grep X file → exists" not "tests pass"
`;
}

function generateConfigReferenceDoc(lang: string): string {
  if (lang === 'tr') {
    return `# Konfigürasyon Referansı

Tüm ayarlar \`.deckent/config.json\` dosyasında.
CLI ile okuma/yazma: \`deckent config read\` / \`deckent config set key value\`

## Temel Ayarlar

| Ayar | Değerler | Varsayılan | Açıklama |
|------|----------|-----------|----------|
| mode | performance, balanced, economic, api | balanced | Plan modu |
| language | en, tr | en | Arayüz dili |
| projectName | string | dizin adı | Proje adı |
| max_workers | 1-10 | mode'a göre | Eş zamanlı worker sayısı |

## Provider Ayarları

| Ayar | Değerler | Varsayılan | Açıklama |
|------|----------|-----------|----------|
| brain_provider | claude, codex, gemini | claude | Brain provider'ı |
| worker_provider | claude, codex, gemini | claude | Worker provider'ı |
| fallback_provider | claude, codex, gemini | - | Yedek provider |
| spawn_backend | tmux, subprocess | tmux | Worker başlatma (Windows: subprocess) |

## Routing Ayarları

| Ayar | Değerler | Varsayılan | Açıklama |
|------|----------|-----------|----------|
| routing_engine | v1, v2 | v2 | Routing motoru |
| brain_planning | ai, structured, auto | auto | Planlama modu |

## Memory + Decay

| Ayar | Değerler | Varsayılan | Açıklama |
|------|----------|-----------|----------|
| memory_budget | sayı | 900 | .brain/ toplam satır bütçesi |
| decay_after_sprints | sayı | 5 | Kaç sprint sonra decay başlar |

## Sprint Ayarları

| Ayar | Değerler | Varsayılan | Açıklama |
|------|----------|-----------|----------|
| fix_phase_enabled | true/false | true | Başarısız task'ları tekrar dene |
| max_fix_retries | sayı | 2 | Maksimum tekrar deneme |
| scan_interval | saniye | 30 | Auditor tarama aralığı |
| heartbeat_timeout | saniye | 120 | Worker heartbeat zaman aşımı |
| cleanup_delay_ms | ms | 180000 | Cleanup öncesi bekleme |
`;
  }
  return `# Configuration Reference

All settings in \`.deckent/config.json\`.
CLI read/write: \`deckent config read\` / \`deckent config set key value\`

## Core Settings

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| mode | performance, balanced, economic, api | balanced | Plan mode |
| language | en, tr | en | UI language |
| projectName | string | dir name | Project name |
| max_workers | 1-10 | per mode | Concurrent worker count |

## Provider Settings

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| brain_provider | claude, codex, gemini | claude | Brain provider |
| worker_provider | claude, codex, gemini | claude | Worker provider |
| fallback_provider | claude, codex, gemini | - | Fallback provider |
| spawn_backend | tmux, subprocess | tmux | Worker spawn (Windows: subprocess) |

## Routing Settings

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| routing_engine | v1, v2 | v2 | Routing engine |
| brain_planning | ai, structured, auto | auto | Planning mode |

## Memory + Decay

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| memory_budget | number | 900 | .brain/ total line budget |
| decay_after_sprints | number | 5 | Sprints before decay |

## Sprint Settings

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| fix_phase_enabled | true/false | true | Retry failed tasks |
| max_fix_retries | number | 2 | Max retry attempts |
| scan_interval | seconds | 30 | Auditor scan interval |
| heartbeat_timeout | seconds | 120 | Worker heartbeat timeout |
| cleanup_delay_ms | ms | 180000 | Wait before cleanup |
`;
}

// ─── BOOT.md Template ────────────────────────────────────────────────

function generateBootContent(lang: string): string {
  if (lang === 'tr') {
    return `# Sprint Başlatma Süreci

Bir sprint başlatıldığında (\`deckent start\`) şu adımlar otomatik çalışır:

1. **Plan** — Brain DIRECTIVES.md'yi okur, task'ları planlar
2. **Spawn** — Worker'lar başlatılır (tmux veya subprocess)
3. **Execute** — Worker'lar task'ları uygular, heartbeat yazar
4. **Evaluate** — Brain sonuçları değerlendirir (GO / NO_GO / TECH_DEBT)
5. **Fix** — Başarısız task'lar yeniden denenir
6. **Retro** — Retrospektif yazılır (RETRO.md)
7. **Decay** — Bellek bütçesi kontrol edilir
8. **Cleanup** — Task dosyaları arşivlenir

> İpucu: \`deckent status --watch\` ile süreci canlı izleyebilirsiniz.
> Sorun olursa: \`deckent kill --all\` → \`deckent cleanup\` → \`deckent doctor\`
`;
  }
  return `# Sprint Boot Sequence

When a sprint starts (\`deckent start\`), these steps run automatically:

1. **Plan** — Brain reads DIRECTIVES.md, plans tasks
2. **Spawn** — Workers launched (tmux or subprocess)
3. **Execute** — Workers implement tasks, write heartbeats
4. **Evaluate** — Brain evaluates results (GO / NO_GO / TECH_DEBT)
5. **Fix** — Failed tasks retried
6. **Retro** — Retrospective written (RETRO.md)
7. **Decay** — Memory budget checked
8. **Cleanup** — Task files archived

> Tip: Use \`deckent status --watch\` to monitor in real-time.
> If stuck: \`deckent kill --all\` → \`deckent cleanup\` → \`deckent doctor\`
`;
}
