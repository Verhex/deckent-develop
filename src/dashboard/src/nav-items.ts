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
  groupLabel: string;
  items: ReadonlyArray<NavItem>;
};

export const navGroups: ReadonlyArray<NavGroup> = [
  {
    groupLabel: "Konuş",
    items: [
      { to: "/chat", labelKey: "nav.chat", icon: MessageCircle },
    ],
  },
  {
    groupLabel: "İzle",
    items: [
      { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { to: "/status", labelKey: "dashboard.status", icon: Activity },
      { to: "/history", labelKey: "nav.history", icon: History },
      { to: "/workers", labelKey: "nav.workers", icon: Users },
      { to: "/evolution", labelKey: "nav.dashboard", label: "Evolution", icon: GitBranch },
      { to: "/nervous", labelKey: "nav.dashboard", label: "Nervous", icon: Bell },
    ],
  },
  {
    groupLabel: "Yönet",
    items: [
      { to: "/memory", labelKey: "nav.memory", icon: Brain },
      { to: "/memory-explorer", labelKey: "nav.dashboard", label: "Memory Explorer", icon: Search },
      { to: "/config", labelKey: "nav.config", icon: SlidersHorizontal },
      { to: "/directives", labelKey: "nav.directives", icon: FileText },
      { to: "/enterprise", labelKey: "nav.dashboard", label: "Enterprise", icon: Building2 },
    ],
  },
];

/** Flat list derived from groups — used by AppShell and backward-compat consumers. */
export const navItems: ReadonlyArray<NavItem> = navGroups.flatMap((g) => g.items);
