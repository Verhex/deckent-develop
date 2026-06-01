// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";

const mockRefetch = vi.fn();

const GENEALOGY_DATA = {
  roots: ["refactorer", "security-auditor"],
  nodes: {
    "refactorer": { agentId: "refactorer", parentId: null, createdAt: "2026-01-01", reason: "origin" },
    "refactorer-v2": { agentId: "refactorer-v2", parentId: "refactorer", createdAt: "2026-03-01", reason: "skill mutation" },
    "security-auditor": { agentId: "security-auditor", parentId: null, createdAt: "2026-01-01", reason: "origin" },
  },
  edges: [
    { parent: "refactorer", child: "refactorer-v2" },
  ],
};

const RETIREMENT_DATA = [
  {
    id: "old-agent-1",
    retiredAt: "2026-05-01T10:00:00Z",
    reason: "Success rate below threshold",
    stats: { successRate: 0.2, totalUses: 15, sprintsParticipated: 6 },
    source: "learned" as const,
  },
  {
    id: "old-agent-2",
    retiredAt: "2026-04-15T08:00:00Z",
    reason: "Replaced by specialized variant",
    stats: { successRate: 0.3, totalUses: 22, sprintsParticipated: 8 },
    source: "user" as const,
  },
];

const PROMPT_METRICS_DATA = [
  {
    agentId: "refactorer",
    currentVersion: 3,
    totalVersions: 3,
    currentSuccessRate: 0.85,
    bestVersion: { version: 3, successRate: 0.85 },
    worstVersion: { version: 1, successRate: 0.6 },
    experimentStatus: "none" as const,
    trend: "improving" as const,
  },
  {
    agentId: "api-builder",
    currentVersion: 2,
    totalVersions: 2,
    currentSuccessRate: 0.72,
    bestVersion: { version: 1, successRate: 0.75 },
    worstVersion: { version: 2, successRate: 0.72 },
    experimentStatus: "active" as const,
    trend: "declining" as const,
  },
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
      <EvolutionPage />
    </LanguageProvider>,
  );
}

import EvolutionPage from "../../src/dashboard/src/pages/EvolutionPage";

describe("EvolutionPage — F7-010 /evolution dashboard (215-013)", () => {
  it("renders genealogy tree with agent nodes when data is available", () => {
    mockDataMap["/api/evolution/genealogy"] = GENEALOGY_DATA;
    renderPage();

    expect(screen.getByTestId("genealogy-tree")).toBeTruthy();
    expect(screen.getByTestId("genealogy-node-refactorer")).toBeTruthy();
    expect(screen.getByTestId("genealogy-node-security-auditor")).toBeTruthy();
    expect(screen.getByTestId("genealogy-node-refactorer-v2")).toBeTruthy();
  });

  it("renders retirement timeline when retirement data is available", () => {
    mockDataMap["/api/evolution/retirement"] = RETIREMENT_DATA;
    renderPage();

    const retirementTab = screen.getByTestId("tab-retirement");
    fireEvent.click(retirementTab);

    expect(screen.getByTestId("retirement-timeline")).toBeTruthy();
    expect(screen.getByTestId("retirement-entry-old-agent-1")).toBeTruthy();
    expect(screen.getByTestId("retirement-entry-old-agent-2")).toBeTruthy();
    expect(screen.getByText("Success rate below threshold")).toBeTruthy();
  });

  it("renders prompt-diff table with agent metrics when data is available", () => {
    mockDataMap["/api/evolution/prompt-metrics"] = PROMPT_METRICS_DATA;
    renderPage();

    const promptTab = screen.getByTestId("tab-prompt-diff");
    fireEvent.click(promptTab);

    expect(screen.getByTestId("prompt-diff-table")).toBeTruthy();
    expect(screen.getByTestId("prompt-row-refactorer")).toBeTruthy();
    expect(screen.getByTestId("prompt-row-api-builder")).toBeTruthy();
    expect(screen.getByText("improving")).toBeTruthy();
    expect(screen.getByText("declining")).toBeTruthy();
  });

  it("shows empty states when all endpoints return no data", () => {
    renderPage();

    // Genealogy tab (default) should show empty state
    expect(screen.queryByTestId("genealogy-tree")).toBeNull();
    expect(screen.getByText("No genealogy data")).toBeTruthy();

    // Retirement tab empty
    const retirementTab = screen.getByTestId("tab-retirement");
    fireEvent.click(retirementTab);
    expect(screen.queryByTestId("retirement-timeline")).toBeNull();
    expect(screen.getByText("No retired agents")).toBeTruthy();

    // Prompt-diff tab empty
    const promptTab = screen.getByTestId("tab-prompt-diff");
    fireEvent.click(promptTab);
    expect(screen.queryByTestId("prompt-diff-table")).toBeNull();
    expect(screen.getByText("No prompt metrics")).toBeTruthy();
  });

  it("renders evolution page wrapper with heading and tabs", () => {
    renderPage();

    expect(screen.getByTestId("evolution-page")).toBeTruthy();
    expect(screen.getByText("Evolution")).toBeTruthy();
    expect(screen.getByTestId("tab-genealogy")).toBeTruthy();
    expect(screen.getByTestId("tab-retirement")).toBeTruthy();
    expect(screen.getByTestId("tab-prompt-diff")).toBeTruthy();
  });

  it("shows genealogy child node indented under parent", () => {
    mockDataMap["/api/evolution/genealogy"] = GENEALOGY_DATA;
    renderPage();

    const parentNode = screen.getByTestId("genealogy-node-refactorer");
    const childNode = screen.getByTestId("genealogy-node-refactorer-v2");
    expect(parentNode).toBeTruthy();
    expect(childNode).toBeTruthy();
    // Child should have non-zero paddingLeft (depth=1 → 20px)
    expect(childNode.style.paddingLeft).toBe("20px");
  });
});
