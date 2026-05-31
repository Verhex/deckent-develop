// ─── Agent Pool Manager ──────────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentDefinition, AgentPool } from './agent-types.js';
import { createDefaultStats } from './agent-types.js';
import type { ActivationRule } from './routing-types.js';
import { createDefaultActivationConfig } from './routing-types.js';
import { readJsonSafe } from './utils.js';

// ─── Built-in Implementation Intent Candidacy (Sprint 204 Task 204-003) ──────
//
// Built-in agent.json files do not declare `intent.primary: "implementation"`
// activation rules — so every "implementation" task historically fell to the
// scope-blind temp-react-ts-specialist (impl@6). Refactorer and architect are
// the natural built-in homes for general code implementation; we inject
// mid-tier implementation candidacy at load time so they out-rank the
// scope-blind temp agent via tie-break + learning bonus, without touching the
// individual agent.json files (which live outside this task's write scope).
//
// Scores are intentionally moderate (refactorer 7, architect 6) so that:
//   - Existing intent matches still dominate (refactor@10, design@8).
//   - For pure implementation tasks, built-ins beat temp-react-ts-specialist (6)
//     via the agent's primary candidacy score plus learning/synergy bonuses.
export const BUILTIN_IMPLEMENTATION_INTENT_RULES: Readonly<
  Record<string, { score: number; name: string }>
> = {
  refactorer: { score: 7, name: 'implementation-candidate' },
  architect: { score: 6, name: 'implementation-candidate' },
};

/**
 * Inject a mid-tier `intent.primary === "implementation"` activation rule into
 * known built-in agents (refactorer, architect) so they become viable
 * candidates for generic implementation tasks. Idempotent: re-applying does
 * not duplicate the rule. Returns true when the agent was modified.
 */
export function applyBuiltinImplementationRules(agent: AgentDefinition): boolean {
  const ruleSpec = BUILTIN_IMPLEMENTATION_INTENT_RULES[agent.id];
  if (!ruleSpec) return false;
  if (agent.source !== 'builtin') return false;

  if (!agent.activation) {
    agent.activation = createDefaultActivationConfig();
  }

  const alreadyPresent = agent.activation.rules.some(
    (r) => r.when['intent.primary'] === 'implementation',
  );
  if (alreadyPresent) return false;

  const rule: ActivationRule = {
    name: ruleSpec.name,
    when: { 'intent.primary': 'implementation' },
    score: ruleSpec.score,
  };
  agent.activation.rules.push(rule);
  return true;
}

// ─── Agent Domain ─────────────────────────────────────────────────────────────

export type AgentDomain = 'cli' | 'react' | 'system' | 'test' | 'doc' | 'devops' | 'security' | 'data';

// Module augmentation: adds domain? to AgentDefinition (backward compat — undefined → 'generic')
declare module './agent-types.js' {
  interface AgentDefinition {
    domain?: AgentDomain;
  }
}

/** Hardcoded domain map for built-in agents (agent.json domain field population is out of scope). */
export const BUILTIN_AGENT_DOMAINS: Readonly<Record<string, AgentDomain>> = {
  'architect': 'system',
  'architecture-planner': 'system',
  'bug-fixer': 'system',
  'code-reviewer': 'system',
  'refactorer': 'system',
  'api-builder': 'react',
  'frontend-designer': 'react',
  'accessibility-auditor': 'react',
  'doc-writer': 'doc',
  'ci-guardian': 'test',
  'security-auditor': 'security',
  'performance-analyzer': 'system',
  'data-engineer': 'data',
  'devops-engineer': 'devops',
  'migration-specialist': 'system',
};

/**
 * Hardcoded domain overrides for known temp agents that lack a domain field in agent.json.
 * Ensures validatePersonaTaskMatch can detect domain mismatches for these agents.
 */
export const TEMP_AGENT_DOMAINS: Readonly<Record<string, AgentDomain>> = {
  'temp-react-ts-specialist': 'react',
};

/**
 * Get the domain for an agent. Reads agent.domain if set (from agent.json),
 * falls back to BUILTIN_AGENT_DOMAINS by id, then TEMP_AGENT_DOMAINS, then 'generic'.
 */
export function getAgentDomain(agent: AgentDefinition): AgentDomain | 'generic' {
  if (agent.domain) return agent.domain;
  const builtin = BUILTIN_AGENT_DOMAINS[agent.id];
  if (builtin) return builtin;
  const temp = TEMP_AGENT_DOMAINS[agent.id];
  if (temp) return temp;
  return 'generic';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENTS_DIR = '.deckent/agents';
const TEMP_AGENTS_DIR = '.tasks/agents';
const AGENT_FILENAME = 'agent.json';

/** Default maximum number of temp agents to keep in pool. */
export const DEFAULT_MAX_TEMP_AGENTS = 50;

/** Default maximum age (in sprints) for temp agents before eviction. */
export const DEFAULT_MAX_AGENT_AGE = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the numeric sprint number from a sprint ID string (e.g. "sprint-037" → 37).
 * Returns 0 if the format is not recognized.
 */
function sprintNumber(sprintId: string): number {
  const match = /sprint-(\d+)/i.exec(sprintId);
  if (!match || !match[1]) return 0;
  return parseInt(match[1], 10);
}

/**
 * Determine whether a temp agent should be evicted based on last-used sprint.
 * @param lastUsedInSprint - The sprint ID when the agent was last used.
 * @param currentSprintId  - The current sprint ID (used as reference point).
 * @param maxAge           - Maximum number of sprints an agent can be unused.
 * @returns true when the agent is old enough to evict.
 */
export function isTempAgentStale(
  lastUsedInSprint: string,
  currentSprintId: string,
  maxAge: number,
): boolean {
  if (!lastUsedInSprint) return true;
  const lastNum = sprintNumber(lastUsedInSprint);
  const currentNum = sprintNumber(currentSprintId);
  if (lastNum === 0 || currentNum === 0) return false; // cannot determine — keep safe
  return currentNum - lastNum > maxAge;
}

// ─── Validation ──────────────────────────────────────────────────────────────

import { ALL_MODELS } from './types.js';
const VALID_MODELS = ALL_MODELS;
const VALID_SOURCES = ['builtin', 'user', 'learned'] as const;

export class AgentPoolManager {
  /** Maximum number of temp agents to keep in pool (LRU eviction). */
  private maxTempAgents: number;

  constructor(projectRoot: string, maxTempAgents = DEFAULT_MAX_TEMP_AGENTS) {
    this.projectRoot = projectRoot;
    this.maxTempAgents = maxTempAgents;
  }

  private projectRoot: string;

  // ─── Load ────────────────────────────────────────────────────────────────────

  /**
   * Load all agents from .deckent/agents/ and .tasks/agents/ directories.
   * Returns an AgentPool (Map<string, AgentDefinition>).
   * Skips directories with invalid agent.json files silently.
   * Applies LRU eviction: keeps only the most-recently-used temp agents
   * up to `maxTempAgents` (default 50).
   */
  loadAgents(): AgentPool {
    const pool: AgentPool = new Map();

    // Load persistent agents from .deckent/agents/ (never evicted)
    const persistentDir = path.join(this.projectRoot, AGENTS_DIR);
    this._loadFromDir(persistentDir, pool);

    // Load temp agents from .tasks/agents/ with LRU eviction
    const tempDir = path.join(this.projectRoot, TEMP_AGENTS_DIR);
    const tempPool: AgentPool = new Map();
    this._loadFromDir(tempDir, tempPool);

    // Apply LRU eviction: keep only maxTempAgents most-recently-used temp agents
    if (tempPool.size > this.maxTempAgents) {
      const sorted = Array.from(tempPool.values()).sort((a, b) => {
        const aNum = sprintNumber(a.stats?.lastUsedInSprint ?? '');
        const bNum = sprintNumber(b.stats?.lastUsedInSprint ?? '');
        return bNum - aNum; // descending: most recent first
      });
      const kept = sorted.slice(0, this.maxTempAgents);
      for (const agent of kept) {
        pool.set(agent.id, agent);
      }
    } else {
      for (const [id, agent] of tempPool) {
        pool.set(id, agent);
      }
    }

    return pool;
  }

  /**
   * Batch-read all agent definitions from a directory.
   * Single readdirSync to list subdirectories, then map over entries — O(N+1) syscalls.
   * readJsonSafe handles missing/invalid agent.json files gracefully (returns null).
   */
  private _loadFromDir(dir: string, pool: AgentPool): void {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    // Batch read: map over all directory entries, attempt to read agent.json for each.
    // No per-entry existsSync — readJsonSafe returns null for missing or invalid files.
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'archive') continue; // Skip archive directory
      const agentFile = path.join(dir, entry.name, AGENT_FILENAME);
      const raw = readJsonSafe<Record<string, unknown>>(agentFile);
      if (raw) {
        const validation = AgentPoolManager.validateAgentDefinition(raw);
        if (validation.valid) {
          const agent = raw as unknown as AgentDefinition;
          applyBuiltinImplementationRules(agent);
          pool.set(agent.id, agent);
        }
      }
    }
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  /**
   * Save an agent definition to .deckent/agents/{id}/agent.json.
   */
  saveAgent(agent: AgentDefinition): void {
    const agentDir = path.join(this.projectRoot, AGENTS_DIR, agent.id);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, AGENT_FILENAME),
      JSON.stringify(agent, null, 2) + '\n',
      'utf8',
    );
  }

  // ─── Remove ──────────────────────────────────────────────────────────────────

  /**
   * Remove an agent by id. Returns true if removed, false if not found.
   */
  removeAgent(id: string): boolean {
    const agentDir = path.join(this.projectRoot, AGENTS_DIR, id);
    if (!fs.existsSync(agentDir)) return false;
    fs.rmSync(agentDir, { recursive: true, force: true });
    return true;
  }

  // ─── Get / List ──────────────────────────────────────────────────────────────

  /**
   * Get a single agent by id. Returns undefined if not found.
   */
  getAgent(id: string): AgentDefinition | undefined {
    const pool = this.loadAgents();
    return pool.get(id);
  }

  /**
   * List all agents as an array.
   */
  listAgents(): AgentDefinition[] {
    const pool = this.loadAgents();
    return Array.from(pool.values());
  }

  /**
   * List only enabled agents.
   */
  listEnabled(): AgentDefinition[] {
    return this.listAgents().filter((a) => a.enabled);
  }

  /**
   * Get the set of active (enabled) agent IDs from the persistent agent pool.
   * Scans .deckent/agents/ directory, skipping 'archive' subdirectory.
   * This is used by the routing fallback chain to verify agent availability.
   */
  getActiveAgentIds(): Set<string> {
    const pool = this.loadAgents();
    const ids = new Set<string>();
    for (const [id, agent] of pool) {
      if (agent.enabled && !id.startsWith('archive')) {
        ids.add(id);
      }
    }
    return ids;
  }

  // ─── Temp Agents ─────────────────────────────────────────────────────────────

  /**
   * Save a temporary agent to the persistent agent pool (.deckent/agents/temp-{id}/).
   * These agents are discoverable by `ls .deckent/agents/` and survive across sprints
   * until explicitly removed or evicted. Idempotent: re-saves on each call.
   */
  saveTempAgentToPool(agent: AgentDefinition): void {
    const dirName = agent.id.startsWith('temp-') ? agent.id : `temp-${agent.id}`;
    const agentDir = path.join(this.projectRoot, AGENTS_DIR, dirName);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, AGENT_FILENAME),
      JSON.stringify({ ...agent, id: dirName }, null, 2) + '\n',
      'utf8',
    );
  }

  /**
   * Remove all temp agents (id starts with "temp-") from .deckent/agents/.
   * Returns the number of agents removed.
   */
  cleanupPersistentTempAgents(): number {
    const persistentDir = path.join(this.projectRoot, AGENTS_DIR);
    if (!fs.existsSync(persistentDir)) return 0;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(persistentDir, { withFileTypes: true });
    } catch {
      return 0;
    }
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('temp-')) {
        fs.rmSync(path.join(persistentDir, entry.name), { recursive: true, force: true });
        removed++;
      }
    }
    return removed;
  }

  /**
   * Create a temporary agent scoped to a sprint.
   * Stored in .tasks/agents/{sprintId}-{id}/agent.json.
   */
  createTempAgent(sprintId: string, agent: AgentDefinition): void {
    const dirName = `${sprintId}-${agent.id}`;
    const agentDir = path.join(this.projectRoot, TEMP_AGENTS_DIR, dirName);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, AGENT_FILENAME),
      JSON.stringify(agent, null, 2) + '\n',
      'utf8',
    );
  }

  /**
   * Cleanup all temporary agents for a given sprint.
   */
  cleanupTempAgents(sprintId: string): void {
    const tempDir = path.join(this.projectRoot, TEMP_AGENTS_DIR);
    if (!fs.existsSync(tempDir)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(tempDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(`${sprintId}-`)) {
        fs.rmSync(path.join(tempDir, entry.name), { recursive: true, force: true });
      }
    }
  }

  /**
   * LRU-based cleanup: remove temp agents that have not been used in the last
   * `maxAge` sprints relative to `currentSprintId`.
   * Builtin agents (source === 'builtin') in .deckent/agents/ are NEVER removed.
   *
   * @param maxAge         - Maximum number of sprints an agent can be unused (default 5).
   * @param currentSprintId - The reference sprint ID (e.g. "sprint-037").
   *                          Defaults to the highest sprint number found in the temp dir.
   * @returns number of agents removed.
   */
  cleanup(maxAge = DEFAULT_MAX_AGENT_AGE, currentSprintId?: string): number {
    const tempDir = path.join(this.projectRoot, TEMP_AGENTS_DIR);
    if (!fs.existsSync(tempDir)) return 0;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(tempDir, { withFileTypes: true });
    } catch {
      return 0;
    }

    // If no currentSprintId provided, infer it from the highest sprint number
    // seen in agent lastUsedInSprint fields. Batch read: no per-entry existsSync.
    let resolvedCurrentSprint = currentSprintId ?? '';
    if (!resolvedCurrentSprint) {
      let maxNum = 0;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const agentFile = path.join(tempDir, entry.name, AGENT_FILENAME);
        const raw = readJsonSafe<Record<string, unknown>>(agentFile);
        if (raw) {
          const stats = raw['stats'] as Record<string, unknown> | undefined;
          const lastUsed = (stats?.['lastUsedInSprint'] as string | undefined) ?? '';
          const num = sprintNumber(lastUsed);
          if (num > maxNum) maxNum = num;
        }
      }
      if (maxNum > 0) {
        resolvedCurrentSprint = `sprint-${String(maxNum).padStart(3, '0')}`;
      }
    }

    // If still no reference sprint, nothing to evict
    if (!resolvedCurrentSprint) return 0;

    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const agentFile = path.join(tempDir, entry.name, AGENT_FILENAME);
      const raw = readJsonSafe<Record<string, unknown>>(agentFile);
      if (!raw) continue;

      const validation = AgentPoolManager.validateAgentDefinition(raw);
      if (!validation.valid) continue;

      const agent = raw as unknown as AgentDefinition;

      // Builtin agents are never removed
      if (agent.source === 'builtin') continue;

      const stats = agent.stats;
      const lastUsed = stats?.lastUsedInSprint ?? '';

      if (isTempAgentStale(lastUsed, resolvedCurrentSprint, maxAge)) {
        fs.rmSync(path.join(tempDir, entry.name), { recursive: true, force: true });
        removed++;
      }
    }

    return removed;
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  /**
   * Update stats for an agent after task evaluation.
   */
  updateAgentStats(
    id: string,
    evaluation: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
    coverage: number,
    sprintId: string,
  ): void {
    const agent = this.getAgent(id);
    if (!agent) return;

    const stats = agent.stats ?? createDefaultStats();
    const prevTotal = stats.totalUses;
    stats.totalUses += 1;

    // Recalculate success rate (DONE and GO_WITH_TECH_DEBT count as success)
    const wasSuccess = evaluation === 'DONE' || evaluation === 'GO_WITH_TECH_DEBT';
    const prevSuccessCount = Math.round(stats.successRate * prevTotal);
    const newSuccessCount = prevSuccessCount + (wasSuccess ? 1 : 0);
    stats.successRate = stats.totalUses > 0 ? newSuccessCount / stats.totalUses : 0;

    // Recalculate average coverage
    const prevTotalCoverage = stats.avgCoverage * prevTotal;
    stats.avgCoverage = stats.totalUses > 0 ? (prevTotalCoverage + coverage) / stats.totalUses : 0;

    stats.lastUsedInSprint = sprintId;
    agent.stats = stats;

    this.saveAgent(agent);
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  /**
   * Validate an unknown value as an AgentDefinition.
   * Returns { valid: boolean, errors: string[] }.
   */
  static validateAgentDefinition(agent: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
      return { valid: false, errors: ['Agent definition must be a non-null object'] };
    }

    const obj = agent as Record<string, unknown>;

    // Required string fields
    for (const field of ['id', 'name'] as const) {
      if (typeof obj[field] !== 'string' || !(obj[field] as string).trim()) {
        errors.push(`"${field}" must be a non-empty string`);
      }
    }

    // Optional string fields that must be strings if present
    for (const field of ['description', 'systemPrompt'] as const) {
      if (obj[field] !== undefined && typeof obj[field] !== 'string') {
        errors.push(`"${field}" must be a string`);
      }
    }

    // preferredModel validation
    if (obj['preferredModel'] !== undefined) {
      if (!VALID_MODELS.includes(obj['preferredModel'] as typeof VALID_MODELS[number])) {
        errors.push(`"preferredModel" must be one of: ${VALID_MODELS.join(', ')}`);
      }
    }

    // source validation
    if (obj['source'] !== undefined) {
      if (!VALID_SOURCES.includes(obj['source'] as typeof VALID_SOURCES[number])) {
        errors.push(`"source" must be one of: ${VALID_SOURCES.join(', ')}`);
      }
    }

    // effortMultiplier validation
    if (obj['effortMultiplier'] !== undefined) {
      if (typeof obj['effortMultiplier'] !== 'number') {
        errors.push('"effortMultiplier" must be a number');
      } else if (obj['effortMultiplier'] < 0.1 || obj['effortMultiplier'] > 3.0) {
        errors.push('"effortMultiplier" must be between 0.1 and 3.0');
      }
    }

    // Boolean fields
    for (const field of ['persistent', 'enabled'] as const) {
      if (obj[field] !== undefined && typeof obj[field] !== 'boolean') {
        errors.push(`"${field}" must be a boolean`);
      }
    }

    // Array fields
    for (const field of [
      'expertise', 'allowedTools', 'deniedTools',
      'triggerKeywords', 'triggerScopes', 'triggerFilePatterns',
    ] as const) {
      if (obj[field] !== undefined) {
        if (!Array.isArray(obj[field])) {
          errors.push(`"${field}" must be an array`);
        } else {
          for (const item of obj[field] as unknown[]) {
            if (typeof item !== 'string') {
              errors.push(`"${field}" must be an array of strings`);
              break;
            }
          }
        }
      }
    }

    // Stats validation
    if (obj['stats'] !== undefined) {
      if (!obj['stats'] || typeof obj['stats'] !== 'object' || Array.isArray(obj['stats'])) {
        errors.push('"stats" must be an object');
      } else {
        const stats = obj['stats'] as Record<string, unknown>;
        if (stats['totalUses'] !== undefined && typeof stats['totalUses'] !== 'number') {
          errors.push('"stats.totalUses" must be a number');
        }
        if (stats['successRate'] !== undefined && typeof stats['successRate'] !== 'number') {
          errors.push('"stats.successRate" must be a number');
        }
        if (stats['avgCoverage'] !== undefined && typeof stats['avgCoverage'] !== 'number') {
          errors.push('"stats.avgCoverage" must be a number');
        }
        if (stats['lastUsedInSprint'] !== undefined && typeof stats['lastUsedInSprint'] !== 'string') {
          errors.push('"stats.lastUsedInSprint" must be a string');
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

// ─── Agent Prompt Resolution (single source — PROMPT.md canonical) ─────

/** Source of the resolved agent prompt content. */
export type AgentPromptSource = 'prompt-md' | 'system-prompt' | 'none';

/**
 * Result of {@link getAgentPrompt}. Single-source contract:
 *   PROMPT.md (canonical) > agent.json::systemPrompt (degraded fallback) > none.
 * Concatenation is NOT performed — at most one source supplies `content`.
 */
export interface AgentPromptResolution {
  content: string;
  source: AgentPromptSource;
  /** True when PROMPT.md was missing and we fell back to systemPrompt. */
  degraded: boolean;
  /** Resolved path (when source !== 'none'), useful for diagnostics. */
  resolvedFrom?: string;
}

const PROMPT_MD_FILENAME = 'PROMPT.md';

function readFileIfExists(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Resolve a single canonical agent prompt for `agentId` from `projectRoot`.
 *
 * Lookup order:
 *   1. `<root>/.deckent/agents/<id>/PROMPT.md` (canonical)
 *   2. `<root>/.tasks/agents/<id>/PROMPT.md`  (temp scope)
 *   3. `agent.json::systemPrompt` (degraded fallback — emits warning)
 *
 * No concatenation. `agent.json::systemPrompt` is preserved in the schema for
 * routing scoring and UI display, but it never co-exists with PROMPT.md in
 * the worker prompt block. ADR-048 (Prompt Lifecycle Contract) — Sprint 182.
 */
export function getAgentPrompt(
  agentId: string,
  projectRoot: string,
): AgentPromptResolution {
  // 1. PROMPT.md (canonical) — persistent agents
  const persistentPromptPath = path.join(projectRoot, AGENTS_DIR, agentId, PROMPT_MD_FILENAME);
  const persistentPrompt = readFileIfExists(persistentPromptPath);
  if (persistentPrompt !== undefined && persistentPrompt.trim().length > 0) {
    return {
      content: persistentPrompt,
      source: 'prompt-md',
      degraded: false,
      resolvedFrom: persistentPromptPath,
    };
  }

  // 2. PROMPT.md (temp scope)
  const tempPromptPath = path.join(projectRoot, TEMP_AGENTS_DIR, agentId, PROMPT_MD_FILENAME);
  const tempPrompt = readFileIfExists(tempPromptPath);
  if (tempPrompt !== undefined && tempPrompt.trim().length > 0) {
    return {
      content: tempPrompt,
      source: 'prompt-md',
      degraded: false,
      resolvedFrom: tempPromptPath,
    };
  }

  // 3. Degraded fallback: agent.json::systemPrompt
  const candidates = [
    path.join(projectRoot, AGENTS_DIR, agentId, AGENT_FILENAME),
    path.join(projectRoot, TEMP_AGENTS_DIR, agentId, AGENT_FILENAME),
  ];
  for (const jsonPath of candidates) {
    const raw = readJsonSafe<Record<string, unknown>>(jsonPath);
    if (!raw) continue;
    const sp = raw['systemPrompt'];
    if (typeof sp === 'string' && sp.trim().length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[deckent] Agent "${agentId}" PROMPT.md missing — falling back to agent.json::systemPrompt (degraded).`,
      );
      return {
        content: sp,
        source: 'system-prompt',
        degraded: true,
        resolvedFrom: jsonPath,
      };
    }
  }

  // 4. Nothing usable
  return { content: '', source: 'none', degraded: true };
}
