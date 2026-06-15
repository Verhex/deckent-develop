// @vitest-environment happy-dom
// Task 218-003 — verifies that the 4 hollow Sprint 215 pages
// (Evolution, Nervous, Enterprise, MemoryExplorer) are wired into both
// App.tsx (route entries) and Sidebar.tsx (canonical navItems list).
//
// Pattern: source-inspection for files that import react-router-dom (matches
// the StatusPage.route.test.tsx / AppShell.test.tsx / Layout-*.test.tsx
// precedent — workspace-root vitest cannot fully resolve react-router-dom
// from src/dashboard/node_modules without breaking React identity) plus a
// real React render of a navItems-driven nav (no NavLink dependency) in
// jsdom to assert the rendered DOM contains every new entry.
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";

// navItems is plain data — no react-router-dom evaluation happens at import
// time for that named export, because Sidebar.tsx's top-level NavLink import
// is only evaluated when SidebarNavLinks is rendered.
import { navItems } from "../../src/dashboard/src/components/Sidebar";
import { en } from "../../src/dashboard/src/i18n/en";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const APP_PATH = join(DASHBOARD_SRC, "App.tsx");
const SIDEBAR_PATH = join(DASHBOARD_SRC, "components", "Sidebar.tsx");

const readApp = () => readFileSync(APP_PATH, "utf-8");
const readSidebar = () => readFileSync(SIDEBAR_PATH, "utf-8");

afterEach(() => cleanup());

describe("App.tsx — 4 new routes registered", () => {
  it("imports EvolutionPage, NervousPage, EnterprisePage, MemoryExplorerPage", () => {
    const src = readApp();
    expect(src).toMatch(/from\s+["']\.\/pages\/EvolutionPage["']/);
    expect(src).toMatch(/from\s+["']\.\/pages\/NervousPage["']/);
    expect(src).toMatch(/from\s+["']\.\/pages\/EnterprisePage["']/);
    expect(src).toMatch(/from\s+["']\.\/pages\/MemoryExplorerPage["']/);
  });

  it("registers /evolution, /nervous, /enterprise, /memory-explorer route paths", () => {
    const src = readApp();
    expect(src).toContain('path="/evolution"');
    expect(src).toContain('path="/nervous"');
    expect(src).toContain('path="/enterprise"');
    expect(src).toContain('path="/memory-explorer"');
  });

  it("each new route renders its page element", () => {
    const src = readApp();
    expect(src).toContain("<EvolutionPage");
    expect(src).toContain("<NervousPage");
    expect(src).toContain("<EnterprisePage");
    expect(src).toContain("<MemoryExplorerPage");
  });

  it("preserves existing 7 routes (no regression)", () => {
    const src = readApp();
    expect(src).toContain('path="/"');
    expect(src).toContain('path="/settings"');
    expect(src).toContain('path="/history"');
    expect(src).toContain('path="/memory"');
    expect(src).toContain('path="/config"');
    expect(src).toContain('path="/chat"');
    expect(src).toContain('path="/status"');
    expect(src).toContain("<Route element={<Layout");
  });

  it("new routes live inside Layout wrapper (after the Layout open tag)", () => {
    const src = readApp();
    const layoutIdx = src.indexOf("<Route element={<Layout");
    const layoutClose = src.indexOf("</Route>", layoutIdx);
    expect(layoutIdx).toBeGreaterThanOrEqual(0);
    expect(layoutClose).toBeGreaterThan(layoutIdx);
    for (const path of ['path="/evolution"', 'path="/nervous"', 'path="/enterprise"', 'path="/memory-explorer"']) {
      const idx = src.indexOf(path);
      expect(idx, `${path} must exist`).toBeGreaterThan(layoutIdx);
      expect(idx, `${path} must be inside Layout`).toBeLessThan(layoutClose);
    }
  });
});

describe("Sidebar.tsx — navItems canonical list", () => {
  it("exports navItems with the 4 new entries", () => {
    const paths = navItems.map((item) => item.to);
    expect(paths).toContain("/evolution");
    expect(paths).toContain("/nervous");
    expect(paths).toContain("/enterprise");
    expect(paths).toContain("/memory-explorer");
  });

  it("preserves the 6 existing nav entries", () => {
    const paths = navItems.map((item) => item.to);
    expect(paths).toContain("/");
    expect(paths).toContain("/history");
    expect(paths).toContain("/memory");
    expect(paths).toContain("/config");
    expect(paths).toContain("/chat");
    expect(paths).toContain("/status");
  });

  it("source file mentions all 4 new route paths (kanit grep target)", () => {
    const src = readSidebar();
    expect(src).toContain("/evolution");
    expect(src).toContain("/nervous");
    expect(src).toContain("/enterprise");
    expect(src).toContain("/memory-explorer");
  });

  it("each new nav item has a displayable label and an icon", () => {
    const newEntries = navItems.filter((item) =>
      ["/evolution", "/nervous", "/enterprise", "/memory-explorer"].includes(item.to),
    );
    expect(newEntries).toHaveLength(4);
    for (const entry of newEntries) {
      const displayed = entry.label ?? entry.labelKey;
      expect(displayed, `entry ${entry.to} must have a displayable label`).toBeTruthy();
      expect(typeof displayed === "string" && displayed.length > 0).toBe(true);
      expect(entry.icon).toBeDefined();
    }
  });

  it("SidebarNavLinks render block uses the label-or-labelKey pattern", () => {
    const src = readSidebar();
    // Rendering must prefer the literal `label` over the i18n `t(labelKey)` so
    // entries without a TranslationKey still show real text.
    expect(src).toMatch(/label\s*\?\?\s*t\(labelKey\)/);
    expect(src).toContain("NavLink");
    expect(src).toContain("isActive");
  });
});

// jsdom render of navItems data via a plain anchor list — exercises the real
// React render pipeline (proves the data flows through React) without coupling
// to react-router-dom's NavLink, which only resolves from
// src/dashboard/node_modules in this monorepo layout.
describe("navItems — jsdom render of 4 new pages", () => {
  function NavItemsList() {
    return React.createElement(
      "nav",
      { "data-testid": "nav-from-navitems" },
      navItems.map((item) =>
        React.createElement(
          "a",
          { key: item.to, href: item.to },
          // Display via the real i18n dictionary (labelKey → English label), with
          // the literal `label` + raw key as fallbacks — mirrors `label ?? t(labelKey)`.
          item.label ?? (en as Record<string, string>)[item.labelKey] ?? item.labelKey,
        ),
      ),
    );
  }

  it("renders an anchor for each navItem in jsdom", () => {
    render(React.createElement(NavItemsList));
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(navItems.length);
    expect(links.length).toBeGreaterThanOrEqual(10);
  });

  it("renders the 4 new pages with the correct href targets", () => {
    render(React.createElement(NavItemsList));
    const hrefs = screen.getAllByRole("link").map((el) => el.getAttribute("href"));
    expect(hrefs).toContain("/evolution");
    expect(hrefs).toContain("/nervous");
    expect(hrefs).toContain("/enterprise");
    expect(hrefs).toContain("/memory-explorer");
  });

  it("renders the 4 new pages with displayable label text", () => {
    render(React.createElement(NavItemsList));
    expect(screen.getByText(/^Evolution$/i)).toBeTruthy();
    expect(screen.getByText(/^Nervous$/i)).toBeTruthy();
    expect(screen.getByText(/^Enterprise$/i)).toBeTruthy();
    expect(screen.getByText(/^Memory Explorer$/i)).toBeTruthy();
  });

  it("preserves the existing 6 nav targets in the rendered DOM (no regression)", () => {
    render(React.createElement(NavItemsList));
    const hrefs = screen.getAllByRole("link").map((el) => el.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/history");
    expect(hrefs).toContain("/memory");
    expect(hrefs).toContain("/config");
    expect(hrefs).toContain("/chat");
    expect(hrefs).toContain("/status");
  });
});
