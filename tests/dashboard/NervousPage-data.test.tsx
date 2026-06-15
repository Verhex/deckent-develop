// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";

const mockRefetch = vi.fn();

const PENDING = [
  {
    id: "p1",
    type: "agent-mutation",
    description: "Agent wants to mutate its core prompt",
    detector: "identity-drift-detector",
    createdAt: "2026-06-01T00:00:00Z",
    risk: "high" as const,
  },
  {
    id: "p2",
    type: "scope-expansion",
    description: "Worker requests write access outside scope",
    detector: "scope-guard-detector",
    createdAt: "2026-06-01T01:00:00Z",
    risk: "medium" as const,
  },
];

const STATUS = {
  panicGuard: false,
  detectors: [
    { id: "d1", name: "identity-drift-detector", enabled: true, triggerCount: 3 },
    { id: "d2", name: "scope-guard-detector", enabled: true, triggerCount: 1 },
  ],
  pendingCount: 2,
};

let mockDataMap: Record<string, unknown> = {};
let mockLoadingMap: Record<string, boolean> = {};
let mockErrorMap: Record<string, string | null> = {};

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn((url: string) => ({
    data: mockDataMap[url] ?? null,
    loading: mockLoadingMap[url] ?? false,
    error: mockErrorMap[url] ?? null,
    refetch: mockRefetch,
  })),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error("no server")),
  postJson: vi.fn().mockResolvedValue({}),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockDataMap = {};
  mockLoadingMap = {};
  mockErrorMap = {};
});

function renderPage() {
  return render(
    <LanguageProvider>
      <NervousPage />
    </LanguageProvider>,
  );
}

import NervousPage from "../../src/dashboard/src/pages/NervousPage";
import { postJson } from "../../src/dashboard/src/lib/api";

describe("NervousPage — real data fetch paths (218-006)", () => {
  it("renders pending approval list with real data (veri render)", () => {
    mockDataMap["/api/nervous/pending"] = PENDING;
    mockDataMap["/api/nervous/status"] = STATUS;
    renderPage();

    expect(screen.getByTestId("pending-list")).toBeTruthy();
    expect(screen.getByTestId("approval-p1")).toBeTruthy();
    expect(screen.getByTestId("approval-p2")).toBeTruthy();
    expect(screen.getByText("agent-mutation")).toBeTruthy();
    expect(screen.getByText("scope-expansion")).toBeTruthy();
  });

  it("calls postJson for accept action and refetches (accept)", async () => {
    mockDataMap["/api/nervous/pending"] = PENDING;
    mockDataMap["/api/nervous/status"] = STATUS;
    renderPage();

    const acceptBtn = screen.getByTestId("accept-p1");
    await act(async () => {
      fireEvent.click(acceptBtn);
    });

    expect(postJson).toHaveBeenCalledWith("/api/nervous/accept/p1");
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("calls postJson for reject action and refetches (reject)", async () => {
    mockDataMap["/api/nervous/pending"] = PENDING;
    mockDataMap["/api/nervous/status"] = STATUS;
    renderPage();

    const rejectBtn = screen.getByTestId("reject-p2");
    await act(async () => {
      fireEvent.click(rejectBtn);
    });

    expect(postJson).toHaveBeenCalledWith("/api/nervous/reject/p2");
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("shows empty state when no pending approvals (boş state)", () => {
    mockDataMap["/api/nervous/pending"] = [];
    mockDataMap["/api/nervous/status"] = STATUS;
    renderPage();

    expect(screen.queryByTestId("pending-list")).toBeNull();
    expect(screen.getByText("No pending approvals")).toBeTruthy();
  });

  it("shows error message when pending fetch fails (error state)", () => {
    mockErrorMap["/api/nervous/pending"] = "Network error: connection refused";
    mockDataMap["/api/nervous/status"] = STATUS;
    renderPage();

    expect(screen.getByText(/Network error/)).toBeTruthy();
  });

  it("shows loading skeleton while pending approvals are loading", () => {
    mockLoadingMap["/api/nervous/pending"] = true;
    mockDataMap["/api/nervous/status"] = STATUS;
    renderPage();

    // skeleton is shown during loading — no pending-list rendered yet
    expect(screen.queryByTestId("pending-list")).toBeNull();
  });

  it("shows panic guard badge with correct ACTIVE state", () => {
    mockDataMap["/api/nervous/status"] = { ...STATUS, panicGuard: true };
    mockDataMap["/api/nervous/pending"] = [];
    renderPage();

    const badge = screen.getByTestId("panic-guard-badge");
    expect(badge.textContent).toContain("Panic Guard ACTIVE");
  });
});

const RECOMMENDATIONS = [
  {
    id: "rec-aaaaaaaaaa11",
    actionId: "DEBT_REPRIORITIZE",
    createdAt: "2026-06-15T10:00:00Z",
    payload: { debtId: "D-12", to: "HIGH" },
    status: "open" as const,
  },
  {
    id: "rec-bbbbbbbbbb22",
    actionId: "COMMIT_PUSH",
    createdAt: "2026-06-15T11:00:00Z",
    payload: { branch: "main" },
    status: "open" as const,
  },
];

describe("NervousPage — Brain inbox (recommendations)", () => {
  it("renders the recommendation list with action id + payload summary", () => {
    mockDataMap["/api/nervous/pending"] = [];
    mockDataMap["/api/nervous/status"] = STATUS;
    mockDataMap["/api/nervous/recommendations"] = RECOMMENDATIONS;
    renderPage();

    expect(screen.getByTestId("recommendation-list")).toBeTruthy();
    expect(screen.getByTestId("recommendation-rec-aaaaaaaaaa11")).toBeTruthy();
    expect(screen.getByText("DEBT_REPRIORITIZE")).toBeTruthy();
    expect(screen.getByText("debtId=D-12 to=HIGH")).toBeTruthy();
    expect(screen.getByText("COMMIT_PUSH")).toBeTruthy();
  });

  it("dismiss button calls the dismiss endpoint and refetches", async () => {
    mockDataMap["/api/nervous/pending"] = [];
    mockDataMap["/api/nervous/status"] = STATUS;
    mockDataMap["/api/nervous/recommendations"] = RECOMMENDATIONS;
    renderPage();

    const dismissBtn = screen.getByTestId("dismiss-rec-aaaaaaaaaa11");
    await act(async () => {
      fireEvent.click(dismissBtn);
    });

    expect(postJson).toHaveBeenCalledWith("/api/nervous/recommendations/dismiss/rec-aaaaaaaaaa11");
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("shows empty state when no open recommendations", () => {
    mockDataMap["/api/nervous/pending"] = [];
    mockDataMap["/api/nervous/status"] = STATUS;
    mockDataMap["/api/nervous/recommendations"] = [];
    renderPage();

    expect(screen.queryByTestId("recommendation-list")).toBeNull();
    expect(screen.getByText("No open recommendations")).toBeTruthy();
  });
});
