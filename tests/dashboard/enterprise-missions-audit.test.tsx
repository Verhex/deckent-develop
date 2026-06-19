// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";

const MISSIONS_AUDIT = [
  {
    id: "ma1",
    action: "missions:create",
    actor: "cli",
    resource: "mission-abc-123",
    timestamp: "2026-06-19T10:00:00Z",
    result: "success" as const,
  },
  {
    id: "ma2",
    action: "missions:settle",
    actor: "scheduler",
    resource: "mission-def-456",
    timestamp: "2026-06-19T10:05:00Z",
    result: "denied" as const,
  },
];

// Per-URL override maps — set in tests that need them
let mockDataMap: Record<string, unknown> = {};
let mockErrorMap: Record<string, string> = {};
let mockLoadingMap: Record<string, boolean> = {};

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn((url: string) => ({
    data: mockDataMap[url] ?? null,
    loading: mockLoadingMap[url] ?? false,
    error: mockErrorMap[url] ?? null,
    refetch: vi.fn(),
  })),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error("no server")),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockDataMap = {};
  mockErrorMap = {};
  mockLoadingMap = {};
});

import EnterprisePage from "../../src/dashboard/src/pages/EnterprisePage";

function renderPage() {
  return render(
    <LanguageProvider>
      <EnterprisePage />
    </LanguageProvider>,
  );
}

function openMissionsAuditTab() {
  const trigger = screen.getByTestId("tab-missions-audit");
  fireEvent.click(trigger);
}

describe("EnterprisePage — Missions Audit panel (298-005)", () => {
  it("renders Missions Audit tab trigger with i18n key resolved (not raw key)", () => {
    renderPage();
    const trigger = screen.getByTestId("tab-missions-audit");
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).not.toBe("enterprise.missions_audit_tab");
    expect(trigger.textContent).toBe("Missions Audit");
  });

  it("renders missions audit table rows when data is available", () => {
    mockDataMap["/api/enterprise/missions-audit"] = MISSIONS_AUDIT;
    renderPage();
    openMissionsAuditTab();

    const table = screen.getByTestId("missions-audit-table");
    expect(table).toBeTruthy();

    // Mission IDs (resource field) visible
    expect(screen.getByText("mission-abc-123")).toBeTruthy();
    expect(screen.getByText("mission-def-456")).toBeTruthy();

    // Actions visible
    expect(screen.getByText("missions:create")).toBeTruthy();
    expect(screen.getByText("missions:settle")).toBeTruthy();

    // Actors visible
    expect(screen.getByText("cli")).toBeTruthy();
    expect(screen.getByText("scheduler")).toBeTruthy();
  });

  it("renders column headers with resolved i18n keys (not raw keys)", () => {
    mockDataMap["/api/enterprise/missions-audit"] = MISSIONS_AUDIT;
    renderPage();
    openMissionsAuditTab();

    expect(screen.getByText("Mission ID")).toBeTruthy();
    expect(screen.getByText("Action")).toBeTruthy();
    expect(screen.getByText("Actor")).toBeTruthy();
    expect(screen.getByText("Result")).toBeTruthy();
    expect(screen.getByText("Time")).toBeTruthy();

    expect(screen.queryByText("enterprise.missions_audit_col_mission")).toBeNull();
    expect(screen.queryByText("enterprise.missions_audit_col_action")).toBeNull();
  });

  it("renders title with resolved i18n (not raw key)", () => {
    mockDataMap["/api/enterprise/missions-audit"] = MISSIONS_AUDIT;
    renderPage();
    openMissionsAuditTab();

    expect(screen.getByText("Missions Audit Log")).toBeTruthy();
    expect(screen.queryByText("enterprise.missions_audit_title")).toBeNull();
  });

  it("renders empty state with resolved i18n when no data", () => {
    mockDataMap["/api/enterprise/missions-audit"] = [];
    renderPage();
    openMissionsAuditTab();

    expect(screen.getByText("No mission audit entries")).toBeTruthy();
    expect(screen.queryByText("enterprise.missions_audit_empty")).toBeNull();
  });

  it("renders empty state when missions-audit data is null (no endpoint yet)", () => {
    // data defaults to null via mockDataMap miss
    renderPage();
    openMissionsAuditTab();

    expect(screen.getByText("No mission audit entries")).toBeTruthy();
  });

  it("renders error state with resolved i18n when error occurs", () => {
    mockErrorMap["/api/enterprise/missions-audit"] = "network error";
    renderPage();
    openMissionsAuditTab();

    expect(screen.getByText("Failed to load mission audit log")).toBeTruthy();
    expect(screen.queryByText("enterprise.missions_audit_error")).toBeNull();
  });

  it("renders loading skeleton when loading", () => {
    mockLoadingMap["/api/enterprise/missions-audit"] = true;
    renderPage();
    openMissionsAuditTab();

    // SkeletonTable renders with aria-label="loading"
    expect(screen.getByLabelText("loading")).toBeTruthy();
  });

  it("result badges show success and denied variants", () => {
    mockDataMap["/api/enterprise/missions-audit"] = MISSIONS_AUDIT;
    renderPage();
    openMissionsAuditTab();

    const successBadge = screen.getByText("success");
    const deniedBadge = screen.getByText("denied");
    expect(successBadge).toBeTruthy();
    expect(deniedBadge).toBeTruthy();
  });
});
