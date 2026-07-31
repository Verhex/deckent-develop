import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const layout = () => readFileSync(join(DASHBOARD_SRC, "components/Layout.tsx"), "utf-8");

describe("Layout.tsx UI/UX polish", () => {
  it("renders: exports Layout component and core structure", () => {
    const content = layout();
    expect(content).toContain("export function Layout");
    expect(content).toContain("Outlet");
    expect(content).toContain("ScrollArea");
  });

  it("dark tek-kimlik: theme toggle söküldü (Alperen 2026-07-31)", () => {
    const content = layout();
    expect(content).not.toContain("useTheme");
    expect(content).not.toContain('data-testid="theme-toggle"');
  });

  it("responsive: uses md: breakpoints for desktop/mobile layout", () => {
    const content = layout();
    expect(content).toContain("hidden md:flex");
    expect(content).toContain("flex md:hidden");
    expect(content).toContain("responsive:");
  });


  it("dark mode: has dark: variant classes for light/dark theme consistency", () => {
    const content = layout();
    expect(content).toContain("dark:");
    expect(content).toContain("dark:bg-zinc-950");
    expect(content).toContain("dark:bg-zinc-900");
    expect(content).toContain("dark:border-zinc-800");
  });

});
