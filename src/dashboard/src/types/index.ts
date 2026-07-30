export interface AgentInfo {
  id: string;
  role: string;
  status: string; // IDLE | EXECUTING | DONE | ERROR
  model: string;
  tmuxWindow: string;
  taskId?: string;
  currentAction?: string;
  spawnedAt?: string;
  lastHeartbeat?: string;
  backend?: 'docker' | 'tmux' | 'subprocess';
}

export interface Alert {
  level: string; // INFO | WARNING | CRITICAL
  message: string;
  source?: string;
  timestamp: string;
  acknowledged?: boolean;
}

export interface DashboardState {
  sprint: {
    id: string;
    number?: number;
    phase: string;
    status: string;
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
  idle?: boolean;
  lastSprint?: {
    id: string;
    metrics: Record<string, string>;
    tasks: string[];
  };
}

export interface DeckentConfig {
  mode?: string;
  language?: string;
  projectName?: string;
  version?: string;
  modes?: Record<string, { brain_model?: string; default_model?: string; max_workers?: number }>;
  // Provider
  brain_provider?: string;
  worker_provider?: string;
  fallback_provider?: string | null;
  cost_optimization?: boolean;
  claude_backend?: string;
  auth_mode?: string;
  spawn_backend?: string;
  // Memory
  memory_budget?: number;
  decay_after_sprints?: number;
  patterns_enabled?: boolean;
  project_identity_enabled?: boolean;
  // Auditor
  scan_interval?: number;
  heartbeat_timeout?: number;
  boundary_enforcement?: boolean;
  // Sprint
  fix_phase_enabled?: boolean;
  max_fix_retries?: number;
  fix_circuit_breaker?: {
    enabled?: boolean;
    max_unresolved_tasks?: number;
    min_unresolved_ratio_percent?: number;
  };
  // Rollback
  rollback_policy?: string;
  // Output
  output_splash?: boolean;
  output_mode?: string;
  output_theme?: string;
  // Search
  search_enabled?: boolean;
  search_provider?: string;
  search_cache_ttl?: number;
  // Notifications
  notify_on_complete?: boolean;
  notify_channel?: string | null;
  notify_url?: string | null;
  // Telemetry
  telemetry_enabled?: boolean;
  telemetry_anonymous?: boolean;
  // Environment
  detected_env?: string | null;
  multi_ide_mode?: boolean;
  // Skill Routing
  skill_routing?: Record<string, string>;
  // Advanced
  auto_clean_locks?: boolean;
}
