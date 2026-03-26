import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { ErrorRegistry } from '../../core/errors.js';
import { ALL_MODELS } from '../../core/types.js';
import { BRAIN_DIR, SPRINTS_DIR } from '../../core/constants.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  type?: 'built-in' | 'custom';
  enabled: boolean;
  model?: string;
  triggers?: string[];
  description?: string;
  uses?: number;
  successRate?: number;
  /** Built-in agent stats sub-object (agent-pool format) */
  stats?: {
    totalUses?: number;
    successRate?: number;
    avgCoverage?: number;
    lastUsedInSprint?: string;
  };
  systemPrompt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const VALID_MODELS = ALL_MODELS as readonly string[];
const VALID_TRIGGER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9\-_.*]+$/;

// ─── Helpers ────────────────────────────────────────────────────────

const AGENTS_DIR = '.deckent/agents';

function getAgentsDir(root: string): string {
  return join(root, AGENTS_DIR);
}

/** Safely read agent uses from stats.totalUses or direct uses field */
export function getAgentUses(a: AgentConfig): number {
  const val = a.stats?.totalUses ?? a.uses ?? 0;
  return isNaN(val) ? 0 : val;
}

/** Safely read agent success rate, returns 0 if NaN */
export function getAgentSuccessRate(a: AgentConfig): number {
  const rate = a.stats?.successRate ?? a.successRate ?? 0;
  return isNaN(rate) ? 0 : Math.round(rate);
}

function isValidAgentName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name) && name.length <= 64;
}

/**
 * Validate trigger keywords — must be non-empty alphanumeric strings
 * with optional hyphens, underscores, dots, and wildcards.
 */
export function validateTriggers(triggers: string[]): string[] {
  const errors: string[] = [];
  for (const trigger of triggers) {
    if (!trigger || trigger.trim().length === 0) {
      errors.push(`Empty trigger keyword`);
    } else if (!VALID_TRIGGER_PATTERN.test(trigger.trim())) {
      errors.push(`Invalid trigger "${trigger}": use alphanumeric chars, hyphens, underscores, dots, or wildcards`);
    }
  }
  return errors;
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

function createDefaultAgent(name: string, model = 'sonnet'): AgentConfig {
  return {
    name,
    type: 'custom',
    enabled: true,
    model,
    triggers: [],
    description: `Custom agent: ${name}`,
    uses: 0,
    successRate: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Load systemPrompt from PROMPT.md if present.
 */
function loadSystemPromptFromFile(agentDir: string): string | undefined {
  const promptPath = join(agentDir, 'PROMPT.md');
  if (!existsSync(promptPath)) return undefined;
  return readFileSync(promptPath, 'utf-8');
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

// ─── Sprint Stats Helpers ────────────────────────────────────────────

interface AgentSprintStat {
  sprint: string;
  tasks: number;
  success: number;
  successRate: number;
}

function loadAgentSprintStats(root: string, agentName: string): AgentSprintStat[] {
  const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsDir)) return [];

  const files = readdirSync(sprintsDir).filter(f => f.endsWith('.md'));
  // Numeric sort
  files.sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return na - nb;
  });

  const stats: AgentSprintStat[] = [];
  for (const file of files) {
    const content = readFileSync(join(sprintsDir, file), 'utf-8');
    // Look for agent mentions in sprint log
    const agentMentionRegex = new RegExp(agentName, 'gi');
    const mentions = (content.match(agentMentionRegex) ?? []).length;
    if (mentions === 0) continue;

    // Try to find task counts associated with this agent
    const taskLineRegex = /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(GO|NO_GO|GO_WITH_TECH_DEBT)\s*\|/g;
    let tasks = 0;
    let success = 0;
    let match: RegExpExecArray | null;
    while ((match = taskLineRegex.exec(content)) !== null) {
      tasks++;
      if (match[3] !== 'NO_GO') success++;
    }

    if (tasks === 0) {
      // Fallback: count agent name mentions as a proxy
      tasks = mentions;
      success = mentions;
    }

    const sprintName = file.replace('.md', '');
    stats.push({
      sprint: sprintName,
      tasks,
      success,
      successRate: tasks > 0 ? Math.round((success / tasks) * 100) : 0,
    });
  }
  return stats;
}

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
          a.type ?? 'custom',
          a.enabled ? 'enabled' : 'disabled',
          String(getAgentUses(a)),
          `${getAgentSuccessRate(a)}%`,
          a.model ?? '-',
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
    .option('--model <model>', `Model to use (${VALID_MODELS.join('|')})`, 'sonnet')
    .option('--triggers <triggers...>', 'Trigger keywords for task routing')
    .action(async (name: string, opts: { model?: string; triggers?: string[] }) => {
      try {
        const root = resolveProjectRoot();

        if (!isValidAgentName(name)) {
          throw ErrorRegistry.createError('DECKENT_E032', {
            message: `Invalid agent name "${name}". Use alphanumeric characters and hyphens only.`,
          });
        }

        const model = opts.model ?? 'sonnet';
        if (!VALID_MODELS.includes(model)) {
          throw new Error(`Invalid model "${model}". Valid options: ${VALID_MODELS.join(', ')}`);
        }

        // Validate triggers if provided
        const triggers = opts.triggers ?? [];
        if (triggers.length > 0) {
          const triggerErrors = validateTriggers(triggers);
          if (triggerErrors.length > 0) {
            throw new Error(`Invalid triggers:\n  ${triggerErrors.join('\n  ')}`);
          }
        }

        const agentDir = join(getAgentsDir(root), name);
        if (existsSync(join(agentDir, 'agent.json'))) {
          throw ErrorRegistry.createError('DECKENT_E033', { message: `Agent "${name}" already exists.` });
        }

        const promptContent = PROMPT_TEMPLATE.replace('{name}', name);
        const agent = createDefaultAgent(name, model);
        agent.triggers = triggers;
        // Auto-fill systemPrompt from PROMPT.md template
        agent.systemPrompt = promptContent;
        mkdirSync(agentDir, { recursive: true });
        writeFileSync(
          join(agentDir, 'agent.json'),
          JSON.stringify(agent, null, 2) + '\n',
        );
        writeFileSync(join(agentDir, 'PROMPT.md'), promptContent);

        print(`Agent "${name}" created at ${agentDir}`);
        print('  - agent.json');
        print('  - PROMPT.md');
        print(`  Model: ${model}`);
        if (triggers.length > 0) {
          print(`  Triggers: ${triggers.join(', ')}`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent stats ────────────────────────────────────────────────
  agentCmd
    .command('stats <name>')
    .description('Show sprint-by-sprint performance for an agent')
    .option('--json', 'Output as JSON')
    .action(async (name: string, opts: { json?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const agentDir = join(getAgentsDir(root), name);

        if (!existsSync(join(agentDir, 'agent.json'))) {
          throw ErrorRegistry.createError('DECKENT_E031', { message: `Agent "${name}" not found.` });
        }

        const agent = loadAgentConfig(agentDir);
        const sprintStats = loadAgentSprintStats(root, name);

        if (opts.json) {
          const uses = getAgentUses(agent);
          const successRate = getAgentSuccessRate(agent);
          print(JSON.stringify({ agent: { name, uses, successRate }, sprints: sprintStats }, null, 2));
          return;
        }

        print(`Agent: ${name}`);
        print(`  Total uses: ${getAgentUses(agent)}`);
        print(`  Overall success rate: ${getAgentSuccessRate(agent)}%`);
        print('');

        if (sprintStats.length === 0) {
          print('No sprint history found for this agent.');
          return;
        }

        const headers = ['Sprint', 'Tasks', 'Success', 'Rate'];
        const rows = sprintStats.map(s => [s.sprint, String(s.tasks), String(s.success), `${s.successRate}%`]);
        print(formatTable(headers, rows));
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
    .option('--triggers <triggers...>', 'Update trigger keywords')
    .option('--sync-prompt', 'Re-sync systemPrompt from PROMPT.md')
    .action(async (name: string, opts: { model?: string; description?: string; enable?: boolean; disable?: boolean; triggers?: string[]; syncPrompt?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const agentDir = join(getAgentsDir(root), name);
        const agent = loadAgentConfig(agentDir);

        const updates: string[] = [];
        if (opts.triggers) {
          const triggerErrors = validateTriggers(opts.triggers);
          if (triggerErrors.length > 0) {
            throw new Error(`Invalid triggers:\n  ${triggerErrors.join('\n  ')}`);
          }
          agent.triggers = opts.triggers;
          updates.push(`triggers=[${opts.triggers.join(', ')}]`);
        }
        if (opts.model) {
          if (!VALID_MODELS.includes(opts.model)) {
            throw new Error(`Invalid model "${opts.model}". Valid options: ${VALID_MODELS.join(', ')}`);
          }
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
        if (opts.syncPrompt) {
          const prompt = loadSystemPromptFromFile(agentDir);
          if (prompt) {
            agent.systemPrompt = prompt;
            updates.push('systemPrompt=<synced from PROMPT.md>');
          } else {
            print(`No PROMPT.md found for agent "${name}".`);
          }
        }

        if (updates.length === 0) {
          print(`Agent: ${agent.name}`);
          print(`  Type: ${agent.type}`);
          print(`  Model: ${agent.model}`);
          print(`  Enabled: ${agent.enabled}`);
          print(`  Description: ${agent.description}`);
          print(`  Uses: ${getAgentUses(agent)}, Success: ${getAgentSuccessRate(agent)}%`);
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
        print(`  Uses: ${getAgentUses(agent)}`);
        print(`  Success Rate: ${getAgentSuccessRate(agent)}%`);
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

// ─── Exported helpers (for testing) ────────────────────────────────
export { createHash };
