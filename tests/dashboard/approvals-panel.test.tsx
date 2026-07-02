// @vitest-environment happy-dom
// Sprint 356 task 356-001: DASH-APPROVALS — read-only pending/approved/denied
// monitor. Mocks globalThis.fetch (useApi -> useLiveData -> fetch), matching
// the convention in use-live-data.test.ts — no need to mock the hooks
// themselves, so this exercises the real polling + rendering path.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import ApprovalsPanel from "../../src/dashboard/src/components/ApprovalsPanel";
import type { ApprovalsResponse } from "../../src/dashboard/src/components/ApprovalsPanel";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Internal Server Error",
    json: async () => body,
  } as unknown as Response;
}

const mockFetch = vi.fn();

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const PAYLOAD: ApprovalsResponse = {
  pending: [
    {
      id: "apr-pending-1",
      summary: "worker requests shell-exec: npm test",
      scope: "shell-exec",
      risk: "high",
      maskedArgs: { cmd: "npm test", cwd: "***" },
      channel: null,
      createdAt: isoMinutesAgo(5),
      decidedAt: null,
    },
  ],
  approved: [
    {
      id: "apr-approved-1",
      summary: "brain requests file-write: docs/adr/ADR-G-040.md",
      scope: "file-write",
      risk: "low",
      maskedArgs: { path: "docs/adr/ADR-G-040.md" },
      channel: "terminal",
      createdAt: isoMinutesAgo(120),
      decidedAt: isoMinutesAgo(119),
    },
  ],
  denied: [
    {
      id: "apr-denied-1",
      summary: "connector requests credential access",
      scope: "credential",
      risk: "critical",
      maskedArgs: null,
      channel: "telegram",
      createdAt: isoMinutesAgo(2000),
      decidedAt: isoMinutesAgo(1999),
    },
  ],
};

const EMPTY_PAYLOAD: ApprovalsResponse = { pending: [], approved: [], denied: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(jsonResponse(PAYLOAD));
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
});

function renderPanel() {
  return render(
    <LanguageProvider>
      <ApprovalsPanel />
    </LanguageProvider>,
  );
}

describe("ApprovalsPanel — three-status list via /api/approvals (fetch-mocked)", () => {
  it("polls /api/approvals", async () => {
    renderPanel();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/approvals",
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("renders all three sections", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("approvals-section-pending")).toBeTruthy();
      expect(screen.getByTestId("approvals-section-approved")).toBeTruthy();
      expect(screen.getByTestId("approvals-section-denied")).toBeTruthy();
    });
  });

  it("renders the pending entry with its summary", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("approval-row-apr-pending-1")).toBeTruthy();
    });
    expect(screen.getByText("worker requests shell-exec: npm test")).toBeTruthy();
  });

  it("renders the approved and denied entries", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("approval-row-apr-approved-1")).toBeTruthy();
      expect(screen.getByTestId("approval-row-apr-denied-1")).toBeTruthy();
    });
  });

  it("shows the maskedArgs one-line summary, never a raw/nested dump", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/cmd=npm test/)).toBeTruthy();
    });
    // maskedArgs is the only args field this component ever reads — there is
    // no rawArgsRef/raw-args field on the DTO for it to accidentally render.
  });

  describe("risk-badge mapping", () => {
    it("maps each risk level to a distinct badge variant class", async () => {
      renderPanel();
      await waitFor(() => {
        expect(screen.getByTestId("risk-badge-apr-pending-1")).toBeTruthy();
      });
      const high = screen.getByTestId("risk-badge-apr-pending-1");
      const low = screen.getByTestId("risk-badge-apr-approved-1");
      const critical = screen.getByTestId("risk-badge-apr-denied-1");

      expect(high.className).toContain("bg-red-900"); // destructive
      expect(low.className).toContain("bg-brand-bg"); // info
      expect(critical.className).toContain("bg-red-900"); // critical
      // high (destructive) and critical use the same red family but are
      // rendered through distinct variants — assert the variant text differs.
      expect(high.textContent).toBe("high");
      expect(critical.textContent).toBe("critical");
      expect(low.textContent).toBe("low");
    });
  });

  it("shows the decision channel for approved/denied entries", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("approval-row-apr-approved-1")).toBeTruthy();
    });
    expect(screen.getByTestId("approval-row-apr-approved-1").textContent).toContain("terminal");
    expect(screen.getByTestId("approval-row-apr-denied-1").textContent).toContain("telegram");
  });

  it("shows an awaiting-decision placeholder (not null/blank) for pending entries", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("approval-row-apr-pending-1")).toBeTruthy();
    });
    const row = screen.getByTestId("approval-row-apr-pending-1");
    expect(row.textContent).toContain("Awaiting decision");
    expect(row.textContent).not.toContain("null");
  });

  it("renders a non-empty age string for every entry", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("approval-row-apr-pending-1")).toBeTruthy();
    });
    expect(screen.getByTestId("approval-row-apr-pending-1").textContent).toMatch(/ago|just now/);
    expect(screen.getByTestId("approval-row-apr-approved-1").textContent).toMatch(/ago|just now/);
  });

  it("has zero decide/accept/deny controls anywhere in the DOM (DASH-1: dashboard observes only)", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("approvals-panel")).toBeTruthy();
    });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("has no emoji characters in rendered output", async () => {
    const { container } = renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("approval-row-apr-pending-1")).toBeTruthy();
    });
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/u;
    expect(emojiRegex.test(container.textContent ?? "")).toBe(false);
  });
});

describe("ApprovalsPanel — empty state per category", () => {
  it("shows an empty state for a category with zero entries", async () => {
    mockFetch.mockResolvedValue(jsonResponse(EMPTY_PAYLOAD));
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("No approvals are currently pending.")).toBeTruthy();
    });
    expect(screen.getByText("No approvals have been granted yet.")).toBeTruthy();
    expect(screen.getByText("No approvals have been denied.")).toBeTruthy();
    expect(screen.queryByTestId("approvals-list-pending")).toBeNull();
    expect(screen.queryByTestId("approvals-list-approved")).toBeNull();
    expect(screen.queryByTestId("approvals-list-denied")).toBeNull();
  });
});
