// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import DebtPage from "../../src/dashboard/src/pages/DebtPage";

const DEBT_CONTENT = `# Technical Debt (auto-generated)

## Active Technical Debt

| ID | Title | Priority | Sprint | Status |
|----|-------|----------|--------|--------|
| rollback-sprint-217 | Sprint 217 rollback | critical | sprint-217 | active |
| debt-high-001 | High severity item | high | sprint-218 | active |

## Resolved Technical Debt

| ID | Title | Priority | Sprint | Status |
|----|-------|----------|--------|--------|
| debt-216-006 | Resolved normal item | normal | sprint-216 | resolved |
| debt-217-001 | Resolved item sprint 217 | critical | sprint-217 | resolved |
`;

const EMPTY_CONTENT = `# Technical Debt (auto-generated)

## Active Technical Debt

## Resolved Technical Debt
`;

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn((url: string) => mockApiMap[url] ?? { data: null, loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error("no server")),
}));

let mockApiMap: Record<string, { data: unknown; loading: boolean; error: null | string; refetch: () => void }> = {};

beforeEach(() => {
  mockApiMap = {
    "/api/debt": { data: { content: DEBT_CONTENT }, loading: false, error: null, refetch: vi.fn() },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <LanguageProvider>
      <DebtPage />
    </LanguageProvider>,
  );
}

describe("DebtPage — tech-debt filter (220-009)", () => {
  it("renders debt page with all entries by default", () => {
    renderPage();

    expect(screen.getByTestId("debt-page")).toBeTruthy();
    expect(screen.getByTestId("debt-table")).toBeTruthy();

    // All 4 rows visible by default
    expect(screen.getByTestId("debt-row-rollback-sprint-217")).toBeTruthy();
    expect(screen.getByTestId("debt-row-debt-high-001")).toBeTruthy();
    expect(screen.getByTestId("debt-row-debt-216-006")).toBeTruthy();
    expect(screen.getByTestId("debt-row-debt-217-001")).toBeTruthy();
  });

  it("filters by severity — critical only shows critical entries", () => {
    renderPage();

    const severityFilter = screen.getByTestId("debt-severity-filter") as HTMLSelectElement;
    fireEvent.change(severityFilter, { target: { value: "critical" } });

    expect(screen.getByTestId("debt-row-rollback-sprint-217")).toBeTruthy();
    expect(screen.getByTestId("debt-row-debt-217-001")).toBeTruthy();
    expect(screen.queryByTestId("debt-row-debt-high-001")).toBeNull();
    expect(screen.queryByTestId("debt-row-debt-216-006")).toBeNull();
  });

  it("filters by sprint — sprint-217 only shows sprint-217 entries", () => {
    renderPage();

    const sprintFilter = screen.getByTestId("debt-sprint-filter") as HTMLSelectElement;
    fireEvent.change(sprintFilter, { target: { value: "sprint-217" } });

    expect(screen.getByTestId("debt-row-rollback-sprint-217")).toBeTruthy();
    expect(screen.getByTestId("debt-row-debt-217-001")).toBeTruthy();
    expect(screen.queryByTestId("debt-row-debt-high-001")).toBeNull();
    expect(screen.queryByTestId("debt-row-debt-216-006")).toBeNull();
  });

  it("filters by status — active shows only active entries", () => {
    renderPage();

    const statusFilter = screen.getByTestId("debt-status-filter") as HTMLSelectElement;
    fireEvent.change(statusFilter, { target: { value: "active" } });

    expect(screen.getByTestId("debt-row-rollback-sprint-217")).toBeTruthy();
    expect(screen.getByTestId("debt-row-debt-high-001")).toBeTruthy();
    expect(screen.queryByTestId("debt-row-debt-216-006")).toBeNull();
    expect(screen.queryByTestId("debt-row-debt-217-001")).toBeNull();
  });

  it("filters by status — resolved shows only resolved entries", () => {
    renderPage();

    const statusFilter = screen.getByTestId("debt-status-filter") as HTMLSelectElement;
    fireEvent.change(statusFilter, { target: { value: "resolved" } });

    expect(screen.queryByTestId("debt-row-rollback-sprint-217")).toBeNull();
    expect(screen.queryByTestId("debt-row-debt-high-001")).toBeNull();
    expect(screen.getByTestId("debt-row-debt-216-006")).toBeTruthy();
    expect(screen.getByTestId("debt-row-debt-217-001")).toBeTruthy();
  });

  it("filters by search query — matches title and id", () => {
    renderPage();

    const searchInput = screen.getByTestId("debt-search");
    fireEvent.change(searchInput, { target: { value: "rollback" } });

    expect(screen.getByTestId("debt-row-rollback-sprint-217")).toBeTruthy();
    expect(screen.queryByTestId("debt-row-debt-high-001")).toBeNull();
    expect(screen.queryByTestId("debt-row-debt-216-006")).toBeNull();
  });

  it("shows empty state when no entries match combined filters", () => {
    renderPage();

    const severityFilter = screen.getByTestId("debt-severity-filter");
    const statusFilter = screen.getByTestId("debt-status-filter");
    fireEvent.change(severityFilter, { target: { value: "low" } });
    fireEvent.change(statusFilter, { target: { value: "active" } });

    expect(screen.queryByTestId("debt-table")).toBeNull();
    expect(screen.getByTestId("debt-empty")).toBeTruthy();
  });

  it("shows empty state when API returns no debt entries", () => {
    mockApiMap["/api/debt"] = { data: { content: EMPTY_CONTENT }, loading: false, error: null, refetch: vi.fn() };
    renderPage();

    expect(screen.queryByTestId("debt-table")).toBeNull();
    expect(screen.getByTestId("debt-empty")).toBeTruthy();
    expect(screen.getByText(/No technical debt/i)).toBeTruthy();
  });

  it("shows filter dropdowns for severity, sprint, and status", () => {
    renderPage();

    expect(screen.getByTestId("debt-severity-filter")).toBeTruthy();
    expect(screen.getByTestId("debt-sprint-filter")).toBeTruthy();
    expect(screen.getByTestId("debt-status-filter")).toBeTruthy();
    expect(screen.getByTestId("debt-search")).toBeTruthy();
  });
});
