// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageProvider";
import { SprintControlPanel } from "./SprintControlPanel";
import type { DashboardState, AgentInfo } from "../types";

vi.mock("../hooks/useSSE", () => ({
  useSSEWithStatus: vi.fn(() => ({ data: null, status: "connecting" })),
}));

vi.mock("../hooks/useApi", () => ({
  useApi: vi.fn(() => ({ data: null, loading: false, error: null, refetch: vi.fn() })),
}));

vi.mock("../lib/api", () => ({
  postJson: vi.fn().mockResolvedValue({}),
  fetchJson: vi.fn().mockResolvedValue({}),
  buildSseUrl: vi.fn((url: string) => url),
}));

import { useSSEWithStatus } from "../hooks/useSSE";
import { useApi } from "../hooks/useApi";
import { postJson } from "../lib/api";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

function makeState(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    sprint: { id: "sprint-210", number: 210, phase: "EXECUTE", status: "running" },
    agents: [],
    progress: { done: 5, active: 2, blocked: 0, total: 10 },
    alerts: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: "w-210-001",
    role: "worker",
    status: "EXECUTING",
    model: "sonnet",
    tmuxWindow: "worker-1",
    taskId: "210-001",
    currentAction: "Writing tests",
    ...overrides,
  };
}

describe("SprintControlPanel", () => {
  it("renders empty state when no sprint data available", () => {
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: null, status: "connecting" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    expect(screen.getByTestId("sprint-control-panel-empty")).toBeTruthy();
    expect(screen.queryByTestId("sprint-control-panel")).toBeNull();
  });

  it("renders sprint status with phase badge when sprint is active", () => {
    const state = makeState();
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    expect(screen.getByTestId("sprint-control-panel")).toBeTruthy();
    const phaseBadge = screen.getByTestId("phase-badge");
    expect(phaseBadge.textContent).toBe("EXECUTE");
    expect(screen.getByText("sprint-210")).toBeTruthy();
  });

  it("renders phase timeline visualization with all phases", () => {
    const state = makeState({
      sprint: { id: "sprint-210", number: 210, phase: "PLAN", status: "running" },
    });
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    // "PLAN" appears in both the phase badge and the timeline item — assert
    // presence without requiring uniqueness.
    expect(screen.getAllByText("PLAN").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("EXECUTE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("RETRO").length).toBeGreaterThanOrEqual(1);
  });

  it("renders worker grid with active workers", () => {
    const state = makeState({
      agents: [
        makeAgent(),
        makeAgent({ id: "w-210-002", taskId: "210-002" }),
      ],
    });
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    expect(screen.getByTestId("worker-grid")).toBeTruthy();
    expect(screen.getByText("w-210-001")).toBeTruthy();
    expect(screen.getByText("w-210-002")).toBeTruthy();
  });

  it("renders empty worker state when no workers assigned", () => {
    const state = makeState({ agents: [] });
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    const grid = screen.getByTestId("worker-grid");
    expect(grid).toBeTruthy();
  });

  // SURF-7 (ADR-G-033): read-only cutover pin
  it("renders NO kill-all/cleanup buttons in ANY phase", () => {
    for (const phase of ["PLAN", "SPAWN", "EXECUTE", "EVALUATE", "FIX", "RETRO", "CLEANUP"]) {
      const state = makeState({
        sprint: { id: "sprint-210", number: 210, phase, status: "running" },
      });
      vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
      vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

      renderWithProviders(<SprintControlPanel />);

      expect(screen.queryByTestId("kill-all-btn")).toBeNull();
      expect(screen.queryByTestId("cleanup-btn")).toBeNull();
      cleanup();
    }
  });

  // SURF-7 (ADR-G-033): read-only cutover pin
  it("shows the readonly notice when a sprint is active", () => {
    const state = makeState();
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    expect(screen.getByTestId("readonly-notice")).toBeTruthy();
  });

  it("shows progress card with done/total counts when total > 0", () => {
    const state = makeState({ progress: { done: 5, active: 2, blocked: 0, total: 10 } });
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    expect(screen.getByTestId("progress-card")).toBeTruthy();
    expect(screen.getByText(/5\/10/)).toBeTruthy();
  });

  it("hides progress card when total is 0", () => {
    const state = makeState({ progress: { done: 0, active: 0, blocked: 0, total: 0 } });
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    expect(screen.queryByTestId("progress-card")).toBeNull();
  });

  it("uses api fallback state when SSE data is null", () => {
    const apiState = makeState({
      sprint: { id: "sprint-api", number: 200, phase: "RETRO", status: "running" },
    });
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: null, status: "disconnected" });
    vi.mocked(useApi).mockReturnValue({ data: apiState, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    expect(screen.getByTestId("sprint-control-panel")).toBeTruthy();
    expect(screen.getByText("sprint-api")).toBeTruthy();
  });

  it("renders empty state when state.idle is true", () => {
    const state = makeState({ idle: true });
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    expect(screen.getByTestId("sprint-control-panel-empty")).toBeTruthy();
    expect(screen.queryByTestId("sprint-control-panel")).toBeNull();
  });

  it("falls back to secondary variant when phase is unknown", () => {
    const state = makeState({
      sprint: { id: "sprint-210", number: 210, phase: "UNKNOWN_PHASE", status: "running" },
    });
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    const badge = screen.getByTestId("phase-badge");
    expect(badge.textContent).toBe("UNKNOWN_PHASE");
  });

  // SURF-7 (ADR-G-033): read-only cutover pin
  it("never calls postJson — the panel has no mutation wiring", () => {
    const state = makeState();
    vi.mocked(useSSEWithStatus).mockReturnValue({ data: state, status: "connected" });
    vi.mocked(useApi).mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });

    renderWithProviders(<SprintControlPanel />);

    expect(postJson).not.toHaveBeenCalled();
  });
});
