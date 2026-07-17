// @vitest-environment happy-dom
// Sprint 218 task 218-010: DashboardPage control panel tests.
// Source-inspection style — reads the .tsx source and asserts structure.
// Matches the established pattern from dashboard-page.test.ts and Layout-godlevel.test.tsx.
// No DOM render, no SSE mock, no network — fully hermetic.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const PAGE_PATH = join(DASHBOARD_SRC, "pages", "DashboardPage.tsx");

const src = () => readFileSync(PAGE_PATH, "utf-8");

describe("DashboardPage — file exists and exports", () => {
  it("DashboardPage.tsx file exists", () => {
    expect(existsSync(PAGE_PATH)).toBe(true);
  });

  it("exports default DashboardPage function component", () => {
    const content = src();
    expect(content).toContain("export default function DashboardPage");
  });
});

describe("DashboardPage — phase indicator", () => {
  it("renders SprintPhaseTimeline for PLAN→CLEANUP phase display", () => {
    const content = src();
    expect(content).toContain("SprintPhaseTimeline");
    expect(content).toContain("currentPhase={state.sprint.phase}");
  });

  it("uses PHASE_COLORS map with PLAN, EXECUTE, COMPLETE labels", () => {
    const content = src();
    expect(content).toContain("PHASE_COLORS");
    expect(content).toContain("PLAN");
    expect(content).toContain("EXECUTE");
    expect(content).toContain("COMPLETE");
  });

  it("shows phase badge next to sprint status card header", () => {
    const content = src();
    // Phase badge rendered with PHASE_COLORS variant lookup
    expect(content).toContain("state.sprint.phase");
    expect(content).toMatch(/PHASE_COLORS\[state\.sprint\.phase\]/);
    expect(content).toContain("Badge");
  });
});

describe("DashboardPage — worker grid", () => {
  it("renders WorkerCardGrid with agents array from live state", () => {
    const content = src();
    expect(content).toContain("WorkerCardGrid");
    expect(content).toContain("agents={agents}");
  });

  it("passes onSelect callback to WorkerCardGrid for AgentDetail sheet", () => {
    const content = src();
    expect(content).toContain("onSelect");
    expect(content).toContain("setSelectedAgent");
    expect(content).toContain("AgentDetail");
  });

  // SURF-7 (ADR-G-033): read-only cutover pin
  it("passes NO onKill callback — worker termination left the dashboard", () => {
    const content = src();
    expect(content).not.toContain("onKill");
    expect(content).not.toContain("handleKill");
    expect(content).not.toContain("/api/kill/");
  });
});

// SURF-7 (ADR-G-033): read-only cutover pin
describe("DashboardPage — read-only control surface", () => {
  it("has NO New Sprint modal wiring", () => {
    const content = src();
    expect(content).not.toContain("NewSprintModal");
    expect(content).not.toContain("setModalOpen");
    expect(content).not.toContain("modalOpen");
  });

  it("has NO cleanup / kill-all buttons in any phase", () => {
    const content = src();
    expect(content).not.toContain("showKillAll");
    expect(content).not.toContain("showCleanup");
    expect(content).not.toContain("kill-all-btn");
    expect(content).not.toContain("cleanup-btn");
  });

  it("renders the ReadOnlyNotice with the sprint hint instead", () => {
    const content = src();
    expect(content).toContain("ReadOnlyNotice");
    expect(content).toContain("readonly.hint.sprint");
    expect(content).toMatch(/from\s+["']\.\.\/components\/ReadOnlyNotice["']/);
  });
});

describe("DashboardPage — live update via useLiveData", () => {
  it("imports useLiveData for stale-while-revalidate polling", () => {
    const content = src();
    expect(content).toContain("useLiveData");
    expect(content).toMatch(/from\s+["']\.\.\/lib\/use-live-data["']/);
  });

  it("polls /api/status via useLiveData when SSE is unavailable", () => {
    const content = src();
    expect(content).toContain('"/api/status"');
    // useLiveData called with enabled: !sseState
    expect(content).toMatch(/useLiveData.*DashboardState/s);
    expect(content).toContain("enabled: !sseState");
  });

  it("prefers SSE state over polled state over fallback state", () => {
    const content = src();
    // Priority chain: sseState → polledState → fallbackState
    expect(content).toContain("sseState ?? polledState ?? fallbackState");
  });

  it("also retains useSSE for real-time push events", () => {
    const content = src();
    expect(content).toContain("useSSE");
    expect(content).toContain("/api/events");
  });
});

describe("DashboardPage — directives editor access", () => {
  it("imports DirectivesEditor component", () => {
    const content = src();
    expect(content).toContain("DirectivesEditor");
    expect(content).toMatch(/from\s+["']\.\.\/components\/DirectivesEditor["']/);
  });

  it("renders DirectivesEditor when no sprint is active", () => {
    const content = src();
    // Shown in the no-sprint / welcome state
    expect(content).toContain("<DirectivesEditor");
    expect(content).toContain("noSprint");
  });

  it("status label references both sprint id and phase for top-level context", () => {
    const content = src();
    expect(content).toContain("dashboard.sprint_id");
    expect(content).toContain("dashboard.status");
  });
});
