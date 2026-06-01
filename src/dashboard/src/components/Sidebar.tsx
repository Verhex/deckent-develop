/**
 * Sidebar navigation items — single source of truth for dashboard nav links.
 * Layout.tsx imports navItems from here; add new routes in this file.
 *
 * Tech debt (Sprint 189): Layout.tsx still has its own inline navItems copy
 * pending the Layout refactor. Once that refactor lands, this export is the
 * canonical source and the inline copy in Layout.tsx is deleted.
 */
import { NavLink } from "react-router-dom";
import { LayoutDashboard, History, Brain, SlidersHorizontal, MessageCircle, Activity, GitBranch, Bell, Building2, Search } from "lucide-react";
import { cn } from "../lib/utils";
import { useTranslation } from "../i18n/LanguageProvider";
import type { TranslationKey } from "../i18n/en";

export type NavItem = {
  to: string;
  labelKey: TranslationKey;
  /** Literal label override used when no TranslationKey exists yet (renders verbatim). */
  label?: string;
  icon: typeof LayoutDashboard;
};

export const navItems: ReadonlyArray<NavItem> = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/history", labelKey: "nav.history", icon: History },
  { to: "/memory", labelKey: "nav.memory", icon: Brain },
  { to: "/config", labelKey: "nav.config", icon: SlidersHorizontal },
  { to: "/chat", labelKey: "nav.chat", icon: MessageCircle },
  { to: "/status", labelKey: "dashboard.status", icon: Activity },
  { to: "/evolution", labelKey: "nav.dashboard", label: "Evolution", icon: GitBranch },
  { to: "/nervous", labelKey: "nav.dashboard", label: "Nervous", icon: Bell },
  { to: "/enterprise", labelKey: "nav.dashboard", label: "Enterprise", icon: Building2 },
  { to: "/memory-explorer", labelKey: "nav.dashboard", label: "Memory Explorer", icon: Search },
];

interface SidebarNavLinksProps {
  onNavigate?: () => void;
}

export function SidebarNavLinks({ onNavigate }: SidebarNavLinksProps) {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ to, labelKey, label, icon: Icon }) => (
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
          {label ?? t(labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}
