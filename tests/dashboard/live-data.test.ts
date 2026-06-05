import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_DIR = join(process.cwd(), "src", "dashboard");

// ─── SSE Hook ────────────────────────────────────────────────────────

describe("dashboard/live-data — useSSE hook", () => {
  const filePath = join(DASHBOARD_DIR, "src/hooks/useSSE.ts");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("exports useSSE function", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("export function useSSE");
  });

  it("exports useSSEWithStatus function", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("export function useSSEWithStatus");
  });

  it("defines SSEStatus type with all 3 states", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('"connecting"');
    expect(content).toContain('"connected"');
    expect(content).toContain('"disconnected"');
  });

  it("creates EventSource with the bootstrap-token-aware SSE URL", () => {
    const content = readFileSync(filePath, "utf-8");
    // Sprint 191 Task 191-010 — useSSE now wraps the URL via `buildSseUrl`
    // so the bootstrap API token can ride as `?token=...` (EventSource
    // cannot send custom headers).
    expect(content).toContain("new EventSource(buildSseUrl(url))");
  });

  it("sets connected on onopen", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("es.onopen");
    expect(content).toContain('setStatus("connected")');
  });

  it("parses JSON from event.data on onmessage", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("es.onmessage");
    expect(content).toContain("JSON.parse(event.data)");
  });

  it("sets disconnected on onerror with 3s reconnect", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("es.onerror");
    expect(content).toContain('setStatus("disconnected")');
    expect(content).toContain("setTimeout(connect, 3000)");
  });

  it("cleans up EventSource and timeout on unmount", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("es?.close()");
    expect(content).toContain("clearTimeout(reconnectTimer)");
  });

  it("exports SSEResult interface", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("export interface SSEResult");
  });

  it("defaults url to /api/events", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('url = "/api/events"');
  });
});

// ─── WorkerCard ──────────────────────────────────────────────────────

describe("dashboard/live-data — WorkerCard", () => {
  const filePath = join(DASHBOARD_DIR, "src/components/WorkerCard.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("defines STATUS_BORDER mapping", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("STATUS_BORDER");
  });

  it("EXECUTING status has animate-pulse class", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toMatch(/EXECUTING.*animate-pulse/);
  });

  it("DONE status has green border", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toMatch(/DONE.*border-green/);
  });

  it("NO_GO status has red border", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toMatch(/NO_GO.*border-red/);
  });

  it("renders agent id", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("agent.id");
  });

  it("renders taskId", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("agent.taskId");
  });

  it("has kill button with Skull icon", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Skull");
    expect(content).toContain('t("dashboard.kill")');
  });

  it("has detail button", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('t("worker.detail")');
  });

  it("has WorkerCardGrid component", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("export function WorkerCardGrid");
  });

  it("maps agents array to cards", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("agents.map");
  });
});

// ─── ActivityFeed ────────────────────────────────────────────────────

describe("dashboard/live-data — ActivityFeed", () => {
  const filePath = join(DASHBOARD_DIR, "src/components/ActivityFeed.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("defines MAX_ENTRIES = 50", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("MAX_ENTRIES = 50");
  });

  it("slices entries to MAX_ENTRIES limit", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain(".slice(-MAX_ENTRIES)");
  });

  it("tracks phase changes via prevPhaseRef", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("prevPhaseRef");
  });

  it("tracks agent status changes via prevAgentsRef", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("prevAgentsRef");
  });

  it("handles spawned event type", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('t("activity.spawned")');
  });

  it("handles done event type", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('t("activity.done")');
  });

  it("handles nogo event type", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('t("activity.nogo")');
  });

  it("auto-scrolls via bottomRef", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("bottomRef");
    expect(content).toContain("scrollIntoView");
  });

  it("displays no-activity message when no sprint", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('t("activity.no_activity")');
  });

  it("displays waiting message when sprint active but no entries", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('t("activity.waiting")');
  });
});

// ─── SprintPhaseTimeline ─────────────────────────────────────────────

describe("dashboard/live-data — SprintPhaseTimeline", () => {
  const filePath = join(DASHBOARD_DIR, "src/components/SprintPhaseTimeline.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("defines all 8 phases", () => {
    const content = readFileSync(filePath, "utf-8");
    const phases = ["PLAN", "SPAWN", "EXECUTE", "EVALUATE", "FIX", "RETRO", "DECAY", "CLEANUP"];
    for (const phase of phases) {
      expect(content).toContain(`"${phase}"`);
    }
  });

  it("active phase has bg-brand-500 and animate-pulse", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("bg-brand-500");
    expect(content).toContain("animate-pulse");
  });

  it("completed phases have bg-green-500", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("bg-green-500");
  });

  it("future phases have border-zinc-600", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("border-zinc-600");
  });

  it("has connector lines between phases", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("h-0.5");
    expect(content).toContain("PHASES.length - 1");
  });

  it("determines phase state based on currentIndex", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("isCompleted");
    expect(content).toContain("isActive");
    expect(content).toContain("isFuture");
  });

  it("shows checkmark SVG for completed phases", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("isCompleted");
    expect(content).toContain("<svg");
    expect(content).toContain("M5 13l4 4L19 7");
  });
});
