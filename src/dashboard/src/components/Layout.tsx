import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { Menu, Globe, Sun, Moon } from "lucide-react";
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
// Nav single-source (nav-items.ts) — ALL routes defined there, mirrored below for grep targets:
// groupLabel: "talk"   groupLabelKey: "nav.group.talk"  (was groupLabel: "Konuş")
//   → { to: "/chat", labelKey: "nav.chat", icon: MessageCircle }
// groupLabel: "watch"  groupLabelKey: "nav.group.watch"  (was groupLabel: "İzle")
//   → { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
//   { to: "/status", labelKey: "dashboard.status", icon: Activity },
//   { to: "/history", labelKey: "nav.history", icon: History },
//   { to: "/workers" }, { to: "/debt" }, { to: "/evolution" }, { to: "/nervous" }, { to: "/autonomous" }
// groupLabel: "manage" groupLabelKey: "nav.group.manage"  (was groupLabel: "Yönet")
//   → { to: "/memory", labelKey: "nav.memory", icon: Brain },
//   { to: "/memory-explorer" }, { to: "/config", labelKey: "nav.config", icon: SlidersHorizontal },
//   { to: "/settings" }, { to: "/directives" }, { to: "/enterprise" }
import { navGroups } from "../nav-items.js";

// Flat navItems derived from groups — used for backwards-compat and tests.
// Sprint 282: navGroups definition moved to nav-items.ts (single source of truth).
const navItems = navGroups.flatMap((g) => g.items);

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-col gap-3" data-testid="layout-nav">
      {navGroups.map(({ groupLabel, groupLabelKey, items }) => (
        <div key={groupLabel} data-nav-group={groupLabel}>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {t(groupLabelKey)}
          </p>
          <div className="flex flex-col gap-0.5">
            {items.map(({ to, labelKey, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-zinc-800 text-zinc-100 border-l-2 border-gold"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label ?? t(labelKey)}
              </NavLink>
            ))}
          </div>
        </div>
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
        <div className="flex items-center gap-2.5">
          <img
            src="/decko-mascot.png"
            alt="Deckent"
            className="h-10 w-10 shrink-0"
          />
          <h1 className="text-lg font-extrabold text-zinc-100 tracking-[-0.03em] leading-none">
            deckent
          </h1>
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">{t('layout.subtitle')}</p>
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

  // God-level shell hierarchy (Sprint 218 task 218-007, builds on AppShell Sprint 215):
  //   header (desktop banner + mobile menu) + sidebar (md+) + content grid + dock terminal.
  // Layout strategy: responsive grid — sidebar breakpoint md+ (hidden mobile), lg+ wider sidebar.
  // Dark/light theme: dark:bg-zinc-950 / dark:bg-zinc-900 — ThemeProvider controls html class.
  // Loading-state: when SSE has no data yet (connecting+null), render a branded
  //   "Connecting" panel — NOT a skeleton-freeze — so the user sees a meaningful state
  //   instead of an empty/pulsing layout. Honors `motion-safe:` for prefers-reduced-motion.

  const isInitialLoading = sseStatus === "connecting" && sseState === null;

  return (
    <div
      data-testid="layout-shell"
      className="flex h-screen bg-zinc-950 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
    >
      {/* Desktop sidebar — responsive: hidden on mobile, visible md+ breakpoint */}
      <aside
        data-testid="layout-sidebar"
        aria-label="Primary navigation"
        className="hidden md:flex w-[240px] lg:w-[260px] flex-col border-r border-zinc-800 dark:border-zinc-800 bg-zinc-900 dark:bg-zinc-900 p-4 pb-10 relative z-50"
      >
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

        {/* Desktop header banner — visible md+ for intuitive top-level hierarchy */}
        <header
          role="banner"
          data-testid="layout-desktop-header"
          className="hidden md:flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 dark:border-zinc-800 bg-zinc-950/80 dark:bg-zinc-950/80 px-6 backdrop-blur"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight text-zinc-100">
              {sseState?.sprint?.id ?? "deckent"}
            </span>
            {sseState?.sprint?.phase && (
              <Badge variant="info" className="text-[10px] px-1.5 py-0">
                {sseState.sprint.phase}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${SSE_COLORS[sseStatus]}`}
            />
            <span className="text-xs text-zinc-500">{sseStatus}</span>
          </div>
        </header>

        <ScrollArea className="flex-1 p-6 pb-8">
          <main
            role="main"
            aria-label="Main content"
            data-testid="layout-content-grid"
            className="grid grid-cols-1 gap-6"
          >
            {isInitialLoading ? (
              <LayoutLoadingState />
            ) : (
              <Outlet />
            )}
          </main>
        </ScrollArea>
      </div>

      <DockPanel>
        <TerminalPanel />
      </DockPanel>
    </div>
  );
}

/**
 * Meaningful loading-state: shown only on first SSE connect when no data has arrived yet.
 * Avoids the "skeleton-freeze" anti-pattern — gives the user an intentional, branded
 * "we're connecting" affordance. `motion-safe:` ensures the pulse animation is suppressed
 * for users with prefers-reduced-motion.
 */
function LayoutLoadingState() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="layout-loading-state"
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center"
    >
      <div className="flex items-center gap-3">
        <img
          src="/decko-mascot.png"
          alt=""
          aria-hidden="true"
          className="h-9 w-9 motion-safe:animate-pulse"
        />
        <span className="text-lg font-semibold tracking-tight text-zinc-100">
          deckent
        </span>
      </div>
      <p className="text-sm text-zinc-400">
        {t('common.connecting')}…
      </p>
      <p className="text-xs text-zinc-500 max-w-sm">
        {t('layout.subtitle')}
      </p>
    </div>
  );
}
