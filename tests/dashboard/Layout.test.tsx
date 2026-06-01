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

  it("theme toggle: integrates useTheme and ThemeToggle component", () => {
    const content = layout();
    expect(content).toContain("useTheme");
    expect(content).toContain("ThemeToggle");
    expect(content).toContain('setTheme(theme === "dark" ? "light" : "dark")');
    expect(content).toContain('data-testid="theme-toggle"');
  });

  it("responsive: uses md: breakpoints for desktop/mobile layout", () => {
    const content = layout();
    expect(content).toContain("hidden md:flex");
    expect(content).toContain("flex md:hidden");
    expect(content).toContain("responsive:");
  });

  it("sidebar: SidebarContent with NavLinks and ThemeToggle in bottom section", () => {
    const content = layout();
    expect(content).toContain("SidebarContent");
    expect(content).toContain("NavLinks");
    expect(content).toContain("<ThemeToggle />");
    expect(content).toContain("<LanguageSwitcher />");
  });

  it("dark mode: has dark: variant classes for light/dark theme consistency", () => {
    const content = layout();
    expect(content).toContain("dark:");
    expect(content).toContain("dark:bg-zinc-950");
    expect(content).toContain("dark:bg-zinc-900");
    expect(content).toContain("dark:border-zinc-800");
  });

  it("theme toggle: imports Sun and Moon icons for dark/light indicator", () => {
    const content = layout();
    expect(content).toContain("Sun");
    expect(content).toContain("Moon");
    expect(content).toContain("lucide-react");
  });
});
