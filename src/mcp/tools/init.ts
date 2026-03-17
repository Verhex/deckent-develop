import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PlanMode } from '../../core/types.js';
import {
  DECKENT_DIR, BRAIN_DIR, TASKS_DIR, LOCKS_DIR, CLAUDE_RULES_DIR,
  WORKSPACE_DIR, DASHBOARD_FILE, DIRECTIVES_FILE, AGENTS_FILE,
  CLAUDE_FILE, MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE,
  RETRO_FILE,
} from '../../core/constants.js';

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeIfNotExists(filePath: string, content: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, content);
  }
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

export function registerInitTool(server: McpServer): void {
  server.registerTool(
    'deckent_init',
    {
      title: 'Initialize Deckent',
      description: 'Initialize a Deckent project in the current directory. Creates .deckent/, .brain/, .tasks/, .locks/, .claude/rules/ and config files.',
      inputSchema: z.object({
        projectName: z.string().describe('Project name'),
        mode: z.enum(['max_plan', 'max5x_plan', 'pro_plan', 'api']).optional().default('max_plan').describe('Claude plan mode'),
        language: z.enum(['en', 'tr']).optional().default('en').describe('Language for agent prompts'),
      }),
    },
    async ({ projectName, mode, language }) => {
      const root = process.cwd();
      const created: string[] = [];

      // Directories
      const dirs = [
        join(root, DECKENT_DIR),
        join(root, WORKSPACE_DIR),
        join(root, BRAIN_DIR),
        join(root, BRAIN_DIR, 'sprints'),
        join(root, TASKS_DIR),
        join(root, LOCKS_DIR),
        join(root, CLAUDE_RULES_DIR),
      ];
      for (const dir of dirs) {
        ensureDir(dir);
        created.push(dir.replace(root + '/', '') + '/');
      }

      // Config
      const config = { mode: mode as PlanMode, language, projectName };
      writeFileSync(
        join(root, DECKENT_DIR, 'config.json'),
        JSON.stringify(config, null, 2) + '\n',
      );
      created.push('.deckent/config.json');

      // Agent files
      const agentsContent = `# ${projectName}\n\n## Rules\n\n@DIRECTIVES.md\n@.brain/MEMORY.md\n`;
      writeIfNotExists(join(root, AGENTS_FILE), agentsContent);
      writeFileSync(join(root, CLAUDE_FILE), agentsContent);
      created.push(AGENTS_FILE, CLAUDE_FILE);

      // Claude rules
      writeIfNotExists(join(root, CLAUDE_RULES_DIR, 'brain.md'), '# Brain Rules\n- Read DIRECTIVES.md first\n- Plan before executing\n');
      writeIfNotExists(join(root, CLAUDE_RULES_DIR, 'auditor.md'), '# Auditor Rules\n- Never write source code\n- Scan every 30 seconds\n');
      writeIfNotExists(join(root, CLAUDE_RULES_DIR, 'worker-default.md'), '# Worker Rules\n- Read your task file first\n- Stay within assigned scope\n');

      // DIRECTIVES.md
      writeIfNotExists(join(root, DIRECTIVES_FILE), '# Directives\n\nDescribe your project goals and architecture here.\nBrain reads this before every sprint.\n');

      // Brain files
      writeIfNotExists(join(root, BRAIN_DIR, MEMORY_FILE), '# Learned Patterns\n');
      writeIfNotExists(join(root, BRAIN_DIR, DECISIONS_FILE), '# Architecture Decisions\n');
      writeIfNotExists(join(root, BRAIN_DIR, DEBT_FILE), '# Tech Debt\n');
      writeIfNotExists(join(root, BRAIN_DIR, PATTERNS_FILE), '# Detected Patterns\n');
      writeIfNotExists(join(root, BRAIN_DIR, RETRO_FILE), '# Sprint Retrospective\n');

      // .gitignore
      appendToGitignore(root, [
        DECKENT_DIR + '/',
        TASKS_DIR + '/',
        LOCKS_DIR + '/',
        DASHBOARD_FILE,
        BRAIN_DIR + '/archive/',
      ]);

      // MCP auto-registration in .claude/settings.json
      const settingsPath = join(root, '.claude', 'settings.json');
      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        try {
          settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        } catch { /* start fresh */ }
      }
      const mcpServers = (settings['mcpServers'] ?? {}) as Record<string, unknown>;
      if (!mcpServers['deckent']) {
        mcpServers['deckent'] = { command: 'deckent-mcp', args: [] };
        settings['mcpServers'] = mcpServers;
        mkdirSync(join(root, '.claude'), { recursive: true });
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        created.push('.claude/settings.json');
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, created, mode, language, projectName }),
        }],
      };
    },
  );
}
