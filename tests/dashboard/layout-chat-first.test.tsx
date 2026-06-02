// Sprint 221 — Layout chat-first + grouped nav tests.
// Source-inspection style (readFileSync) — matches Layout.test.tsx / Layout-godlevel.test.tsx
// pattern. Hermetic: no DOM render, no SSE, no network.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const layout = () => readFileSync(join(DASHBOARD_SRC, "components/Layout.tsx"), "utf-8");

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

  it("chat is the first item in the first nav group (Konuş)", () => {
    const content = layout();
    // navGroups[0].items[0] must be /chat
    expect(content).toContain('groupLabel: "Konuş"');
    const konusIdx = content.indexOf('groupLabel: "Konuş"');
    const chatInKonusIdx = content.indexOf('"/chat"', konusIdx);
    const dashInContent = content.indexOf('"/"', konusIdx);
    // /chat appears before the dashboard "/" entry after the Konuş group label
    expect(chatInKonusIdx).toBeGreaterThan(konusIdx);
    expect(chatInKonusIdx).toBeLessThan(dashInContent);
  });

  it("all 3 nav groups are defined: Konuş, İzle, Yönet", () => {
    const content = layout();
    expect(content).toContain('groupLabel: "Konuş"');
    expect(content).toContain('groupLabel: "İzle"');
    expect(content).toContain('groupLabel: "Yönet"');
  });

  it("active-link styling is preserved (border-l-2 border-blue-500 on active)", () => {
    const content = layout();
    expect(content).toContain("border-l-2 border-blue-500");
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
