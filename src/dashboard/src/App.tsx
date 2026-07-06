import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { AuthProvider } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { UnauthorizedBanner } from "./components/UnauthorizedBanner";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import DebtPage from "./pages/DebtPage";
import HistoryPage from "./pages/HistoryPage";
import MemoryPage from "./pages/MemoryPage";
import ConfigPage from "./pages/ConfigPage";
import ChatPage from "./pages/ChatPage";
import StatusPage from "./pages/StatusPage";
import EvolutionPage from "./pages/EvolutionPage";
import NervousPage from "./pages/NervousPage";
import AutonomousPage from "./pages/AutonomousPage";
import EnterprisePage from "./pages/EnterprisePage";
import MemoryExplorerPage from "./pages/MemoryExplorerPage";
import WorkersPage from "./pages/WorkersPage";
import DirectivesPage from "./pages/DirectivesPage";
import DocsHealthPage from "./pages/DocsHealthPage";
import MissionsPage from "./pages/MissionsPage";
import LoginPage from "./pages/LoginPage";
import CallbackPage from "./pages/CallbackPage";
import KpiTrendPage from "./pages/KpiTrendPage";
import { LimitsCard } from "./components/LimitsCard";
import { EvaluateHealthCard } from "./components/EvaluateHealthCard";

// DASH-MOUNT-CARDS (374-003): LimitsCard (366-005) and EvaluateHealthCard
// (370-007) were written but never mounted anywhere. DashboardPage.tsx itself
// is out of this task's write scope, so the mount happens here — wrapping the
// existing "/" route (already the primary, always-reachable nav destination)
// instead of adding a new nav entry. Additive, below the dashboard's own
// content; Layout.tsx's <main className="grid ... gap-6"> already spaces
// Outlet's direct children, so no extra layout CSS is needed here.
function DashboardWithObservability() {
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
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <UnauthorizedBanner />
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<DashboardWithObservability />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/debt" element={<DebtPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/memory" element={<MemoryPage />} />
                <Route path="/config" element={<ConfigPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/status" element={<StatusPage />} />
                <Route path="/evolution" element={<EvolutionPage />} />
                <Route path="/nervous" element={<NervousPage />} />
                <Route path="/autonomous" element={<AutonomousPage />} />
                <Route path="/enterprise" element={<EnterprisePage />} />
                <Route path="/memory-explorer" element={<MemoryExplorerPage />} />
                <Route path="/workers" element={<WorkersPage />} />
                <Route path="/directives" element={<DirectivesPage />} />
                <Route path="/docs-health" element={<DocsHealthPage />} />
                <Route path="/missions" element={<MissionsPage />} />
                <Route path="/kpi" element={<KpiTrendPage />} />
              </Route>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/callback" element={<CallbackPage />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
