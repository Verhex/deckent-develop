import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const layout = () => readFileSync(join(DASHBOARD_SRC, "components/Layout.tsx"), "utf-8");

describe("Layout-ux: F7-003 UI/UX pass", () => {
  it("render: Layout exports with Outlet, ScrollArea, and flex h-screen structure", () => {
    const content = layout();
    expect(content).toContain("export function Layout");
    expect(content).toContain("Outlet");
    expect(content).toContain("ScrollArea");
    expect(content).toContain("flex h-screen");
  });

  it("dark tek-kimlik: toggle/Sun/Moon söküldü (Alperen 2026-07-31)", () => {
    const content = layout();
    expect(content).not.toContain("useTheme");
    expect(content).not.toContain('data-testid="theme-toggle"');
  });

  it("responsive: uses md: and lg: breakpoints for sidebar and mobile layout", () => {
    const content = layout();
    expect(content).toContain("hidden md:flex");
    expect(content).toContain("flex md:hidden");
    expect(content).toContain("lg:");
  });

  it("layout: SidebarContent with NavLinks and footer LanguageSwitcher (dark tek-kimlik)", () => {
    const content = layout();
    expect(content).toContain("SidebarContent");
    expect(content).toContain("NavLinks");
    expect(content).toContain("<LanguageSwitcher />");
  });
});
