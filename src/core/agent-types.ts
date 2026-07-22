// ─── Agent Pool Types ────────────────────────────────────────────────────────
import type { ModelType } from './types.js';
import type { ActivationConfig } from './routing-types.js';
import { modelRegistry } from './model-registry.js';

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
  /** Manifest version: 1 (v1 keyword), 2 (v2 activation rules) */
  manifestVersion?: 1 | 2;
  /** V2 activation rules — if present, used instead of triggerKeywords/triggerScopes */
  activation?: ActivationConfig;
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

/** Registry-derived standard GA model for synthesized/user agents. */
export function resolveDefaultAgentModel(): ModelType {
  const preferredModel = modelRegistry.getByTier('standard').find((model) => model.status === 'ga');
  if (!preferredModel) throw new Error('E_AGENT_DEFAULT_MODEL_UNAVAILABLE');
  return preferredModel.id as ModelType;
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
    preferredModel: resolveDefaultAgentModel(),
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
