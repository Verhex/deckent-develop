// Task 219-009 — RENDER-based test that the dashboard nav exposes ALL 10
// pages. This is the kalıcı-fix for the "kullanıcı 5 sayfa gördü" bug:
// kaynak-string grep tests (the prior Sprint 189 pattern) passed even when
// the rendered DOM was missing entries. Here we render the canonical
// navItems export from Sidebar.tsx through a real React render and assert
// against the DOM tree.
//
// Why plain <a> instead of <SidebarNavLinks />:
// Sidebar.tsx top-imports react-router-dom's NavLink, and react-router-dom
// only resolves from src/dashboard/node_modules (not workspace root).
// vitest.dashboard.config.ts has aliases for react/react-dom but not
// react-router-dom — so a direct SidebarNavLinks render fails module
// resolution. Importing the plain `navItems` data export evaluates only
// the lucide icons (resolvable from workspace root) and gives us the same
// canonical surface to assert against. This is the same pattern used by
// tests/dashboard/route-sidebar-wire.test.tsx (Sprint 218).
//
// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { navItems } from "../../src/dashboard/src/components/Sidebar";

afterEach(() => cleanup());

// Minimal navItems-driven nav — exercises React render and produces a real
// DOM tree we can assert against. NOT a mock of the component: the data
// flowing through is the canonical navItems export.
function NavRenderHarness() {
  return React.createElement(
    "nav",
    { "data-testid": "nav-render-harness" },
    navItems.map((item) =>
      React.createElement(
        "a",
        { key: item.to, href: item.to, "data-testid": `nav-link-${item.to}` },
        item.label ?? item.labelKey,
      ),
    ),
  );
}

describe("Dashboard nav — render-based assertion of 10 pages", () => {
  it("renders all 14 nav links into the DOM (real React render, not source grep)", () => {
    // 10 (Sprint 219) + /workers + /directives (Sprint 269 Task 269-002)
    render(React.createElement(NavRenderHarness));
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(14);
  });

  it("renders Evolution / Nervous / Enterprise / Memory Explorer entries (Sprint 215 god-level pages)", () => {
    render(React.createElement(NavRenderHarness));
    const hrefs = screen.getAllByRole("link").map((el) => el.getAttribute("href"));
    expect(hrefs).toContain("/evolution");
    expect(hrefs).toContain("/nervous");
    expect(hrefs).toContain("/enterprise");
    expect(hrefs).toContain("/memory-explorer");
    expect(screen.getByText(/^Evolution$/)).toBeTruthy();
    expect(screen.getByText(/^Nervous$/)).toBeTruthy();
    expect(screen.getByText(/^Enterprise$/)).toBeTruthy();
    expect(screen.getByText(/^Memory Explorer$/)).toBeTruthy();
  });

  it("preserves the 6 existing nav entries (no regression on /, /history, /memory, /config, /chat, /status)", () => {
    render(React.createElement(NavRenderHarness));
    const hrefs = screen.getAllByRole("link").map((el) => el.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/history");
    expect(hrefs).toContain("/memory");
    expect(hrefs).toContain("/config");
    expect(hrefs).toContain("/chat");
    expect(hrefs).toContain("/status");
  });

  it("Sidebar.tsx is the SINGLE canonical source: navItems is exported, has exactly 14 unique routes", () => {
    // Single-source claim: exported as a named ReadonlyArray<NavItem>.
    // 10 (Sprint 219) + /workers + /directives (Sprint 269 Task 269-002).
    expect(Array.isArray(navItems)).toBe(true);
    expect(navItems).toHaveLength(14);

    // No duplicate `to` keys — proves there is no accidental fork inside
    // Sidebar.tsx itself.
    const routes = navItems.map((item) => item.to);
    const uniqueRoutes = new Set(routes);
    expect(uniqueRoutes.size).toBe(routes.length);
  });

  it("each nav item has an icon component and a displayable label or labelKey", () => {
    for (const item of navItems) {
      // icon must be a component reference (function / forwardRef object).
      expect(item.icon).toBeDefined();
      // Either a literal label string or a translation key must be present.
      const displayed = item.label ?? item.labelKey;
      expect(typeof displayed).toBe("string");
      expect((displayed as string).length).toBeGreaterThan(0);
    }
  });
});
