import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { AuthProvider } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage"; // redirects to /config
import HistoryPage from "./pages/HistoryPage";
import MemoryPage from "./pages/MemoryPage";
import ConfigPage from "./pages/ConfigPage";
import ChatPage from "./pages/ChatPage";
import StatusPage from "./pages/StatusPage";
import EvolutionPage from "./pages/EvolutionPage";
import NervousPage from "./pages/NervousPage";
import EnterprisePage from "./pages/EnterprisePage";
import MemoryExplorerPage from "./pages/MemoryExplorerPage";
import WorkersPage from "./pages/WorkersPage";
import DirectivesPage from "./pages/DirectivesPage";
import LoginPage from "./pages/LoginPage";
import CallbackPage from "./pages/CallbackPage";

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/memory" element={<MemoryPage />} />
                <Route path="/config" element={<ConfigPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/status" element={<StatusPage />} />
                <Route path="/evolution" element={<EvolutionPage />} />
                <Route path="/nervous" element={<NervousPage />} />
                <Route path="/enterprise" element={<EnterprisePage />} />
                <Route path="/memory-explorer" element={<MemoryExplorerPage />} />
                <Route path="/workers" element={<WorkersPage />} />
                <Route path="/directives" element={<DirectivesPage />} />
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
