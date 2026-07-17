// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";

const mockRefetch = vi.fn();

const PENDING = [
  { triggerId: "trig-1", action: "deploy.staging", requestedBy: "autonomous:scheduler", enqueuedAt: "2026-06-15T00:00:00Z" },
  { triggerId: "trig-2", action: "db.migrate", requestedBy: "system:reactive", enqueuedAt: "2026-06-15T01:00:00Z" },
];

const STATUS = {
  pendingCount: 2,
  backlogSummary: { total: 3, pending: 1, running: 0, parked: 1, done: 1, failed: 0 },
  recentAudit: [],
};

const BACKLOG = [
  { id: "b1", title: "Nightly report", kind: "task", status: "pending", policy: "auto", trigger: { type: "recurring", cron: "0 0 * * *" }, lastRun: null },
];

let mockDataMap: Record<string, unknown> = {};

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn((url: string) => ({
    data: mockDataMap[url] ?? null,
    loading: false,
    error: null,
    refetch: mockRefetch,
  })),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error("no server")),
  postJson: vi.fn().mockResolvedValue({}),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockDataMap = {};
});

import AutonomousPage from "../../src/dashboard/src/pages/AutonomousPage";
import { postJson } from "../../src/dashboard/src/lib/api";

function renderPage() {
  return render(
    <LanguageProvider>
      <AutonomousPage />
    </LanguageProvider>,
  );
}

describe("AutonomousPage — W6-W7 Autonomous Engine UI", () => {
  it("renders the page wrapper with heading", () => {
    renderPage();
    expect(screen.getByTestId("autonomous-page")).toBeTruthy();
    expect(screen.getByText("Autonomous Engine")).toBeTruthy();
  });

  it("renders pending approvals with their action + ids", () => {
    mockDataMap["/api/autonomous/pending"] = PENDING;
    mockDataMap["/api/autonomous/status"] = STATUS;
    renderPage();
    expect(screen.getByTestId("pending-list")).toBeTruthy();
    expect(screen.getByTestId("approval-trig-1")).toBeTruthy();
    expect(screen.getByText("deploy.staging")).toBeTruthy();
    expect(screen.getByText("db.migrate")).toBeTruthy();
  });

  // SURF-7 (ADR-G-033): read-only cutover pin
  it("renders NO approve/reject buttons; readonly notice present; no postJson", () => {
    mockDataMap["/api/autonomous/pending"] = PENDING;
    renderPage();
    expect(screen.queryByTestId("approve-trig-1")).toBeNull();
    expect(screen.queryByTestId("reject-trig-1")).toBeNull();
    expect(screen.queryByTestId("approve-trig-2")).toBeNull();
    expect(screen.queryByTestId("reject-trig-2")).toBeNull();
    expect(screen.getByTestId("readonly-notice")).toBeTruthy();
    expect(postJson).not.toHaveBeenCalled();
  });

  it("shows the empty state when no pending approvals", () => {
    mockDataMap["/api/autonomous/pending"] = [];
    renderPage();
    expect(screen.queryByTestId("pending-list")).toBeNull();
    expect(screen.getByText("No pending approvals")).toBeTruthy();
  });

  it("renders the backlog summary counts", () => {
    mockDataMap["/api/autonomous/status"] = STATUS;
    renderPage();
    expect(screen.getByTestId("backlog-summary")).toBeTruthy();
    expect(screen.getByTestId("summary-parked")).toBeTruthy();
  });

  it("renders backlog entries", () => {
    mockDataMap["/api/autonomous/backlog"] = BACKLOG;
    renderPage();
    expect(screen.getByTestId("backlog-list")).toBeTruthy();
    expect(screen.getByTestId("backlog-b1")).toBeTruthy();
    expect(screen.getByText("Nightly report")).toBeTruthy();
  });
});
