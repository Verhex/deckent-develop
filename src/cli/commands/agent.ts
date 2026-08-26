import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { promptConfirm } from '../helpers/prompt.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { memoryCatalogMessage } from '../helpers/message-catalog/cli-memory-catalog.js';
import { DeckentError, ErrorRegistry } from '../../core/errors.js';
import { BRAIN_DIR, SPRINTS_DIR } from '../../core/constants.js';
import { loadConfig, resolveDefaultModel } from '../../core/config.js';
import { modelRegistry, resolveCanonicalModelIdentity } from '../../core/model-registry.js';
import { createAgentDefinition } from '../../core/agent-types.js';
import { buildAgentCatalogEntries } from '../../core/agent-catalog-projection.js';
import { readCatalogStats } from '../../core/catalog-stats-read-model.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  type?: 'built-in' | 'custom';
  enabled: boolean;
  model?: string;
  preferredModel?: string;
  triggers?: string[];
  triggerKeywords?: string[];
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
export function validateTriggers(triggers: string[], lang = 'en'): string[] {
  const errors: string[] = [];
  for (const trigger of triggers) {
    if (!trigger || trigger.trim().length === 0) {
      errors.push(getMessage('agent.create.trigger_empty', lang));
    } else if (!VALID_TRIGGER_PATTERN.test(trigger.trim())) {
      errors.push(getMessage('agent.create.trigger_invalid', lang, { trigger }));
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

// ─── Agent catalog read model (row 7011, slice S4) ──────────────────────────
//
// `agent list` no longer discovers agents itself: the raw `.deckent/agents` scan
// this module used to export is gone, and every id, facet and precedence decision comes from
// the resolver (`AgentPoolManager`) — the same read model `deckent_agent_list`
// consumes, so the two surfaces cannot report different sets or (D3) different
// provenance words for the same record.
//
// The projection is duplicated in `src/mcp/tools/agent-list.ts` on purpose:
// ADR-D-004 C3 forbids `cli/ ↔ mcp/` imports, and this slice holds no write
// authority in `src/core/`, where the shared projection belongs. Parity is held
// by tests/cli/agent-surface-readmodel.test.ts until that module exists.

/** One catalog record as the read surfaces render it — §3.4's four facets, kept separate. */
// S5 (sprint-523 task 9): the catalog projection is CANONICAL in core —
// this surface consumes and re-exports it; the local duplicate builder is gone.
export { buildAgentCatalogEntries } from '../../core/agent-catalog-projection.js';
export type { AgentCatalogSurfaceEntry } from '../../core/agent-catalog-projection.js';


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
  successRate: number | null;
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

    // Match real sprint table rows: | Task | Agent | Skills | Status |
    const taskLineRegex = /\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*(DONE|GO|GO_WITH_TECH_DEBT|NO_GO)\s*\|/g;
    let tasks = 0;
    let success = 0;
    let match: RegExpExecArray | null;
    while ((match = taskLineRegex.exec(content)) !== null) {
      const agentCol = (match[2] ?? '').trim();
      if (!agentCol.toLowerCase().includes(agentName.toLowerCase())) continue;
      tasks++;
      if ((match[4] ?? '').trim() !== 'NO_GO') success++;
    }

    const sprintName = file.replace('.md', '');
    stats.push({
      sprint: sprintName,
      tasks,
      success,
      successRate: tasks > 0 ? Math.round((success / tasks) * 100) : null,
    });
  }
  return stats;
}

// ─── Registration ───────────────────────────────────────────────────

/** Interactive confirmation for the destructive `agent delete`. Non-interactive
 *  (no TTY) returns false so a scripted run must opt in via --force. */
async function interactiveAgentDeleteConfirm(name: string, lang: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  return promptConfirm(getMessage('agent.delete_confirm_prompt', lang, { name }), false);
}

/**
 * Decide whether `agent delete` may proceed (CONFIRM-002, §4G). --force bypasses
 * the prompt; otherwise the confirm callback decides — a recursive rmSync of the
 * agent directory must be human-confirmed.
 */
export async function shouldProceedAgentDelete(
  opts: { force?: boolean },
  confirm: () => Promise<boolean>,
): Promise<boolean> {
  if (opts.force) return true;
  return confirm();
}

export function registerAgent(program: Command): void {
  const agentCmd = program.command('agent').description(getMessage('cli.agent.desc', getLanguage(undefined)));
  const registrationLang = getLanguage();

  // ─── agent lint (ROUTING-V3 Slice-1, 446) ────────────────────────
  agentCmd
    .command('lint')
    .description(getMessage('cli.agent.lint.desc', getLanguage(undefined)))
    .option('--json', memoryCatalogMessage('cli.memcat.shared.opt.json', getLanguage(undefined)))
    .action(async (opts: { json?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const lang = getLanguage();
        const { AgentPoolManager } = await import('../../core/agent-pool.js');
        const { loadVocabulary } = await import('../../core/routing/vocabulary.js');
        const { lintCatalog } = await import('../../core/routing/agent-lint.js');
        const { resolveRoutingV3Config } = await import('../../core/routing/config.js');
        const { validateCapabilities } = await import('../../core/routing/capability-vector.js');
        type LintCandidate = Parameters<typeof lintCatalog>[0][number];

        const pool = new AgentPoolManager(root).loadAgents();
        const candidates: LintCandidate[] = [];
        const withoutCapabilities: string[] = [];
        for (const agent of pool.values()) {
          const caps = (agent as unknown as Record<string, unknown>)['capabilities'];
          const validation = caps ? validateCapabilities(caps) : null;
          if (!validation?.ok) {
            withoutCapabilities.push(agent.id);
            continue;
          }
          candidates.push({
            agentId: agent.id,
            capabilities: validation.value,
            source: agent.source === 'learned' ? 'learned' : agent.source === 'user' ? 'user' : 'builtin',
          });
        }

        const vocabulary = await loadVocabulary(root);
        const config = resolveRoutingV3Config(null, {});
        const report = lintCatalog(candidates, vocabulary.domains, config);

        if (opts.json) {
          print(JSON.stringify({ ...report, withoutCapabilities }, null, 2));
        } else {
          print(getMessage('agent.lint.header', lang, {
            agents: String(candidates.length),
            cells: String(report.sweep.cells),
          }));
          if (withoutCapabilities.length > 0) {
            print(getMessage('agent.lint.no_capabilities', lang, {
              count: String(withoutCapabilities.length),
              ids: withoutCapabilities.join(', '),
            }));
          }
          for (const u of report.unreachable) {
            const detail = u.nearestMiss
              ? `${u.nearestMiss.workType}×${u.nearestMiss.domain} (−${u.nearestMiss.gapToWinner.toFixed(2)} vs ${u.nearestMiss.winner})`
              : (u.alwaysEliminated ?? '-');
            print(getMessage('agent.lint.unreachable', lang, { agentId: u.agentId, detail }));
          }
          for (const g of report.gaps) {
            print(getMessage('agent.lint.gap', lang, {
              workType: g.workType,
              domain: g.domain,
              reasons: g.reasons.join(', '),
            }));
          }
          for (const o of report.overlaps) {
            print(getMessage('agent.lint.overlap', lang, {
              a: o.a,
              b: o.b,
              pct: (o.similarity * 100).toFixed(0),
            }));
          }
          if (report.unreachable.length === 0 && report.gaps.length === 0) {
            print(getMessage('agent.lint.clean', lang));
          }
        }

        // CI-usable ratchet: coverage gaps are catalog errors (exit 1).
        if (report.gaps.length > 0) {
          process.exitCode = 1;
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent list ─────────────────────────────────────────────────
  agentCmd
    .command('list')
    .description(getMessage('cli.agent.list.desc', getLanguage(undefined)))
    .option('--json', memoryCatalogMessage('cli.memcat.shared.opt.json', getLanguage(undefined)))
    .action(async (opts: { json?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const catalogStats = readCatalogStats(root);
        const agents = buildAgentCatalogEntries(root).map((agent) => {
          const legacyRatio = agent.uses === 0
            ? null
            : Math.max(0, Math.min(1, agent.successRate > 1 ? agent.successRate / 100 : agent.successRate));
          const stats = catalogStats.agents[agent.id] ?? {
            uses: agent.uses,
            successes: legacyRatio === null ? 0 : Math.round(legacyRatio * agent.uses),
            successRatio: legacyRatio,
            successPercent: legacyRatio === null ? null : Math.round(legacyRatio * 100),
            lastUsedInSprint: null,
          };
          return { ...agent, ...stats, successRate: stats.successRatio };
        });

        // JSON first: the machine surface owes stdout exactly one document, and an
        // empty catalog is the empty array — never the human "create one" hint.
        if (opts.json) {
          // The machine payload carries all four facets (§3.4); the table below is the
          // six-column human view and cannot show them without new i18n keys (see notes).
          print(JSON.stringify(agents, null, 2));
          return;
        }

        if (agents.length === 0) {
          print('No agents found. Create one with: deckent agent create <name>');
          return;
        }

        const headers = ['Name', 'Type', 'Status', 'Uses', 'Success', 'Model'];
        const rows = agents.map((a) => [
          a.name,
          a.displayType ?? 'custom',
          a.enabled ? 'enabled' : 'disabled',
          String(a.uses),
          a.successPercent === null ? 'never' : `${a.successPercent}%`,
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
    .command('create')
    .argument('<name>', memoryCatalogMessage('cli.memcat.agent.arg.new_name', registrationLang))
    .description(getMessage('agent.create.description', registrationLang))
    .option('--model <model>', getMessage('agent.create.option_model', registrationLang))
    .option('--triggers <triggers...>', getMessage('agent.create.option_triggers', registrationLang))
    .option('--prompt <text>', getMessage('agent.create.option_prompt', registrationLang))
    .option('--description <desc>', getMessage('agent.create.option_description', registrationLang))
    .action(async (name: string, opts: { model?: string; triggers?: string[]; prompt?: string; description?: string }) => {
      try {
        const root = resolveProjectRoot();
        const config = await loadConfig(root).catch(() => undefined);
        const lang = getLanguage(config?.language);

        if (!isValidAgentName(name)) {
          throw ErrorRegistry.createError('DECKENT_E032', {
            message: getMessage('agent.create.invalid_name', lang, { name }),
          });
        }

        const requestedModel = opts.model ?? resolveDefaultModel(config);
        let model: string;
        try {
          model = resolveCanonicalModelIdentity(requestedModel, { registerParametric: false }).id;
        } catch {
          throw new DeckentError('E_AGENT_INVALID_MODEL', getMessage('agent.create.invalid_model', lang, {
            model: requestedModel,
            models: modelRegistry.getAllModelIds().join(', '),
          }));
        }

        // Validate triggers if provided
        const triggers = opts.triggers ?? [];
        if (triggers.length > 0) {
          const triggerErrors = validateTriggers(triggers, lang);
          if (triggerErrors.length > 0) {
            throw new DeckentError('E_AGENT_INVALID_TRIGGERS', getMessage('agent.create.invalid_triggers', lang, {
              errors: triggerErrors.join('\n  '),
            }));
          }
        }

        const agentDir = join(getAgentsDir(root), name);
        if (existsSync(join(agentDir, 'agent.json'))) {
          throw ErrorRegistry.createError('DECKENT_E033', {
            message: getMessage('agent.create.exists', lang, { name }),
          });
        }

        const promptContent = opts.prompt ?? PROMPT_TEMPLATE.replace('{name}', name);
        const agent = createAgentDefinition({
          id: name,
          name,
          description: opts.description ?? getMessage('agent.create.default_description', lang, { name }),
          systemPrompt: promptContent,
          preferredModel: model,
          triggerKeywords: triggers,
          manifestVersion: 1,
          source: 'user',
        });
        mkdirSync(agentDir, { recursive: true });
        writeFileSync(
          join(agentDir, 'agent.json'),
          JSON.stringify(agent, null, 2) + '\n',
        );
        writeFileSync(join(agentDir, 'PROMPT.md'), promptContent);

        print(getMessage('agent.create.created', lang, { name, path: agentDir }));
        print(getMessage('agent.create.file', lang, { file: 'agent.json' }));
        print(getMessage('agent.create.file', lang, { file: 'PROMPT.md' }));
        print(getMessage('agent.create.model', lang, { model }));
        if (opts.description) {
          print(getMessage('agent.create.description_value', lang, { description: opts.description }));
        }
        if (triggers.length > 0) {
          print(getMessage('agent.create.triggers', lang, { triggers: triggers.join(', ') }));
        }
        if (opts.prompt) {
          print(getMessage('agent.create.prompt', lang, { chars: String(promptContent.length) }));
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent stats ────────────────────────────────────────────────
  agentCmd
    .command('stats')
    .argument('<name>', memoryCatalogMessage('cli.memcat.agent.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.agent.stats.desc', getLanguage(undefined)))
    .option('--json', memoryCatalogMessage('cli.memcat.shared.opt.json', getLanguage(undefined)))
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
        const rows = sprintStats.map(s => [s.sprint, String(s.tasks), String(s.success), s.successRate !== null ? `${s.successRate}%` : '-']);
        print(formatTable(headers, rows));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent enable ───────────────────────────────────────────────
  agentCmd
    .command('enable')
    .argument('<name>', memoryCatalogMessage('cli.memcat.agent.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.agent.enable.desc', getLanguage(undefined)))
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
    .command('disable')
    .argument('<name>', memoryCatalogMessage('cli.memcat.agent.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.agent.disable.desc', getLanguage(undefined)))
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
    .command('delete')
    .argument('<name>', memoryCatalogMessage('cli.memcat.agent.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.agent.delete.desc', getLanguage(undefined)))
    .option('--force', memoryCatalogMessage('cli.memcat.agent.delete.opt.force', getLanguage(undefined)))
    .action(async (name: string, opts: { force?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const agentDir = join(getAgentsDir(root), name);
        if (!existsSync(agentDir)) {
          throw ErrorRegistry.createError('DECKENT_E031', {
            message: `Agent '${name}' not found`,
          });
        }
        const lang = getLanguage();
        const proceed = await shouldProceedAgentDelete(opts, () =>
          interactiveAgentDeleteConfirm(name, lang),
        );
        if (!proceed) {
          print(getMessage('agent.delete_aborted', lang, { name }));
          return;
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
    .command('edit')
    .argument('<name>', memoryCatalogMessage('cli.memcat.agent.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.agent.edit.desc', getLanguage(undefined)))
    .option('--model <model>', memoryCatalogMessage('cli.memcat.agent.edit.opt.model', getLanguage(undefined)))
    .option('--description <desc>', memoryCatalogMessage('cli.memcat.agent.edit.opt.description', getLanguage(undefined)))
    .option('--enable', memoryCatalogMessage('cli.memcat.agent.edit.opt.enable', getLanguage(undefined)))
    .option('--disable', memoryCatalogMessage('cli.memcat.agent.edit.opt.disable', getLanguage(undefined)))
    .option('--triggers <triggers...>', memoryCatalogMessage('cli.memcat.agent.edit.opt.triggers', getLanguage(undefined)))
    .option('--sync-prompt', memoryCatalogMessage('cli.memcat.agent.edit.opt.sync_prompt', getLanguage(undefined)))
    .action(async (name: string, opts: { model?: string; description?: string; enable?: boolean; disable?: boolean; triggers?: string[]; syncPrompt?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const config = await loadConfig(root).catch(() => undefined);
        const lang = getLanguage(config?.language);
        const agentDir = join(getAgentsDir(root), name);
        const agent = loadAgentConfig(agentDir);

        const updates: string[] = [];
        if (opts.triggers) {
          const triggerErrors = validateTriggers(opts.triggers, lang);
          if (triggerErrors.length > 0) {
            throw new DeckentError('E_AGENT_EDIT_INVALID_TRIGGERS', `Invalid triggers:\n  ${triggerErrors.join('\n  ')}`);
          }
          if (agent.preferredModel !== undefined) agent.triggerKeywords = opts.triggers;
          else agent.triggers = opts.triggers;
          updates.push(`triggers=[${opts.triggers.join(', ')}]`);
        }
        if (opts.model) {
          const canonicalModel = resolveCanonicalModelIdentity(opts.model, { registerParametric: false }).id;
          if (agent.preferredModel !== undefined) agent.preferredModel = canonicalModel;
          else agent.model = canonicalModel;
          updates.push(`model=${canonicalModel}`);
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

  // ─── agent reclassify ──────────────────────────────────────────
  agentCmd
    .command('reclassify')
    .description(getMessage('cli.agent.reclassify.desc', getLanguage(undefined)))
    .requiredOption('--sprint <id>', memoryCatalogMessage('cli.memcat.agent.reclassify.opt.sprint', getLanguage(undefined)))
    .requiredOption('--task <id>', memoryCatalogMessage('cli.memcat.agent.reclassify.opt.task', getLanguage(undefined)))
    .requiredOption('--decision <decision>', memoryCatalogMessage('cli.memcat.agent.reclassify.opt.decision', getLanguage(undefined)))
    .option('--reason <text>', memoryCatalogMessage('cli.memcat.agent.reclassify.opt.reason', getLanguage(undefined)))
    .option('--no-audit', memoryCatalogMessage('cli.memcat.agent.reclassify.opt.no_audit', getLanguage(undefined)))
    .action(async (opts: { sprint: string; task: string; decision: string; reason?: string; audit?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const valid = ['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO'] as const;
        if (!(valid as readonly string[]).includes(opts.decision)) {
          throw new DeckentError('E_AGENT_INVALID_DECISION', `Invalid --decision "${opts.decision}". Valid values: ${valid.join(', ')}`);
        }
        const decision = opts.decision as typeof valid[number];

        // Lazy-load OutcomeTracker (avoids loading at CLI startup if unused).
        const { OutcomeTracker } = await import('../../orchestra/outcome-tracker.js');
        const tracker = new OutcomeTracker(root);

        // Lazy-load MemoryStore — better-sqlite3 may be absent in some installs.
        let memoryStore: import('../../orchestra/outcome-tracker.js').ReclassifyAuditStore | undefined;
        if (opts.audit !== false) {
          try {
            const memMod = await import('../../core/memory-store.js');
            const dbPath = join(root, '.brain', 'memory.db');
            if (existsSync(dbPath)) {
              memoryStore = new memMod.MemoryStore(dbPath);
            } else {
              print('Note: .brain/memory.db not found — audit trail will be skipped.');
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            print(`Note: MemoryStore unavailable (${msg}) — audit trail will be skipped.`);
          }
        }

        const result = tracker.reclassifyTaskOutcome(opts.sprint, opts.task, decision, {
          reason: opts.reason,
          memoryStore,
        });

        if (!result.changed) {
          print(`No change: ${opts.task} already classified as ${decision} in ${opts.sprint}.`);
          return;
        }

        print(`Reclassified ${opts.task} in ${opts.sprint}: ${result.previous} → ${result.current}`);
        if (result.agentId) {
          print(`  Agent: ${result.agentId}`);
        }
        if (result.skillIds.length > 0) {
          print(`  Skills: ${result.skillIds.join(', ')}`);
        }
        if (opts.reason) {
          print(`  Reason: ${opts.reason}`);
        }
        if (result.auditTrailWritten) {
          print('  Audit-trail: written (retro entry, tag=adr-046)');
        } else {
          print('  Audit-trail: skipped');
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── agent info ────────────────────────────────────────────────
  agentCmd
    .command('info')
    .argument('<name>', memoryCatalogMessage('cli.memcat.agent.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.agent.info.desc', getLanguage(undefined)))
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const agentDir = join(getAgentsDir(root), name);
        const agent = loadAgentConfig(agentDir);
        const stats = readCatalogStats(root).agents[name];

        print(`Agent: ${agent.name}`);
        print(`  Type: ${agent.type}`);
        print(`  Model: ${agent.model}`);
        print(`  Enabled: ${agent.enabled}`);
        print(`  Description: ${agent.description}`);
        print(`  Uses: ${stats?.uses ?? 0}`);
        print(`  Success Rate: ${stats?.successPercent === null || stats === undefined ? 'never' : `${stats.successPercent}%`}`);
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
