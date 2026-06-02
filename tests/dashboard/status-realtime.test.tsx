// @vitest-environment happy-dom
// StatusPage real-time status updates (sprint-220 task 220-005/006).
// Source-inspection style — reads .tsx source and asserts structure.
// No DOM render, no SSE mock, no network — fully hermetic.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const PAGE_PATH = join(DASHBOARD_SRC, "pages", "StatusPage.tsx");
const src = () => readFileSync(PAGE_PATH, "utf-8");

describe("StatusPage — real-time task status (220-005)", () => {
  it("StatusPage.tsx exists", () => {
    expect(existsSync(PAGE_PATH)).toBe(true);
  });

  it("uses useLiveData for real-time task polling", () => {
    const content = src();
    expect(content).toContain("useLiveData");
    expect(content).toContain("use-live-data");
    expect(content).toContain("/api/tasks");
  });

  it("done-render: liveTasks.data fed to SprintSummary for DONE task display", () => {
    const content = src();
    // liveTasks.data ?? [] passed as tasks → SprintSummary renders done status
    expect(content).toContain("liveTasks.data");
    expect(content).toContain("SprintSummary");
    // tasks derived from liveTasks, not stale manual fetch
    expect(content).not.toContain("setTasks(");
  });

  it("polls with pollIntervalMs for live status updates (done/working/no_go)", () => {
    const content = src();
    expect(content).toContain("pollIntervalMs");
    // 5000ms polling keeps task statuses up-to-date
    expect(content).toContain("5000");
  });

  it("phase shown from SSE — useSSE drives sprint.phase in SprintSummary", () => {
    const content = src();
    // Phase comes from sseState (useSSE) → state.sprint.phase fed to SprintSummary
    expect(content).toContain("useSSE");
    expect(content).toContain("/api/events");
    expect(content).toContain("sseState");
    // state passed to SprintSummary carries sprint.phase
    expect(content).toContain("state={state}");
  });
});
