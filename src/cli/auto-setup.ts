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
      return 'max_plan';
    case 'pro':
      return 'pro_plan';
    case 'unknown':
      return 'pro_plan';
  }
}

// ─── Model Selection ─────────────────────────────────────────────────

function selectModels(subscription: SubscriptionDetected): { brainModel: ModelType; defaultModel: ModelType } {
  switch (subscription) {
    case 'max':
      return { brainModel: 'opus', defaultModel: 'sonnet' };
    case 'pro':
      return { brainModel: 'sonnet', defaultModel: 'sonnet' };
    case 'unknown':
      return { brainModel: 'sonnet', defaultModel: 'sonnet' };
  }
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

  // 4. Models
  const { brainModel, defaultModel } = selectModels(subscription);
  reasons.push(`Brain model: ${brainModel}, Default model: ${defaultModel}`);

  // 5. Planning mode
  const planning = selectPlanning(subscription);
  reasons.push(`Planning mode: ${planning}`);

  return {
    mode,
    maxWorkers,
    brainModel,
    defaultModel,
    planning,
    reasons,
  };
}
