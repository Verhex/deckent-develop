// @vitest-environment happy-dom
/**
 * Task 279-006: DASH-002 — Sidebar Bell badge for Nervous pending count.
 *
 * Test strategy:
 * - Source inspection for Sidebar.tsx structural changes (NavLink from react-router-dom
 *   cannot be resolved at workspace-root vitest — same constraint as nav-render.test.tsx).
 * - renderHook for useNervousStatus behaviour (mock fetch / mock useLiveData).
 * - Render-based harness component for badge show/hide logic (no NavLink dependency).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── paths ────────────────────────────────────────────────────────────────────
const SIDEBAR_PATH = join(process.cwd(), "src", "dashboard", "src", "components", "Sidebar.tsx");
const sidebarSrc = () => readFileSync(SIDEBAR_PATH, "utf-8");

// ── useLiveData mock state ────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  liveDataMap: {} as Record<string, unknown>,
}));

vi.mock("../../src/dashboard/src/lib/use-live-data", () => ({
  useLiveData: vi.fn((url: string) => ({
    data: h.liveDataMap[url] ?? null,
    isStale: false,
    isLoading: false,
    error: null,
    status: "connected",
    refresh: vi.fn(),
  })),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  postJson: vi.fn().mockResolvedValue({}),
  getBootstrapApiToken: vi.fn().mockReturnValue(null),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.liveDataMap = {};
});

// ── import hook under test ────────────────────────────────────────────────────
import { useNervousStatus } from "../../src/dashboard/src/hooks/useNervousStatus";

// ── badge render harness (no react-router-dom) ────────────────────────────────
function BellBadgeHarness() {
  const { pendingCount } = useNervousStatus();
  return (
    <div data-testid="harness">
      {pendingCount > 0 && (
        <span data-testid="nervous-bell-badge">
          {pendingCount > 99 ? "99+" : pendingCount}
        </span>
      )}
    </div>
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("useNervousStatus hook", () => {
  it("returns pendingCount from /api/nervous/status data", () => {
    h.liveDataMap["/api/nervous/status"] = { pendingCount: 3, panicGuard: false, detectors: [] };
    const { result } = renderHook(() => useNervousStatus());
    expect(result.current.pendingCount).toBe(3);
  });

  it("returns 0 when data is null (endpoint not yet loaded)", () => {
    // liveDataMap has no entry → data = null
    const { result } = renderHook(() => useNervousStatus());
    expect(result.current.pendingCount).toBe(0);
  });

  it("returns 0 when pendingCount is 0 in data", () => {
    h.liveDataMap["/api/nervous/status"] = { pendingCount: 0, panicGuard: false, detectors: [] };
    const { result } = renderHook(() => useNervousStatus());
    expect(result.current.pendingCount).toBe(0);
  });
});

describe("Bell badge render harness", () => {
  it("shows badge with count when pendingCount > 0", () => {
    h.liveDataMap["/api/nervous/status"] = { pendingCount: 5 };
    render(React.createElement(BellBadgeHarness));
    const badge = screen.getByTestId("nervous-bell-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("5");
  });

  it("hides badge when pendingCount is 0", () => {
    h.liveDataMap["/api/nervous/status"] = { pendingCount: 0 };
    render(React.createElement(BellBadgeHarness));
    expect(screen.queryByTestId("nervous-bell-badge")).toBeNull();
  });

  it("hides badge when data is null (not yet loaded)", () => {
    render(React.createElement(BellBadgeHarness));
    expect(screen.queryByTestId("nervous-bell-badge")).toBeNull();
  });

  it("caps badge at 99+ when pendingCount exceeds 99", () => {
    h.liveDataMap["/api/nervous/status"] = { pendingCount: 150 };
    render(React.createElement(BellBadgeHarness));
    const badge = screen.getByTestId("nervous-bell-badge");
    expect(badge.textContent).toBe("99+");
  });
});

describe("Sidebar.tsx — source inspection", () => {
  it("imports useNervousStatus hook", () => {
    const src = sidebarSrc();
    expect(src).toContain("useNervousStatus");
  });

  it("has nervous-bell-badge data-testid attribute", () => {
    const src = sidebarSrc();
    expect(src).toContain('data-testid="nervous-bell-badge"');
  });

  it("badge is conditional on pendingCount > 0", () => {
    const src = sidebarSrc();
    expect(src).toContain("pendingCount > 0");
  });

  it("uses useNervousStatus to get pendingCount", () => {
    const src = sidebarSrc();
    expect(src).toContain("useNervousStatus");
    expect(src).toContain("pendingCount");
  });

  it("contains no emoji characters in sidebar source", () => {
    const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/u;
    const src = sidebarSrc();
    const matches = src.match(new RegExp(EMOJI_RE.source, "gu")) ?? [];
    expect(matches).toHaveLength(0);
  });
});
