// ─── Configuration Domain Types ─────────────────────────────────────────────
// Split from types.ts — Config, setup, CLI, and project analysis types

import type { DecisionEngineConfig, LearningConfig, CollaborationConfig } from './decision-config.js';
import type { NotificationConfig } from './notifications.js';
import type { ModelType } from './task-types.js';

// ─── Usage & Budgeting (Blueprint 9) ────────────────────────────────
export interface UsageMetrics {
  fiveHourPercent: number;
  weeklyPercent: number;
  measuredAt: string;
}

export interface UsageThresholds {
  '5hr': number;
  weekly: number;
}

// ─── Configuration (Blueprint 13) ───────────────────────────────────
export interface PlanModeConfig {
  max_workers: number | 'auto';
  brain_model: ModelType;
  default_model: ModelType;
  haiku_allowed: boolean;
  usage_thresholds: UsageThresholds;
  budget_per_sprint?: number;
  requires?: string;
  brain_planning?: BrainPlanningMode;
}

export type BrainPlanningMode = 'ai' | 'structured' | 'auto';

export type PlanMode = 'max_plan' | 'max5x_plan' | 'pro_plan' | 'api';

export interface SkillConfig {
  enabled: boolean;
  maxPerTask: number;         // default 3
  autoDetectStack: boolean;   // default true
  preferredSkills: string[];
}

export interface DeckentConfig {
  mode: PlanMode;
  modes: Record<PlanMode, PlanModeConfig>;
  language?: string;
  projectName?: string;
  version?: string;
  auto_docs?: AutoDocsConfig;
  /** Spawn backend: 'tmux' | 'subprocess' | 'auto' (default: 'auto') */
  spawn_backend?: 'tmux' | 'subprocess' | 'auto';
  /** Skill system configuration */
  skills?: SkillConfig;
  /** Decision engine configuration */
  decision_engine?: DecisionEngineConfig;
  /** Learning system configuration */
  learning?: LearningConfig;
  /** Collaboration configuration */
  collaboration?: CollaborationConfig;
  /** Notification configuration */
  notifications?: NotificationConfig;
  /** Auto-remove stale locks (>5min) during auditor scan. Default: false */
  auto_clean_locks?: boolean;
}

export interface ResolvedConfig {
  mode: PlanMode;
  activeModeConfig: PlanModeConfig;
  modes: Record<PlanMode, PlanModeConfig>;
  language: string;
  projectName: string;
  projectRoot: string;
  version: string;
  auto_docs?: AutoDocsConfig;
  /** Spawn backend: 'tmux' | 'subprocess' | 'auto' (default: 'auto') */
  spawn_backend?: 'tmux' | 'subprocess' | 'auto';
  /** Skill system configuration */
  skills?: SkillConfig;
}

// ─── Auto Docs Config ─────────────────────────────────────────────
export interface AutoDocsConfig {
  tier1: boolean;  // CHANGELOG, SPRINT-LOG
  tier2: boolean;  // README counts, CONTRIBUTING, HEALTH-CHECK
  tier3: boolean;  // BLUEPRINT, ARCHITECTURE
}

// ─── CLI Types ──────────────────────────────────────────────────────
// autoApprove: passed to tmux as --dangerously-skip-permissions (CLI/spawn only)
// sandboxMode: Docker sandbox flag (not yet implemented)
// haikuAllowed (PlanModeConfig): model selection constraint only — never used for permissions
export interface StartOptions {
  autoApprove?: boolean;
  sandboxMode?: boolean;
}

export interface DoctorResult {
  ok: boolean;
  checks: {
    name: string;
    passed: boolean;
    message: string;
    required: boolean;
  }[];
}

// ─── Subscription ───────────────────────────────────────────────────
export type SubscriptionDetected = 'max' | 'pro' | 'unknown';
export type DetectionMethod = 'opus_probe' | 'cli_missing' | 'timeout' | 'error';

export interface SubscriptionProfile {
  detected: SubscriptionDetected;
  opusAvailable: boolean;
  testedAt: string;
  method: DetectionMethod;
}

// ─── Setup Recommendation ──────────────────────────────────────────
export interface SetupRecommendation {
  mode: PlanMode;
  maxWorkers: number;
  brainModel: ModelType;
  defaultModel: ModelType;
  planning: BrainPlanningMode;
  reasons: string[];
}

// ─── Project Analysis ──────────────────────────────────────────────
export type DetectedFramework = 'react' | 'next' | 'express' | 'nest' | 'vue' | 'angular' | 'svelte' | 'unknown';
export type DetectedLanguage = 'typescript' | 'javascript' | 'python' | 'rust' | 'mixed' | 'unknown';
export type DetectedTestFramework = 'vitest' | 'jest' | 'mocha' | 'pytest' | 'unknown';
export type DetectedBuildTool = 'tsc' | 'vite' | 'webpack' | 'esbuild' | 'turbo' | 'unknown';
export type DetectedCI = 'github-actions' | 'gitlab-ci' | 'circleci' | 'unknown';
export type ProjectSize = 'small' | 'medium' | 'large';
export type MethodologyRecommendation = 'micro-sprint' | 'sprint' | 'agile' | 'hybrid';

export interface ProjectAnalysis {
  framework: DetectedFramework;
  language: DetectedLanguage;
  testFramework: DetectedTestFramework;
  buildTool: DetectedBuildTool;
  ci: DetectedCI;
  fileCount: number;
  authorCount: number;
  size: ProjectSize;
  methodology: MethodologyRecommendation;
}

// ─── System Profile ─────────────────────────────────────────────────
export interface SystemProfile {
  cpuCores: number;
  totalMemMB: number;
  freeMemMB: number;
  recommendedMaxWorkers: number;
}
