import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Dark TEK-KİMLİK tutarlılık kontratı (Alperen 2026-07-31, DESIGN-SYSTEM-001 +
 * ADR-G-033). Eski hali silinmiş lib/theme.ts'in (ölü dark/light token ikizi)
 * sözleşmesiydi — o dünya söküldü: dashboard'un light yolu YOKTUR, tema authority
 * design/tokens → @theme zinciridir.
 */
const DASH = join(process.cwd(), "src", "dashboard");
const css = () => readFileSync(join(DASH, "src", "index.css"), "utf-8");

describe("dashboard dark tek-kimlik tutarlılığı", () => {
  it("ölü token-ikizi lib/theme.ts yok", () => {
    expect(existsSync(join(DASH, "src", "lib", "theme.ts"))).toBe(false);
  });

  it("ThemeProvider ve light yolu söküldü", () => {
    expect(existsSync(join(DASH, "src", "components", "ThemeProvider.tsx"))).toBe(false);
    const settings = readFileSync(join(DASH, "src", "pages", "SettingsPage.tsx"), "utf-8");
    expect(settings).not.toContain("settings-theme-light");
  });

  it("dark: utilities deterministik always-on (OS-tercihinden bağımsız)", () => {
    expect(css()).toContain("@custom-variant dark");
    const html = readFileSync(join(DASH, "index.html"), "utf-8");
    expect(html).toContain('<html lang="en" class="dark">');
  });

  it("koyu zemin/mürekkep tek kaynaktan: @theme background/foreground", () => {
    const c = css();
    expect(c).toContain("--color-background: #09090b");
    expect(c).toContain("--color-foreground: #fafafa");
    expect(c).toContain("color-scheme: dark");
  });

  it("tema i18n anahtarları kaldırıldı (en + tr)", () => {
    for (const f of ["en.ts", "tr.ts"]) {
      const i18n = readFileSync(join(DASH, "src", "i18n", f), "utf-8");
      expect(i18n).not.toContain("settings.theme_label");
    }
  });
});
