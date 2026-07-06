// @vitest-environment happy-dom
// Task 377-002 — DASH-LAZY-LOAD. App.tsx used to eager-import all 20 page
// components (Recharts + xterm-adjacent pages included) into a single
// startup bundle. This converts the non-critical-first-paint pages to
// React.lazy()+Suspense so they ship as separate chunks, fetched on first
// navigation.
//
// Pattern: source-inspection for App.tsx (react-router-dom resolves from
// src/dashboard/node_modules, not workspace root — a direct <App /> render
// hits a second React instance; see route-sidebar-wire.test.tsx /
// AppShell.test.tsx / layout.test.ts precedent) plus a real React render of
// an isolated lazy()+Suspense fixture (same mechanism App.tsx uses) proving
// the SkeletonCard fallback renders first and the real page content mounts
// once the dynamic import resolves.
import React, { Suspense, lazy } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../src/dashboard/src/i18n/LanguageProvider";
import { SkeletonCard } from "../../src/dashboard/src/components/Skeleton";
import * as api from "../../src/dashboard/src/lib/api";

const APP_PATH = join(process.cwd(), "src", "dashboard", "src", "App.tsx");
const readApp = () => readFileSync(APP_PATH, "utf-8");

afterEach(() => cleanup());

// ─── (a) App.tsx wiring — source inspection ────────────────────────────────

describe("App.tsx — route-based code splitting (377-002)", () => {
  it("imports lazy and Suspense from react", () => {
    const src = readApp();
    expect(src).toMatch(/import\s+\{[^}]*\blazy\b[^}]*\}\s+from\s+["']react["']/);
    expect(src).toMatch(/import\s+\{[^}]*\bSuspense\b[^}]*\}\s+from\s+["']react["']/);
  });

  const LAZY_PAGES = [
    "HistoryPage",
    "MemoryPage",
    "ConfigPage",
    "StatusPage",
    "AutonomousPage",
    "DocsHealthPage",
    "MissionsPage",
    "LoginPage",
    "CallbackPage",
  ];

  it.each(LAZY_PAGES)("%s is lazy-loaded via dynamic import", (page) => {
    const src = readApp();
    expect(src).toMatch(new RegExp(`const ${page} = lazy\\(\\(\\) => import\\(["']\\./pages/${page}["']\\)\\)`));
  });

  it.each(LAZY_PAGES)("%s's route element is wrapped in Suspense (via the Lazy helper)", (page) => {
    const src = readApp();
    const routeMatch = src.match(new RegExp(`element=\\{<Lazy><${page}\\s*/></Lazy>\\}`));
    expect(routeMatch, `${page}'s route must render through <Lazy>`).toBeTruthy();
  });

  // "/" (Dashboard) and ChatPage stay on the critical first-paint path —
  // untouched eager static imports, no regression.
  it('"/" (DashboardWithObservability) and ChatPage remain eager (not lazy)', () => {
    const src = readApp();
    expect(src).toMatch(/from\s+["']\.\/pages\/DashboardPage["']/);
    expect(src).toMatch(/from\s+["']\.\/pages\/ChatPage["']/);
    expect(src).not.toMatch(/const DashboardPage = lazy\(/);
    expect(src).not.toMatch(/const ChatPage = lazy\(/);
    expect(src).toContain('path="/" element={<DashboardWithObservability />}');
    expect(src).toContain('path="/chat" element={<ChatPage />}');
  });

  // Evolution/Nervous/Enterprise/MemoryExplorer/Workers/Directives/KpiTrend/
  // Settings/Debt stay eager too — their App.tsx static-import style is
  // asserted by route-sidebar-wire.test.tsx / workers-directives-pages.test.tsx /
  // kpi-dashboard.test.tsx / settings-debt-surface.test.tsx; converting them
  // to lazy would break those existing, still-required-green suites.
  const PROTECTED_EAGER_PAGES = [
    "EvolutionPage",
    "NervousPage",
    "EnterprisePage",
    "MemoryExplorerPage",
    "WorkersPage",
    "DirectivesPage",
    "KpiTrendPage",
    "SettingsPage",
    "DebtPage",
  ];

  it.each(PROTECTED_EAGER_PAGES)(
    "%s remains a static top-level import (protected by other route-wiring suites)",
    (page) => {
      const src = readApp();
      expect(src).toMatch(new RegExp(`from\\s+["']\\./pages/${page}["']`));
      expect(src).not.toMatch(new RegExp(`const ${page} = lazy\\(`));
    },
  );

  it("route tree paths are unchanged (same 20 routes, same order)", () => {
    const src = readApp();
    const paths = [
      "/", "/settings", "/debt", "/history", "/memory", "/config", "/chat",
      "/status", "/evolution", "/nervous", "/autonomous", "/enterprise",
      "/memory-explorer", "/workers", "/directives", "/docs-health",
      "/missions", "/kpi", "/login", "/auth/callback",
    ];
    for (const p of paths) {
      expect(src, `path="${p}" must still be registered`).toContain(`path="${p}"`);
    }
  });

  it("defines a Lazy wrapper using the SkeletonCard fallback (no new spinner invented)", () => {
    const src = readApp();
    expect(src).toContain("from \"./components/Skeleton\"");
    expect(src).toMatch(/function Lazy\(/);
    expect(src).toContain("<Suspense fallback={<SkeletonCard />}>");
  });
});

// ─── (b) Render-tree proof — Suspense fallback then resolved content ───────

// Mirrors App.tsx's own `const X = lazy(() => import("./pages/X"))` +
// `<Suspense fallback={<SkeletonCard />}>` mechanism against one of the
// ACTUAL lazy-converted page modules (MissionsPage — one of the 9 pages
// App.tsx now lazy-loads), without rendering <App /> itself
// (react-router-dom resolution — see file banner).
const LazyMissionsPage = lazy(() => import("../../src/dashboard/src/pages/MissionsPage"));

afterEach(() => {
  vi.restoreAllMocks();
});

function renderLazyRoute() {
  return render(
    <LanguageProvider>
      <Suspense fallback={<SkeletonCard />}>
        <LazyMissionsPage />
      </Suspense>
    </LanguageProvider>,
  );
}

describe("Lazy route render — fallback then resolved page", () => {
  it("renders the SkeletonCard fallback before the dynamic import resolves", () => {
    vi.spyOn(api, "fetchJson").mockImplementation(() => new Promise(() => {}));
    renderLazyRoute();
    // The dynamic import for an already-loaded ESM module resolves on a
    // microtask, but React still commits the Suspense fallback for the
    // very first synchronous render pass.
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("mounts the real page content once the lazy import resolves", async () => {
    vi.spyOn(api, "fetchJson").mockImplementation((url: string) =>
      url === "/api/missions" ? Promise.resolve({ missions: [] }) : Promise.resolve({}),
    );
    renderLazyRoute();
    await waitFor(() => {
      expect(screen.getByTestId("missions-page")).toBeTruthy();
    });
  });
});
