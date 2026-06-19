// @vitest-environment happy-dom
/**
 * Task 279-009: WK-5/COMM-1 — Worker Comms panel + Resource Summary in WorkersPage.
 *
 * Test strategy:
 * - Mock useSSE and useLiveData (same pattern as workers-directives-pages.test.tsx)
 * - Render WorkersPage with LanguageProvider
 * - Verify comms panel renders with mock agent data
 * - Verify empty state when no agents
 * - Verify resource summary row
 * - Source inspection for no-emoji and structural keywords
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import type { DashboardState } from "../../src/dashboard/src/types";

// ── hoisted mock state ──────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  mockSseState: null as unknown,
  liveDataMap: {} as Record<string, unknown>,
  refreshSpy: vi.fn(),
}));

vi.mock("../../src/dashboard/src/hooks/useSSE", () => ({
  useSSE: vi.fn(() => h.mockSseState),
  useSSEWithStatus: vi.fn(() => ({ data: h.mockSseState, status: "connected" })),
}));

vi.mock("../../src/dashboard/src/lib/use-live-data", () => ({
  useLiveData: vi.fn((url: string, opts: Record<string, unknown> = {}) => {
    const enabled = opts.enabled !== false;
    return {
      data: enabled ? (h.liveDataMap[url] ?? null) : null,
      isStale: false,
      isLoading: false,
      error: null,
      status: "connected",
      refresh: h.refreshSpy,
    };
  }),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  postJson: vi.fn().mockResolvedValue({}),
  getBootstrapApiToken: vi.fn().mockReturnValue(null),
  buildSseUrl: vi.fn((u: string) => u),
}));

import WorkersPage from "../../src/dashboard/src/pages/WorkersPage";

// ── helpers ──────────────────────────────────────────────────────────────────
function renderWithI18n(node: React.ReactElement) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.liveDataMap = {};
  h.mockSseState = null;
});

// ── mock data ─────────────────────────────────────────────────────────────────
const AGENTS_STATE: DashboardState = {
  sprint: { id: "sprint-279", phase: "EXECUTE", status: "RUNNING" },
  agents: [
    {
      id: "w-1",
      role: "frontend-designer",
      status: "EXECUTING",
      model: "sonnet",
      tmuxWindow: "0",
      taskId: "279-009",
      lastHeartbeat: new Date().toISOString(),
      backend: "docker",
    },
    {
      id: "w-2",
      role: "api-builder",
      status: "DONE",
      model: "haiku",
      tmuxWindow: "1",
      taskId: "279-001",
      lastHeartbeat: new Date().toISOString(),
      backend: "tmux",
    },
  ],
  progress: { done: 1, active: 1, blocked: 0, total: 2 },
  alerts: [],
  updatedAt: new Date().toISOString(),
};

const EMPTY_STATE: DashboardState = {
  sprint: { id: "sprint-279", phase: "IDLE", status: "IDLE" },
  agents: [],
  progress: { done: 0, active: 0, blocked: 0, total: 0 },
  alerts: [],
  updatedAt: new Date().toISOString(),
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe("WorkerCommsPanel — renders with agent data", () => {
  it("renders the comms panel with data-testid when agents are present", () => {
    h.mockSseState = AGENTS_STATE;
    renderWithI18n(<WorkersPage />);
    expect(screen.getByTestId("worker-comms-panel")).toBeTruthy();
  });

  it("shows the DONE agent as a handoff entry", () => {
    h.mockSseState = AGENTS_STATE;
    renderWithI18n(<WorkersPage />);
    // w-2 is DONE → should appear in handoff list
    expect(screen.getByTestId("handoff-w-2")).toBeTruthy();
  });

  it("shows completed-worker count for DONE workers", () => {
    h.mockSseState = AGENTS_STATE;
    renderWithI18n(<WorkersPage />);
    const sharedEl = screen.getByTestId("worker-comms-shared-count");
    expect(sharedEl.textContent).toContain("1");
    expect(sharedEl.textContent).toMatch(/completed/i);
  });

  it("renders the handoff list container when DONE agents exist", () => {
    h.mockSseState = AGENTS_STATE;
    renderWithI18n(<WorkersPage />);
    expect(screen.getByTestId("worker-comms-handoffs")).toBeTruthy();
  });

  it("shows the taskId of the DONE worker inside the handoff row", () => {
    h.mockSseState = AGENTS_STATE;
    renderWithI18n(<WorkersPage />);
    const handoffRow = screen.getByTestId("handoff-w-2");
    expect(handoffRow.textContent).toContain("279-001");
  });
});

describe("WorkerCommsPanel — empty state", () => {
  it("shows empty state container when no agents are present", () => {
    h.mockSseState = EMPTY_STATE;
    renderWithI18n(<WorkersPage />);
    expect(screen.getByTestId("worker-comms-empty")).toBeTruthy();
  });

  it("still renders the worker-comms-panel wrapper in empty state", () => {
    h.mockSseState = EMPTY_STATE;
    renderWithI18n(<WorkersPage />);
    expect(screen.getByTestId("worker-comms-panel")).toBeTruthy();
  });
});

describe("WorkerResourceSummary — resource row", () => {
  it("renders the resource summary with backend info when agents are present", () => {
    h.mockSseState = AGENTS_STATE;
    renderWithI18n(<WorkersPage />);
    const summary = screen.getByTestId("worker-resource-summary");
    expect(summary).toBeTruthy();
    // Agents have docker and tmux backends — both should appear
    expect(summary.textContent).toMatch(/docker|tmux/i);
  });

  it("does not render resource summary when no agents", () => {
    h.mockSseState = EMPTY_STATE;
    renderWithI18n(<WorkersPage />);
    expect(screen.queryByTestId("worker-resource-summary")).toBeNull();
  });
});

describe("WorkersPage source — structural and no-emoji guard", () => {
  const WP_PATH = join(process.cwd(), "src", "dashboard", "src", "pages", "WorkersPage.tsx");
  const src = () => readFileSync(WP_PATH, "utf-8");

  it("contains 'comms' keyword in source (kanit: grep requirement)", () => {
    expect(src().toLowerCase()).toContain("comms");
  });

  it("contains 'shared' keyword in source", () => {
    expect(src().toLowerCase()).toContain("shared");
  });

  it("contains 'handoff' keyword in source", () => {
    expect(src().toLowerCase()).toContain("handoff");
  });

  it("contains zero emoji-presentation characters in the comms additions", () => {
    const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/u;
    const matches = src().match(new RegExp(EMOJI_RE.source, "gu")) ?? [];
    expect(matches).toHaveLength(0);
  });
});
