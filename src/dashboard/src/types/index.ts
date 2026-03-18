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
    number: number;
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
  usage: {
    fiveHourPercent: number;
    weeklyPercent: number;
    measuredAt: string;
  };
  alerts: Alert[];
  updatedAt: string;
  auditorLastScan?: string;
  violations?: number;
}

export interface DeckentConfig {
  mode?: string;
  language?: string;
  projectName?: string;
  modes?: Record<string, { brain_model?: string; default_model?: string; max_workers?: number }>;
}
