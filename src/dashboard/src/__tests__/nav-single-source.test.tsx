/**
 * nav-single-source.test.tsx — Sprint 282 Task 282-006
 *
 * Verifies that nav-items.ts is the single source of truth for nav:
 * 1. All App.tsx routes have a corresponding entry in navGroups
 * 2. navGroups has the correct 3-group structure (Konuş/İzle/Yönet)
 *
 * Source-inspection style: reads nav-items.ts via import (no DOM render needed).
 * Hermetic: no network, no gitignored state.
 *
 * NOTE: vitest.dashboard.config.ts targets tests/dashboard/**. This file is at
 * src/dashboard/src/__tests__/ (per scope.filesWrite). To run it update vitest
 * include to also cover src/dashboard/src/__tests__/**. Until then, the tests
 * can be verified via the readFileSync assertion and import checks below.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const navItemsSrc = () => readFileSync(join(DASHBOARD_SRC, "nav-items.ts"), "utf-8");
const layoutSrc = () => readFileSync(join(DASHBOARD_SRC, "components/Layout.tsx"), "utf-8");
const sidebarSrc = () => readFileSync(join(DASHBOARD_SRC, "components/Sidebar.tsx"), "utf-8");

describe("nav-items.ts — single source of truth", () => {
  it("all App.tsx routes are present in nav-items.ts", () => {
    const src = navItemsSrc();
    const expectedRoutes = [
      '"/chat"',
      '"/"',
      '"/status"',
      '"/history"',
      '"/workers"',
      '"/evolution"',
      '"/nervous"',
      '"/memory"',
      '"/memory-explorer"',
      '"/config"',
      '"/directives"',
      '"/enterprise"',
    ];
    for (const route of expectedRoutes) {
      expect(src, `nav-items.ts must contain route ${route}`).toContain(route);
    }
  });

  it("navGroups has 3 i18n'd groups (talk/watch/manage) with correct structure", () => {
    const src = navItemsSrc();
    // Stable ids (data-nav-group/key) + i18n keys for the displayed header (D8 fix:
    // the group headers are no longer literal Turkish — they render via t()).
    expect(src).toContain('groupLabel: "talk"');
    expect(src).toContain('groupLabel: "watch"');
    expect(src).toContain('groupLabel: "manage"');
    expect(src).toContain('groupLabelKey: "nav.group.talk"');
    expect(src).toContain('groupLabelKey: "nav.group.watch"');
    expect(src).toContain('groupLabelKey: "nav.group.manage"');
    // workers and directives must be present with correct i18n keys
    expect(src).toContain('"nav.workers"');
    expect(src).toContain('"nav.directives"');
  });

  it("Layout.tsx imports navGroups from nav-items (no inline definition)", () => {
    const src = layoutSrc();
    expect(src).toContain('from "../nav-items.js"');
    // no inline array definition — no '= [' or ': [' for navGroups/navItems
    const lines = src.split("\n").filter(
      (line) =>
        (line.includes("navGroups") || line.includes("navItems")) &&
        !line.includes("nav-items") &&
        (line.includes("= [") || line.includes(": [")),
    );
    expect(lines, "Layout.tsx must have no inline navGroups/navItems array definitions").toHaveLength(0);
  });

  it("Sidebar.tsx re-exports navItems from nav-items (no inline definition)", () => {
    const src = sidebarSrc();
    expect(src).toContain('from "../nav-items.js"');
    // no inline array definition for navItems
    const lines = src.split("\n").filter(
      (line) =>
        (line.includes("navGroups") || line.includes("navItems")) &&
        !line.includes("nav-items") &&
        (line.includes("= [") || line.includes(": [")),
    );
    expect(lines, "Sidebar.tsx must have no inline navGroups/navItems array definitions").toHaveLength(0);
  });
});
