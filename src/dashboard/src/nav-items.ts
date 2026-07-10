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
  Target,
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
      { to: "/missions", labelKey: "nav.missions", icon: Target },
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

/**
 * DESK-B2-DASHBOARD-BRIDGE (392-008): ADR-G-033 relocates interactive chat to
 * the Desktop app, so the Chat entry (the "talk" group) must lead the nav
 * when running inside Desktop. The "talk" group already leads `navGroups`
 * today (Sprint 282 IA) — this is a defensive re-sort that guards the
 * invariant even if a future edit reorders `navGroups`, rather than a silent
 * behavioral no-op. Does not mutate `navGroups`/`navItems` (existing
 * consumers/tests keep their current, unpinned order).
 *
 * NOTE: Layout.tsx (the nav's sole renderer) is not yet wired to call this
 * with a live isDesktop flag — that wiring is a follow-up outside this
 * task's write scope (App.tsx / nav-items.ts only).
 */
export function getNavGroups(isDesktop: boolean): ReadonlyArray<NavGroup> {
  if (!isDesktop) return navGroups;
  const talkGroups = navGroups.filter((g) => g.groupLabel === "talk");
  const otherGroups = navGroups.filter((g) => g.groupLabel !== "talk");
  return [...talkGroups, ...otherGroups];
}
