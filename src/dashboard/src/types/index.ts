export interface AgentInfo {
  workerId: number;
  taskId: string;
  status: "idle" | "running" | "done" | "error";
  model?: string;
  startedAt?: string;
}

export interface Alert {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
}

export interface SprintMetrics {
  sprintId: string;
  totalTasks: number;
  completedTasks: number;
  passedTasks: number;
  failedTasks: number;
  coverage: number;
  duration?: number;
}

export interface DeckentConfig {
  projectName?: string;
  maxWorkers?: number;
  model?: string;
  autoApprove?: boolean;
  brainDir?: string;
}

export interface DashboardState {
  sprintId: string | null;
  phase: string;
  agents: AgentInfo[];
  alerts: Alert[];
  metrics: SprintMetrics | null;
  config: DeckentConfig;
  uptime: number;
}
