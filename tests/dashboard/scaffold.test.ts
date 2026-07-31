import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_DIR = join(process.cwd(), "src", "dashboard");

describe("dashboard scaffold", () => {
  const requiredFiles = [
    "package.json",
    "vite.config.ts",
    "tsconfig.json",
    "tsconfig.node.json",
    "index.html",
    "src/main.tsx",
    "src/App.tsx",
    "src/index.css",
    "src/lib/utils.ts",
    "src/lib/api.ts",
    "src/hooks/useSSE.ts",
    "src/hooks/useApi.ts",
    "src/types/index.ts",
    "src/components/ui/button.tsx",
    "src/components/ui/card.tsx",
    "src/pages/DashboardPage.tsx",
    "src/pages/SettingsPage.tsx",
    "src/pages/HistoryPage.tsx",
    "src/pages/MemoryPage.tsx",
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(existsSync(join(DASHBOARD_DIR, file))).toBe(true);
    });
  }

  it("package.json has correct name and type", () => {
    const pkg = JSON.parse(readFileSync(join(DASHBOARD_DIR, "package.json"), "utf-8"));
    expect(pkg.name).toBe("deckent-dashboard");
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe("module");
  });

  it("package.json has required dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(DASHBOARD_DIR, "package.json"), "utf-8"));
    expect(pkg.dependencies).toHaveProperty("react");
    expect(pkg.dependencies).toHaveProperty("react-dom");
    expect(pkg.dependencies).toHaveProperty("react-router-dom");
    expect(pkg.dependencies).toHaveProperty("recharts");
    expect(pkg.dependencies).toHaveProperty("lucide-react");
    expect(pkg.dependencies).toHaveProperty("class-variance-authority");
    expect(pkg.dependencies).toHaveProperty("clsx");
    expect(pkg.dependencies).toHaveProperty("tailwind-merge");
  });

  it("package.json has required devDependencies", () => {
    const pkg = JSON.parse(readFileSync(join(DASHBOARD_DIR, "package.json"), "utf-8"));
    expect(pkg.devDependencies).toHaveProperty("vite");
    expect(pkg.devDependencies).toHaveProperty("@vitejs/plugin-react");
    expect(pkg.devDependencies).toHaveProperty("tailwindcss");
    expect(pkg.devDependencies).toHaveProperty("@tailwindcss/vite");
    expect(pkg.devDependencies).toHaveProperty("typescript");
    expect(pkg.devDependencies).toHaveProperty("@types/react");
    expect(pkg.devDependencies).toHaveProperty("@types/react-dom");
  });

  it("package.json has correct scripts", () => {
    const pkg = JSON.parse(readFileSync(join(DASHBOARD_DIR, "package.json"), "utf-8"));
    expect(pkg.scripts.dev).toBe("vite");
    expect(pkg.scripts.build).toBe("tsc -b && vite build");
    expect(pkg.scripts.preview).toBe("vite preview");
  });

  it("tsconfig.json has correct compiler options", () => {
    const tsconfig = JSON.parse(readFileSync(join(DASHBOARD_DIR, "tsconfig.json"), "utf-8"));
    expect(tsconfig.compilerOptions.target).toBe("ES2022");
    expect(tsconfig.compilerOptions.module).toBe("ESNext");
    expect(tsconfig.compilerOptions.moduleResolution).toBe("bundler");
    expect(tsconfig.compilerOptions.jsx).toBe("react-jsx");
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.lib).toEqual(["ES2022", "DOM", "DOM.Iterable"]);
    expect(tsconfig.compilerOptions.paths).toEqual({ "@/*": ["./src/*"] });
  });

  it("vite.config.ts contains proxy and port configuration", () => {
    const viteConfig = readFileSync(join(DASHBOARD_DIR, "vite.config.ts"), "utf-8");
    expect(viteConfig).toContain("port: 5173");
    expect(viteConfig).toContain('"/api"');
    expect(viteConfig).toContain("http://localhost:3100");
    expect(viteConfig).toContain("@vitejs/plugin-react");
    expect(viteConfig).toContain("@tailwindcss/vite");
  });

  it("index.html has root div and module script", () => {
    const html = readFileSync(join(DASHBOARD_DIR, "index.html"), "utf-8");
    expect(html).toContain('<div id="root">');
    expect(html).toContain('src="/src/main.tsx"');
    expect(html).toContain('type="module"');
  });

  it("App.tsx uses Layout wrapper and routes", () => {
    const app = readFileSync(join(DASHBOARD_DIR, "src/App.tsx"), "utf-8");
    expect(app).toContain("Layout");
    expect(app).not.toContain("ThemeProvider"); // dark tek-kimlik 2026-07-31
    expect(app).toContain("BrowserRouter");
    expect(app).toContain('path="/"');
    expect(app).toContain('path="/settings"');
    expect(app).toContain('path="/history"');
    expect(app).toContain('path="/memory"');
  });

  it("index.css imports tailwindcss", () => {
    const css = readFileSync(join(DASHBOARD_DIR, "src/index.css"), "utf-8");
    expect(css).toContain('@import "tailwindcss"');
    expect(css).toContain("@theme");
  });

  it("node_modules exists (npm install ran)", () => {
    // CI installs dashboard deps in a separate step — skip gracefully if not present yet
    const hasModules = existsSync(join(DASHBOARD_DIR, "node_modules"));
    if (!hasModules && process.env.CI) return;
    expect(hasModules).toBe(true);
  });

  it("useSSE hook has auto-reconnect logic", () => {
    const hook = readFileSync(join(DASHBOARD_DIR, "src/hooks/useSSE.ts"), "utf-8");
    expect(hook).toContain("EventSource");
    expect(hook).toContain("3000");
    expect(hook).toContain("/api/events");
  });

  it("useApi hook has loading/error/data states", () => {
    const hook = readFileSync(join(DASHBOARD_DIR, "src/hooks/useApi.ts"), "utf-8");
    expect(hook).toContain("loading");
    expect(hook).toContain("error");
    expect(hook).toContain("data");
    expect(hook).toContain("refetch");
  });

  it("button component has all variants", () => {
    const button = readFileSync(join(DASHBOARD_DIR, "src/components/ui/button.tsx"), "utf-8");
    expect(button).toContain("default");
    expect(button).toContain("destructive");
    expect(button).toContain("outline");
    expect(button).toContain("ghost");
  });

  it("card component exports all sub-components", () => {
    const card = readFileSync(join(DASHBOARD_DIR, "src/components/ui/card.tsx"), "utf-8");
    expect(card).toContain("Card");
    expect(card).toContain("CardHeader");
    expect(card).toContain("CardTitle");
    expect(card).toContain("CardContent");
    expect(card).toContain("CardDescription");
  });
});
