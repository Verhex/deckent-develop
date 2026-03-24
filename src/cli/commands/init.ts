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
import { createDeckTemplate } from '../../core/deck-file.js';
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

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize a new Deckent project')
    .option('--auto', 'Auto-detect system, subscription, and project to generate recommendations')
    .option('--manual', 'Skip auto-detection, use interactive prompts only')
    .option('--cursor', 'Configure for Cursor IDE environment')
    .option('--claude-code', 'Configure for Claude Code environment (default)')
    .action(async (options: { auto?: boolean; manual?: boolean; cursor?: boolean; claudeCode?: boolean }) => {
      const root = resolveProjectRoot();

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
          language = 'en';
          projectName = dirName;
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
            Object.assign(existing, newConfig);
            writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');
          } catch {
            writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n');
          }
        } else {
          writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n');
        }

        // 6. DECKENT.md (single source of truth — writeIfNotExists)
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
Build: tsc
Test: npx vitest run
Lint: tsc --noEmit

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

        // 7c. Create .deck template
        try {
          createDeckTemplate(root);
        } catch { /* non-fatal */ }

        // 8. Claude rules (blueprint-quality templates with frontmatter)
        writeIfNotExists(
          join(root, CLAUDE_RULES_DIR, 'brain.md'),
          `---\npaths: [".tasks/*", ".brain/*", ".contracts/*"]\n---\n# Brain Rules\n- Always read DIRECTIVES.md first\n- Always check usage before planning\n- Plan mode required before execution\n- Write sprint plan as task JSON files in .tasks/\n- Assign model and effort per task with reason\n- Define scope (directories, filesRead, filesWrite) for each task\n- Define GO/NO-GO criteria for each task\n- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO\n- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix\n- Update MEMORY.md after every sprint (max 200 lines)\n- Write RETRO.md (overwrite, max 100 lines)\n- Trigger decay if .brain/ exceeds 600 lines\n- Sprint is NEVER left incomplete\n`,
        );
        writeIfNotExists(
          join(root, CLAUDE_RULES_DIR, 'auditor.md'),
          `---\npaths: [".dashboard", ".brain/PATTERNS.md"]\n---\n# Auditor Rules\n- NEVER write source code\n- Scan every 30 seconds\n- Read all heartbeat files → detect stale agents (>2min = alert)\n- Run git diff --stat → detect boundary violations\n- Check .locks/ → detect stale locks (>5min)\n- Detect circular dependencies / deadlocks\n- Overwrite .dashboard on every scan (never append)\n- Append new patterns to PATTERNS.md (never overwrite)\n- Write alerts for critical issues\n`,
        );
        writeIfNotExists(
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
          const analysis = options.auto ? analyzeProject(root) : undefined;
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
            authMethod: (p as any).authMethod,
            version: (p as any).version,
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
          // --auto mode with multiple providers: use first available as brain + worker
          const firstAvailable = providers.find(p => p.available)!.name;
          providerConfig = {
            brain_provider: firstAvailable,
            worker_provider: firstAvailable,
          };
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
          Object.assign(existing, providerMerge);
          writeFileSync(providerConfigPath, JSON.stringify(existing, null, 2) + '\n');
        } catch {
          // Config file not readable yet — write fresh with provider fields
          const freshConfig: Record<string, unknown> = { mode, language, projectName, ...providerMerge };
          writeFileSync(providerConfigPath, JSON.stringify(freshConfig, null, 2) + '\n');
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
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
