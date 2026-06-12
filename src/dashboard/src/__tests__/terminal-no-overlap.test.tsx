/**
 * terminal-no-overlap.test.tsx — Sprint 283 Task 283-001
 *
 * Verifies that the collapsed terminal dock bar does not overlap the desktop sidebar.
 * The fix: Layout.tsx aside carries `relative z-50` (above DockPanel's z-40) and
 * `pb-10` (40px bottom padding, clearing the 32px COLLAPSED_HEIGHT).
 *
 * Source-inspection style: reads source files via readFileSync (no DOM render needed).
 * Hermetic: no network, no gitignored state.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const layoutSrc = () => readFileSync(join(DASHBOARD_SRC, "components/Layout.tsx"), "utf-8");
const dockPanelSrc = () => readFileSync(join(DASHBOARD_SRC, "components/DockPanel.tsx"), "utf-8");

describe("terminal-no-overlap — collapsed bar ↔ sidebar z-index/layout", () => {
  it("sidebar aside has z-50 — stacking above z-40 DockPanel", () => {
    const src = layoutSrc();
    // The aside[data-testid="layout-sidebar"] must carry z-50 so it renders above the dock bar
    expect(src, "Layout.tsx aside must contain z-50 to appear above z-40 DockPanel").toContain("z-50");
    // Confirm the aside also has the relative positioning that establishes stacking context
    expect(src, "Layout.tsx aside must contain 'relative' for z-index to apply").toContain("relative z-50");
  });

  it("DockPanel root has z-40 — confirmed lower than sidebar z-50", () => {
    const src = dockPanelSrc();
    // DockPanel fixed bar uses z-40; sidebar z-50 exceeds it → no visual overlap
    expect(src, "DockPanel must contain z-40 as its stacking level").toContain("z-40");
    expect(src, "DockPanel must be fixed bottom-0").toContain("fixed bottom-0");
  });

  it("sidebar has pb-10 bottom padding clearing the 32px collapsed dock bar", () => {
    const src = layoutSrc();
    // COLLAPSED_HEIGHT = 32px; pb-10 = 40px > 32px → bottom nav items never hidden
    expect(src, "Layout.tsx aside must contain pb-10 (40px) to clear 32px collapsed dock bar").toContain("pb-10");
  });
});
