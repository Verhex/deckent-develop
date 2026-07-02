// @vitest-environment happy-dom
// Sprint 359 task 359-013: APR-HISTORY — read-only, paginated audit trail
// over ApprovalStore's settled buckets (approved/denied/expired). Mocks
// useApi keyed by URL (mirrors debt-filter.test.tsx's convention) — the
// panel derives its query string from filter/pagination state, so a
// URL-keyed mock lets each interaction assert against a distinct fixture
// without needing to intercept fetch + wait on async query-string timing.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import ApprovalHistoryPanel from "../../src/dashboard/src/components/ApprovalHistoryPanel";
import type { ApprovalHistoryResponse } from "../../src/dashboard/src/components/ApprovalHistoryPanel";

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn((url: string) => mockApiMap[url] ?? { data: null, loading: false, error: null, refetch: vi.fn() }),
}));

// LanguageProvider calls fetchJson('/api/config') directly (not through
// useApi) to resolve the persisted language — mock it hermetically so the
// suite never attempts a real network connection (mirrors debt-filter.test.tsx).
vi.mock("../../src/dashboard/src/lib/api", () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error("no server")),
  postJson: vi.fn().mockRejectedValue(new Error("no server")),
}));

interface MockApiEntry {
  data: ApprovalHistoryResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

let mockApiMap: Record<string, MockApiEntry> = {};

function url(status: string, offset = 0): string {
  return `/api/approvals/history?status=${status}&limit=20&offset=${offset}`;
}

function loaded(data: ApprovalHistoryResponse): MockApiEntry {
  return { data, loading: false, error: null, refetch: vi.fn() };
}

const APPROVED_ENTRY: ApprovalHistoryResponse["entries"][number] = {
  id: "apr-approved-1",
  summary: "brain requests file-write: docs/adr/ADR-G-041.md",
  scope: "file-write",
  risk: "low",
  policy: "notify",
  maskedArgs: { path: "docs/adr/ADR-G-041.md" },
  category: "approved",
  channel: "terminal",
  decidedBy: "alperen",
  decidedAt: "2026-06-30T10:00:00.000Z",
  reason: "looks fine",
  createdAt: "2026-06-30T09:55:00.000Z",
  expiresAt: "2026-06-30T10:55:00.000Z",
};

const DENIED_ENTRY: ApprovalHistoryResponse["entries"][number] = {
  id: "apr-denied-1",
  summary: "connector requests credential access",
  scope: "credential",
  risk: "critical",
  policy: "require-approval",
  maskedArgs: null,
  category: "denied",
  channel: "telegram",
  decidedBy: "alperen",
  decidedAt: "2026-06-29T08:00:00.000Z",
  reason: "",
  createdAt: "2026-06-29T07:55:00.000Z",
  expiresAt: "2026-06-29T08:55:00.000Z",
};

// Overdue-but-unswept expired entry — no decision file yet (channel/decidedBy/
// decidedAt all null per approval-store.ts categorize()).
const EXPIRED_ENTRY: ApprovalHistoryResponse["entries"][number] = {
  id: "apr-expired-1",
  summary: "worker requests shell-exec: rm stale.tmp",
  scope: "shell-exec",
  risk: "medium",
  policy: "require-approval",
  maskedArgs: { cmd: "rm stale.tmp" },
  category: "expired",
  channel: null,
  decidedBy: null,
  decidedAt: null,
  reason: null,
  createdAt: "2026-06-28T06:00:00.000Z",
  expiresAt: "2026-06-28T07:00:00.000Z",
};

const ALL_PAYLOAD: ApprovalHistoryResponse = {
  entries: [APPROVED_ENTRY, DENIED_ENTRY, EXPIRED_ENTRY],
  pagination: { total: 3, limit: 20, offset: 0, hasMore: false },
};

const EMPTY_PAYLOAD: ApprovalHistoryResponse = {
  entries: [],
  pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
};

function makePagedEntry(id: string): ApprovalHistoryResponse["entries"][number] {
  return { ...APPROVED_ENTRY, id, summary: `paged entry ${id}` };
}

const PAGE1_PAYLOAD: ApprovalHistoryResponse = {
  entries: [makePagedEntry("apr-page1")],
  pagination: { total: 25, limit: 20, offset: 0, hasMore: true },
};

const PAGE2_PAYLOAD: ApprovalHistoryResponse = {
  entries: [makePagedEntry("apr-page2")],
  pagination: { total: 25, limit: 20, offset: 20, hasMore: false },
};

beforeEach(() => {
  mockApiMap = {
    [url("all")]: loaded(ALL_PAYLOAD),
    [url("approved")]: loaded({ entries: [APPROVED_ENTRY], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } }),
    [url("denied")]: loaded({ entries: [DENIED_ENTRY], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } }),
    [url("expired")]: loaded({ entries: [EXPIRED_ENTRY], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } }),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel() {
  return render(
    <LanguageProvider>
      <ApprovalHistoryPanel />
    </LanguageProvider>,
  );
}

describe("ApprovalHistoryPanel — settled (approved/denied/expired) audit trail", () => {
  it("renders the default 'all' view with rows from every settled category", () => {
    renderPanel();
    expect(screen.getByTestId("history-row-apr-approved-1")).toBeTruthy();
    expect(screen.getByTestId("history-row-apr-denied-1")).toBeTruthy();
    expect(screen.getByTestId("history-row-apr-expired-1")).toBeTruthy();
  });

  it("renders category badge, risk badge, policy, and channel for a row", () => {
    renderPanel();
    const row = screen.getByTestId("history-row-apr-approved-1");
    expect(row.textContent).toContain("notify");
    expect(row.textContent).toContain("terminal");
    expect(row.textContent).toContain("alperen");
    expect(screen.getByTestId("category-badge-apr-approved-1")).toBeTruthy();
    expect(screen.getByTestId("risk-badge-apr-approved-1")).toBeTruthy();
  });

  it("shows the reason line only when reason is non-empty", () => {
    renderPanel();
    expect(screen.getByTestId("history-row-apr-approved-1").textContent).toContain("looks fine");
    // DENIED_ENTRY.reason === '' and EXPIRED_ENTRY.reason === null — neither renders a reason line.
    const deniedRow = screen.getByTestId("history-row-apr-denied-1");
    const expiredRow = screen.getByTestId("history-row-apr-expired-1");
    expect(deniedRow.textContent).not.toMatch(/Reason:|Gerekçe:/);
    expect(expiredRow.textContent).not.toMatch(/Reason:|Gerekçe:/);
  });

  it("shows an awaiting-decision placeholder (not null/blank) for an unswept-expired entry", () => {
    renderPanel();
    const row = screen.getByTestId("history-row-apr-expired-1");
    expect(row.textContent).toContain("Awaiting decision");
    expect(row.textContent).not.toContain("null");
  });

  describe("filters", () => {
    it("switches to the approved-only view on filter click", () => {
      renderPanel();
      fireEvent.click(screen.getByTestId("filter-approved"));
      expect(screen.getByTestId("history-row-apr-approved-1")).toBeTruthy();
      expect(screen.queryByTestId("history-row-apr-denied-1")).toBeNull();
      expect(screen.queryByTestId("history-row-apr-expired-1")).toBeNull();
    });

    it("switches to the denied-only view on filter click", () => {
      renderPanel();
      fireEvent.click(screen.getByTestId("filter-denied"));
      expect(screen.getByTestId("history-row-apr-denied-1")).toBeTruthy();
      expect(screen.queryByTestId("history-row-apr-approved-1")).toBeNull();
    });

    it("switches to the expired-only view on filter click", () => {
      renderPanel();
      fireEvent.click(screen.getByTestId("filter-expired"));
      expect(screen.getByTestId("history-row-apr-expired-1")).toBeTruthy();
      expect(screen.queryByTestId("history-row-apr-approved-1")).toBeNull();
    });

    it("returns to the all view on filter click after narrowing", () => {
      renderPanel();
      fireEvent.click(screen.getByTestId("filter-denied"));
      fireEvent.click(screen.getByTestId("filter-all"));
      expect(screen.getByTestId("history-row-apr-approved-1")).toBeTruthy();
      expect(screen.getByTestId("history-row-apr-denied-1")).toBeTruthy();
      expect(screen.getByTestId("history-row-apr-expired-1")).toBeTruthy();
    });
  });

  describe("empty state per filter", () => {
    it("shows an empty state when the approved filter has zero entries", () => {
      mockApiMap[url("approved")] = loaded(EMPTY_PAYLOAD);
      renderPanel();
      fireEvent.click(screen.getByTestId("filter-approved"));
      expect(screen.getByText("No approvals have been granted yet.")).toBeTruthy();
      expect(screen.queryByTestId("approval-history-list")).toBeNull();
    });

    it("shows an empty state when the expired filter has zero entries", () => {
      mockApiMap[url("expired")] = loaded(EMPTY_PAYLOAD);
      renderPanel();
      fireEvent.click(screen.getByTestId("filter-expired"));
      expect(screen.getByText("No approvals have expired.")).toBeTruthy();
    });
  });

  describe("pagination", () => {
    beforeEach(() => {
      mockApiMap[url("all")] = loaded(PAGE1_PAYLOAD);
      mockApiMap[url("all", 20)] = loaded(PAGE2_PAYLOAD);
    });

    it("disables Previous on the first page and enables Next when hasMore", () => {
      renderPanel();
      expect(screen.getByTestId("pagination-prev").hasAttribute("disabled")).toBe(true);
      expect(screen.getByTestId("pagination-next").hasAttribute("disabled")).toBe(false);
    });

    it("advances to the next page and back on click", () => {
      renderPanel();
      fireEvent.click(screen.getByTestId("pagination-next"));
      expect(screen.getByTestId("history-row-apr-page2")).toBeTruthy();
      expect(screen.getByTestId("pagination-next").hasAttribute("disabled")).toBe(true);

      fireEvent.click(screen.getByTestId("pagination-prev"));
      expect(screen.getByTestId("history-row-apr-page1")).toBeTruthy();
      expect(screen.getByTestId("pagination-prev").hasAttribute("disabled")).toBe(true);
    });

    it("resets to offset 0 when switching filters", () => {
      renderPanel();
      fireEvent.click(screen.getByTestId("pagination-next"));
      expect(screen.getByTestId("history-row-apr-page2")).toBeTruthy();

      fireEvent.click(screen.getByTestId("filter-denied"));
      expect(screen.getByTestId("history-row-apr-denied-1")).toBeTruthy();

      fireEvent.click(screen.getByTestId("filter-all"));
      // Back on 'all' at offset 0 -> page1 fixture, not page2.
      expect(screen.getByTestId("history-row-apr-page1")).toBeTruthy();
    });
  });

  it("has zero decide/accept/deny controls — only the 4 filter + 2 pagination buttons exist", () => {
    mockApiMap[url("all")] = loaded(PAGE1_PAYLOAD);
    renderPanel();
    const buttons = screen.getAllByRole("button");
    const testIds = buttons.map((b) => b.getAttribute("data-testid"));
    expect(testIds.sort()).toEqual(
      [
        "filter-all",
        "filter-approved",
        "filter-denied",
        "filter-expired",
        "pagination-next",
        "pagination-prev",
      ].sort(),
    );
  });

  it("has no emoji characters in rendered output", () => {
    const { container } = renderPanel();
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/u;
    expect(emojiRegex.test(container.textContent ?? "")).toBe(false);
  });
});
