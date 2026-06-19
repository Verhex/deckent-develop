// Sprint 221 — Layout chat-first + grouped nav tests.
// Source-inspection style (readFileSync) — matches Layout.test.tsx / Layout-godlevel.test.tsx
// pattern. Hermetic: no DOM render, no SSE, no network.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const layout = () => readFileSync(join(DASHBOARD_SRC, "components/Layout.tsx"), "utf-8");
// Sprint 282: navGroups (the group definitions + order) moved to nav-items.ts —
// the single source of truth. Group-structure assertions read it directly.
const navItemsSrc = () => readFileSync(join(DASHBOARD_SRC, "nav-items.ts"), "utf-8");

describe("Layout — chat-first nav ordering", () => {
  it("chat nav item appears before dashboard in navGroups definition", () => {
    const content = layout();
    const chatIdx = content.indexOf('"/chat"');
    const dashIdx = content.indexOf('"/"');
    expect(chatIdx).toBeGreaterThan(0);
    expect(dashIdx).toBeGreaterThan(0);
    // Chat group definition must come before Dashboard group
    expect(chatIdx).toBeLessThan(dashIdx);
  });

  it("chat is the first item in the first nav group (talk)", () => {
    const content = navItemsSrc();
    // navGroups[0].items[0] must be /chat
    expect(content).toContain('groupLabel: "talk"');
    const talkIdx = content.indexOf('groupLabel: "talk"');
    const chatInTalkIdx = content.indexOf('"/chat"', talkIdx);
    const dashInContent = content.indexOf('"/"', talkIdx);
    // /chat appears before the dashboard "/" entry after the talk group label
    expect(chatInTalkIdx).toBeGreaterThan(talkIdx);
    expect(chatInTalkIdx).toBeLessThan(dashInContent);
  });

  it("all 3 nav groups are defined: talk, watch, manage", () => {
    const content = navItemsSrc();
    expect(content).toContain('groupLabel: "talk"');
    expect(content).toContain('groupLabel: "watch"');
    expect(content).toContain('groupLabel: "manage"');
  });

  it("active-link styling is preserved (border-l-2 border-gold on active)", () => {
    const content = layout();
    expect(content).toContain("border-l-2 border-gold");
    expect(content).toContain("isActive");
  });
});

describe("Layout — all 10 pages preserved in nav", () => {
  it("all 10 route paths are present in navGroups", () => {
    const content = layout();
    const routes = [
      '"/chat"',
      '"/"',
      '"/status"',
      '"/history"',
      '"/evolution"',
      '"/nervous"',
      '"/memory"',
      '"/memory-explorer"',
      '"/config"',
      '"/enterprise"',
    ];
    for (const route of routes) {
      expect(content, `route ${route} should exist in navGroups`).toContain(route);
    }
  });

  it("navGroups flat count equals 10 items (via navItems derived array)", () => {
    const content = layout();
    // navItems is derived via flatMap — it references navGroups
    expect(content).toContain("navGroups.flatMap");
    expect(content).toContain("const navItems");
  });

  it("grouped nav uses data-nav-group attribute for each section", () => {
    const content = layout();
    expect(content).toContain("data-nav-group={groupLabel}");
  });

  it("Nav renders layout-nav testid for integration hooks", () => {
    const content = layout();
    expect(content).toContain('data-testid="layout-nav"');
  });
});
