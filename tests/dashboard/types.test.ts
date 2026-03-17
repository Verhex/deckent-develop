import { describe, it, expect } from "vitest";
import type {
  DashboardState,
  AgentInfo,
  Alert,
  SprintMetrics,
  DeckentConfig,
} from "../../src/dashboard/src/types/index.js";

describe("dashboard/types", () => {
  it("DashboardState satisfies type shape", () => {
    const state: DashboardState = {
      sprintId: "sprint-011",
      phase: "RUNNING",
      agents: [],
      alerts: [],
      metrics: null,
      config: {},
      uptime: 1234,
    };
    expect(state.sprintId).toBe("sprint-011");
    expect(state.phase).toBe("RUNNING");
    expect(state.agents).toEqual([]);
  });

  it("AgentInfo satisfies type shape", () => {
    const agent: AgentInfo = {
      workerId: 1,
      taskId: "009-001",
      status: "running",
      model: "claude-sonnet",
      startedAt: "2026-03-17T10:00:00Z",
    };
    expect(agent.workerId).toBe(1);
    expect(agent.status).toBe("running");
  });

  it("Alert satisfies type shape", () => {
    const alert: Alert = {
      level: "warn",
      message: "Worker 2 timed out",
      timestamp: "2026-03-17T10:05:00Z",
    };
    expect(alert.level).toBe("warn");
  });

  it("SprintMetrics satisfies type shape", () => {
    const metrics: SprintMetrics = {
      sprintId: "sprint-011",
      totalTasks: 4,
      completedTasks: 3,
      passedTasks: 2,
      failedTasks: 1,
      coverage: 85.5,
      duration: 120000,
    };
    expect(metrics.coverage).toBe(85.5);
    expect(metrics.totalTasks).toBe(4);
  });

  it("DeckentConfig satisfies type shape with optional fields", () => {
    const config: DeckentConfig = {
      projectName: "deckent",
      maxWorkers: 4,
    };
    expect(config.projectName).toBe("deckent");
    expect(config.model).toBeUndefined();
  });

  it("DashboardState with full metrics", () => {
    const state: DashboardState = {
      sprintId: "sprint-010",
      phase: "COMPLETE",
      agents: [
        { workerId: 1, taskId: "010-001", status: "done" },
        { workerId: 2, taskId: "010-002", status: "done" },
      ],
      alerts: [{ level: "info", message: "Sprint complete", timestamp: "2026-03-17T12:00:00Z" }],
      metrics: {
        sprintId: "sprint-010",
        totalTasks: 2,
        completedTasks: 2,
        passedTasks: 2,
        failedTasks: 0,
        coverage: 95,
      },
      config: { maxWorkers: 2, autoApprove: false },
      uptime: 60000,
    };
    expect(state.agents).toHaveLength(2);
    expect(state.metrics?.passedTasks).toBe(2);
  });
});
