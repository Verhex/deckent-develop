// @vitest-environment happy-dom
// Sprint 370 Task 370-007 — EvaluateHealthCard (born-484 EVAL-OBS-DASH).
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import { EvaluateHealthCard } from "../../src/dashboard/src/components/EvaluateHealthCard";
import type { EvaluateHealthResponse } from "../../src/dashboard/src/components/EvaluateHealthCard";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUseApiResult: { data: unknown; loading: boolean } = { data: null, loading: false };

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn(() => mockUseApiResult),
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
  mockUseApiResult = { data: null, loading: false };
});

// ─── Test data ──────────────────────────────────────────────────────────────

const CLEAN_PAYLOAD: EvaluateHealthResponse = {
  counts: { EVALUATION_FAULT: 0, EVALUATE_ABORTED: 0, EVALUATE_PREMATURE: 0, RESULT_CONTRACT_DRIFT: 0 },
  lastEventAt: null,
  sprintsScanned: 20,
  clean: true,
  generatedAt: "2026-07-05T12:00:00.000Z",
};

const FAULTY_PAYLOAD: EvaluateHealthResponse = {
  counts: { EVALUATION_FAULT: 2, EVALUATE_ABORTED: 1, EVALUATE_PREMATURE: 0, RESULT_CONTRACT_DRIFT: 3 },
  lastEventAt: "2026-07-04T08:30:00.000Z",
  sprintsScanned: 20,
  clean: false,
  generatedAt: "2026-07-05T12:00:00.000Z",
};

function renderCard() {
  return render(
    <LanguageProvider>
      <EvaluateHealthCard />
    </LanguageProvider>,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("EvaluateHealthCard", () => {
  it("renders a skeleton while loading", () => {
    mockUseApiResult = { data: null, loading: true };
    const { container } = renderCard();
    expect(screen.queryByTestId("evaluate-health-card")).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders the honest clean state when no faults are present", () => {
    mockUseApiResult = { data: CLEAN_PAYLOAD, loading: false };
    renderCard();
    expect(screen.getByTestId("evaluate-health-card")).toBeTruthy();
    expect(screen.getByTestId("evaluate-health-clean")).toBeTruthy();
    expect(screen.queryByTestId("evaluate-health-counters")).toBeNull();
    expect(screen.getByText("No evaluate-health faults")).toBeTruthy();
    expect(screen.getByText("No events recorded")).toBeTruthy();
  });

  it("renders the clean state (not zero counters) even with no data at all", () => {
    mockUseApiResult = { data: null, loading: false };
    renderCard();
    expect(screen.getByTestId("evaluate-health-clean")).toBeTruthy();
  });

  it("renders all 4 counters with correct values when faults are present", () => {
    mockUseApiResult = { data: FAULTY_PAYLOAD, loading: false };
    renderCard();
    expect(screen.queryByTestId("evaluate-health-clean")).toBeNull();
    expect(screen.getByTestId("evaluate-health-counters")).toBeTruthy();

    expect(screen.getByTestId("evaluate-health-count-EVALUATION_FAULT").textContent).toBe("2");
    expect(screen.getByTestId("evaluate-health-count-EVALUATE_ABORTED").textContent).toBe("1");
    expect(screen.getByTestId("evaluate-health-count-EVALUATE_PREMATURE").textContent).toBe("0");
    expect(screen.getByTestId("evaluate-health-count-RESULT_CONTRACT_DRIFT").textContent).toBe("3");
  });

  it("renders the last-event timestamp row when faults are present", () => {
    mockUseApiResult = { data: FAULTY_PAYLOAD, loading: false };
    renderCard();
    const row = screen.getByTestId("evaluate-health-last-event");
    expect(row.textContent).toContain("Last event:");
  });

  it("has no emoji characters in rendered output (clean state)", () => {
    mockUseApiResult = { data: CLEAN_PAYLOAD, loading: false };
    const { container } = renderCard();
    const emojiRegex = /[\u{1F300}-\u{1FAFF}]/u;
    expect(emojiRegex.test(container.textContent ?? "")).toBe(false);
  });

  it("has no emoji characters in rendered output (faulty state)", () => {
    mockUseApiResult = { data: FAULTY_PAYLOAD, loading: false };
    const { container } = renderCard();
    const emojiRegex = /[\u{1F300}-\u{1FAFF}]/u;
    expect(emojiRegex.test(container.textContent ?? "")).toBe(false);
  });
});
