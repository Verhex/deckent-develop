import {
  LayoutDashboard,
  History,
  Brain,
  SlidersHorizontal,
  MessageCircle,
  Activity,
  GitBranch,
  Bell,
  Building2,
  Search,
  Users,
  FileText,
  AlertTriangle,
  Settings,
  Zap,
} from "lucide-react";
import type { TranslationKey } from "./i18n/en.js";

export type NavItem = {
  to: string;
  labelKey: TranslationKey;
  /** Literal label override used when no dedicated nav.* TranslationKey exists yet. */
  label?: string;
  icon: typeof LayoutDashboard;
};

export type NavGroup = {
  /** Stable id (also the data-nav-group attribute + React key). */
  groupLabel: string;
  /** i18n key for the displayed group header (en/tr). */
  groupLabelKey: TranslationKey;
  items: ReadonlyArray<NavItem>;
};

export const navGroups: ReadonlyArray<NavGroup> = [
  {
    groupLabel: "talk",
    groupLabelKey: "nav.group.talk",
    items: [
      { to: "/chat", labelKey: "nav.chat", icon: MessageCircle },
    ],
  },
  {
    groupLabel: "watch",
    groupLabelKey: "nav.group.watch",
    items: [
      { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { to: "/status", labelKey: "dashboard.status", icon: Activity },
      { to: "/history", labelKey: "nav.history", icon: History },
      { to: "/workers", labelKey: "nav.workers", icon: Users },
      { to: "/debt", labelKey: "nav.debt", icon: AlertTriangle },
      { to: "/evolution", labelKey: "nav.evolution", icon: GitBranch },
      { to: "/nervous", labelKey: "nav.nervous", icon: Bell },
      { to: "/autonomous", labelKey: "nav.autonomous", icon: Zap },
    ],
  },
  {
    groupLabel: "manage",
    groupLabelKey: "nav.group.manage",
    items: [
      { to: "/memory", labelKey: "nav.memory", icon: Brain },
      { to: "/memory-explorer", labelKey: "nav.memory_explorer", icon: Search },
      { to: "/config", labelKey: "nav.config", icon: SlidersHorizontal },
      { to: "/settings", labelKey: "nav.settings", icon: Settings },
      { to: "/directives", labelKey: "nav.directives", icon: FileText },
      { to: "/docs-health", labelKey: "nav.docs_health", icon: FileText },
      { to: "/enterprise", labelKey: "nav.enterprise", icon: Building2 },
    ],
  },
];

/** Flat list derived from groups — used by AppShell and backward-compat consumers. */
export const navItems: ReadonlyArray<NavItem> = navGroups.flatMap((g) => g.items);
