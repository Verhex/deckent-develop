// @vitest-environment happy-dom
// Sprint 220 task 220-005: WorkerGrid real-time live data tests.
// Source-inspection style — reads the .tsx source and asserts structure.
// Matches established pattern from DashboardPage-control.test.tsx.
// No DOM render, no SSE mock, no network — fully hermetic.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS_DIR = join(process.cwd(), "src", "dashboard", "src", "components");
const GRID_PATH = join(COMPONENTS_DIR, "WorkerGrid.tsx");

const src = () => readFileSync(GRID_PATH, "utf-8");

describe("WorkerGrid — file exists and exports", () => {
  it("WorkerGrid.tsx file exists", () => {
    expect(existsSync(GRID_PATH)).toBe(true);
  });

  it("exports WorkerGrid function component", () => {
    const content = src();
    expect(content).toContain("export function WorkerGrid");
  });
});

describe("WorkerGrid — real-time polling via useLiveData", () => {
  it("imports useLiveData for stale-while-revalidate polling", () => {
    const content = src();
    expect(content).toContain("useLiveData");
    expect(content).toMatch(/from\s+["'].*use-live-data/);
  });

  it("polls /api/status for real-time worker updates", () => {
    const content = src();
    expect(content).toContain('"/api/status"');
    expect(content).toMatch(/useLiveData<DashboardState>/);
  });

  it("derives worker list from live data with no fixed cap", () => {
    const content = src();
    // workers derived from data.agents — no fixed limit like slice(0,6)
    expect(content).toContain("data?.agents");
    expect(content).not.toMatch(/\.slice\(0,\s*6\)/);
  });

  it("shows reconnecting indicator when connection is stale", () => {
    const content = src();
    expect(content).toContain("isStale");
    expect(content).toContain("reconnecting");
  });
});

describe("WorkerGrid — callbacks passed to WorkerCardGrid", () => {
  it("delegates rendering to WorkerCardGrid with live agents", () => {
    const content = src();
    expect(content).toContain("WorkerCardGrid");
    expect(content).toContain("agents={workers}");
  });

  it("accepts and passes onSelect callback for agent detail view", () => {
    const content = src();
    expect(content).toContain("onSelect");
    expect(content).toContain("onSelect={onSelect}");
  });

  it("accepts and passes onKill callback for worker termination", () => {
    const content = src();
    expect(content).toContain("onKill");
    expect(content).toContain("onKill={onKill}");
  });
});

describe("WorkerGrid — empty state handled by WorkerCardGrid", () => {
  it("uses empty array fallback when no data yet (no crash)", () => {
    const content = src();
    // data?.agents ?? [] ensures empty array when data is null
    expect(content).toContain("data?.agents ?? []");
  });
});
