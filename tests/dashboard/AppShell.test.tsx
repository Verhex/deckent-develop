// @vitest-environment happy-dom
// Tests follow the source-inspection pattern established in Layout.test.tsx —
// avoids React 19/18 mismatch issues when rendering dashboard components in workspace-root vitest.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMPONENT_PATH = join(
  process.cwd(),
  "src",
  "dashboard",
  "src",
  "components",
  "AppShell.tsx",
);
const src = () => readFileSync(COMPONENT_PATH, "utf-8");

describe("AppShell — render", () => {
  it("exports AppShell component function", () => {
    const content = src();
    expect(content).toContain("export function AppShell");
    expect(content).toContain("AppShellProps");
  });

  it("renders structural zones with data-testid attributes", () => {
    const content = src();
    expect(content).toContain('data-testid="app-shell"');
    expect(content).toContain('data-testid="app-shell-sidebar"');
    expect(content).toContain('data-testid="app-shell-header"');
    expect(content).toContain('data-testid="app-shell-main"');
    expect(content).toContain('data-testid="app-shell-nav"');
  });

  it("renders children inside main zone and supports headerContent slot", () => {
    const content = src();
    // children prop is used inside main element
    expect(content).toContain("{children}");
    // headerContent slot is rendered inside header
    expect(content).toContain("headerContent");
  });
});

describe("AppShell — theme toggle", () => {
  it("integrates useTheme hook for dark/light control", () => {
    const content = src();
    expect(content).toContain("useTheme");
    expect(content).toContain('theme === "dark" ? "light" : "dark"');
  });

  it("has theme toggle buttons with testId attributes", () => {
    const content = src();
    // ThemeToggleButton receives testId prop which is forwarded to data-testid
    expect(content).toContain('testId="app-shell-theme-toggle"');
    expect(content).toContain('testId="app-shell-theme-toggle-mobile"');
    expect(content).toContain("data-testid={testId}");
  });

  it("exposes data-theme attribute on shell root for CSS targeting", () => {
    const content = src();
    expect(content).toContain("data-theme={theme}");
  });
});

describe("AppShell — responsive breakpoints", () => {
  it("applies responsive CSS grid for sidebar breakpoint layout", () => {
    const content = src();
    // Shell uses grid layout
    expect(content).toContain("grid");
    // Responsive breakpoint: single-col mobile → 2-col md+
    expect(content).toContain("grid-cols-1");
    expect(content).toContain("md:grid-cols-");
    expect(content).toContain("lg:grid-cols-");
  });

  it("hides sidebar on mobile via hidden/md:flex responsive classes", () => {
    const content = src();
    expect(content).toContain("hidden md:flex");
  });

  it("applies dark/light theme tokens consistently across zones", () => {
    const content = src();
    // Multiple dark: token classes — ensures consistency
    const darkMatches = (content.match(/dark:/g) ?? []).length;
    expect(darkMatches).toBeGreaterThanOrEqual(4);
  });
});

describe("AppShell — navigation", () => {
  it("imports navItems from Sidebar for navigation hierarchy", () => {
    const content = src();
    expect(content).toContain("navItems");
    expect(content).toContain("Sidebar");
  });

  it("renders NavLink for each nav item with active class logic", () => {
    const content = src();
    expect(content).toContain("NavLink");
    expect(content).toContain("isActive");
    // Active state styling with blue accent border
    expect(content).toContain("border-gold");
  });

  it("uses useTranslation for i18n nav labels", () => {
    const content = src();
    expect(content).toContain("useTranslation");
    expect(content).toContain("labelKey");
  });
});
