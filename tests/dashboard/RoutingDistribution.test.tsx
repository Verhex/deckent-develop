// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import RoutingDistribution, {
  parseDistributionData,
  computeImbalance,
  type RoutingDistributionEntry,
  type RoutingDistributionData,
} from "../../src/dashboard/src/components/RoutingDistribution";

// Mock recharts to avoid React version conflict (dashboard has its own node_modules/react)
vi.mock("../../src/dashboard/node_modules/recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children, data }: { children: React.ReactNode; data?: unknown[] }) => (
    <div data-testid="bar-chart" data-entries={JSON.stringify(data)}>{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

beforeEach(() => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("no server"));
});

afterEach(() => {
  cleanup();
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

function makeData(agentPercentages: number[] = [30, 20, 50]): RoutingDistributionData {
  const agents: RoutingDistributionEntry[] = agentPercentages.map((pct, i) => ({
    id: `agent-${i}`,
    label: `agent-${i}`,
    count: pct,
    percentage: pct,
  }));
  return { agents, skills: [], totalTasks: agentPercentages.reduce((a, b) => a + b, 0) };
}

// ─── parseDistributionData ──────────────────────────────────────────────────

describe("parseDistributionData", () => {
  it("maps agentId field to id and label", () => {
    const result = parseDistributionData({ agents: [{ agentId: "bug-fixer", count: 5, percentage: 50 }] });
    expect(result.agents[0].id).toBe("bug-fixer");
    expect(result.agents[0].label).toBe("bug-fixer");
    expect(result.agents[0].count).toBe(5);
    expect(result.agents[0].percentage).toBe(50);
  });

  it("handles empty agents and skills", () => {
    const result = parseDistributionData({});
    expect(result.agents).toHaveLength(0);
    expect(result.skills).toHaveLength(0);
    expect(result.totalTasks).toBe(0);
  });
});

// ─── computeImbalance ──────────────────────────────────────────────────────

describe("computeImbalance", () => {
  it("returns false when all agents ≤80%", () => {
    const entries: RoutingDistributionEntry[] = [
      { id: "a", label: "a", count: 8, percentage: 80 },
      { id: "b", label: "b", count: 2, percentage: 20 },
    ];
    expect(computeImbalance(entries)).toBe(false);
  });

  it("returns true when any agent >80%", () => {
    const entries: RoutingDistributionEntry[] = [
      { id: "a", label: "a", count: 9, percentage: 90 },
      { id: "b", label: "b", count: 1, percentage: 10 },
    ];
    expect(computeImbalance(entries)).toBe(true);
  });
});

// ─── RoutingDistribution component ─────────────────────────────────────────

describe("RoutingDistribution", () => {
  it("renders distribution wrapper when data is provided", () => {
    const data = makeData([30, 40, 30]);
    renderWithProviders(<RoutingDistribution data={data} />);
    expect(screen.getByTestId("routing-distribution")).toBeDefined();
    expect(screen.getByTestId("distribution-chart-Agents")).toBeDefined();
  });

  it("passes agent entries to bar chart data prop", () => {
    const data: RoutingDistributionData = {
      agents: [
        { id: "api-builder", label: "api-builder", count: 3, percentage: 30 },
        { id: "refactorer", label: "refactorer", count: 7, percentage: 70 },
      ],
      skills: [],
      totalTasks: 10,
    };
    renderWithProviders(<RoutingDistribution data={data} />);
    const chart = screen.getByTestId("bar-chart");
    const entries = JSON.parse(chart.getAttribute("data-entries") ?? "[]") as Array<{ label: string }>;
    expect(entries).toHaveLength(2);
    expect(entries[0].label).toBe("api-builder");
    expect(entries[1].label).toBe("refactorer");
  });

  it("shows imbalance warning when an agent exceeds 80%", () => {
    const data: RoutingDistributionData = {
      agents: [{ id: "refactorer", label: "refactorer", count: 9, percentage: 90 }],
      skills: [],
      totalTasks: 10,
    };
    renderWithProviders(<RoutingDistribution data={data} />);
    expect(screen.getByTestId("imbalance-warning")).toBeDefined();
  });

  it("shows empty state when no agents or skills", () => {
    const data: RoutingDistributionData = { agents: [], skills: [], totalTasks: 0 };
    renderWithProviders(<RoutingDistribution data={data} />);
    expect(screen.getByTestId("empty-state")).toBeDefined();
    expect(screen.queryByTestId("imbalance-warning")).toBeNull();
  });
});
