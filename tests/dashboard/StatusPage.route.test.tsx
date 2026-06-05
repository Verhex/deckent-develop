import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");

describe("dashboard/StatusPage — route wiring (189-006)", () => {
  describe("App.tsx — /status route", () => {
    const appPath = join(DASHBOARD_SRC, "App.tsx");
    let content: string;

    it("App.tsx exists", () => {
      expect(existsSync(appPath)).toBe(true);
      content = readFileSync(appPath, "utf-8");
    });

    it("imports StatusPage", () => {
      const app = readFileSync(appPath, "utf-8");
      expect(app).toContain("StatusPage");
      expect(app).toContain("./pages/StatusPage");
    });

    it("registers /status route", () => {
      const app = readFileSync(appPath, "utf-8");
      expect(app).toContain('path="/status"');
      expect(app).toContain("<StatusPage");
    });

    it("StatusPage route is inside Layout wrapper", () => {
      const app = readFileSync(appPath, "utf-8");
      // Layout wraps all child routes — /status must appear after Layout open tag
      const layoutIdx = app.indexOf("<Route element={<Layout");
      const statusIdx = app.indexOf('path="/status"');
      expect(layoutIdx).toBeGreaterThanOrEqual(0);
      expect(statusIdx).toBeGreaterThan(layoutIdx);
    });
  });

  describe("routes.tsx — ROUTES constant", () => {
    const routesPath = join(DASHBOARD_SRC, "routes.tsx");

    it("routes.tsx exists", () => {
      expect(existsSync(routesPath)).toBe(true);
    });

    it("ROUTES array contains /status entry", () => {
      const content = readFileSync(routesPath, "utf-8");
      expect(content).toContain('path: "/status"');
    });

    it("ROUTES /status entry has a label", () => {
      const content = readFileSync(routesPath, "utf-8");
      expect(content).toMatch(/path:\s*["']\/status["'][^}]+label:/);
    });

    it("exports RoutePath type covering /status", () => {
      const content = readFileSync(routesPath, "utf-8");
      expect(content).toContain("RoutePath");
      // /status must be in ROUTES for RoutePath union to include it
      expect(content).toContain('"/status"');
    });
  });

  describe("StatusPage.tsx — page component", () => {
    const statusPagePath = join(DASHBOARD_SRC, "pages", "StatusPage.tsx");

    it("StatusPage.tsx file exists", () => {
      expect(existsSync(statusPagePath)).toBe(true);
    });

    it("uses SSE hook for live updates", () => {
      const content = readFileSync(statusPagePath, "utf-8");
      expect(content).toContain("useSSE");
      expect(content).toContain("/api/events");
    });

    it("fetches /api/status as fallback", () => {
      const content = readFileSync(statusPagePath, "utf-8");
      expect(content).toContain("/api/status");
    });

    it("fetches /api/tasks for task info", () => {
      const content = readFileSync(statusPagePath, "utf-8");
      expect(content).toContain("/api/tasks");
    });

    it("uses SprintSummary component", () => {
      const content = readFileSync(statusPagePath, "utf-8");
      expect(content).toContain("SprintSummary");
    });

    it("renders a page title via i18n", () => {
      const content = readFileSync(statusPagePath, "utf-8");
      expect(content).toContain("status.title");
    });
  });

  describe("Sidebar.tsx — nav items canonical list", () => {
    const sidebarPath = join(DASHBOARD_SRC, "components", "Sidebar.tsx");

    it("Sidebar.tsx exists", () => {
      expect(existsSync(sidebarPath)).toBe(true);
    });

    it("exports navItems array including /status", () => {
      const content = readFileSync(sidebarPath, "utf-8");
      expect(content).toContain("navItems");
      expect(content).toContain('to: "/status"');
    });

    it("uses Activity icon for Status nav item", () => {
      const content = readFileSync(sidebarPath, "utf-8");
      expect(content).toContain("Activity");
    });

    it("exports SidebarNavLinks component", () => {
      const content = readFileSync(sidebarPath, "utf-8");
      expect(content).toContain("SidebarNavLinks");
      expect(content).toContain("export function SidebarNavLinks");
    });

    it("renders NavLink with active state styling", () => {
      const content = readFileSync(sidebarPath, "utf-8");
      expect(content).toContain("NavLink");
      expect(content).toContain("isActive");
      expect(content).toContain("border-gold");
    });
  });
});
