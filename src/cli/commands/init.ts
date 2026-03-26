import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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
          mode = await promptSelect<PlanMode>('Select your Claude plan:', [
            { label: 'Max ($200/mo) — 8 workers, Opus brain', value: 'max_plan' },
            { label: 'Max 5x ($100/mo) — 5 workers, Sonnet brain', value: 'max5x_plan' },
            { label: 'Pro ($20/mo) — 3 workers, Sonnet only', value: 'pro_plan' },
            { label: 'API (pay-as-you-go) — 10 workers, any model', value: 'api' },
          ]);

          language = await promptSelect('Select language:', [
            { label: 'English', value: 'en' },
            { label: 'Türkçe', value: 'tr' },
          ]);

          projectName = await promptText('Project name', dirName);
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

        // 5. Config (merge — preserve existing fields)
        const configPath = join(root, DECKENT_DIR, 'config.json');
        const newConfig: Record<string, unknown> = { mode, language, projectName };
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

        // 6. DECKENT.md — C) Use dynamic build/test commands from detectFullStack
        let buildCmd = 'tsc';
        let testCmd = 'npx vitest run';
        let lintCmd = 'tsc --noEmit';
        try {
          const stackForDeckent = detectFullStack(root);
          if (stackForDeckent.commands.build) buildCmd = stackForDeckent.commands.build;
          if (stackForDeckent.commands.test) testCmd = stackForDeckent.commands.test;
          if (stackForDeckent.commands.lint) lintCmd = stackForDeckent.commands.lint;
        } catch { /* fallback to defaults above */ }

        const deckentContent = `# ${projectName} — Deckent Orchestrated

## Identity
@.deckent/workspace/IDENTITY.md

## Rules
- Brain is the ONLY orchestrator — workers never plan
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Sprint is NEVER left incomplete
- Memory budget: 600 lines max in .brain/

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
          `---\npaths: [".tasks/*", ".brain/*", ".contracts/*"]\n---\n# Brain Rules\n- Always read DIRECTIVES.md first\n- Always check usage before planning\n- Plan mode required before execution\n- Write sprint plan as task JSON files in .tasks/\n- Assign model and effort per task with reason\n- Define scope (directories, filesRead, filesWrite) for each task\n- Define GO/NO-GO criteria for each task\n- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO\n- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix\n- Update MEMORY.md after every sprint (max 200 lines)\n- Write RETRO.md (overwrite, max 100 lines)\n- Trigger decay if .brain/ exceeds 600 lines\n- Sprint is NEVER left incomplete\n`,
        );
        writeFile(
          join(root, CLAUDE_RULES_DIR, 'auditor.md'),
          `---\npaths: [".dashboard", ".brain/PATTERNS.md"]\n---\n# Auditor Rules\n- NEVER write source code\n- Scan every 30 seconds\n- Read all heartbeat files → detect stale agents (>2min = alert)\n- Run git diff --stat → detect boundary violations\n- Check .locks/ → detect stale locks (>5min)\n- Detect circular dependencies / deadlocks\n- Overwrite .dashboard on every scan (never append)\n- Append new patterns to PATTERNS.md (never overwrite)\n- Write alerts for critical issues\n`,
        );
        writeFile(
          join(root, CLAUDE_RULES_DIR, 'worker-default.md'),
          `---\npaths: ["src/**", "tests/**"]\n---\n# Worker Rules\n- Read your task file first\n- Write plan before writing code\n- Check .locks/ before writing any file\n- Create and update heartbeat file (.tasks/task-{id}.hb)\n- Run tests before marking done (npx vitest run)\n- Coverage goal: minimum 80%\n- Document changes\n- Stay within your assigned scope\n- Write result file (.tasks/task-{id}.result) — REQUIRED\n`,
        );

        // 9. DIRECTIVES.md
        writeIfNotExists(
          join(root, DIRECTIVES_FILE),
          `# Directives\n\nDescribe your project goals and architecture here.\nBrain reads this before every sprint.\n`,
        );

        // 10. Brain files
        writeIfNotExists(join(root, BRAIN_DIR, MEMORY_FILE), '# Learned Patterns\n');
        writeIfNotExists(join(root, BRAIN_DIR, DECISIONS_FILE), '# Architecture Decisions\n');
        writeIfNotExists(join(root, BRAIN_DIR, DEBT_FILE), '# Tech Debt\n');
        writeIfNotExists(join(root, BRAIN_DIR, PATTERNS_FILE), '# Detected Patterns\n');
        writeIfNotExists(join(root, BRAIN_DIR, RETRO_FILE), '# Sprint Retrospective\n');

        // 10a. PROJECT-IDENTITY.md (permanent memory — never decayed)
        try {
          const analysis = options.auto ? detectedAnalysis ?? analyzeProject(root) : undefined;
          writeIfNotExists(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), generateProjectIdentity({
            projectName,
            sprintId: 'sprint-000',
            totalSprints: 0,
            mode,
            language: analysis?.language ?? 'unknown',
            framework: analysis?.framework ?? 'unknown',
            testFramework: analysis?.testFramework ?? 'unknown',
            buildTool: analysis?.buildTool ?? 'unknown',
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

        // 10b. Workspace: TOOLS.md + BOOT.md
        writeIfNotExists(join(root, WORKSPACE_DIR, 'TOOLS.md'), generateToolsContent(root));
        writeIfNotExists(join(root, WORKSPACE_DIR, 'BOOT.md'), `# Boot Sequence\n\n1. Brain reads DIRECTIVES.md\n2. Brain checks context (MEMORY, RETRO, DEBT, PATTERNS)\n3. Brain plans sprint\n4. Workers spawned, auditor scan loop starts\n5. Workers execute tasks, write heartbeats\n6. Brain waits for results, evaluates\n7. Sprint complete\n`);

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
