// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  SprintSummary,
  getTaskStatusColor,
  getTaskStatusBg,
  getStatusIcon,
  getStatusLabel,
  computeSelfHealingCount,
  computeProviderBreakdown,
  estimateTimeRemaining,
  formatElapsedTime,
  type TaskInfo,
  type SprintSummaryProps,
} from "../../src/dashboard/src/components/SprintSummary";
import type { DashboardState, AgentInfo } from "../../src/dashboard/src/types";

// ─── Fixtures ───────────────────────────────────────────────────────

function makeState(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    sprint: { id: "sprint-040", number: 40, phase: "EXECUTE", status: "running" },
    agents: [],
    progress: { done: 5, active: 2, blocked: 0, total: 10 },
    usage: { fiveHourPercent: 30, weeklyPercent: 15, measuredAt: new Date().toISOString() },
    alerts: [],
    updatedAt: new Date(Date.now() - 10 * 60000).toISOString(), // 10 min ago
    ...overrides,
  };
}

function makeTasks(count: number, statusOverrides: Record<number, Partial<TaskInfo>> = {}): TaskInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `040-${String(i + 1).padStart(3, "0")}`,
    title: `Task ${i + 1}`,
    status: "PENDING",
    ...statusOverrides[i],
  }));
}

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: "w-040-001",
    role: "worker",
    status: "EXECUTING",
    model: "sonnet",
    tmuxWindow: "worker-1",
    taskId: "040-001",
    currentAction: "Writing code",
    ...overrides,
  };
}

// ─── Helper function tests ──────────────────────────────────────────

describe("getTaskStatusColor", () => {
  it("returns green for DONE", () => {
    expect(getTaskStatusColor("DONE")).toBe("text-green-400");
  });

  it("returns blue for EXECUTING", () => {
    expect(getTaskStatusColor("EXECUTING")).toBe("text-blue-400");
  });

  it("returns blue for TESTING", () => {
    expect(getTaskStatusColor("TESTING")).toBe("text-blue-400");
  });

  it("returns blue for VERIFYING", () => {
    expect(getTaskStatusColor("VERIFYING")).toBe("text-blue-400");
  });

  it("returns blue for CODING", () => {
    expect(getTaskStatusColor("CODING")).toBe("text-blue-400");
  });

  it("returns yellow for NO_GO", () => {
    expect(getTaskStatusColor("NO_GO")).toBe("text-yellow-400");
  });

  it("returns yellow for ERROR", () => {
    expect(getTaskStatusColor("ERROR")).toBe("text-yellow-400");
  });

  it("returns orange for PAUSED", () => {
    expect(getTaskStatusColor("PAUSED")).toBe("text-orange-400");
  });

  it("returns zinc (gray) for unknown status", () => {
    expect(getTaskStatusColor("PENDING")).toBe("text-zinc-500");
    expect(getTaskStatusColor("DRAFT")).toBe("text-zinc-500");
    expect(getTaskStatusColor("UNKNOWN")).toBe("text-zinc-500");
  });
});

describe("getTaskStatusBg", () => {
  it("returns green bg for DONE", () => {
    expect(getTaskStatusBg("DONE")).toContain("bg-green");
  });

  it("returns blue bg for EXECUTING", () => {
    expect(getTaskStatusBg("EXECUTING")).toContain("bg-blue");
  });

  it("returns yellow bg for NO_GO", () => {
    expect(getTaskStatusBg("NO_GO")).toContain("bg-yellow");
  });

  it("returns orange bg for PAUSED", () => {
    expect(getTaskStatusBg("PAUSED")).toContain("bg-orange");
  });

  it("returns zinc bg for unknown status", () => {
    expect(getTaskStatusBg("PENDING")).toContain("bg-zinc");
  });
});

describe("getStatusIcon", () => {
  it("returns CheckCircle for DONE", () => {
    expect(getStatusIcon("DONE").displayName ?? getStatusIcon("DONE").name).toBeTruthy();
  });

  it("returns different icons for different statuses", () => {
    const doneIcon = getStatusIcon("DONE");
    const execIcon = getStatusIcon("EXECUTING");
    const nogoIcon = getStatusIcon("NO_GO");
    const pendingIcon = getStatusIcon("PENDING");

    // All should be valid React components (function or object with render)
    expect(doneIcon).toBeTruthy();
    expect(execIcon).toBeTruthy();
    expect(nogoIcon).toBeTruthy();
    expect(pendingIcon).toBeTruthy();
    // Different statuses should map to different icons
    expect(doneIcon).not.toBe(execIcon);
    expect(nogoIcon).not.toBe(pendingIcon);
  });
});

describe("getStatusLabel", () => {
  it("maps DONE to Done", () => {
    expect(getStatusLabel("DONE")).toBe("Done");
  });

  it("maps EXECUTING to Active", () => {
    expect(getStatusLabel("EXECUTING")).toBe("Active");
  });

  it("maps CODING to Writing code", () => {
    expect(getStatusLabel("CODING")).toBe("Writing code");
  });

  it("maps TESTING to Running tests", () => {
    expect(getStatusLabel("TESTING")).toBe("Running tests");
  });

  it("maps VERIFYING to Type checking", () => {
    expect(getStatusLabel("VERIFYING")).toBe("Type checking");
  });

  it("maps NO_GO to Needs attention", () => {
    expect(getStatusLabel("NO_GO")).toBe("Needs attention");
  });

  it("maps PENDING to Queued", () => {
    expect(getStatusLabel("PENDING")).toBe("Queued");
  });

  it("maps PAUSED to Paused", () => {
    expect(getStatusLabel("PAUSED")).toBe("Paused");
  });

  it("maps unknown to Waiting", () => {
    expect(getStatusLabel("SOMETHING")).toBe("Waiting");
  });
});

describe("computeSelfHealingCount", () => {
  it("returns 0 for empty array", () => {
    expect(computeSelfHealingCount([])).toBe(0);
  });

  it("returns 0 when no tasks have feedbackLoop", () => {
    const tasks = makeTasks(3);
    expect(computeSelfHealingCount(tasks)).toBe(0);
  });

  it("counts tasks with tscAttempts > 1", () => {
    const tasks: TaskInfo[] = [
      { id: "1", title: "T1", status: "DONE", feedbackLoop: { tscAttempts: 2, testAttempts: 1 } },
      { id: "2", title: "T2", status: "DONE", feedbackLoop: { tscAttempts: 1, testAttempts: 1 } },
    ];
    expect(computeSelfHealingCount(tasks)).toBe(1);
  });

  it("counts tasks with testAttempts > 1", () => {
    const tasks: TaskInfo[] = [
      { id: "1", title: "T1", status: "DONE", feedbackLoop: { tscAttempts: 1, testAttempts: 3 } },
    ];
    expect(computeSelfHealingCount(tasks)).toBe(1);
  });

  it("counts tasks with both tsc and test retries", () => {
    const tasks: TaskInfo[] = [
      { id: "1", title: "T1", status: "DONE", feedbackLoop: { tscAttempts: 2, testAttempts: 2 } },
      { id: "2", title: "T2", status: "DONE", feedbackLoop: { tscAttempts: 3, testAttempts: 1 } },
      { id: "3", title: "T3", status: "DONE", feedbackLoop: { tscAttempts: 1, testAttempts: 1 } },
    ];
    expect(computeSelfHealingCount(tasks)).toBe(2);
  });
});

describe("computeProviderBreakdown", () => {
  it("returns empty for no agents and no tasks", () => {
    expect(computeProviderBreakdown([], [])).toEqual({});
  });

  it("groups by task provider field", () => {
    const tasks: TaskInfo[] = [
      { id: "1", title: "T1", status: "DONE", provider: "Claude" },
      { id: "2", title: "T2", status: "DONE", provider: "Claude" },
      { id: "3", title: "T3", status: "DONE", provider: "Codex" },
    ];
    const result = computeProviderBreakdown([], tasks);
    expect(result).toEqual({ Claude: 2, Codex: 1 });
  });

  it("infers Claude from agent model when no task providers", () => {
    const agents: AgentInfo[] = [
      makeAgent({ id: "w-1", model: "sonnet" }),
      makeAgent({ id: "w-2", model: "opus" }),
    ];
    const result = computeProviderBreakdown(agents, []);
    expect(result).toEqual({ Claude: 2 });
  });

  it("infers Codex from gpt/codex model names", () => {
    const agents: AgentInfo[] = [
      makeAgent({ id: "w-1", model: "codex-mini" }),
      makeAgent({ id: "w-2", model: "gpt-4o" }),
    ];
    const result = computeProviderBreakdown(agents, []);
    expect(result).toEqual({ Codex: 2 });
  });

  it("infers Gemini from gemini model names", () => {
    const agents: AgentInfo[] = [
      makeAgent({ id: "w-1", model: "gemini-pro" }),
    ];
    const result = computeProviderBreakdown(agents, []);
    expect(result).toEqual({ Gemini: 1 });
  });

  it("prefers task providers over agent inference", () => {
    const agents: AgentInfo[] = [makeAgent()];
    const tasks: TaskInfo[] = [
      { id: "1", title: "T1", status: "DONE", provider: "Codex" },
    ];
    const result = computeProviderBreakdown(agents, tasks);
    // Task provider takes precedence, agent inference skipped
    expect(result).toEqual({ Codex: 1 });
  });
});

describe("estimateTimeRemaining", () => {
  it("returns empty when no startedAt", () => {
    expect(estimateTimeRemaining(5, 10)).toBe("");
  });

  it("returns empty when done is 0", () => {
    expect(estimateTimeRemaining(0, 10, new Date().toISOString())).toBe("");
  });

  it("returns empty when done equals total", () => {
    expect(estimateTimeRemaining(10, 10, new Date().toISOString())).toBe("");
  });

  it("calculates remaining time based on average pace", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
    // 5 done in 10 min = 2 min/task, 5 remaining = ~10 min
    const result = estimateTimeRemaining(5, 10, tenMinAgo);
    expect(result).toContain("~10 min remaining");
  });

  it("returns ~1 min for very short remaining", () => {
    const justNow = new Date(Date.now() - 1000).toISOString();
    // 9 done in 1 sec, 1 remaining — Math.ceil rounds up to 1
    const result = estimateTimeRemaining(9, 10, justNow);
    expect(result).toBe("~1 min remaining");
  });
});

describe("formatElapsedTime", () => {
  it("returns empty when no startedAt", () => {
    expect(formatElapsedTime()).toBe("");
  });

  it("returns 'just started' for less than a minute", () => {
    const now = new Date().toISOString();
    expect(formatElapsedTime(now)).toBe("just started");
  });

  it("returns minutes for elapsed time", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatElapsedTime(fiveMinAgo)).toBe("5 min elapsed");
  });
});

// ─── Component rendering tests ──────────────────────────────────────

describe("SprintSummary component", () => {
  it("renders without crashing", () => {
    const state = makeState();
    render(<SprintSummary state={state} />);
    expect(screen.getByTestId("sprint-summary")).toBeTruthy();
  });

  it("renders progress bar", () => {
    const state = makeState({ progress: { done: 7, active: 2, blocked: 0, total: 12 } });
    render(<SprintSummary state={state} />);
    expect(screen.getByTestId("progress-bar")).toBeTruthy();
  });

  it("shows correct percentage", () => {
    const state = makeState({ progress: { done: 6, active: 2, blocked: 0, total: 12 } });
    render(<SprintSummary state={state} />);
    expect(screen.getByTestId("progress-percentage").textContent).toBe("50%");
  });

  it("shows fraction (done/total)", () => {
    const state = makeState({ progress: { done: 7, active: 2, blocked: 0, total: 12 } });
    render(<SprintSummary state={state} />);
    expect(screen.getByTestId("progress-fraction").textContent).toContain("7/12");
  });

  it("shows sprint ID in header", () => {
    const state = makeState();
    render(<SprintSummary state={state} />);
    expect(screen.getByText(/Sprint 040/)).toBeTruthy();
  });

  it("shows phase in header", () => {
    const state = makeState();
    render(<SprintSummary state={state} />);
    expect(screen.getByText(/EXECUTE/)).toBeTruthy();
  });

  it("shows done count", () => {
    const state = makeState({ progress: { done: 5, active: 2, blocked: 0, total: 10 } });
    render(<SprintSummary state={state} />);
    expect(screen.getByText("5 done")).toBeTruthy();
  });

  it("shows active count", () => {
    const state = makeState({ progress: { done: 5, active: 2, blocked: 0, total: 10 } });
    render(<SprintSummary state={state} />);
    expect(screen.getByText("2 active")).toBeTruthy();
  });

  it("shows queued count", () => {
    const state = makeState({ progress: { done: 5, active: 2, blocked: 0, total: 10 } });
    render(<SprintSummary state={state} />);
    expect(screen.getByText("3 queued")).toBeTruthy();
  });

  it("shows color-coded task list", () => {
    const tasks: TaskInfo[] = [
      { id: "001", title: "TSC verify", status: "DONE" },
      { id: "002", title: "Test verify", status: "EXECUTING" },
      { id: "003", title: "Metrics", status: "NO_GO" },
      { id: "004", title: "Prompt", status: "PENDING" },
    ];
    const state = makeState();
    render(<SprintSummary state={state} tasks={tasks} />);

    const taskList = screen.getByTestId("task-list");
    expect(taskList).toBeTruthy();

    const task1 = screen.getByTestId("task-001");
    expect(task1.getAttribute("data-status")).toBe("DONE");

    const task2 = screen.getByTestId("task-002");
    expect(task2.getAttribute("data-status")).toBe("EXECUTING");

    const task3 = screen.getByTestId("task-003");
    expect(task3.getAttribute("data-status")).toBe("NO_GO");

    const task4 = screen.getByTestId("task-004");
    expect(task4.getAttribute("data-status")).toBe("PENDING");
  });

  it("shows task status labels", () => {
    const tasks: TaskInfo[] = [
      { id: "001", title: "TSC verify", status: "DONE" },
      { id: "002", title: "Test verify", status: "EXECUTING" },
    ];
    const state = makeState();
    render(<SprintSummary state={state} tasks={tasks} />);

    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("shows self-healing count when tasks auto-fixed", () => {
    const tasks: TaskInfo[] = [
      { id: "001", title: "T1", status: "DONE", feedbackLoop: { tscAttempts: 2, testAttempts: 1 } },
      { id: "002", title: "T2", status: "DONE", feedbackLoop: { tscAttempts: 1, testAttempts: 3 } },
      { id: "003", title: "T3", status: "DONE", feedbackLoop: { tscAttempts: 1, testAttempts: 1 } },
    ];
    const state = makeState();
    render(<SprintSummary state={state} tasks={tasks} />);

    const selfHealing = screen.getByTestId("self-healing-count");
    expect(selfHealing.textContent).toContain("2 auto-fixed");
  });

  it("hides self-healing count when zero", () => {
    const tasks: TaskInfo[] = [
      { id: "001", title: "T1", status: "DONE", feedbackLoop: { tscAttempts: 1, testAttempts: 1 } },
    ];
    const state = makeState();
    render(<SprintSummary state={state} tasks={tasks} />);

    expect(screen.queryByTestId("self-healing-count")).toBeNull();
  });

  it("shows provider breakdown", () => {
    const tasks: TaskInfo[] = [
      { id: "001", title: "T1", status: "DONE", provider: "Claude" },
      { id: "002", title: "T2", status: "DONE", provider: "Claude" },
      { id: "003", title: "T3", status: "DONE", provider: "Codex" },
    ];
    const state = makeState();
    render(<SprintSummary state={state} tasks={tasks} />);

    const breakdown = screen.getByTestId("provider-breakdown");
    expect(breakdown).toBeTruthy();
    expect(screen.getByText("2 on Claude")).toBeTruthy();
    expect(screen.getByText("1 on Codex")).toBeTruthy();
  });

  it("shows active workers in 'What's happening now' section", () => {
    const state = makeState({
      agents: [
        makeAgent({ id: "w-1", taskId: "040-005", currentAction: "Writing code" }),
        makeAgent({ id: "w-2", taskId: "040-006", currentAction: "Running tests, attempt 2/3" }),
      ],
    });
    render(<SprintSummary state={state} />);

    expect(screen.getByText("What's happening now")).toBeTruthy();
    expect(screen.getByText("040-005")).toBeTruthy();
    expect(screen.getByText("040-006")).toBeTruthy();
    expect(screen.getByText("Writing code")).toBeTruthy();
    expect(screen.getByText("Running tests, attempt 2/3")).toBeTruthy();
  });

  it("hides 'What's happening now' when no active agents", () => {
    const state = makeState({
      agents: [makeAgent({ id: "w-1", status: "DONE" })],
    });
    render(<SprintSummary state={state} />);

    expect(screen.queryByText("What's happening now")).toBeNull();
  });

  it("shows ETA when tasks are in progress", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
    const state = makeState({
      progress: { done: 5, active: 2, blocked: 0, total: 10 },
      updatedAt: tenMinAgo,
    });
    render(<SprintSummary state={state} />);

    // Should show some time remaining text
    expect(screen.getByText(/min remaining/)).toBeTruthy();
  });

  it("shows elapsed time", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    const state = makeState({ updatedAt: fiveMinAgo });
    render(<SprintSummary state={state} />);

    expect(screen.getByText(/5 min elapsed/)).toBeTruthy();
  });

  it("shows warnings for tasks with many retries", () => {
    const tasks: TaskInfo[] = [
      { id: "009", title: "Dashboard chart", status: "NO_GO", feedbackLoop: { tscAttempts: 3, testAttempts: 1 } },
    ];
    const state = makeState();
    render(<SprintSummary state={state} tasks={tasks} />);

    const warningsEl = screen.getByTestId("warnings");
    expect(warningsEl).toBeTruthy();
    expect(warningsEl.textContent).toContain("Dashboard chart");
    expect(warningsEl.textContent).toContain("may need attention");
  });

  it("handles zero total tasks gracefully", () => {
    const state = makeState({ progress: { done: 0, active: 0, blocked: 0, total: 0 } });
    render(<SprintSummary state={state} />);

    expect(screen.getByTestId("progress-percentage").textContent).toBe("0%");
    expect(screen.getByTestId("progress-fraction").textContent).toContain("0/0");
  });

  it("handles 100% completion", () => {
    const state = makeState({ progress: { done: 12, active: 0, blocked: 0, total: 12 } });
    render(<SprintSummary state={state} />);

    expect(screen.getByTestId("progress-percentage").textContent).toBe("100%");
  });

  it("does not show task list when no tasks provided", () => {
    const state = makeState();
    render(<SprintSummary state={state} />);

    expect(screen.queryByTestId("task-list")).toBeNull();
  });

  it("does not show provider breakdown when no providers", () => {
    const state = makeState({ agents: [] });
    render(<SprintSummary state={state} tasks={[]} />);

    expect(screen.queryByTestId("provider-breakdown")).toBeNull();
  });
});
