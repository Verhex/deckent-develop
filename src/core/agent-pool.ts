// ─── Agent Pool Manager ──────────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentDefinition, AgentPool } from './agent-types.js';
import { createDefaultStats } from './agent-types.js';
import { readJsonSafe } from './utils.js';

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
      const agentFile = path.join(dir, entry.name, AGENT_FILENAME);
      const raw = readJsonSafe<Record<string, unknown>>(agentFile);
      if (raw) {
        const validation = AgentPoolManager.validateAgentDefinition(raw);
        if (validation.valid) {
          const agent = raw as unknown as AgentDefinition;
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

  // ─── Temp Agents ─────────────────────────────────────────────────────────────

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
