import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageProvider";
import MissionsPage from "./MissionsPage";
import * as api from "../lib/api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// MissionView fixture factory
function makeMission(overrides: Partial<{
  id: string;
  renderAs: "checklist" | "goal";
  status: "pending" | "active" | "completed" | "failed" | "cancelled";
  title: string;
  done: number;
  total: number;
}> = {}) {
  const {
    id = "m-001",
    renderAs = "checklist",
    status = "active",
    title = "Test Mission",
    done = 3,
    total = 5,
  } = overrides;
  return {
    id,
    renderAs,
    status,
    title,
    progress: { done, total },
    deliverTo: null,
    lastResult: null,
    items: [],
  };
}

function renderPage() {
  return render(
    <LanguageProvider>
      <MissionsPage />
    </LanguageProvider>,
  );
}

describe("MissionsPage", () => {
  it("renders render_as badge and progress for each MissionView", async () => {
    const missions = [
      makeMission({ id: "m-001", renderAs: "checklist", status: "active", title: "Import contacts", done: 8, total: 20 }),
      makeMission({ id: "m-002", renderAs: "goal", status: "completed", title: "Reach inbox zero", done: 5, total: 5 }),
    ];

    vi.spyOn(api, "fetchJson").mockResolvedValue({ missions } as never);

    renderPage();

    // Mission cards appear
    await waitFor(() => expect(screen.getByTestId("missions-page")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("mission-card-m-001")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("mission-card-m-002")).toBeTruthy());

    // render_as badges with correct testid (render_as values)
    expect(screen.getByTestId("render-as-badge-checklist")).toBeTruthy();
    expect(screen.getByTestId("render-as-badge-goal")).toBeTruthy();

    // Mission titles rendered
    expect(screen.getByText("Import contacts")).toBeTruthy();
    expect(screen.getByText("Reach inbox zero")).toBeTruthy();

    // Progress: "8 / 20" and "5 / 5"
    const progressEls = screen.getAllByTestId("mission-progress");
    expect(progressEls).toHaveLength(2);
    expect(progressEls[0]?.textContent).toContain("8");
    expect(progressEls[0]?.textContent).toContain("20");
    expect(progressEls[1]?.textContent).toContain("5");
  });

  it("renders status badges with mission status text", async () => {
    const missions = [
      makeMission({ id: "m-pending", renderAs: "checklist", status: "pending", title: "Pending Task" }),
      makeMission({ id: "m-failed", renderAs: "goal", status: "failed", title: "Failed Task" }),
    ];

    vi.spyOn(api, "fetchJson").mockResolvedValue({ missions } as never);

    renderPage();

    await waitFor(() => expect(screen.getByTestId("mission-status-m-pending")).toBeTruthy());
    expect(screen.getByTestId("mission-status-m-pending").textContent).toContain("pending");
    expect(screen.getByTestId("mission-status-m-failed").textContent).toContain("failed");
  });

  it("renders empty state when missions list is empty", async () => {
    vi.spyOn(api, "fetchJson").mockResolvedValue({ missions: [] } as never);

    renderPage();

    // Empty state appears (EmptyState component renders the title text)
    await waitFor(() => expect(screen.getByText("No missions")).toBeTruthy());

    // missions-list should NOT be present
    expect(screen.queryByTestId("missions-list")).toBeNull();
  });
});
