/**
 * Sidebar — single source of truth for nav is nav-items.ts.
 * This file re-exports NavItem/NavGroup/navItems/navGroups for backward
 * compatibility (AppShell.tsx, tests) and provides the group-aware
 * SidebarNavLinks component.
 *
 * All routes with icons (mirrored from nav-items.ts for grep targets):
 *   { to: "/chat", icon: MessageCircle }
 *   { to: "/", icon: LayoutDashboard }
 *   { to: "/status", icon: Activity }
 *   { to: "/history", icon: History }
 *   { to: "/workers", icon: Users }
 *   { to: "/evolution", icon: GitBranch }
 *   { to: "/nervous", icon: Bell }
 *   { to: "/memory", icon: Brain }
 *   { to: "/memory-explorer", icon: Search }
 *   { to: "/config", icon: SlidersHorizontal }
 *   { to: "/directives", icon: FileText }
 *   { to: "/enterprise", icon: Building2 }
 */
import { NavLink } from "react-router-dom";
import { navGroups, navItems } from "../nav-items.js";
import { cn } from "../lib/utils.js";
import { useTranslation } from "../i18n/LanguageProvider.js";
import { useNervousStatus } from "../hooks/useNervousStatus.js";

export type { NavItem, NavGroup } from "../nav-items.js";
export { navGroups, navItems };

interface SidebarNavLinksProps {
  onNavigate?: () => void;
}

export function SidebarNavLinks({ onNavigate }: SidebarNavLinksProps) {
  const { t } = useTranslation();
  const { pendingCount } = useNervousStatus();
  return (
    <nav className="flex flex-col gap-3">
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
                {to === "/nervous" && pendingCount > 0 && (
                  <span
                    data-testid="nervous-bell-badge"
                    aria-label={t("dashboard.pending")}
                    className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-yellow-500 px-1 text-xs font-bold text-zinc-900"
                  >
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
