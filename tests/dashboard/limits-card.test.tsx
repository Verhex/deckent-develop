// @vitest-environment happy-dom
// Sprint 365 Task 365-006 — LimitsCard tests (DASH-LIMITS-CARD).
// Mirrors tests/dashboard/RoutingDistribution.test.tsx: mock useApi,
// render with LanguageProvider, happy-dom.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import { LimitsCard, type LimitsResponse } from "../../src/dashboard/src/components/LimitsCard";
import { useApi } from "../../src/dashboard/src/hooks/useApi";

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn(),
}));

beforeEach(() => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("no server"));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

function mockUseApi(result: { data: LimitsResponse | null; loading: boolean }) {
  vi.mocked(useApi).mockReturnValue({
    data: result.data,
    loading: result.loading,
    error: null,
    refetch: vi.fn(),
  });
}

const FULL_DATA: LimitsResponse = {
  unavailable: false,
  reason: null,
  windows: [
    { name: "session", pct: 81, resetAt: { text: "Jul 2, 8:30pm", timezone: "Europe/Istanbul" }, verdict: "warn" },
    { name: "week_all", pct: 31, resetAt: { text: "Jul 6, 12:00am", timezone: "Europe/Istanbul" }, verdict: "ok" },
    { name: "week_fable", pct: 96, resetAt: { text: "Jul 6, 12:00am", timezone: "Europe/Istanbul" }, verdict: "block" },
  ],
};

const NO_FABLE_DATA: LimitsResponse = {
  unavailable: false,
  reason: null,
  windows: [
    { name: "session", pct: 12, resetAt: null, verdict: "ok" },
    { name: "week_all", pct: 5, resetAt: null, verdict: "ok" },
  ],
};

const UNAVAILABLE_DATA: LimitsResponse = {
  unavailable: true,
  reason: 'usage output missing required "Current session" line',
  windows: [],
};

// Matches the emoji ranges used by tests/dashboard/no-emoji-guard.test.tsx.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/gu;

describe("LimitsCard", () => {
  it("renders a skeleton while loading", () => {
    mockUseApi({ data: null, loading: true });
    renderWithProviders(<LimitsCard />);
    expect(screen.queryByTestId("limits-card")).toBeNull();
  });

  it("renders 3 window bars with pct + reset time for a full probe", () => {
    mockUseApi({ data: FULL_DATA, loading: false });
    renderWithProviders(<LimitsCard />);

    expect(screen.getByTestId("limits-card")).toBeDefined();
    expect(screen.getByTestId("limits-window-session")).toBeDefined();
    expect(screen.getByTestId("limits-window-week_all")).toBeDefined();
    expect(screen.getByTestId("limits-window-week_fable")).toBeDefined();

    expect(screen.getByTestId("limits-pct-session").textContent).toBe("81%");
    expect(screen.getByText(/Resets Jul 2, 8:30pm \(Europe\/Istanbul\)/)).toBeDefined();
  });

  it("renders only 2 window bars when the probe has no Fable window", () => {
    mockUseApi({ data: NO_FABLE_DATA, loading: false });
    renderWithProviders(<LimitsCard />);

    expect(screen.getByTestId("limits-window-session")).toBeDefined();
    expect(screen.getByTestId("limits-window-week_all")).toBeDefined();
    expect(screen.queryByTestId("limits-window-week_fable")).toBeNull();
    expect(screen.getAllByText("No reset time reported")).toHaveLength(2);
  });

  it("shows an honest empty-state (no fabricated bars) when the probe is unavailable", () => {
    mockUseApi({ data: UNAVAILABLE_DATA, loading: false });
    renderWithProviders(<LimitsCard />);

    expect(screen.getByTestId("limits-card")).toBeDefined();
    expect(screen.queryByTestId("limits-windows")).toBeNull();
    expect(screen.getByText("Limit probe unavailable")).toBeDefined();
    expect(screen.getByText(/Current session/)).toBeDefined();
  });

  it("falls back to a generic error message when unavailable with no reason", () => {
    mockUseApi({ data: { unavailable: true, reason: null, windows: [] }, loading: false });
    renderWithProviders(<LimitsCard />);
    expect(screen.getByText("Error")).toBeDefined();
  });

  it("treats a null data response (fetch not yet resolved to unavailable) as honestly unavailable", () => {
    mockUseApi({ data: null, loading: false });
    renderWithProviders(<LimitsCard />);
    expect(screen.getByText("Limit probe unavailable")).toBeDefined();
    expect(screen.queryByTestId("limits-windows")).toBeNull();
  });

  it("renders zero emoji-presentation characters", () => {
    mockUseApi({ data: FULL_DATA, loading: false });
    const { container } = renderWithProviders(<LimitsCard />);
    const matches = (container.innerHTML.match(EMOJI_RE) ?? []).length;
    expect(matches).toBe(0);
  });
});
