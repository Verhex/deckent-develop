// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";

const mockRefetch = vi.fn();

const PENDING_APPROVALS = [
  {
    id: "n1",
    type: "agent-mutation",
    description: "Agent refactorer wants to mutate its core prompt",
    detector: "identity-drift-detector",
    createdAt: "2026-06-01T00:00:00Z",
    risk: "high" as const,
  },
  {
    id: "n2",
    type: "scope-expansion",
    description: "Worker requests write access outside assigned scope",
    detector: "scope-guard-detector",
    createdAt: "2026-06-01T01:00:00Z",
    risk: "medium" as const,
  },
];

const NERVOUS_STATUS = {
  panicGuard: false,
  detectors: [
    { id: "d1", name: "identity-drift-detector", enabled: true, triggerCount: 3 },
    { id: "d2", name: "scope-guard-detector", enabled: true, triggerCount: 1 },
    { id: "d3", name: "loop-guard-detector", enabled: false, triggerCount: 0 },
  ],
  pendingCount: 2,
};

let mockDataMap: Record<string, unknown> = {};

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn((url: string) => ({
    data: mockDataMap[url] ?? null,
    loading: false,
    error: null,
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

describe("NervousPage — F7-009 Nervous System UI (215-015)", () => {
  it("renders pending approval list when approvals are available", () => {
    mockDataMap["/api/nervous/pending"] = PENDING_APPROVALS;
    mockDataMap["/api/nervous/status"] = NERVOUS_STATUS;
    renderPage();

    expect(screen.getByTestId("pending-list")).toBeTruthy();
    expect(screen.getByTestId("approval-n1")).toBeTruthy();
    expect(screen.getByTestId("approval-n2")).toBeTruthy();
    expect(screen.getByText("agent-mutation")).toBeTruthy();
    expect(screen.getByText("scope-expansion")).toBeTruthy();
  });

  it("calls postJson for accept action and refetches", async () => {
    mockDataMap["/api/nervous/pending"] = PENDING_APPROVALS;
    mockDataMap["/api/nervous/status"] = NERVOUS_STATUS;
    renderPage();

    const acceptBtn = screen.getByTestId("accept-n1");
    await act(async () => {
      fireEvent.click(acceptBtn);
    });

    expect(postJson).toHaveBeenCalledWith("/api/nervous/accept/n1");
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("calls postJson for reject action and refetches", async () => {
    mockDataMap["/api/nervous/pending"] = PENDING_APPROVALS;
    mockDataMap["/api/nervous/status"] = NERVOUS_STATUS;
    renderPage();

    const rejectBtn = screen.getByTestId("reject-n2");
    await act(async () => {
      fireEvent.click(rejectBtn);
    });

    expect(postJson).toHaveBeenCalledWith("/api/nervous/reject/n2");
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("shows empty state when no pending approvals", () => {
    mockDataMap["/api/nervous/pending"] = [];
    mockDataMap["/api/nervous/status"] = NERVOUS_STATUS;
    renderPage();

    expect(screen.queryByTestId("pending-list")).toBeNull();
    expect(screen.getByText("No pending approvals")).toBeTruthy();
  });

  it("shows panic-guard badge with correct state", () => {
    const panicStatus = { ...NERVOUS_STATUS, panicGuard: true };
    mockDataMap["/api/nervous/status"] = panicStatus;
    mockDataMap["/api/nervous/pending"] = [];
    renderPage();

    const badge = screen.getByTestId("panic-guard-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain("Panic Guard ACTIVE");
  });

  it("renders detector list from status endpoint", () => {
    mockDataMap["/api/nervous/status"] = NERVOUS_STATUS;
    mockDataMap["/api/nervous/pending"] = [];
    renderPage();

    expect(screen.getByTestId("detector-list")).toBeTruthy();
    expect(screen.getByText("identity-drift-detector")).toBeTruthy();
    expect(screen.getByText("scope-guard-detector")).toBeTruthy();
  });

  it("renders the nervous page wrapper with heading", () => {
    renderPage();

    expect(screen.getByTestId("nervous-page")).toBeTruthy();
    expect(screen.getByText("Nervous System")).toBeTruthy();
  });
});
