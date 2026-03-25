import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { ErrorRegistry } from '../../core/errors.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  type: 'built-in' | 'custom';
  enabled: boolean;
  model: string;
  triggers: string[];
  description: string;
  uses: number;
  successRate: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

const AGENTS_DIR = '.deckent/agents';

function getAgentsDir(root: string): string {
  return join(root, AGENTS_DIR);
}

function isValidAgentName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name) && name.length <= 64;
}

export function loadAgentConfig(agentDir: string): AgentConfig {
  const configPath = join(agentDir, 'agent.json');
  if (!existsSync(configPath)) {
    throw ErrorRegistry.createError('DECKENT_E031', { message: `Agent config not found: ${configPath}` });
  }
  return JSON.parse(readFileSync(configPath, 'utf-8')) as AgentConfig;
}

export function loadAllAgents(root: string): AgentConfig[] {
  const agentsDir = getAgentsDir(root);
  if (!existsSync(agentsDir)) {
    return [];
  }
  const entries = readdirSync(agentsDir, { withFileTypes: true });
  const agents: AgentConfig[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const configPath = join(agentsDir, entry.name, 'agent.json');
    if (existsSync(configPath)) {
      try {
        agents.push(JSON.parse(readFileSync(configPath, 'utf-8')) as AgentConfig);
      } catch {
        // Skip malformed agent configs
      }
    }
  }
  return agents;
}

export function saveAgentConfig(root: string, agent: AgentConfig): void {
  const agentDir = join(getAgentsDir(root), agent.name);
  if (!existsSync(agentDir)) {
    mkdirSync(agentDir, { recursive: true });
  }
  writeFileSync(
    join(agentDir, 'agent.json'),
    JSON.stringify(agent, null, 2) + '\n',
  );
}

function createDefaultAgent(name: string): AgentConfig {
  return {
    name,
    type: 'custom',
    enabled: true,
    model: 'sonnet',
    triggers: [],
    description: `Custom agent: ${name}`,
    uses: 0,
    successRate: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const PROMPT_TEMPLATE = `# Agent: {name}

## Role
Describe what this agent specializes in.

## Instructions
- Follow project conventions
- Stay within assigned scope
- Write tests for all changes

## Triggers
Keywords or patterns that should route tasks to this agent.
`;

// ─── Registration ───────────────────────────────────────────────────

export function registerAgent(program: Command): void {
  const agentCmd = program.command('agent').description('Manage agent pool');

  // ─── agent list ─────────────────────────────────────────────────
  agentCmd
    .command('list')
    .description('List all agents in the pool')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const agents = loadAllAgents(root);

        if (agents.length === 0) {
          print('No agents found. Create one with: deckent agent create <name>');
          return;
        }

        if (opts.json) {
          print(JSON.stringify(agents, null, 2));
          return;
        }

        const headers = ['Name', 'Type', 'Status', 'Uses', 'Success', 'Model'];
        const rows = agents.map((a) => [
          a.name,
          a.type,
          a.enabled ? 'enabled' : 'disabled',
          String(a.uses),
          `${Math.round(a.successRate)}%`,
          a.model,
        ]);
        print(formatTable(headers, rows));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent create ───────────────────────────────────────────────
  agentCmd
    .command('create <name>')
    .description('Create a custom agent')
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();

        if (!isValidAgentName(name)) {
          throw ErrorRegistry.createError('DECKENT_E032', {
            message: `Invalid agent name "${name}". Use alphanumeric characters and hyphens only.`,
          });
        }

        const agentDir = join(getAgentsDir(root), name);
        if (existsSync(join(agentDir, 'agent.json'))) {
          throw ErrorRegistry.createError('DECKENT_E033', { message: `Agent "${name}" already exists.` });
        }

        const agent = createDefaultAgent(name);
        mkdirSync(agentDir, { recursive: true });
        writeFileSync(
          join(agentDir, 'agent.json'),
          JSON.stringify(agent, null, 2) + '\n',
        );
        writeFileSync(
          join(agentDir, 'PROMPT.md'),
          PROMPT_TEMPLATE.replace('{name}', name),
        );

        print(`Agent "${name}" created at ${agentDir}`);
        print('  - agent.json');
        print('  - PROMPT.md');
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent enable ───────────────────────────────────────────────
  agentCmd
    .command('enable <name>')
    .description('Enable an agent')
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const agentDir = join(getAgentsDir(root), name);
        const agent = loadAgentConfig(agentDir);
        agent.enabled = true;
        agent.updatedAt = new Date().toISOString();
        saveAgentConfig(root, agent);
        print(`Agent "${name}" enabled.`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent disable ──────────────────────────────────────────────
  agentCmd
    .command('disable <name>')
    .description('Disable an agent')
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const agentDir = join(getAgentsDir(root), name);
        const agent = loadAgentConfig(agentDir);
        agent.enabled = false;
        agent.updatedAt = new Date().toISOString();
        saveAgentConfig(root, agent);
        print(`Agent "${name}" disabled.`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent delete ──────────────────────────────────────────────
  agentCmd
    .command('delete <name>')
    .description('Delete an agent from the pool')
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const agentDir = join(getAgentsDir(root), name);
        if (!existsSync(agentDir)) {
          throw ErrorRegistry.createError('DECKENT_E031', {
            message: `Agent '${name}' not found`,
          });
        }
        rmSync(agentDir, { recursive: true, force: true });
        print(`Agent '${name}' deleted.`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent edit ────────────────────────────────────────────────
  agentCmd
    .command('edit <name>')
    .description('Edit an agent configuration')
    .option('--model <model>', 'Update model')
    .option('--description <desc>', 'Update description')
    .option('--enable', 'Enable the agent')
    .option('--disable', 'Disable the agent')
    .action(async (name: string, opts: { model?: string; description?: string; enable?: boolean; disable?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const agentDir = join(getAgentsDir(root), name);
        const agent = loadAgentConfig(agentDir);

        const updates: string[] = [];
        if (opts.model) {
          agent.model = opts.model;
          updates.push(`model=${opts.model}`);
        }
        if (opts.description) {
          agent.description = opts.description;
          updates.push(`description=${opts.description}`);
        }
        if (opts.enable) {
          agent.enabled = true;
          updates.push('enabled=true');
        }
        if (opts.disable) {
          agent.enabled = false;
          updates.push('enabled=false');
        }

        if (updates.length === 0) {
          print(`Agent: ${agent.name}`);
          print(`  Type: ${agent.type}`);
          print(`  Model: ${agent.model}`);
          print(`  Enabled: ${agent.enabled}`);
          print(`  Description: ${agent.description}`);
          print(`  Uses: ${agent.uses}, Success: ${Math.round(agent.successRate)}%`);
          return;
        }

        agent.updatedAt = new Date().toISOString();
        saveAgentConfig(root, agent);
        print(`Updated: ${updates.join(', ')}`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent info ────────────────────────────────────────────────
  agentCmd
    .command('info <name>')
    .description('Show detailed agent information')
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const agentDir = join(getAgentsDir(root), name);
        const agent = loadAgentConfig(agentDir);

        print(`Agent: ${agent.name}`);
        print(`  Type: ${agent.type}`);
        print(`  Model: ${agent.model}`);
        print(`  Enabled: ${agent.enabled}`);
        print(`  Description: ${agent.description}`);
        print(`  Uses: ${agent.uses}`);
        print(`  Success Rate: ${Math.round(agent.successRate)}%`);
        print(`  Created: ${agent.createdAt}`);
        print(`  Updated: ${agent.updatedAt}`);

        const promptPath = join(agentDir, 'PROMPT.md');
        if (existsSync(promptPath)) {
          const promptContent = readFileSync(promptPath, 'utf-8');
          print(`\n--- PROMPT.md ---\n${promptContent}`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
