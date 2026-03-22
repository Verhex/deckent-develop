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

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_MODELS = ['opus', 'sonnet', 'haiku'] as const;
const VALID_SOURCES = ['builtin', 'user', 'learned'] as const;

export class AgentPoolManager {
  constructor(private projectRoot: string) {}

  // ─── Load ────────────────────────────────────────────────────────────────────

  /**
   * Load all agents from .deckent/agents/ and .tasks/agents/ directories.
   * Returns an AgentPool (Map<string, AgentDefinition>).
   * Skips directories with invalid agent.json files silently.
   */
  loadAgents(): AgentPool {
    const pool: AgentPool = new Map();

    // Load persistent agents from .deckent/agents/
    const persistentDir = path.join(this.projectRoot, AGENTS_DIR);
    this._loadFromDir(persistentDir, pool);

    // Load temp agents from .tasks/agents/
    const tempDir = path.join(this.projectRoot, TEMP_AGENTS_DIR);
    this._loadFromDir(tempDir, pool);

    return pool;
  }

  private _loadFromDir(dir: string, pool: AgentPool): void {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const agentFile = path.join(dir, entry.name, AGENT_FILENAME);
      if (!fs.existsSync(agentFile)) continue;
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
