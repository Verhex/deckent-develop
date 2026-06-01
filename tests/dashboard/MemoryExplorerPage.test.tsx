// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import MemoryExplorerPage from "../../src/dashboard/src/pages/MemoryExplorerPage";

// Mock useApi to avoid real HTTP calls
const mockUseApi = vi.fn();
vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: (...args: unknown[]) => mockUseApi(...args),
}));

vi.mock("../../src/dashboard/src/lib/api", () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error("no server")),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("no server"));
  // Default: return loading state
  mockUseApi.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
});

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryExplorerPage />
    </LanguageProvider>,
  );
}

const MEMORY_WITH_ADRS = `# Brain Memory

| ID | Title | Status |
|----|-------|--------|
| adr-001 | TypeScript + ESM | accepted |
| adr-002 | Node16 Module Resolution | accepted |
| adr-073 | Routing Live Validation | accepted |
| adr-055 | Hybrid Scoring Pipeline | proposed |
| adr-005 | Synchronous IO | deprecated |

Sprint learnings: Docker heartbeat fix, memory FTS5 search, debt table patterns.
`;

// ─── Test: page renders ───────────────────────────────────────────────────────

describe("MemoryExplorerPage", () => {
  it("renders page title and memory explorer section", () => {
    renderPage();

    expect(screen.getByTestId("memory-explorer-page")).toBeTruthy();
    // Title text
    expect(screen.getByText(/Memory.*ADR.*Explorer/i)).toBeTruthy();
  });

  it("renders ADR timeline card with filter when memory data has ADRs", () => {
    mockUseApi.mockReturnValue({
      data: { content: MEMORY_WITH_ADRS },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByTestId("adr-timeline-card")).toBeTruthy();
    expect(screen.getByTestId("adr-timeline")).toBeTruthy();
    expect(screen.getByTestId("timeline-status-filter")).toBeTruthy();

    // Should show ADR entries in the timeline
    const timelineEntries = screen.queryAllByTestId(/^timeline-entry-/);
    expect(timelineEntries.length).toBeGreaterThan(0);
  });

  it("shows empty state in timeline when memory returns no ADR entries", () => {
    mockUseApi.mockReturnValue({
      data: { content: "No ADR data here. Just sprint learnings." },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByTestId("adr-timeline-empty")).toBeTruthy();
  });

  it("filters ADR timeline by status when dropdown changes", () => {
    mockUseApi.mockReturnValue({
      data: { content: MEMORY_WITH_ADRS },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    const filter = screen.getByTestId("timeline-status-filter") as HTMLSelectElement;
    expect(filter.value).toBe("all");

    // Filter to only proposed
    fireEvent.change(filter, { target: { value: "proposed" } });
    expect(filter.value).toBe("proposed");

    // With "proposed" filter — only adr-055 should show
    const entries = screen.queryAllByTestId(/^timeline-entry-/);
    expect(entries.length).toBe(1);
    expect(entries[0].getAttribute("data-testid")).toContain("adr-055");
  });

  it("shows debt-fts-note footer with FTS5 and debt references", () => {
    renderPage();
    expect(screen.getByTestId("debt-fts-note")).toBeTruthy();
    const note = screen.getByTestId("debt-fts-note");
    expect(note.textContent).toMatch(/debt/i);
    expect(note.textContent).toMatch(/fts/i);
  });

  it("shows filtered-empty message when no ADRs match selected status", () => {
    mockUseApi.mockReturnValue({
      data: { content: MEMORY_WITH_ADRS },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    const filter = screen.getByTestId("timeline-status-filter");
    fireEvent.change(filter, { target: { value: "rejected" } });

    expect(screen.getByTestId("adr-timeline-filtered-empty")).toBeTruthy();
  });
});
