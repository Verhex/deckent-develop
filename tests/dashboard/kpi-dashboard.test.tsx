// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import { KpiCard } from "../../src/dashboard/src/components/KpiCard";
import KpiTrendPage from "../../src/dashboard/src/pages/KpiTrendPage";

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockDataMap: Record<string, unknown> = {};

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn((url: string) => ({
    data: mockDataMap[url] ?? null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error("no server")),
  postJson: vi.fn().mockResolvedValue({}),
  ApiError: class extends Error {
    constructor(public status: number, msg: string) {
      super(msg);
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockDataMap = {};
});

// ─── Test Data ────────────────────────────────────────────────────────────────

const KPI_PAYLOAD = {
  sprintId: "sprint-330",
  kpis: [
    {
      id: "task_success_rate",
      title: { en: "Task Success Rate", tr: "Görev Başarı Oranı" },
      value: 87.5,
      target: 90,
      status: "warning",
      direction: "up" as const,
      format: "percent",
      unit: "%",
    },
    {
      id: "cost_usd",
      title: { en: "Total Cost (USD)", tr: "Toplam Maliyet (USD)" },
      value: 3.42,
      target: 5,
      status: "healthy",
      direction: "down" as const,
      format: "currency",
      unit: "USD",
    },
  ],
};

const TREND_PAYLOAD = {
  kpiId: "task_success_rate",
  series: [
    { periodKey: "sprint-328", value: 80, status: "warning" },
    { periodKey: "sprint-329", value: 85, status: "warning" },
    { periodKey: "sprint-330", value: 87.5, status: "warning" },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderKpiCard() {
  return render(
    <LanguageProvider>
      <KpiCard />
    </LanguageProvider>,
  );
}

function renderKpiTrendPage() {
  return render(
    <LanguageProvider>
      <KpiTrendPage />
    </LanguageProvider>,
  );
}

// ─── KpiCard tests ────────────────────────────────────────────────────────────

describe("KpiCard — scorecard component", () => {
  it("renders KPI rows from seeded /api/kpi payload", () => {
    mockDataMap["/api/kpi"] = KPI_PAYLOAD;
    renderKpiCard();

    expect(screen.getByTestId("kpi-scorecard")).toBeTruthy();
    expect(screen.getByTestId("kpi-row-task_success_rate")).toBeTruthy();
    expect(screen.getByTestId("kpi-row-cost_usd")).toBeTruthy();
    expect(screen.getByTestId("kpi-value-task_success_rate")).toBeTruthy();
    expect(screen.getByTestId("kpi-value-cost_usd")).toBeTruthy();
  });

  it("shows KPI titles from payload", () => {
    mockDataMap["/api/kpi"] = KPI_PAYLOAD;
    renderKpiCard();

    expect(screen.getByText("Task Success Rate")).toBeTruthy();
    expect(screen.getByText("Total Cost (USD)")).toBeTruthy();
  });

  it("shows status badges for KPI entries", () => {
    mockDataMap["/api/kpi"] = KPI_PAYLOAD;
    renderKpiCard();

    expect(screen.getByText("warning")).toBeTruthy();
    expect(screen.getByText("healthy")).toBeTruthy();
  });

  it("shows empty state when kpis array is empty", () => {
    mockDataMap["/api/kpi"] = { sprintId: null, kpis: [] };
    renderKpiCard();

    expect(screen.getByTestId("kpi-scorecard")).toBeTruthy();
    expect(screen.getByText("No KPI data")).toBeTruthy();
    expect(screen.queryByTestId("kpi-row-task_success_rate")).toBeNull();
  });

  it("shows empty state when no data at all", () => {
    // mockDataMap empty — useApi returns null → treated as empty
    renderKpiCard();

    expect(screen.getByText("No KPI data")).toBeTruthy();
  });

  it("uses i18n — scorecard title rendered via t()", () => {
    mockDataMap["/api/kpi"] = { sprintId: null, kpis: [] };
    renderKpiCard();
    expect(screen.getByText("KPI Scorecard")).toBeTruthy();
  });

  it("has no emoji characters in rendered output", () => {
    mockDataMap["/api/kpi"] = KPI_PAYLOAD;
    const { container } = renderKpiCard();
    const emojiRegex = /[\u{1F300}-\u{1FAFF}]/u;
    expect(emojiRegex.test(container.textContent ?? "")).toBe(false);
  });
});

// ─── KpiTrendPage tests ───────────────────────────────────────────────────────

describe("KpiTrendPage — trend page", () => {
  it("renders the trend page wrapper", () => {
    mockDataMap["/api/kpi"] = KPI_PAYLOAD;
    mockDataMap["/api/kpi/trend?kpiId="] = { kpiId: "", series: [] };
    renderKpiTrendPage();

    expect(screen.getByTestId("kpi-trend-page")).toBeTruthy();
  });

  it("renders a KPI selector dropdown with the KPI list", () => {
    mockDataMap["/api/kpi"] = KPI_PAYLOAD;
    mockDataMap["/api/kpi/trend?kpiId="] = { kpiId: "", series: [] };
    renderKpiTrendPage();

    const selector = screen.getByTestId("kpi-selector");
    expect(selector).toBeTruthy();
    expect(selector.textContent).toContain("Task Success Rate");
    expect(selector.textContent).toContain("Total Cost (USD)");
  });

  it("shows empty series state by default (no KPI selected)", () => {
    mockDataMap["/api/kpi"] = KPI_PAYLOAD;
    mockDataMap["/api/kpi/trend?kpiId="] = { kpiId: "", series: [] };
    renderKpiTrendPage();

    expect(screen.getByText("No trend data")).toBeTruthy();
    expect(screen.queryByTestId("kpi-trend-series")).toBeNull();
  });

  it("shows empty series state when series is empty", () => {
    mockDataMap["/api/kpi"] = { sprintId: null, kpis: [] };
    mockDataMap["/api/kpi/trend?kpiId="] = { kpiId: "", series: [] };
    renderKpiTrendPage();

    expect(screen.getByText("No trend data")).toBeTruthy();
    expect(screen.queryByTestId("kpi-trend-series")).toBeNull();
  });

  it("renders trend series when series data is returned by useApi", () => {
    mockDataMap["/api/kpi"] = KPI_PAYLOAD;
    // Series returned for the empty-kpiId URL (default state before user selects)
    mockDataMap["/api/kpi/trend?kpiId="] = TREND_PAYLOAD;
    renderKpiTrendPage();

    expect(screen.getByTestId("kpi-trend-series")).toBeTruthy();
    expect(screen.getByTestId("trend-point-sprint-328")).toBeTruthy();
    expect(screen.getByTestId("trend-point-sprint-329")).toBeTruthy();
    expect(screen.getByTestId("trend-point-sprint-330")).toBeTruthy();
  });

  it("shows trend values in each series row", () => {
    mockDataMap["/api/kpi"] = KPI_PAYLOAD;
    mockDataMap["/api/kpi/trend?kpiId="] = TREND_PAYLOAD;
    renderKpiTrendPage();

    expect(screen.getByTestId("trend-value-sprint-328")).toBeTruthy();
    expect(screen.getByTestId("trend-value-sprint-330")).toBeTruthy();
  });

  it("has no emoji characters in rendered output", () => {
    mockDataMap["/api/kpi"] = KPI_PAYLOAD;
    mockDataMap["/api/kpi/trend?kpiId="] = { kpiId: "", series: [] };
    const { container } = renderKpiTrendPage();
    const emojiRegex = /[\u{1F300}-\u{1FAFF}]/u;
    expect(emojiRegex.test(container.textContent ?? "")).toBe(false);
  });
});

// ─── Route + Sidebar wire tests ───────────────────────────────────────────────

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const APP_PATH = join(DASHBOARD_SRC, "App.tsx");
const SIDEBAR_PATH = join(DASHBOARD_SRC, "components", "Sidebar.tsx");

describe("Route + Sidebar wire", () => {
  it("App.tsx imports KpiTrendPage", () => {
    const src = readFileSync(APP_PATH, "utf-8");
    expect(src).toMatch(/from\s+["']\.\/pages\/KpiTrendPage["']/);
  });

  it("App.tsx registers /kpi route", () => {
    const src = readFileSync(APP_PATH, "utf-8");
    expect(src).toContain('path="/kpi"');
    expect(src).toContain("<KpiTrendPage");
  });

  it("Sidebar.tsx contains /kpi nav link", () => {
    const src = readFileSync(SIDEBAR_PATH, "utf-8");
    expect(src).toContain('to="/kpi"');
  });

  it("Sidebar.tsx uses i18n key for KPI nav label", () => {
    const src = readFileSync(SIDEBAR_PATH, "utf-8");
    expect(src).toContain("nav.kpi");
  });

  it("Sidebar.tsx uses BarChart2 lucide icon for KPI link", () => {
    const src = readFileSync(SIDEBAR_PATH, "utf-8");
    expect(src).toContain("BarChart2");
  });
});
