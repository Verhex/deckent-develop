// @vitest-environment happy-dom
// DASH-RT-1 live-merge tests (Sprint 284 task 284-002).
// Source-inspection style — reads hook/page sources and asserts structure.
// No DOM render, no SSE mock, no network — fully hermetic.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const HOOKS_DIR = join(process.cwd(), "src", "dashboard", "src", "hooks");
const LIB_DIR = join(process.cwd(), "src", "dashboard", "src", "lib");
const PAGES_DIR = join(process.cwd(), "src", "dashboard", "src", "pages");

const useSSEPath = join(HOOKS_DIR, "useSSE.ts");
const useLiveDataPath = join(LIB_DIR, "use-live-data.ts");
const dashboardPagePath = join(PAGES_DIR, "DashboardPage.tsx");
const workersPagePath = join(PAGES_DIR, "WorkersPage.tsx");

const sse = () => readFileSync(useSSEPath, "utf-8");
const liveData = () => readFileSync(useLiveDataPath, "utf-8");
const dashboard = () => readFileSync(dashboardPagePath, "utf-8");
const workers = () => readFileSync(workersPagePath, "utf-8");

describe("live-merge: files exist", () => {
  it("useSSE.ts exists", () => expect(existsSync(useSSEPath)).toBe(true));
  it("use-live-data.ts exists", () => expect(existsSync(useLiveDataPath)).toBe(true));
  it("DashboardPage.tsx exists", () => expect(existsSync(dashboardPagePath)).toBe(true));
  it("WorkersPage.tsx exists", () => expect(existsSync(workersPagePath)).toBe(true));
});

describe("hb-merge-instantly: worker_heartbeat patches agent state", () => {
  it("useSSE.ts listens for worker_heartbeat named SSE event", () => {
    const src = sse();
    expect(src).toContain('addEventListener("worker_heartbeat"');
  });

  it("worker_heartbeat handler patches agent currentAction immediately via setData", () => {
    const src = sse();
    // Must contain currentAction assignment inside the worker_heartbeat handler
    const hbIdx = src.indexOf('addEventListener("worker_heartbeat"');
    expect(hbIdx).toBeGreaterThan(0);
    const hbSection = src.slice(hbIdx, hbIdx + 600);
    expect(hbSection).toContain("currentAction");
    expect(hbSection).toContain("setData");
  });

  it("worker_heartbeat handler reads taskId from event payload", () => {
    const src = sse();
    const hbIdx = src.indexOf('addEventListener("worker_heartbeat"');
    const hbSection = src.slice(hbIdx, hbIdx + 400);
    expect(hbSection).toContain("taskId");
  });
});

describe("done-merge: worker_done marks agent DONE", () => {
  it("useSSE.ts listens for worker_done named SSE event", () => {
    const src = sse();
    expect(src).toContain('addEventListener("worker_done"');
  });

  it("worker_done handler sets agent status to DONE", () => {
    const src = sse();
    const doneIdx = src.indexOf('addEventListener("worker_done"');
    expect(doneIdx).toBeGreaterThan(0);
    const doneSection = src.slice(doneIdx, doneIdx + 500);
    expect(doneSection).toContain('"DONE"');
    expect(doneSection).toContain("setData");
  });
});

describe("feed-append: deckent_event appended to liveEvents ring buffer", () => {
  it("useSSE.ts listens for deckent_event named SSE event", () => {
    const src = sse();
    expect(src).toContain('addEventListener("deckent_event"');
  });

  it("deckent_event handler calls setLiveEvents to append to ring buffer", () => {
    const src = sse();
    expect(src).toContain('addEventListener("deckent_event"');
    // setLiveEvents must be present in the file (ring-buffer append logic)
    expect(src).toContain("setLiveEvents");
  });

  it("use-live-data.ts exports LiveActivityEntry type containing deckent_event literal", () => {
    const src = liveData();
    expect(src).toContain("LiveActivityEntry");
    expect(src).toContain("deckent_event");
  });

  it("use-live-data.ts exports MAX_LIVE_ACTIVITY constant", () => {
    const src = liveData();
    expect(src).toContain("MAX_LIVE_ACTIVITY");
  });

  it("useSSEWithLiveEvents returns liveEvents array", () => {
    const src = sse();
    expect(src).toContain("useSSEWithLiveEvents");
    expect(src).toContain("liveEvents");
    expect(src).toContain("SSEResultExtended");
  });
});

describe("ts-conflict-rule: event-ts > snapshot-ts → event wins", () => {
  it("useSSE.ts compares event ts against agent lastHeartbeat before merging", () => {
    const src = sse();
    // The conflict-rule guard: snapshotTs > ts → return unchanged agent
    expect(src).toContain("lastHeartbeat");
    expect(src).toContain("snapshotTs");
  });

  it("mergeAgents discards overrides when snapshot is newer (snapshotTs > override.ts)", () => {
    const src = sse();
    expect(src).toContain("mergeAgents");
    // The guard: if snapshotTs > override.ts delete and return agent
    const mergeIdx = src.indexOf("function mergeAgents");
    expect(mergeIdx).toBeGreaterThan(0);
    const mergeSection = src.slice(mergeIdx, mergeIdx + 600);
    expect(mergeSection).toContain("snapshotTs > override.ts");
  });

  it("worker_heartbeat handler skips update when snapshot ts is newer", () => {
    const src = sse();
    // The conflict-rule guard is present in the file
    expect(src).toContain("snapshotTs > ts");
    expect(src).toContain('addEventListener("worker_heartbeat"');
  });
});

describe("dashboard integration: DashboardPage uses live events", () => {
  it("DashboardPage imports useSSEWithLiveEvents", () => {
    const src = dashboard();
    expect(src).toContain("useSSEWithLiveEvents");
  });

  it("DashboardPage destructures liveEvents from hook result", () => {
    const src = dashboard();
    expect(src).toContain("liveEvents");
  });

  it("DashboardPage renders LiveActivityFeed component", () => {
    const src = dashboard();
    expect(src).toContain("LiveActivityFeed");
  });
});

describe("workers integration: WorkersPage benefits from live-merged SSE via useSSE", () => {
  it("WorkersPage imports useSSE (backed by useSSEWithLiveEvents for live HB merging)", () => {
    const src = workers();
    expect(src).toContain("useSSE");
    expect(src).toContain("hooks/useSSE");
  });

  it("useSSE is backed by useSSEWithLiveEvents so WorkersPage gets live currentAction", () => {
    // useSSE calls useSSEWithStatus which calls useSSEWithLiveEvents
    const src = sse();
    expect(src).toContain("export function useSSE");
    expect(src).toContain("useSSEWithLiveEvents");
  });
});
