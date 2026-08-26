import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PlanMode } from '../../core/types.js';
import {
  DECKENT_DIR, BRAIN_DIR, TASKS_DIR, LOCKS_DIR, CLAUDE_RULES_DIR,
  WORKSPACE_DIR, PLUGINS_DIR, DASHBOARD_FILE, DIRECTIVES_FILE,
  AGENTS_FILE, CLAUDE_FILE, DECKENT_FILE,
} from '../../core/constants.js';
import { regenerateRules } from '../../core/rule-generator.js';
import { detectAvailableProviders } from '../../core/provider.js';
import {
  provisionMissing,
  collectMissingTools,
  planInstall,
} from '../../core/provisioner.js';
import { ensureDeckentImport } from '../../core/utils.js';
import { enrichResponse } from '../helpers/enrich.js';
import { seedDocsConfig } from '../../orchestra/managed-docs/docs-config.js';
import { initializeWorkspaceArtifacts } from '../../orchestra/workspace-artifacts.js';
import { detectProjectStack } from '../../core/stack-detector.js';
import {
  withConfigWriteLock,
  writeConfigJsonAtomic,
} from '../../core/config-write-authority.js';
import { mcpToolDescription } from './description-catalog.js';

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
      description: mcpToolDescription('deckent_init'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        projectName: z.string().optional().describe('Project name used in DECKENT.md header and PROJECT-IDENTITY.md. Defaults to current directory name if omitted.'),
        mode: z.enum(['performance', 'balanced', 'economic', 'api', 'max_plan', 'max5x_plan', 'pro_plan']).optional().default('performance').describe('Plan tier mode: performance (Opus, max power), balanced (Sonnet brain + Opus workers), economic (Sonnet, cost-efficient), api (API key, pay-per-use)'),
        language: z.enum(['en', 'tr']).optional().default('en').describe('Language for agent prompt templates (en=English, tr=Turkish)'),
        force: z.boolean().optional().default(false).describe('Force config re-initialization while reconciling only registered managed workspace sections; user-owned workspace content, .brain/ and .tasks/ data are preserved.'),
        auto: z.boolean().optional().default(false).describe('Auto-detection mode: skip interactive wizard, detect project stack automatically and apply defaults.'),
        installMissing: z.boolean().optional().default(false).describe('Install missing provider CLIs (claude/codex/gemini) automatically. MCP has no interactive consent, so this is an explicit opt-in (equivalent to CLI `--yes`). When false, missing tools are only reported.'),
      }),
    },
    async ({ projectName, mode, language, force, auto, installMissing }) => {
      const root = process.cwd();
      // auto: hint that project stack should be auto-detected (already default behavior in MCP)
      void auto;

      try {
      const created: string[] = [];
      // Resolve projectName: use provided value or fall back to directory name
      const resolvedProjectName = projectName ?? root.split('/').at(-1) ?? 'my-project';

      // Directories
      const dirs = [
        join(root, DECKENT_DIR),
        join(root, WORKSPACE_DIR),
        join(root, BRAIN_DIR),
        join(root, BRAIN_DIR, 'sprints'),
        join(root, TASKS_DIR),
        join(root, LOCKS_DIR),
        join(root, CLAUDE_RULES_DIR),
        join(root, PLUGINS_DIR),
      ];
      for (const dir of dirs) {
        ensureDir(dir);
        created.push(dir.replace(root + '/', '') + '/');
      }

      // Config (merge — preserve existing fields; force=true overwrites entirely)
      const configPath = join(root, DECKENT_DIR, 'config.json');
      const newConfig: Record<string, unknown> = { mode: mode as PlanMode, language, projectName: resolvedProjectName };
      withConfigWriteLock(configPath, () => {
        if (existsSync(configPath) && !force) {
          try {
            const existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
            Object.assign(existing, newConfig);
            writeConfigJsonAtomic(configPath, existing);
          } catch {
            writeConfigJsonAtomic(configPath, newConfig);
          }
        } else {
          writeConfigJsonAtomic(configPath, newConfig);
        }
      });
      created.push('.deckent/config.json');

      // Write helper that respects force flag
      const writeFile = (filePath: string, content: string): void => {
        if (force) {
          writeFileSync(filePath, content);
        } else {
          writeIfNotExists(filePath, content);
        }
      };

      // DECKENT.md (single source of truth)
      const deckentContent = `# ${resolvedProjectName} — Deckent Orchestrated

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
@.brain/exports/summary.md
@docs/reference/api-surface.md

## Environment
Build: tsc
Test: npx vitest run
Lint: tsc --noEmit

## Boot
@.deckent/workspace/BOOT.md
`;
      writeFile(join(root, DECKENT_FILE), deckentContent);
      created.push(DECKENT_FILE);

      // Agent files — additive injection, never overwrite
      writeIfNotExists(join(root, AGENTS_FILE), `@${DECKENT_FILE}\n`);
      ensureDeckentImport(join(root, AGENTS_FILE));
      ensureDeckentImport(join(root, CLAUDE_FILE));
      created.push(AGENTS_FILE, CLAUDE_FILE);

      // Rule files for ALL supported providers (Claude/Codex/Gemini/Cursor)
      // — single source via rule-generator templates. regenerateRules() also
      // picks up ADRs from .brain/memory.db when re-run on an existing project.
      await regenerateRules(root);
      created.push('.claude/rules/', '.codex/rules/', '.gemini/rules/', '.cursor/rules/');

      // DIRECTIVES.md (never overwrite with force — user content is precious)
      writeIfNotExists(join(root, DIRECTIVES_FILE), '# Directives\n\nDescribe your project goals and architecture here.\nBrain reads this before every sprint.\n');

      // Brain files — Memory V2 is fully DB-first (Task #4 + B6/B7/B8): no
      // .brain/ root .md stubs (MEMORY / RETRO / PATTERNS / DEBT / DECISIONS /
      // PROJECT-IDENTITY). memory.db is the single source of truth.

      // Versioned workspace artifacts — same application service as CLI init.
      let detectedStack: ReturnType<typeof detectProjectStack> | undefined;
      try {
        detectedStack = detectProjectStack(root);
      } catch {
        // Stack detection is advisory during bootstrap. The versioned
        // workspace contract records undetected values honestly and the
        // canonical detector can refresh them after init has created state.
      }
      const workspace = initializeWorkspaceArtifacts({
        projectRoot: root,
        projectName: resolvedProjectName,
        language,
        stack: detectedStack,
      });
      created.push(...workspace.actions
        .filter((action) => action.action !== 'unchanged')
        .map((action) => action.path));

      // Bootstrap docs.json — managed docs automation (template-based)
      try {
        seedDocsConfig(root);
      } catch { /* non-fatal */ }

      // .gitignore (no longer adds .deckent/ — it should be tracked)
      appendToGitignore(root, [
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

      // Consent-based provisioning of missing provider CLIs (MCP parity).
      let provisioning: Array<{ tool: string; status: string; detail?: string }> | undefined;
      try {
        const providers = await detectAvailableProviders();
        const missing = collectMissingTools(providers, []);
        if (missing.length > 0) {
          if (installMissing) {
            const results = await provisionMissing({ missing, mode: 'yes' });
            provisioning = results.map(r => ({
              tool: r.tool,
              status: r.status,
              detail: r.status === 'failed' ? r.error : planInstall(r.tool).instruction,
            }));
          } else {
            provisioning = missing.map(t => ({
              tool: t,
              status: 'missing',
              detail: planInstall(t).instruction,
            }));
          }
        }
      } catch { /* provider detection failure is non-fatal */ }

      const nextSteps = [
        '`deckent plan` — plan your first sprint',
        '`deckent start` — start the sprint',
        '`deckent status` — monitor progress',
      ];
      if (provisioning && !installMissing) {
        nextSteps.unshift(`Install missing prerequisites: ${provisioning.map(p => p.tool).join(', ')} (or re-run with installMissing:true)`);
      }

      const enriched = enrichResponse('init', { success: true, created, mode, language, projectName: resolvedProjectName, force, auto, nextSteps, provisioning }, { lang: language });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(enriched),
        }],
      };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Initialization failed: ${message}` }) }],
          isError: true,
        };
      }
    },
  );
}
