import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DECKENT_DIR } from '../../core/constants.js';

interface AgentStats {
  totalUses?: number;
  successRate?: number;
}

interface AgentManifest {
  id?: string;
  name?: string;
  source?: string;
  persistent?: boolean;
  stats?: AgentStats;
}

interface AgentEntry {
  id: string;
  name: string;
  type: 'built-in' | 'temp';
  uses: number;
  successRate: number;
}

function resolveAgentType(manifest: AgentManifest): 'built-in' | 'temp' {
  if (manifest.source === 'builtin') return 'built-in';
  if (manifest.persistent === true) return 'built-in';
  return 'temp';
}

function readAgents(root: string): AgentEntry[] {
  const agentsDir = join(root, DECKENT_DIR, 'agents');
  if (!existsSync(agentsDir)) return [];

  const entries: AgentEntry[] = [];

  try {
    const dirs = readdirSync(agentsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const dir of dirs) {
      const agentPath = join(agentsDir, dir, 'agent.json');
      if (!existsSync(agentPath)) continue;

      try {
        const manifest = JSON.parse(readFileSync(agentPath, 'utf-8')) as AgentManifest;
        entries.push({
          id: manifest.id ?? dir,
          name: manifest.name ?? dir,
          type: resolveAgentType(manifest),
          uses: manifest.stats?.totalUses ?? 0,
          successRate: manifest.stats?.successRate ?? 0,
        });
      } catch {
        // skip malformed agent.json
      }
    }
  } catch {
    // directory read error
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

export function registerAgentListTool(server: McpServer): void {
  server.registerTool(
    'deckent_agent_list',
    {
      title: 'Agent List',
      description:
        'List all registered agents in the Deckent project — both built-in and dynamically generated temp agents. ' +
        'Returns id, name, type (built-in/temp), total uses, and success rate for each agent. ' +
        'Reads from .deckent/agents/ directory. ' +
        'Use to audit agent pool health, check which agents are active, or understand routing assignments.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const root = process.cwd();

      try {
        const agents = readAgents(root);
        const builtInCount = agents.filter((a) => a.type === 'built-in').length;
        const tempCount = agents.filter((a) => a.type === 'temp').length;

        const response = {
          agents,
          total: agents.length,
          builtIn: builtInCount,
          temp: tempCount,
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
