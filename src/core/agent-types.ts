// ─── Agent Pool Types ────────────────────────────────────────────────────────
import type { ModelType } from './types.js';

// ─── Agent Stats ─────────────────────────────────────────────────────────────

export interface AgentStats {
  totalUses: number;
  successRate: number;  // 0.0-1.0
  avgCoverage: number;  // 0-100
  lastUsedInSprint: string;
}

// ─── Agent Definition ────────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  expertise: string[];
  allowedTools: string[];
  deniedTools: string[];
  preferredModel: ModelType;
  effortMultiplier: number;  // 0.1-3.0
  triggerKeywords: string[];
  triggerScopes: string[];
  triggerFilePatterns: string[];
  persistent: boolean;
  enabled: boolean;
  source: 'builtin' | 'user' | 'learned';
  stats: AgentStats;
}

// ─── Agent Pool ──────────────────────────────────────────────────────────────

export type AgentPool = Map<string, AgentDefinition>;

// ─── Agent Selection Result ──────────────────────────────────────────────────

export interface AgentSelectionResult {
  agent: AgentDefinition | null;
  score: number;
  reason: string;
}

// ─── Multi-Agent Pipeline ────────────────────────────────────────────────────

export interface MultiAgentPipelineStep {
  agentId: string;
  phase: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create default agent stats with zeroed counters.
 */
export function createDefaultStats(): AgentStats {
  return {
    totalUses: 0,
    successRate: 0,
    avgCoverage: 0,
    lastUsedInSprint: '',
  };
}

/**
 * Create an AgentDefinition with sensible defaults.
 * Requires at minimum `id` and `name`.
 */
export function createAgentDefinition(
  partial: Partial<AgentDefinition> & { id: string; name: string },
): AgentDefinition {
  return {
    description: '',
    systemPrompt: '',
    expertise: [],
    allowedTools: [],
    deniedTools: [],
    preferredModel: 'sonnet',
    effortMultiplier: 1.0,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: false,
    enabled: true,
    source: 'user',
    stats: createDefaultStats(),
    ...partial,
  };
}
