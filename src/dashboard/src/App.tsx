import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { AuthProvider } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { UnauthorizedBanner } from "./components/UnauthorizedBanner";
import { SkeletonCard } from "./components/Skeleton";
// Eager: "/" (Dashboard) + ChatPage are the critical-first-paint routes
// (DASH-LAZY-LOAD, 377-002). Evolution/Nervous/Enterprise/MemoryExplorer/
// Workers/Directives/KpiTrend/Settings/Debt also stay eager here — their
// App.tsx import style is asserted via static `from "./pages/X"` checks in
// route-sidebar-wire.test.tsx, workers-directives-pages.test.tsx,
// kpi-dashboard.test.tsx and settings-debt-surface.test.tsx, and none of
// the nine pull in recharts (the one heavy chart dep lives behind
// HistoryPage's SprintChart, which IS lazy below) — so keeping them eager
// costs near-zero bundle weight while preserving those suites'
// source-inspection assertions.
import DashboardPage from "./pages/DashboardPage";
import ChatPage from "./pages/ChatPage";
import EvolutionPage from "./pages/EvolutionPage";
import NervousPage from "./pages/NervousPage";
import EnterprisePage from "./pages/EnterprisePage";
import MemoryExplorerPage from "./pages/MemoryExplorerPage";
import WorkersPage from "./pages/WorkersPage";
import DirectivesPage from "./pages/DirectivesPage";
import KpiTrendPage from "./pages/KpiTrendPage";
import SettingsPage from "./pages/SettingsPage";
import DebtPage from "./pages/DebtPage";
import { LimitsCard } from "./components/LimitsCard";
import { EvaluateHealthCard } from "./components/EvaluateHealthCard";

// Lazy: route-based code splitting for the remaining pages — each ships in
// its own chunk, fetched on first navigation instead of the initial bundle.
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const MemoryPage = lazy(() => import("./pages/MemoryPage"));
const ConfigPage = lazy(() => import("./pages/ConfigPage"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const AutonomousPage = lazy(() => import("./pages/AutonomousPage"));
const DocsHealthPage = lazy(() => import("./pages/DocsHealthPage"));
const MissionsPage = lazy(() => import("./pages/MissionsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const CallbackPage = lazy(() => import("./pages/CallbackPage"));

// Suspense-fallback reuses the existing SkeletonCard loading pattern (see
// ConfigPage/HistoryPage/EvolutionPage's own `if (loading) return
// <SkeletonCard />` gates) instead of inventing a new spinner.
function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SkeletonCard />}>{children}</Suspense>;
}

// DESK-B2-DASHBOARD-BRIDGE (392-008): `window.deckentDesktop` is only present
// when the dashboard is loaded inside the DESK-1 Electron shell (typed via the
// ambient hand-mirror at src/dashboard/src/types/desktop-global.d.ts — SSOT:
// src/desktop/src/shared/desktop-api.ts, kept in sync by
// scripts/lint-desktop-api-sync.mjs). Computed once at module scope: the
// preload's contextBridge exposure happens before the renderer's own scripts
// run, so this is stable for the lifetime of the page.
const isDesktop = typeof window !== "undefined" && window.deckentDesktop?.isDesktop === true;

// DASH-MOUNT-CARDS (374-003): LimitsCard (366-005) and EvaluateHealthCard
// (370-007) were written but never mounted anywhere. DashboardPage.tsx itself
// is out of this task's write scope, so the mount happens here — wrapping the
// existing "/" route (already the primary, always-reachable nav destination)
// instead of adding a new nav entry. Additive, below the dashboard's own
// content; Layout.tsx's <main className="grid ... gap-6"> already spaces
// Outlet's direct children, so no extra layout CSS is needed here.
//
// DESK-B2-DASHBOARD-BRIDGE (392-008): ADR-G-033 relocates interactive chat to
// the Desktop app — "/" is not a meaningful Desktop landing page, so inside
// Desktop this component redirects straight to "/chat" instead of rendering
// the observability dashboard. The browser path (isDesktop === false) is
// untouched — same DashboardPage + cards render as before.
function DashboardWithObservability() {
  if (isDesktop) {
    return <Navigate to="/chat" replace />;
  }
  return (
    <>
      <DashboardPage />
      <div
        data-testid="observability-cards-row"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <LimitsCard />
        <EvaluateHealthCard />
      </div>
    </>
  );
}

function App() {
  return (
    <LanguageProvider>
        <AuthProvider>
          <UnauthorizedBanner />
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<DashboardWithObservability />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/debt" element={<DebtPage />} />
                <Route path="/history" element={<Lazy><HistoryPage /></Lazy>} />
                <Route path="/memory" element={<Lazy><MemoryPage /></Lazy>} />
                <Route path="/config" element={<Lazy><ConfigPage /></Lazy>} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/status" element={<Lazy><StatusPage /></Lazy>} />
                <Route path="/evolution" element={<EvolutionPage />} />
                <Route path="/nervous" element={<NervousPage />} />
                <Route path="/autonomous" element={<Lazy><AutonomousPage /></Lazy>} />
                <Route path="/enterprise" element={<EnterprisePage />} />
                <Route path="/memory-explorer" element={<MemoryExplorerPage />} />
                <Route path="/workers" element={<WorkersPage />} />
                <Route path="/directives" element={<DirectivesPage />} />
                <Route path="/docs-health" element={<Lazy><DocsHealthPage /></Lazy>} />
                <Route path="/missions" element={<Lazy><MissionsPage /></Lazy>} />
                <Route path="/kpi" element={<KpiTrendPage />} />
              </Route>
              <Route path="/login" element={<Lazy><LoginPage /></Lazy>} />
              <Route path="/auth/callback" element={<Lazy><CallbackPage /></Lazy>} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
