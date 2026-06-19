import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LanguageProvider, useTranslation } from "./i18n/LanguageProvider";
import MissionsPage from "./pages/MissionsPage";
import { navGroups } from "./nav-items";
import * as api from "./lib/api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");

// ── Source inspection helpers ────────────────────────────────────────────────

describe("App.tsx — /missions route wire", () => {
  it("App.tsx declares /missions route with MissionsPage", () => {
    const src = readFileSync(join(DASHBOARD_SRC, "App.tsx"), "utf-8");
    expect(src, 'App.tsx must contain path="/missions"').toContain('path="/missions"');
    expect(src, "App.tsx must import MissionsPage").toContain("MissionsPage");
  });
});

// ── nav-items structural check ───────────────────────────────────────────────

describe("nav-items — Missions entry", () => {
  it("navGroups contains a /missions item with labelKey nav.missions", () => {
    const allItems = navGroups.flatMap((g) => g.items);
    const missionsItem = allItems.find((item) => item.to === "/missions");
    expect(missionsItem, "/missions item missing from navGroups").toBeTruthy();
    expect(missionsItem?.labelKey).toBe("nav.missions");
  });
});

// ── Real render: MissionsPage component mounts (the page wired to /missions) ──

describe("/missions route — real render", () => {
  it("MissionsPage (wired to /missions in App.tsx) renders correctly", async () => {
    vi.spyOn(api, "fetchJson").mockImplementation((url: string) => {
      if (url === "/api/config") return Promise.resolve({});
      if (url === "/api/missions") return Promise.resolve({ missions: [] });
      return Promise.resolve({});
    });

    render(
      <LanguageProvider>
        <MissionsPage />
      </LanguageProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("missions-page")).toBeTruthy(),
    );
    // Empty state visible — confirms the page component mounted correctly
    await waitFor(() => expect(screen.getByText("No missions")).toBeTruthy());
  });
});

// ── Real render: nav label translates to "Missions" ───────────────────────────

function NavLabelSmokeTest() {
  const { t } = useTranslation();
  const allItems = navGroups.flatMap((g) => g.items);
  const missionsItem = allItems.find((item) => item.to === "/missions");
  if (!missionsItem) return <span data-testid="missions-nav-missing">missing</span>;
  const label = missionsItem.label ?? t(missionsItem.labelKey);
  return (
    <span data-testid="missions-nav-label">{label}</span>
  );
}

describe("nav Missions label — real render", () => {
  it("nav Missions item renders translated label 'Missions'", async () => {
    vi.spyOn(api, "fetchJson").mockResolvedValue({} as never);

    render(
      <LanguageProvider>
        <NavLabelSmokeTest />
      </LanguageProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("missions-nav-label")).toBeTruthy(),
    );
    expect(screen.getByTestId("missions-nav-label").textContent).toBe("Missions");
  });
});
