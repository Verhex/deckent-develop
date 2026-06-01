import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { LayoutDashboard, History, Brain, Menu, SlidersHorizontal, Globe, MessageCircle, Sun, Moon } from "lucide-react";
import { cn } from "../lib/utils";
import { useTheme } from "./ThemeProvider";
import { Sheet, SheetTrigger, SheetContent } from "./ui/sheet";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { DockPanel } from "./DockPanel";
import { TerminalPanel } from "./terminal/TerminalPanel.js";
import { useSSEWithStatus } from "../hooks/useSSE";
import type { SSEStatus } from "../hooks/useSSE";
import { useTranslation } from "../i18n/LanguageProvider";
import type { DashboardState } from "../types";
import type { TranslationKey } from "../i18n/en";

const navItems: ReadonlyArray<{ to: string; labelKey: TranslationKey; icon: typeof LayoutDashboard }> = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/history", labelKey: "nav.history", icon: History },
  { to: "/memory", labelKey: "nav.memory", icon: Brain },
  { to: "/config", labelKey: "nav.config", icon: SlidersHorizontal },
  { to: "/chat", labelKey: "nav.chat", icon: MessageCircle },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ to, labelKey, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-zinc-800 text-zinc-100 border-l-2 border-blue-500"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent",
            )
          }
        >
          <Icon className="h-4 w-4" />
          {t(labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}

function LanguageSwitcher() {
  const { lang, setLang } = useTranslation();
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'tr' : 'en')}
      className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-all duration-200"
      title={lang === 'en' ? 'Türkçeye geç' : 'Switch to English'}
    >
      <Globe className="h-3.5 w-3.5" />
      {lang === 'en' ? 'TR' : 'EN'}
    </button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-zinc-400 dark:text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 dark:hover:text-zinc-200 transition-all duration-200"
      aria-label="Toggle dark/light theme"
      data-testid="theme-toggle"
    >
      {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

const SSE_COLORS: Record<SSEStatus, string> = {
  connected: "bg-green-500",
  connecting: "bg-yellow-500",
  disconnected: "bg-red-500",
};

const SSE_LABEL_KEYS: Record<SSEStatus, "common.live" | "common.connecting" | "common.offline"> = {
  connected: "common.live",
  connecting: "common.connecting",
  disconnected: "common.offline",
};

function SidebarContent({ onNavigate, sseState, sseStatus }: { onNavigate?: () => void; sseState: DashboardState | null; sseStatus: SSEStatus }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mb-4 px-3">
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Deckent"
            className="h-7 w-7 shrink-0"
            style={{ imageRendering: 'pixelated' }}
          />
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight">
            deckent
          </h1>
        </div>
        <p className="text-xs text-zinc-500">{t('layout.subtitle')}</p>
      </div>
      {sseState?.sprint && (
        <div className="mb-4 px-3 flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-400">{sseState.sprint.id}</span>
          <Badge variant="info" className="text-[10px] px-1.5 py-0">
            {sseState.sprint.phase}
          </Badge>
        </div>
      )}
      <div className="mb-4 px-3 flex items-center gap-2">
        <span className="text-xs text-zinc-400">{t('layout.auditor')}:</span>
        {sseState?.auditorLastScan ? (
          <Badge variant="success" className="text-[10px]">{t('layout.active')}</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">{t('layout.inactive')}</Badge>
        )}
      </div>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto pt-4 border-t border-zinc-800 dark:border-zinc-800 space-y-2">
        <div className="flex items-center gap-2 px-3">
          <span className={`h-2 w-2 rounded-full ${SSE_COLORS[sseStatus]}`} />
          <span className="text-xs text-zinc-500">{t(SSE_LABEL_KEYS[sseStatus])}</span>
        </div>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </>
  );
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: sseState, status: sseStatus } = useSSEWithStatus("/api/events");

  // Layout strategy: responsive grid — sidebar breakpoint md+ (hidden mobile), lg+ wider sidebar
  // Dark/light theme: dark:bg-zinc-950 / dark:bg-zinc-900 — ThemeProvider controls html class

  return (
    <div className="flex h-screen bg-zinc-950 dark:bg-zinc-950">
      {/* Desktop sidebar — responsive: hidden on mobile, visible md+ breakpoint */}
      <aside className="hidden md:flex w-[240px] lg:w-[260px] flex-col border-r border-zinc-800 dark:border-zinc-800 bg-zinc-900 dark:bg-zinc-900 p-4">
        <SidebarContent sseState={sseState} sseStatus={sseStatus} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[240px] p-4">
          <SidebarContent onNavigate={() => setMobileOpen(false)} sseState={sseState} sseStatus={sseStatus} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex md:hidden items-center border-b border-zinc-800 dark:border-zinc-800 bg-zinc-900 dark:bg-zinc-900 px-4 py-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger aria-label="Toggle menu">
              <Menu className="h-5 w-5 text-zinc-400" />
            </SheetTrigger>
          </Sheet>
          <span className="ml-3 text-sm font-bold text-zinc-100">deckent</span>
        </header>

        <ScrollArea className="flex-1 p-6 pb-8">
          <Outlet />
        </ScrollArea>
      </div>

      <DockPanel>
        <TerminalPanel />
      </DockPanel>
    </div>
  );
}
