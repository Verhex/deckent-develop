/**
 * settings-debt-surface.test.tsx — Sprint 283 Task 283-002
 *
 * Verifies that:
 * 1. App.tsx has /debt route (DebtPage wired up)
 * 2. App.tsx has /settings route (SettingsPage is real, not just redirect)
 * 3. Both routes appear in nav-items.ts single source
 * 4. SettingsPage uses the real API (settings-set-roundtrip contract)
 *
 * Inspection-style: readFileSync — no DOM render needed, hermetic.
 * NOTE: vitest.dashboard.config.ts includes tests/dashboard/**. Run directly:
 *   npx vitest run src/dashboard/src/__tests__/settings-debt-surface.test.tsx
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src", "dashboard", "src");

const appSrc = () => readFileSync(join(SRC, "App.tsx"), "utf-8");
const navSrc = () => readFileSync(join(SRC, "nav-items.ts"), "utf-8");
const settingsSrc = () => readFileSync(join(SRC, "pages", "SettingsPage.tsx"), "utf-8");

describe("settings-debt-surface — route and nav wiring", () => {
  it("App.tsx has /debt route rendering DebtPage (route-render #1)", () => {
    const src = appSrc();
    expect(src).toContain('import DebtPage from "./pages/DebtPage"');
    expect(src).toContain('path="/debt"');
    expect(src).toContain('<DebtPage />');
  });

  it("App.tsx has /settings route rendering SettingsPage (route-render #2)", () => {
    const src = appSrc();
    expect(src).toContain('import SettingsPage from "./pages/SettingsPage"');
    expect(src).toContain('path="/settings"');
    expect(src).toContain('<SettingsPage />');
  });

  it("nav-items.ts contains /debt and /settings entries", () => {
    const src = navSrc();
    expect(src, "nav-items.ts must have /debt route").toContain('"/debt"');
    expect(src, "nav-items.ts must have /settings route").toContain('"/settings"');
  });

  it("SettingsPage uses useTranslation and useTheme — settings-set-roundtrip contract", () => {
    const src = settingsSrc();
    // Language persistence goes through LanguageProvider.setLang → postJson('/api/config')
    expect(src).toContain("useTranslation");
    expect(src).toContain("setLang");
    // Theme is applied via ThemeProvider.setTheme
    expect(src).toContain("useTheme");
    expect(src).toContain("setTheme");
    // No Navigate redirect — it is a real page now
    expect(src).not.toContain('Navigate to="/config"');
  });

  it("i18n keys are complete: nav.debt, settings.appearance, settings.language_label, settings.theme_label in en.ts", () => {
    const en = readFileSync(join(SRC, "i18n", "en.ts"), "utf-8");
    expect(en).toContain("'nav.debt'");
    expect(en).toContain("'settings.appearance'");
    expect(en).toContain("'settings.language_label'");
    expect(en).toContain("'settings.theme_label'");
  });

  it("tr.ts has all new settings keys translated (no missing entries)", () => {
    const tr = readFileSync(join(SRC, "i18n", "tr.ts"), "utf-8");
    expect(tr).toContain("'nav.debt'");
    expect(tr).toContain("'settings.appearance'");
    expect(tr).toContain("'settings.language_label'");
    expect(tr).toContain("'settings.theme_label'");
  });
});
