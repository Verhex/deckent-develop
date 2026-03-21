// ─── Agent Retirement ───────────────────────────────────────────────────────
// Evaluates agents for retirement based on performance criteria.
// Retired agents are moved to .deckent/agents/.retired/.

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

export interface RetirementStats {
  successRate: number;       // 0.0-1.0
  totalUses: number;
  sprintsParticipated: number;
}

export interface RetirementConfig {
  minSuccessRate: number;    // default 0.3
  minSprints: number;        // default 5
  minUses: number;           // default 10
}

export interface RetirementResult {
  shouldRetire: boolean;
  reasons: string[];
}

export interface RetiredAgentRecord {
  id: string;
  retiredAt: string;
  reason: string;
  stats: RetirementStats;
  source: 'builtin' | 'user' | 'learned';
}

// ─── Constants ──────────────────────────────────────────────────────

const AGENTS_DIR = '.deckent/agents';
const RETIRED_DIR = '.deckent/agents/.retired';
const AGENT_FILENAME = 'agent.json';
const RETIRED_FILENAME = 'retired.json';

const DEFAULT_CONFIG: RetirementConfig = {
  minSuccessRate: 0.3,
  minSprints: 5,
  minUses: 10,
};

// ─── AgentRetirement ────────────────────────────────────────────────

export class AgentRetirement {
  constructor(private projectRoot: string) {}

  /**
   * Evaluate whether an agent should be retired.
   * Criteria: successRate < 30% AND 5+ sprints AND 10+ uses.
   * Built-in agents can be disabled but not retired.
   */
  evaluateForRetirement(
    _agentId: string,
    stats: RetirementStats,
    source: 'builtin' | 'user' | 'learned',
    config: Partial<RetirementConfig> = {},
  ): RetirementResult {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const reasons: string[] = [];

    if (source === 'builtin') {
      return { shouldRetire: false, reasons: ['Built-in agents cannot be retired, only disabled.'] };
    }

    const meetsUsageThreshold = stats.totalUses >= cfg.minUses;
    const meetsSprintThreshold = stats.sprintsParticipated >= cfg.minSprints;
    const isBelowSuccessRate = stats.successRate < cfg.minSuccessRate;

    if (!meetsUsageThreshold) {
      reasons.push(`Agent has ${stats.totalUses} uses (minimum ${cfg.minUses} required).`);
    }
    if (!meetsSprintThreshold) {
      reasons.push(`Agent participated in ${stats.sprintsParticipated} sprints (minimum ${cfg.minSprints} required).`);
    }
    if (isBelowSuccessRate && meetsUsageThreshold && meetsSprintThreshold) {
      reasons.push(`Success rate ${(stats.successRate * 100).toFixed(1)}% is below ${(cfg.minSuccessRate * 100).toFixed(1)}% threshold.`);
    }

    const shouldRetire = isBelowSuccessRate && meetsUsageThreshold && meetsSprintThreshold;

    return { shouldRetire, reasons };
  }

  /**
   * Retire an agent: move from agents/ to .retired/.
   */
  retire(agentId: string, reason: string): boolean {
    const agentDir = path.join(this.projectRoot, AGENTS_DIR, agentId);
    const agentFile = path.join(agentDir, AGENT_FILENAME);

    if (!fs.existsSync(agentFile)) return false;

    let agentData: Record<string, unknown>;
    try {
      agentData = JSON.parse(fs.readFileSync(agentFile, 'utf8'));
    } catch {
      return false;
    }

    // Prevent retiring built-in agents
    if (agentData.source === 'builtin') return false;

    // Create retired record
    const retiredDir = path.join(this.projectRoot, RETIRED_DIR);
    fs.mkdirSync(retiredDir, { recursive: true });

    const record: RetiredAgentRecord = {
      id: agentId,
      retiredAt: new Date().toISOString(),
      reason,
      stats: {
        successRate: typeof agentData.stats === 'object' && agentData.stats !== null
          ? (agentData.stats as Record<string, unknown>).successRate as number ?? 0
          : 0,
        totalUses: typeof agentData.stats === 'object' && agentData.stats !== null
          ? (agentData.stats as Record<string, unknown>).totalUses as number ?? 0
          : 0,
        sprintsParticipated: 0,
      },
      source: agentData.source as 'builtin' | 'user' | 'learned' ?? 'user',
    };

    // Save retired record
    const retiredAgentDir = path.join(retiredDir, agentId);
    fs.mkdirSync(retiredAgentDir, { recursive: true });
    fs.writeFileSync(
      path.join(retiredAgentDir, AGENT_FILENAME),
      JSON.stringify(agentData, null, 2) + '\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(retiredAgentDir, RETIRED_FILENAME),
      JSON.stringify(record, null, 2) + '\n',
      'utf8',
    );

    // Remove from active agents
    fs.rmSync(agentDir, { recursive: true, force: true });
    return true;
  }

  /**
   * Reinstate a retired agent back to active pool.
   */
  reinstate(agentId: string): boolean {
    const retiredAgentDir = path.join(this.projectRoot, RETIRED_DIR, agentId);
    const retiredAgentFile = path.join(retiredAgentDir, AGENT_FILENAME);

    if (!fs.existsSync(retiredAgentFile)) return false;

    let agentData: Record<string, unknown>;
    try {
      agentData = JSON.parse(fs.readFileSync(retiredAgentFile, 'utf8'));
    } catch {
      return false;
    }

    // Restore to active agents
    const activeDir = path.join(this.projectRoot, AGENTS_DIR, agentId);
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(
      path.join(activeDir, AGENT_FILENAME),
      JSON.stringify(agentData, null, 2) + '\n',
      'utf8',
    );

    // Remove from retired
    fs.rmSync(retiredAgentDir, { recursive: true, force: true });
    return true;
  }

  /**
   * List all retired agents.
   */
  listRetired(): RetiredAgentRecord[] {
    const retiredDir = path.join(this.projectRoot, RETIRED_DIR);
    if (!fs.existsSync(retiredDir)) return [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(retiredDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const records: RetiredAgentRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const recordFile = path.join(retiredDir, entry.name, RETIRED_FILENAME);
      try {
        const raw = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
        records.push(raw as RetiredAgentRecord);
      } catch {
        // skip invalid
      }
    }

    return records;
  }
}
