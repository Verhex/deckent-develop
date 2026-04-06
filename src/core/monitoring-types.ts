// ─── Agent & Monitoring Domain Types ────────────────────────────────────────
// Split from types.ts — Agent system, alerts, monitoring, dashboard types

import type { ModelType } from './task-types.js';
import type { SprintPhase, SprintStatus } from './sprint-types.js';

// ─── Agent System ────────────────────────────────────────────────────
export type AgentRole = 'brain' | 'auditor' | 'worker';

export enum AgentStatus {
  IDLE = 'IDLE',
  PLANNING = 'PLANNING',
  EXECUTING = 'EXECUTING',
  EVALUATING = 'EVALUATING',
  SCANNING = 'SCANNING',
  CODING = 'CODING',
  VERIFYING = 'VERIFYING',
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
  progress: number;
  /** Agent ID for this heartbeat */
  agentId?: string;
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
  /** Assigned agent persona (from agent pool) or 'generic' */
  assignedAgent?: string;
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
  | 'memory_budget_exceeded';

export interface BoundaryViolation {
  type: BoundaryViolationType;
  agentId: string;
  detail: string;
  timestamp: string;
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
  alerts: Alert[];
  updatedAt: string;
  auditorLastScan?: string;
  violations?: number;
}

// ─── Lock System ────────────────────────────────────────────────────
export interface LockInfo {
  filePath: string;
  ownerWorkerId: string;
  acquiredAt: string;
  taskId: string;
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
