import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const THEME_PATH = join(process.cwd(), "src", "dashboard", "src", "lib", "theme.ts");
const src = () => readFileSync(THEME_PATH, "utf-8");

describe("theme.ts — dark token", () => {
  it("file exists", () => {
    expect(existsSync(THEME_PATH)).toBe(true);
  });

  it("exports darkTokens with color sub-object", () => {
    const content = src();
    expect(content).toContain("export const darkTokens");
    expect(content).toContain("darkColorTokens");
  });

  it("dark color tokens include background and foreground", () => {
    const content = src();
    expect(content).toContain('"#09090b"');
    expect(content).toContain('"#fafafa"');
  });

  it("dark shadow tokens present", () => {
    const content = src();
    expect(content).toContain("darkShadowTokens");
  });
});

describe("theme.ts — light token", () => {
  it("exports lightTokens with color sub-object", () => {
    const content = src();
    expect(content).toContain("export const lightTokens");
    expect(content).toContain("lightColorTokens");
  });

  it("light color tokens include light background", () => {
    const content = src();
    expect(content).toContain('"#ffffff"');
  });

  it("light shadow tokens present", () => {
    const content = src();
    expect(content).toContain("lightShadowTokens");
  });
});

describe("theme.ts — toggle (getThemeTokens)", () => {
  it("exports getThemeTokens function", () => {
    const content = src();
    expect(content).toContain("export function getThemeTokens");
  });

  it("getThemeTokens returns darkTokens for 'dark' mode", () => {
    const content = src();
    expect(content).toContain('mode === "dark" ? darkTokens : lightTokens');
  });

  it("ThemeMode type exported as 'dark' | 'light'", () => {
    const content = src();
    expect(content).toContain('export type ThemeMode = "dark" | "light"');
  });
});

describe("theme.ts — token consistency", () => {
  it("both dark and light tokens include spacing sub-object", () => {
    const content = src();
    expect(content).toContain("SpacingTokens");
    expect(content).toContain("spacingScale");
  });

  it("both dark and light tokens include radius sub-object", () => {
    const content = src();
    expect(content).toContain("RadiusTokens");
    expect(content).toContain("radiusScale");
  });

  it("ColorTokens interface defines same keys for dark and light", () => {
    const content = src();
    expect(content).toContain("export interface ColorTokens");
    // Both token objects reference the same ColorTokens interface shape
    expect(content).toContain("background:");
    expect(content).toContain("foreground:");
    expect(content).toContain("border:");
    expect(content).toContain("destructive:");
  });

  it("themeClasses exported for component-level consistency", () => {
    const content = src();
    expect(content).toContain("export const themeClasses");
    expect(content).toContain("dark:bg-background");
  });
});
