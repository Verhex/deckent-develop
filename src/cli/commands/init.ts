import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { PlanMode } from '../../core/types.js';
import { generateSetupRecommendation } from '../auto-setup.js';
import { getSystemProfile } from '../../core/system-profile.js';
import { detectSubscription } from '../../core/subscription.js';
import { analyzeProject } from '../../core/analyzer.js';
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
} from '../../core/constants.js';
import { generateProjectIdentity } from '../../orchestra/sprint-reporter.js';
import { ensureDeckentImport } from '../../core/utils.js';
import { promptText, promptSelect } from '../helpers/prompt.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeIfNotExists(filePath: string, content: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, content);
  }
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
    .action(async (options: { auto?: boolean; manual?: boolean }) => {
      const root = resolveProjectRoot();

      try {
        let mode: PlanMode;
        let language: string;
        let projectName: string;

        const dirName = root.split(/[\\/]/).pop() ?? 'my-project';

        if (options.auto && !options.manual) {
          // Auto-detect mode
          print(getMessage('init.auto_detecting', 'en'));
          const systemProfile = getSystemProfile();
          const subscription = detectSubscription();
          const analysis = analyzeProject(root);

          const recommendation = generateSetupRecommendation(
            systemProfile,
            subscription.detected,
            analysis,
          );

          print('');
          print(getMessage('init.recommendation', 'en'));
          for (const reason of recommendation.reasons) {
            print(`  • ${reason}`);
          }
          print('');

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

        print('\n' + getMessage('init.initialized', language, { name: projectName, mode, language }));
        print('');
        print(getMessage('init.next_steps', language));
        print(getMessage('init.next_step_directives', language));
        print(getMessage('init.next_step_start', language));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
