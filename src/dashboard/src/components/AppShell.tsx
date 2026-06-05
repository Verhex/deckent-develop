// AppShell — top-level layout shell with responsive grid, dark/light token consistency.
// Builds on Sidebar navItems + ThemeProvider. Use as an alternative to Layout.tsx
// when you need a composable shell without SSE/DockPanel dependencies.
//
// Responsive breakpoints:
//   mobile  (<768px):  single-column grid, sidebar hidden, header shows brand+theme toggle
//   md      (≥768px):  sidebar 240px | content, sidebar visible
//   lg      (≥1024px): sidebar 260px | content
//
// dark/light tokens: zinc-950/zinc-100 background, zinc-900/zinc-50 sidebar,
//   zinc-800/zinc-200 borders — all via dark: Tailwind variants.

import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Sun, Moon, Menu } from "lucide-react";
import { cn } from "../lib/utils.js";
import { useTheme } from "./ThemeProvider.js";
import { navItems } from "./Sidebar.js";
import { useTranslation } from "../i18n/LanguageProvider.js";

export interface AppShellProps {
  children?: ReactNode;
  /** Optional content injected into the top header bar (e.g. breadcrumb, actions). */
  headerContent?: ReactNode;
  className?: string;
}

function ThemeToggleButton({
  theme,
  onToggle,
  testId,
  compact,
}: {
  theme: string;
  onToggle: () => void;
  testId: string;
  compact?: boolean;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 rounded-md transition-all duration-200",
        "text-zinc-500 dark:text-zinc-400",
        "hover:bg-zinc-200/70 dark:hover:bg-zinc-800/50",
        "hover:text-zinc-800 dark:hover:text-zinc-200",
        compact ? "px-2 py-1.5" : "px-3 py-1.5 text-xs w-full",
      )}
      aria-label="Toggle dark/light theme"
    >
      {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      {!compact && (theme === "dark" ? "Light mode" : "Dark mode")}
    </button>
  );
}

/** AppShell — responsive grid shell. Wrap page content as children. */
export function AppShell({ children, headerContent, className }: AppShellProps) {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    // Shell grid: responsive 1-col mobile → sidebar+content desktop
    // dark/light background token applied at shell root
    <div
      data-testid="app-shell"
      data-theme={theme}
      className={cn(
        "app-shell grid h-screen overflow-hidden",
        // Responsive grid breakpoint: single-col → 2-col at md
        "grid-cols-1 md:grid-cols-[240px_1fr] lg:grid-cols-[260px_1fr]",
        // dark/light theme token: root background
        "bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100",
        className,
      )}
    >
      {/* Sidebar zone — hidden below md breakpoint, grid handles responsive collapse */}
      <aside
        data-testid="app-shell-sidebar"
        className={cn(
          "hidden md:flex flex-col overflow-y-auto",
          "border-r border-zinc-200 dark:border-zinc-800",
          // dark/light sidebar background token
          "bg-zinc-100 dark:bg-zinc-900",
          "p-4",
        )}
      >
        {/* Brand header */}
        <div className="mb-6 px-1">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            deckent
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">
            AI Agent Orchestrator
          </p>
        </div>

        {/* Navigation hierarchy — active link gets blue border-l accent */}
        <nav data-testid="app-shell-nav" className="flex flex-col gap-1 flex-1">
          {navItems.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  "transition-all duration-200 border-l-2",
                  isActive
                    ? // dark/light active token: elevated bg + accent border
                      "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-gold"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200 border-transparent",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer: theme toggle */}
        <div className="mt-auto pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <ThemeToggleButton
            theme={theme}
            onToggle={toggleTheme}
            testId="app-shell-theme-toggle"
          />
        </div>
      </aside>

      {/* Content zone: header + scrollable main */}
      <div
        data-testid="app-shell-content"
        className="flex flex-col overflow-hidden"
      >
        {/* Top header bar — visible at all breakpoints */}
        <header
          data-testid="app-shell-header"
          className={cn(
            "flex items-center justify-between shrink-0",
            "h-14 px-4 py-3",
            "border-b border-zinc-200 dark:border-zinc-800",
            // dark/light header background token matches shell root
            "bg-zinc-50 dark:bg-zinc-950",
          )}
        >
          {/* Mobile brand label (sidebar hidden on mobile) */}
          <div className="flex items-center gap-2">
            <span className="md:hidden text-sm font-bold text-zinc-900 dark:text-zinc-100">
              deckent
            </span>
            <Menu
              data-testid="app-shell-menu-icon"
              className="md:hidden h-5 w-5 text-zinc-400"
            />
          </div>

          {/* Custom header slot (breadcrumb, sprint info, etc.) */}
          {headerContent && (
            <div className="flex items-center gap-2 flex-1 px-4">{headerContent}</div>
          )}

          {/* Mobile theme toggle in header (desktop toggle lives in sidebar) */}
          <ThemeToggleButton
            theme={theme}
            onToggle={toggleTheme}
            testId="app-shell-theme-toggle-mobile"
            compact
          />
        </header>

        {/* Main scrollable content area */}
        <main
          data-testid="app-shell-main"
          className="flex-1 overflow-y-auto p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
