import type {
  SystemProfile,
  SubscriptionDetected,
  ProjectAnalysis,
  ProjectSize,
  SetupRecommendation,
  PlanMode,
  ModelType,
  BrainPlanningMode,
} from '../core/types.js';
import type { ModelTier } from '../core/model-registry.js';
import { getModePreset } from '../core/mode-presets.js';
import { modelRegistry } from '../core/model-registry.js';

// ─── Project Size Multiplier ─────────────────────────────────────────

function getWorkerMultiplier(size: ProjectSize): number {
  switch (size) {
    case 'small':
      return 0.5;
    case 'medium':
      return 0.75;
    case 'large':
      return 1;
  }
}

// ─── Mode Selection ──────────────────────────────────────────────────

function selectMode(subscription: SubscriptionDetected): PlanMode {
  switch (subscription) {
    case 'max':
      return 'performance';
    case 'pro':
      return 'economic';
    case 'unknown':
      return 'economic';
  }
}

// ─── Tier Selection (provider-agnostic) ──────────────────────────────

function selectTiers(mode: PlanMode): { brain_tier: ModelTier; worker_tier: ModelTier } {
  const preset = getModePreset(mode);
  if (preset) {
    return { brain_tier: preset.model_strategy.brain_tier, worker_tier: preset.model_strategy.worker_tier };
  }
  // Fallback for unknown modes
  return { brain_tier: 'standard', worker_tier: 'standard' };
}

/**
 * Resolve tier to a concrete model name for backward compatibility.
 * Uses Claude provider as default since it's the primary provider.
 */
function tierToModel(tier: ModelTier): ModelType {
  const model = modelRegistry.getByProviderAndTier('claude', tier);
  return (model?.id ?? 'sonnet') as ModelType;
}

// ─── Planning Mode ───────────────────────────────────────────────────

function selectPlanning(subscription: SubscriptionDetected): BrainPlanningMode {
  return subscription === 'max' ? 'ai' : 'structured';
}

// ─── Main ────────────────────────────────────────────────────────────

/**
 * Generate a setup recommendation based on system profile, subscription, and project analysis.
 */
export function generateSetupRecommendation(
  systemProfile: SystemProfile,
  subscription: SubscriptionDetected,
  projectAnalysis: ProjectAnalysis,
): SetupRecommendation {
  const reasons: string[] = [];

  // 1. Mode from subscription
  const mode = selectMode(subscription);
  reasons.push(`Subscription "${subscription}" → mode "${mode}"`);

  // 2. Workers from system profile
  const baseWorkers = systemProfile.recommendedMaxWorkers;
  reasons.push(`System recommends max ${baseWorkers} workers (${systemProfile.cpuCores} cores, ${systemProfile.totalMemMB} MB RAM)`);

  // 3. Scale workers by project size
  const multiplier = getWorkerMultiplier(projectAnalysis.size);
  const maxWorkers = Math.max(1, Math.ceil(baseWorkers * multiplier));
  reasons.push(`Project size "${projectAnalysis.size}" (×${multiplier}) → ${maxWorkers} workers`);

  // 4. Tiers (provider-agnostic) → derive model names for backward compat
  const { brain_tier, worker_tier } = selectTiers(mode);
  const brainModel = tierToModel(brain_tier);
  const defaultModel = tierToModel(worker_tier);
  reasons.push(`Brain tier: ${brain_tier} (${brainModel}), Worker tier: ${worker_tier} (${defaultModel})`);

  // 5. Planning mode
  const planning = selectPlanning(subscription);
  reasons.push(`Planning mode: ${planning}`);

  return {
    mode,
    maxWorkers,
    brainModel,
    defaultModel,
    brain_tier,
    worker_tier,
    planning,
    reasons,
  };
}
