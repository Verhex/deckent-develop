import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  DECKENT_DIR,
  PROJECT_CONFIG_PATH,
  DIRECTIVES_FILE,
  DASHBOARD_FILE,
  DECKENT_VERSION,
  JOBS_DIR,
} from '../../core/constants.js';
// Canonical tool catalog (B-MCPCATALOG-SSOT). Used at runtime inside the handler
// only — referencing it at module-eval time would hit the index.ts↔help.ts
// circular-import TDZ (index.ts imports registerHelpTool, help.ts imports TOOL_CATALOG).
import { TOOL_CATALOG, type McpToolCatalogEntry } from './index.js';
import { mcpToolDescription } from './description-catalog.js';

type HelpToolInfo = McpToolCatalogEntry;

interface HelpResourceInfo {
  name: string;
  uri: string;
  description: string;
}

interface HelpState {
  initialized: boolean;
  hasDirectives: boolean;
  sprintActive: boolean;
  lastSprint: string | null;
  routingEngine: string;
  agentCount: number;
  skillCount: number;
}

interface HelpResponse {
  version: string;
  state: HelpState;
  nextAction: string;
  workflows: {
    sprint: string[];
    debug: string[];
    config: string[];
  };
  tools: HelpToolInfo[];
  resources: HelpResourceInfo[];
}

const RESOURCES: HelpResourceInfo[] = [
  { name: 'dashboard', uri: 'deckent://dashboard', description: 'Live sprint status: agents, progress, usage, alerts' },
  { name: 'directives', uri: 'deckent://directives', description: 'Current DIRECTIVES.md content — sprint goals and task definitions' },
  { name: 'memory', uri: 'deckent://memory', description: 'Brain memory: sprint learnings and patterns (.brain/exports/memory.md)' },
  { name: 'debt', uri: 'deckent://debt', description: 'Tech debt register: open and resolved items (.brain/exports/debt.md)' },
  { name: 'config', uri: 'deckent://config', description: 'Resolved Deckent configuration (merged defaults + global + project)' },
  { name: 'retro', uri: 'deckent://retro', description: 'Latest sprint retrospective (DB-first, exported to .brain/exports/)' },
  { name: 'tasks', uri: 'deckent://tasks', description: 'Current .tasks/ directory listing with task statuses' },
  { name: 'agents', uri: 'deckent://agents', description: 'Registered agents: built-in and project-specific (.deckent/agents/)' },
];

function detectState(root: string): HelpState {
  const configPath = join(root, PROJECT_CONFIG_PATH);
  const initialized = existsSync(configPath);

  const directivesPath = join(root, DIRECTIVES_FILE);
  let hasDirectives = false;
  if (existsSync(directivesPath)) {
    try {
      const content = readFileSync(directivesPath, 'utf-8').trim();
      hasDirectives = content.length > 0 && !content.startsWith('# Directives\n\nDescribe your project goals');
    } catch {
      hasDirectives = false;
    }
  }

  const dashPath = join(root, DASHBOARD_FILE);
  let sprintActive = false;
  if (existsSync(dashPath)) {
    try {
      const dash = JSON.parse(readFileSync(dashPath, 'utf-8')) as { active?: boolean };
      sprintActive = dash.active === true;
    } catch {
      sprintActive = false;
    }
  }

  let lastSprint: string | null = null;
  const jobsDir = join(root, JOBS_DIR);
  if (existsSync(jobsDir)) {
    try {
      const jobFiles = readdirSync(jobsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();
      if (jobFiles.length > 0) {
        try {
          const latest = JSON.parse(
            readFileSync(join(jobsDir, jobFiles[0]!), 'utf-8'),
          ) as { sprintId?: string };
          lastSprint = latest.sprintId ?? null;
        } catch {
          lastSprint = null;
        }
      }
    } catch {
      lastSprint = null;
    }
  }
  if (!lastSprint && initialized) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { last_sprint_id?: string };
      lastSprint = cfg.last_sprint_id ?? null;
    } catch {
      lastSprint = null;
    }
  }

  let routingEngine = 'v2';
  if (initialized) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { routing_engine?: string };
      routingEngine = cfg.routing_engine ?? 'v3';
    } catch {
      routingEngine = 'v2';
    }
  }

  let agentCount = 0;
  const agentsDir = join(root, DECKENT_DIR, 'agents');
  if (existsSync(agentsDir)) {
    try {
      agentCount = readdirSync(agentsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .length;
    } catch {
      agentCount = 0;
    }
  }

  let skillCount = 0;
  const skillsDir = join(root, DECKENT_DIR, 'skills');
  if (existsSync(skillsDir)) {
    try {
      skillCount = readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .length;
    } catch {
      skillCount = 0;
    }
  }

  return { initialized, hasDirectives, sprintActive, lastSprint, routingEngine, agentCount, skillCount };
}

function determineNextAction(state: HelpState): string {
  if (!state.initialized) {
    return 'deckent_init ile projeyi baslatin';
  }
  if (!state.hasDirectives) {
    return 'deckent_set_directives ile sprint hedeflerini yazin';
  }
  if (state.sprintActive) {
    return 'deckent_status ile ilerlemeyi izleyin';
  }
  if (state.lastSprint) {
    return 'deckent_retro ile son sprint\'i okuyun veya yeni DIRECTIVES yazin';
  }
  return 'deckent_plan ile ilk sprint\'i planlayın';
}

export function registerHelpTool(server: McpServer): void {
  server.registerTool(
    'deckent_help',
    {
      title: 'Deckent Help',
      description: mcpToolDescription('deckent_help'),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const root = process.cwd();

      try {
        const state = detectState(root);
        const nextAction = determineNextAction(state);

        const response: HelpResponse = {
          version: DECKENT_VERSION,
          state,
          nextAction,
          workflows: {
            sprint: ['init', 'set_directives', 'plan', 'start', 'status', 'review', 'cleanup'],
            debug: ['doctor', 'status', 'kill', 'cleanup'],
            config: ['config read', 'config set key value', 'sync'],
          },
          tools: TOOL_CATALOG,
          resources: RESOURCES,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
