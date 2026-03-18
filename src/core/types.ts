// ─── Models ──────────────────────────────────────────────────────────
export type ModelType = 'opus' | 'sonnet' | 'haiku';
export type TaskEffort = 'low' | 'normal' | 'high';
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

// ─── Task System ─────────────────────────────────────────────────────
export enum TaskStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  EXECUTING = 'EXECUTING',
  TESTING = 'TESTING',
  DOCUMENTING = 'DOCUMENTING',
  DONE = 'DONE',
  NO_GO = 'NO_GO',
  PAUSED = 'PAUSED',
}

export enum TaskEvaluation {
  DONE = 'DONE',
  GO_WITH_TECH_DEBT = 'GO_WITH_TECH_DEBT',
  NO_GO = 'NO_GO',
}

export type SelfAssessment = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';

// ─── Task Scope (Blueprint 15) ──────────────────────────────────────
export interface TaskScope {
  directories: string[];
  filesRead: string[];
  filesWrite: string[];
}

// ─── GO / NO-GO Criteria (Blueprint 8) ──────────────────────────────
export interface GoNoGoCriteria {
  goCriteria: string;
  noGoCriteria: string;
  techDebtAcceptable: string;
}

// ─── Task ────────────────────────────────────────────────────────────
export interface Task {
  id: string;
  title: string;
  description: string;
  model: ModelType;
  effort: TaskEffort;
  priority: TaskPriority;
  reason: string;
  scope: TaskScope;
  dependencies: string[];
  goNogo: GoNoGoCriteria;
  status: TaskStatus;
  sprintId?: string;
  assignedWorker?: string;
  isPriorityFix?: boolean;
  fixForTaskId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── TaskResult ──────────────────────────────────────────────────────
export interface TaskResult {
  taskId: string;
  workerId: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  testsPassed: boolean;
  coverage: number;
  selfAssessment: SelfAssessment;
  notes: string;
  completedAt?: string;
  durationMs?: number;
}

// ─── TaskPlan ────────────────────────────────────────────────────────
export interface TaskPlan {
  taskId: string;
  workerId: string;
  filesToCreate: string[];
  filesToModify: string[];
  executionSteps: string[];
  testStrategy: string;
  documentationPlan: string;
  estimatedDurationMin?: number;
}

// ─── Agent System ────────────────────────────────────────────────────
export type AgentRole = 'brain' | 'auditor' | 'worker';

export enum AgentStatus {
  IDLE = 'IDLE',
  PLANNING = 'PLANNING',
  EXECUTING = 'EXECUTING',
  EVALUATING = 'EVALUATING',
  SCANNING = 'SCANNING',
  CODING = 'CODING',
  TESTING = 'TESTING',
  DOCUMENTING = 'DOCUMENTING',
  DONE = 'DONE',
  ERROR = 'ERROR',
  PAUSED = 'PAUSED',
}

export interface Heartbeat {
  workerId: string;
  taskId: string;
  status: AgentStatus;
  currentAction: string;
  currentFile?: string;
  timestamp: string;
  filesChangedCount: number;
  sequence: number;
}

export interface AgentInfo {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  model: ModelType;
  tmuxWindow: string;
  taskId?: string;
  currentAction?: string;
  spawnedAt?: string;
  lastHeartbeat?: string;
}

// ─── Alerts & Monitoring ────────────────────────────────────────────
export enum AlertLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export interface Alert {
  level: AlertLevel;
  message: string;
  source?: string;
  timestamp: string;
  acknowledged?: boolean;
  count?: number;
}

export type BoundaryViolationType =
  | 'file_outside_scope'
  | 'stale_heartbeat'
  | 'stale_lock'
  | 'circular_dependency'
  | 'usage_threshold_exceeded'
  | 'memory_budget_exceeded';

export interface BoundaryViolation {
  type: BoundaryViolationType;
  agentId: string;
  detail: string;
  timestamp: string;
}

// ─── Sprint System ──────────────────────────────────────────────────
export enum SprintPhase {
  DIRECTIVE = 'DIRECTIVE',
  PLAN = 'PLAN',
  SPAWN = 'SPAWN',
  EXECUTE = 'EXECUTE',
  EVALUATE = 'EVALUATE',
  FIX = 'FIX',
  RETRO = 'RETRO',
  DECAY = 'DECAY',
  TRANSITION = 'TRANSITION',
  COMPLETE = 'COMPLETE',
}

export enum SprintStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  EVALUATING = 'EVALUATING',
  FIXING = 'FIXING',
  RETROSPECTIVE = 'RETROSPECTIVE',
  COMPLETE = 'COMPLETE',
  PAUSED = 'PAUSED',
}

export interface Sprint {
  id: string;
  number: number;
  status: SprintStatus;
  phase: SprintPhase;
  tasks: Task[];
  workers: string[];
  metrics?: SprintMetrics;
  startedAt?: string;
  completedAt?: string;
  reasoning?: string;
  planningMode?: string;
}

export interface SprintMetrics {
  totalTasks: number;
  completedTasks: number;
  techDebtTasks: number;
  noGoTasks: number;
  durationMs: number;
  coveragePercent: number;
  noGoRate: number;
  newDebtCount: number;
  resolvedDebtCount: number;
  totalOpenDebt: number;
  boundaryViolations: number;
  crossAssignments: number;
  contextLinesUsed: number;
}

// ─── Sprint Result ─────────────────────────────────────────────────
export interface SprintResult {
  sprint: Sprint;
  evaluations: Map<string, TaskEvaluation>;
  metrics: SprintMetrics;
}

// ─── Tech Debt (Blueprint 8) ────────────────────────────────────────
export enum DebtPriority {
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface DebtItem {
  id: string;
  description: string;
  originTaskId: string;
  originSprintId: string;
  priority: DebtPriority;
  sprintsOpen: number;
  resolved: boolean;
  resolvedInSprintId?: string;
  createdAt: string;
}

// ─── Memory System (Blueprint 6) ────────────────────────────────────
export interface MemoryEntry {
  content: string;
  addedInSprint: string;
  lastUsedInSprint: string;
  sprintsSinceLastUse: number;
}

export interface PatternEntry {
  pattern: string;
  occurrences: number;
  firstDetectedInSprint: string;
  lastDetectedInSprint: string;
  resolved: boolean;
}

// ─── Lock System ────────────────────────────────────────────────────
export interface LockInfo {
  filePath: string;
  ownerWorkerId: string;
  acquiredAt: string;
  taskId: string;
}

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

// ─── System Profile ─────────────────────────────────────────────────
export interface SystemProfile {
  cpuCores: number;
  totalMemMB: number;
  freeMemMB: number;
  recommendedMaxWorkers: number;
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

export interface DeckentConfig {
  mode: PlanMode;
  modes: Record<PlanMode, PlanModeConfig>;
  language?: string;
  projectName?: string;
  version?: string;
  auto_docs?: AutoDocsConfig;
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
}

// ─── Dashboard (Blueprint 12) ───────────────────────────────────────
export interface DashboardState {
  sprint: {
    id: string;
    number: number;
    phase: SprintPhase;
    status: SprintStatus;
  };
  agents: AgentInfo[];
  progress: {
    done: number;
    active: number;
    blocked: number;
    total: number;
  };
  usage: UsageMetrics;
  alerts: Alert[];
  updatedAt: string;
  auditorLastScan?: string;
  violations?: number;
}

// ─── Plugin System (Blueprint 11) ───────────────────────────────────
export interface SkillMeta {
  name: string;
  description: string;
  version: string;
  author: string;
  triggers: string[];
  model: ModelType;
}

// ─── Decay Result ──────────────────────────────────────────────
export interface DecayResult {
  linesBefore: number;
  linesAfter: number;
  archivedSprints: string[];
  removedDebtCount: number;
  removedPatternCount: number;
}

// ─── Brain Context ──────────────────────────────────────────────────
export interface BrainContext {
  directives: string;
  memory: string;
  retro: string;
  debt: DebtItem[];
  patterns: string;
  decisions: string;
  existingTasks: Task[];
  projectState: ProjectState;
}

export interface ProjectState {
  gitStatus: string;
  fileTree: string[];
}

export interface SprintSizeRecommendation {
  size: 'full' | 'reduced' | 'minimal';
  maxWorkers: number;
  modelConstraint: ModelType | null;
  reason: string;
}

// ─── AI Planner ─────────────────────────────────────────────────────
export interface PlannerTask {
  title: string;
  description: string;
  model: ModelType;
  effort: TaskEffort;
  priority: TaskPriority;
  reason: string;
  scope: TaskScope;
  dependencies: string[];
  goNogo: GoNoGoCriteria;
}

export interface PlannerResult {
  tasks: PlannerTask[];
  reasoning: string;
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

// ─── Auto Docs Config ─────────────────────────────────────────────
export interface AutoDocsConfig {
  tier1: boolean;  // CHANGELOG, SPRINT-LOG
  tier2: boolean;  // README counts, CONTRIBUTING, HEALTH-CHECK
  tier3: boolean;  // BLUEPRINT, ARCHITECTURE
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
