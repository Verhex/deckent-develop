// @vitest-environment happy-dom
// APR-HISTORY-DILIM fix (sprint-367 task 367-007-fix): proves the
// scope-named dashboard entry point (ApprovalHistory.tsx, a re-export of
// ApprovalHistoryPanel.tsx — see that file's header comment) renders the
// settled-approval list, filters by category, and shows an honest empty
// state with zero emoji. Full behavioral coverage (pagination, per-category
// empty states, decide-button-absence, ...) already lives in
// approval-history-panel.test.tsx (sprint-359 task 359-013) against the
// underlying component — this file does not re-assert all of that, only
// that the re-exported import path this task's scope requires is wired and
// behaves correctly.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import ApprovalHistory from "../../src/dashboard/src/components/ApprovalHistory";
import type { ApprovalHistoryResponse } from "../../src/dashboard/src/components/ApprovalHistory";

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn((url: string) => mockApiMap[url] ?? { data: null, loading: false, error: null, refetch: vi.fn() }),
}));

// LanguageProvider calls fetchJson('/api/config') directly (not through
// useApi) to resolve the persisted language — mock it hermetically so the
// suite never attempts a real network connection.
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
  ...APPROVED_ENTRY,
  id: "apr-denied-1",
  summary: "connector requests credential access",
  scope: "credential",
  risk: "critical",
  policy: "require-approval",
  maskedArgs: null,
  category: "denied",
  channel: "telegram",
  reason: "",
};

const ALL_PAYLOAD: ApprovalHistoryResponse = {
  entries: [APPROVED_ENTRY, DENIED_ENTRY],
  pagination: { total: 2, limit: 20, offset: 0, hasMore: false },
};

const EMPTY_PAYLOAD: ApprovalHistoryResponse = {
  entries: [],
  pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
};

beforeEach(() => {
  mockApiMap = {
    [url("all")]: loaded(ALL_PAYLOAD),
    [url("approved")]: loaded({
      entries: [APPROVED_ENTRY],
      pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
    }),
    [url("denied")]: loaded(EMPTY_PAYLOAD),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderView() {
  return render(
    <LanguageProvider>
      <ApprovalHistory />
    </LanguageProvider>,
  );
}

describe("ApprovalHistory (scope-named re-export of ApprovalHistoryPanel)", () => {
  it("renders the default 'all' view with rows from every settled category", () => {
    renderView();
    expect(screen.getByTestId("history-row-apr-approved-1")).toBeTruthy();
    expect(screen.getByTestId("history-row-apr-denied-1")).toBeTruthy();
  });

  it("filters to a single category (karar-tipi) on filter click", () => {
    renderView();
    fireEvent.click(screen.getByTestId("filter-approved"));
    expect(screen.getByTestId("history-row-apr-approved-1")).toBeTruthy();
    expect(screen.queryByTestId("history-row-apr-denied-1")).toBeNull();
  });

  it("shows an honest empty state for a filter with zero entries", () => {
    renderView();
    fireEvent.click(screen.getByTestId("filter-denied"));
    expect(screen.queryByTestId("approval-history-list")).toBeNull();
    expect(screen.getByText("No approvals have been denied.")).toBeTruthy();
  });

  it("has no emoji characters in rendered output", () => {
    const { container } = renderView();
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/u;
    expect(emojiRegex.test(container.textContent ?? "")).toBe(false);
  });
});
