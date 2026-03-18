import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { PlanMode } from '../../core/types.js';
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
  MEMORY_FILE,
  DECISIONS_FILE,
  DEBT_FILE,
  PATTERNS_FILE,
  RETRO_FILE,
} from '../../core/constants.js';
import { promptText, promptSelect } from '../helpers/prompt.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

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
    .action(async () => {
      const root = resolveProjectRoot();

      try {
        // 1. Plan selection
        const mode = await promptSelect<PlanMode>('Select your Claude plan:', [
          { label: 'Max ($200/mo) — 8 workers, Opus brain', value: 'max_plan' },
          { label: 'Max 5x ($100/mo) — 5 workers, Sonnet brain', value: 'max5x_plan' },
          { label: 'Pro ($20/mo) — 3 workers, Sonnet only', value: 'pro_plan' },
          { label: 'API (pay-as-you-go) — 10 workers, any model', value: 'api' },
        ]);

        // 2. Language
        const language = await promptSelect('Select language:', [
          { label: 'English', value: 'en' },
          { label: 'Türkçe', value: 'tr' },
        ]);

        // 3. Project name
        const dirName = root.split(/[\\/]/).pop() ?? 'my-project';
        const projectName = await promptText('Project name', dirName);

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

        // 5. Config
        const config = {
          mode,
          language,
          projectName,
        };
        writeFileSync(
          join(root, DECKENT_DIR, 'config.json'),
          JSON.stringify(config, null, 2) + '\n',
        );

        // 6. Agent files
        const agentsContent = `# ${projectName}\n\n## Rules\n\n@DIRECTIVES.md\n@.brain/MEMORY.md\n`;
        writeIfNotExists(join(root, AGENTS_FILE), agentsContent);
        writeFileSync(join(root, CLAUDE_FILE), agentsContent);

        // 7. Claude rules
        writeIfNotExists(
          join(root, CLAUDE_RULES_DIR, 'brain.md'),
          '# Brain Rules\n- Read DIRECTIVES.md first\n- Plan before executing\n',
        );
        writeIfNotExists(
          join(root, CLAUDE_RULES_DIR, 'auditor.md'),
          '# Auditor Rules\n- Never write source code\n- Scan every 30 seconds\n',
        );
        writeIfNotExists(
          join(root, CLAUDE_RULES_DIR, 'worker-default.md'),
          '# Worker Rules\n- Read your task file first\n- Stay within assigned scope\n',
        );

        // 8. DIRECTIVES.md
        writeIfNotExists(
          join(root, DIRECTIVES_FILE),
          `# Directives\n\nDescribe your project goals and architecture here.\nBrain reads this before every sprint.\n`,
        );

        // 9. Brain files
        writeIfNotExists(join(root, BRAIN_DIR, MEMORY_FILE), '# Learned Patterns\n');
        writeIfNotExists(join(root, BRAIN_DIR, DECISIONS_FILE), '# Architecture Decisions\n');
        writeIfNotExists(join(root, BRAIN_DIR, DEBT_FILE), '# Tech Debt\n');
        writeIfNotExists(join(root, BRAIN_DIR, PATTERNS_FILE), '# Detected Patterns\n');
        writeIfNotExists(join(root, BRAIN_DIR, RETRO_FILE), '# Sprint Retrospective\n');

        // 9b. Workspace: TOOLS.md + BOOT.md
        writeIfNotExists(join(root, WORKSPACE_DIR, 'TOOLS.md'), generateToolsContent(root));
        writeIfNotExists(join(root, WORKSPACE_DIR, 'BOOT.md'), `# Boot Sequence\n\n1. Brain reads DIRECTIVES.md\n2. Brain checks context (MEMORY, RETRO, DEBT, PATTERNS)\n3. Brain plans sprint\n4. Workers spawned, auditor scan loop starts\n5. Workers execute tasks, write heartbeats\n6. Brain waits for results, evaluates\n7. Sprint complete\n`);

        // 9c. i18n
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

        // 10. .gitignore
        appendToGitignore(root, [
          DECKENT_DIR + '/',
          TASKS_DIR + '/',
          LOCKS_DIR + '/',
          DASHBOARD_FILE,
          BRAIN_DIR + '/archive/',
        ]);

        print(`\nDeckent initialized for "${projectName}" (${mode}, ${language}).`);
        print('');
        print('Next steps:');
        print('  1. Edit DIRECTIVES.md with your project goals');
        print('  2. Run `deckent start` to begin your first sprint');
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
