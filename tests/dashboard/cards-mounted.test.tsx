// @vitest-environment happy-dom
// Sprint 374 Task 374-003 — DASH-MOUNT-CARDS.
// LimitsCard (366-005) and EvaluateHealthCard (370-007) were written but never
// mounted anywhere in the dashboard (orphan components). This suite proves the
// fix two ways: (a) source-inspection of App.tsx — both cards are imported and
// rendered inside the Layout-wrapped "/" route (the primary, always-reachable
// nav destination — see route-sidebar-wire.test.tsx / StatusPage.route.test.tsx
// for the same source-inspection technique used elsewhere in this repo); and
// (b) a real React render (happy-dom) proving both cards coexist in one render
// tree, mirroring the mocked-useApi pattern from kpi-dashboard.test.tsx.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import { LimitsCard } from "../../src/dashboard/src/components/LimitsCard";
import { EvaluateHealthCard } from "../../src/dashboard/src/components/EvaluateHealthCard";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const APP_PATH = join(DASHBOARD_SRC, "App.tsx");

// ─── (a) App.tsx wiring — source inspection ────────────────────────────────

describe("App.tsx — orphan cards mounted (374-003)", () => {
  it("App.tsx exists", () => {
    expect(existsSync(APP_PATH)).toBe(true);
  });

  it("imports LimitsCard and EvaluateHealthCard", () => {
    const src = readFileSync(APP_PATH, "utf-8");
    expect(src).toMatch(/from\s+["']\.\/components\/LimitsCard["']/);
    expect(src).toMatch(/from\s+["']\.\/components\/EvaluateHealthCard["']/);
  });

  it("renders both cards from the element mounted on the \"/\" route", () => {
    const src = readFileSync(APP_PATH, "utf-8");
    expect(src).toContain("<LimitsCard");
    expect(src).toContain("<EvaluateHealthCard");
  });

  it("both cards are wired inside the Layout-wrapped route tree (nav-reachable)", () => {
    const src = readFileSync(APP_PATH, "utf-8");

    // The component mounted on "/" contains both cards.
    const compStart = src.indexOf("function DashboardWithObservability");
    expect(compStart).toBeGreaterThanOrEqual(0);
    const compEnd = src.indexOf("\nfunction App", compStart);
    expect(compEnd).toBeGreaterThan(compStart);
    const componentBody = src.slice(compStart, compEnd);
    expect(componentBody).toContain("<LimitsCard");
    expect(componentBody).toContain("<EvaluateHealthCard");

    // The root "/" route (already the primary sidebar nav link — item #1 in
    // the "watch" nav group) lives inside the Layout wrapper, and renders
    // exactly the component that mounts both cards.
    const layoutIdx = src.indexOf("<Route element={<Layout");
    const layoutClose = src.indexOf("</Route>", layoutIdx);
    const rootRouteIdx = src.indexOf('path="/"');
    expect(layoutIdx).toBeGreaterThanOrEqual(0);
    expect(layoutClose).toBeGreaterThan(layoutIdx);
    expect(rootRouteIdx).toBeGreaterThan(layoutIdx);
    expect(rootRouteIdx).toBeLessThan(layoutClose);
    expect(src.slice(rootRouteIdx, rootRouteIdx + 80)).toContain("<DashboardWithObservability");
  });

  it("does not remove the existing \"/\" route (no regression)", () => {
    const src = readFileSync(APP_PATH, "utf-8");
    expect(src).toContain('path="/"');
    expect(src).toContain("DashboardPage");
  });

  it("has zero emoji-presentation characters in the new App.tsx content", () => {
    const src = readFileSync(APP_PATH, "utf-8");
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/gu;
    expect(src.match(emojiRegex) ?? []).toHaveLength(0);
  });
});

// ─── (b) Render-tree proof — both cards mount together ─────────────────────

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

function renderMountedCards() {
  return render(
    <LanguageProvider>
      <div data-testid="observability-cards-row">
        <LimitsCard />
        <EvaluateHealthCard />
      </div>
    </LanguageProvider>,
  );
}

describe("Mounted cards — coexist in one render tree", () => {
  it("renders LimitsCard and EvaluateHealthCard together (no longer orphans)", () => {
    mockDataMap["/api/limits"] = { unavailable: true, reason: "no probe", windows: [] };
    mockDataMap["/api/evaluate-health"] = {
      counts: { EVALUATION_FAULT: 0, EVALUATE_ABORTED: 0, EVALUATE_PREMATURE: 0, RESULT_CONTRACT_DRIFT: 0 },
      lastEventAt: null,
      sprintsScanned: 0,
      clean: true,
      generatedAt: "2026-07-06T00:00:00.000Z",
    };

    renderMountedCards();

    expect(screen.getByTestId("observability-cards-row")).toBeTruthy();
    expect(screen.getByTestId("limits-card")).toBeTruthy();
    expect(screen.getByTestId("evaluate-health-card")).toBeTruthy();
  });

  it("renders both cards' real data (not stubbed placeholders)", () => {
    mockDataMap["/api/limits"] = {
      unavailable: false,
      reason: null,
      windows: [{ name: "session", pct: 42, resetAt: null, verdict: "ok" }],
    };
    mockDataMap["/api/evaluate-health"] = {
      counts: { EVALUATION_FAULT: 1, EVALUATE_ABORTED: 0, EVALUATE_PREMATURE: 0, RESULT_CONTRACT_DRIFT: 0 },
      lastEventAt: "2026-07-04T08:30:00.000Z",
      sprintsScanned: 5,
      clean: false,
      generatedAt: "2026-07-06T00:00:00.000Z",
    };

    renderMountedCards();

    expect(screen.getByTestId("limits-window-session")).toBeTruthy();
    expect(screen.getByTestId("evaluate-health-counters")).toBeTruthy();
  });

  it("has zero emoji-presentation characters in the combined render output", () => {
    mockDataMap["/api/limits"] = { unavailable: true, reason: "no probe", windows: [] };
    mockDataMap["/api/evaluate-health"] = {
      counts: { EVALUATION_FAULT: 0, EVALUATE_ABORTED: 0, EVALUATE_PREMATURE: 0, RESULT_CONTRACT_DRIFT: 0 },
      lastEventAt: null,
      sprintsScanned: 0,
      clean: true,
      generatedAt: "2026-07-06T00:00:00.000Z",
    };

    const { container } = renderMountedCards();
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/u;
    expect(emojiRegex.test(container.textContent ?? "")).toBe(false);
  });
});
