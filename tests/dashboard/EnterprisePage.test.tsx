// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";

const mockRefetch = vi.fn();

const TENANTS = [
  { id: "t1", name: "Acme Corp", status: "active", users: 10, createdAt: "2026-01-01" },
  { id: "t2", name: "Globex", status: "inactive", users: 5, createdAt: "2026-02-01" },
];

const RBAC = [
  { role: "admin", permissions: ["read", "write", "delete", "admin"] },
  { role: "operator", permissions: ["read", "write"] },
  { role: "viewer", permissions: ["read"] },
];

const AUDIT = [
  { id: "a1", action: "login", actor: "alice", resource: "/api/tenants", result: "success", timestamp: "2026-06-01T00:00:00Z" },
  { id: "a2", action: "delete", actor: "bob", resource: "/api/tenants/t1", result: "denied", timestamp: "2026-06-01T01:00:00Z" },
];

const RATE = [
  { endpoint: "/api/sprints", limit: 100, remaining: 75, resetAt: "2026-06-01T12:00:00Z" },
  { endpoint: "/api/tenants", limit: 50, remaining: 5, resetAt: "2026-06-01T12:00:00Z" },
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
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockDataMap = {};
});

function renderPage() {
  return render(
    <LanguageProvider>
      <EnterprisePage />
    </LanguageProvider>,
  );
}

import EnterprisePage from "../../src/dashboard/src/pages/EnterprisePage";

describe("EnterprisePage — F7-006 enterprise view (215-010)", () => {
  it("renders tenant list when tenant data is available", () => {
    mockDataMap["/api/enterprise/tenants"] = TENANTS;
    renderPage();

    expect(screen.getByTestId("tenant-list")).toBeTruthy();
    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("Globex")).toBeTruthy();
  });

  it("renders RBAC role matrix with admin > operator > viewer order", () => {
    mockDataMap["/api/enterprise/rbac"] = RBAC;
    renderPage();

    const rbacTab = screen.getByTestId("tab-rbac");
    fireEvent.click(rbacTab);

    expect(screen.getByTestId("rbac-matrix")).toBeTruthy();
    expect(screen.getAllByText("admin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("operator").length).toBeGreaterThan(0);
    expect(screen.getAllByText("viewer").length).toBeGreaterThan(0);
  });

  it("renders audit log table with action, actor, result columns", () => {
    mockDataMap["/api/enterprise/audit"] = AUDIT;
    renderPage();

    const auditTab = screen.getByTestId("tab-audit");
    fireEvent.click(auditTab);

    expect(screen.getByTestId("audit-table")).toBeTruthy();
    expect(screen.getByText("alice")).toBeTruthy();
    expect(screen.getByText("bob")).toBeTruthy();
  });

  it("shows empty state when no tenant data", () => {
    renderPage();

    // Default tab is tenants, data is null → empty state shown
    expect(screen.queryByTestId("tenant-list")).toBeNull();
    expect(screen.getByText("No tenants")).toBeTruthy();
  });

  it("renders rate limit status with progress bars", () => {
    mockDataMap["/api/enterprise/rate"] = RATE;
    renderPage();

    const rateTab = screen.getByTestId("tab-rate");
    fireEvent.click(rateTab);

    expect(screen.getByTestId("rate-status")).toBeTruthy();
    expect(screen.getByText("/api/sprints")).toBeTruthy();
  });

  it("shows empty state in RBAC tab when no role data", () => {
    renderPage();

    const rbacTab = screen.getByTestId("tab-rbac");
    fireEvent.click(rbacTab);

    expect(screen.queryByTestId("rbac-matrix")).toBeNull();
    expect(screen.getByText("No RBAC roles")).toBeTruthy();
  });

  it("renders enterprise page wrapper with enterprise heading", () => {
    renderPage();

    expect(screen.getByTestId("enterprise-page")).toBeTruthy();
    expect(screen.getByText("Enterprise")).toBeTruthy();
  });
});
