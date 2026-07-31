// God-level Layout shell tests (Sprint 218 task 218-007).
// Source-inspection style — matches Layout.test.tsx / Layout-ux.test.tsx pattern.
// This avoids the React 18/19 mismatch noted in AppShell.test.tsx and stays hermetic
// (no DOM render, no SSE mock, no network) — every test reads the .tsx file content.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const layout = () => readFileSync(join(DASHBOARD_SRC, "components/Layout.tsx"), "utf-8");

describe("Layout — god-level shell structure", () => {
  it("kanıt: grep grid|responsive|loading|header|sidebar|theme returns ≥3 matching lines", () => {
    const content = layout();
    const keywords = /grid|responsive|loading|header|sidebar|theme/gi;
    const matchingLines = content
      .split("\n")
      .filter((line) => keywords.test(line));
    // Reset regex lastIndex side-effects from the //g flag
    keywords.lastIndex = 0;
    expect(matchingLines.length).toBeGreaterThanOrEqual(3);
  });

  it("renders god-level shell wrapper with sidebar + content grid testids", () => {
    const content = layout();
    expect(content).toContain('data-testid="layout-shell"');
    expect(content).toContain('data-testid="layout-sidebar"');
    expect(content).toContain('data-testid="layout-content-grid"');
  });

  it("content area uses an explicit CSS grid (not a vertically frozen skeleton stack)", () => {
    const content = layout();
    // Inner main wrapped with grid utility for intuitive vertical rhythm
    expect(content).toMatch(/grid grid-cols-1/);
    // Outlet rendered inside <main role="main">
    expect(content).toContain("Outlet");
    expect(content).toMatch(/role=["']main["']/);
  });
});

describe("Layout — responsive breakpoints", () => {
  it("desktop header banner is md+ only with hidden md:flex", () => {
    const content = layout();
    // Desktop banner exists and uses md+ breakpoint
    expect(content).toContain('data-testid="layout-desktop-header"');
    expect(content).toContain("hidden md:flex");
  });

  it("mobile hamburger header remains visible on small screens via flex md:hidden", () => {
    const content = layout();
    expect(content).toContain("flex md:hidden");
    expect(content).toContain("Menu");
  });

  it("sidebar width expands at lg: breakpoint for wider desktop", () => {
    const content = layout();
    expect(content).toMatch(/lg:w-\[260px\]/);
  });
});

describe("Layout — meaningful loading-state (not skeleton-freeze)", () => {
  it("exposes a dedicated layout-loading-state with role=status", () => {
    const content = layout();
    expect(content).toContain('data-testid="layout-loading-state"');
    expect(content).toMatch(/role=["']status["']/);
    expect(content).toMatch(/aria-live=["']polite["']/);
  });

  it("loading-state is gated on SSE connecting + no data (not a permanent skeleton)", () => {
    const content = layout();
    // The gating expression must reference both connecting and null data
    expect(content).toMatch(/sseStatus\s*===\s*["']connecting["']/);
    expect(content).toMatch(/sseState\s*===\s*null/);
    // Conditional render — branded loading OR Outlet, not both forever
    expect(content).toContain("isInitialLoading");
    expect(content).toContain("LayoutLoadingState");
  });

  it("loading-state respects prefers-reduced-motion via motion-safe:", () => {
    const content = layout();
    // motion-safe: variant guards the pulse animation
    expect(content).toMatch(/motion-safe:animate-pulse/);
  });

  it("loading-state surfaces brand + i18n connecting copy (not just a spinner)", () => {
    const content = layout();
    // Branded label + i18n keys for connecting + subtitle
    expect(content).toContain("deckent");
    expect(content).toContain("common.connecting");
    expect(content).toContain("layout.subtitle");
  });
});

describe("Layout — navigation hierarchy + semantic landmarks", () => {
  it("preserves existing SidebarContent + NavLinks + LanguageSwitcher composition (dark tek-kimlik: ThemeToggle yok)", () => {
    const content = layout();
    expect(content).toContain("SidebarContent");
    expect(content).toContain("NavLinks");
    expect(content).toContain("<LanguageSwitcher />");
  });

  it("adds semantic landmarks (role=banner header, role=main content, aria-labels)", () => {
    const content = layout();
    expect(content).toMatch(/role=["']banner["']/);
    expect(content).toMatch(/role=["']main["']/);
    expect(content).toContain('aria-label="Primary navigation"');
    expect(content).toContain('aria-label="Main content"');
  });

  it("desktop header surfaces sprint id + phase badge for top-level context", () => {
    const content = layout();
    // Reads sprint id and phase from SSE state to give intuitive top-bar hierarchy
    expect(content).toMatch(/sseState\?\.sprint\?\.id/);
    expect(content).toMatch(/sseState\.sprint\.phase/);
    expect(content).toContain("Badge");
  });
});

describe("Layout — theme + dark mode tokens preserved", () => {
  it("dark/light tokens remain consistent (dark:bg-zinc-950, dark:bg-zinc-900, dark:border-zinc-800)", () => {
    const content = layout();
    expect(content).toContain("dark:bg-zinc-950");
    expect(content).toContain("dark:bg-zinc-900");
    expect(content).toContain("dark:border-zinc-800");
  });

  it("dark tek-kimlik: theme-toggle yüzeyden kalktı (Alperen 2026-07-31)", () => {
    const content = layout();
    expect(content).not.toContain("useTheme");
    expect(content).not.toContain('data-testid="theme-toggle"');
  });
});
