// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import MemoryExplorer, {
  parseAdrEntries,
  filterMemoryContent,
  type AdrEntry,
} from "../../src/dashboard/src/components/MemoryExplorer";

vi.mock("../../src/dashboard/src/hooks/useApi", () => ({
  useApi: vi.fn(() => ({ data: null, loading: false, error: null, refetch: vi.fn() })),
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
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

const MEMORY_CONTENT = `# Brain Memory

## Sprint Learnings

| ID | Title | Status |
|----|-------|--------|
| adr-001 | TypeScript + ESM | accepted |
| adr-002 | Node16 Module Resolution | accepted |
| adr-073 | Routing Live Validation | accepted |

Some memory content about sprint-210 learnings and task outcomes.
Docker heartbeat fix was important.
`;

const DEBT_CONTENT = `| ID | Description | Priority | Sprint | Status |
|----|-------------|----------|--------|--------|
| --- | --- | --- | --- | --- |
| DEBT-001 | Test coverage gap | NORMAL | sprint-210 | open |
| DEBT-002 | Stale heartbeat | LOW | sprint-209 | open |
`;

// ─── parseAdrEntries ─────────────────────────────────────────────────────────

describe("parseAdrEntries", () => {
  it("extracts ADR entries from table-formatted content", () => {
    const result = parseAdrEntries(MEMORY_CONTENT);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const ids = result.map((e) => e.id);
    expect(ids.some((id) => id.includes("adr-001") || id.includes("adr-002"))).toBe(true);
  });

  it("deduplicates entries with same id", () => {
    const content = `| adr-001 | Title A | accepted |
| adr-001 | Title A | accepted |
| adr-002 | Title B | proposed |`;
    const result = parseAdrEntries(content);
    const ids = result.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("returns empty array for empty content", () => {
    expect(parseAdrEntries("")).toHaveLength(0);
    expect(parseAdrEntries("No ADR entries here.")).toHaveLength(0);
  });

  it("normalizes status to lowercase", () => {
    const content = `| ADR-010 | Commander.js | Accepted |`;
    const result = parseAdrEntries(content);
    if (result.length > 0) {
      expect(result[0].status).toBe(result[0].status.toLowerCase());
    }
  });
});

// ─── filterMemoryContent ─────────────────────────────────────────────────────

describe("filterMemoryContent", () => {
  it("returns all content when query is empty", () => {
    const result = filterMemoryContent(MEMORY_CONTENT, "");
    expect(result).toBe(MEMORY_CONTENT);
  });

  it("filters lines matching query (case-insensitive)", () => {
    const result = filterMemoryContent(MEMORY_CONTENT, "docker");
    expect(result.toLowerCase()).toContain("docker");
    expect(result).not.toContain("Sprint Learnings");
  });

  it("returns empty string when no lines match", () => {
    const result = filterMemoryContent(MEMORY_CONTENT, "ZZZNOMATCH999");
    expect(result.trim()).toBe("");
  });
});

// ─── MemoryExplorer component ─────────────────────────────────────────────────

describe("MemoryExplorer", () => {
  it("renders search tab with search input and memory content", () => {
    renderWithProviders(
      <MemoryExplorer memoryContent={MEMORY_CONTENT} debtContent={DEBT_CONTENT} />,
    );

    expect(screen.getByTestId("memory-explorer")).toBeTruthy();
    expect(screen.getByTestId("search-input")).toBeTruthy();
    expect(screen.getByTestId("memory-content")).toBeTruthy();
  });

  it("filters memory content when user types in search box", () => {
    renderWithProviders(
      <MemoryExplorer memoryContent={MEMORY_CONTENT} debtContent={DEBT_CONTENT} />,
    );

    const input = screen.getByTestId("search-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "docker" } });

    expect(input.value).toBe("docker");
    // The content container should still exist
    expect(screen.getByTestId("memory-content")).toBeTruthy();
  });

  it("shows no-results message when search has no matches", () => {
    renderWithProviders(
      <MemoryExplorer memoryContent={MEMORY_CONTENT} debtContent={DEBT_CONTENT} />,
    );

    const input = screen.getByTestId("search-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ZZZNOMATCH999" } });

    expect(screen.getByTestId("search-no-results")).toBeTruthy();
  });

  it("renders ADR tab with list when memory content has ADR entries", () => {
    renderWithProviders(
      <MemoryExplorer memoryContent={MEMORY_CONTENT} debtContent={DEBT_CONTENT} />,
    );

    const adrTab = screen.getByTestId("tab-adr");
    fireEvent.click(adrTab);

    expect(screen.getByTestId("adr-list")).toBeTruthy();
  });

  it("renders debt tab with DebtTable when debt content provided", () => {
    renderWithProviders(
      <MemoryExplorer memoryContent={MEMORY_CONTENT} debtContent={DEBT_CONTENT} />,
    );

    const debtTab = screen.getByTestId("tab-debt");
    fireEvent.click(debtTab);

    expect(screen.getByTestId("debt-table-container")).toBeTruthy();
  });

  it("shows empty state in search tab when memory content is empty", () => {
    renderWithProviders(<MemoryExplorer memoryContent="" debtContent="" />);

    // Should not crash and should not show memory-content
    expect(screen.getByTestId("memory-explorer")).toBeTruthy();
    expect(screen.queryByTestId("memory-content")).toBeNull();
  });

  it("shows empty state in ADR tab when no ADR entries in content", () => {
    renderWithProviders(
      <MemoryExplorer memoryContent="No ADR data here" debtContent="" />,
    );

    const adrTab = screen.getByTestId("tab-adr");
    fireEvent.click(adrTab);

    expect(screen.getByTestId("adr-empty")).toBeTruthy();
    expect(screen.queryByTestId("adr-list")).toBeNull();
  });

  it("clears search when X button is clicked", () => {
    renderWithProviders(
      <MemoryExplorer memoryContent={MEMORY_CONTENT} debtContent={DEBT_CONTENT} />,
    );

    const input = screen.getByTestId("search-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "docker" } });
    expect(input.value).toBe("docker");

    const clearBtn = screen.getByTestId("search-clear");
    fireEvent.click(clearBtn);
    expect(input.value).toBe("");
  });
});
