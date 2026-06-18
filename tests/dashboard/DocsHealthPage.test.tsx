import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import DocsHealthPage from "../../src/dashboard/src/pages/DocsHealthPage";
import * as api from "../../src/dashboard/src/lib/api";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const fixture = {
  rows: [
    { doc_rank: 0, state: "DRIFT", priority_score: 5, path: "DECKENT.md" },
    { doc_rank: 1, state: "CRITICAL_STALE", priority_score: 100, path: "docs/adr/001.md" },
  ],
  heatmap: [
    { bucket: "0", state: "DRIFT", count: 1 },
    { bucket: "1-10", state: "CRITICAL_STALE", count: 1 },
  ],
  generatedAt: "2026-06-18T00:00:00Z",
};

function renderPage() {
  return render(
    <LanguageProvider>
      <DocsHealthPage />
    </LanguageProvider>,
  );
}

describe("DocsHealthPage", () => {
  it("renders the doc table from /api/docs/health", async () => {
    vi.spyOn(api, "fetchJson").mockResolvedValue(fixture as never);
    renderPage();
    await waitFor(() => expect(screen.getByText("DECKENT.md")).toBeTruthy());
    expect(screen.getByText("docs/adr/001.md")).toBeTruthy();
  });

  it("filters the table when a heatmap cell is clicked", async () => {
    vi.spyOn(api, "fetchJson").mockResolvedValue(fixture as never);
    renderPage();
    await waitFor(() => expect(screen.getByText("DECKENT.md")).toBeTruthy());
    fireEvent.click(screen.getByTestId("cell-1-10-CRITICAL_STALE"));
    await waitFor(() => expect(screen.queryByText("DECKENT.md")).toBeNull());
    expect(screen.getByText("docs/adr/001.md")).toBeTruthy();
  });
});
