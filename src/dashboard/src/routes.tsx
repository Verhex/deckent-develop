/**
 * Route definitions for the Deckent dashboard.
 * Re-exported for reference — actual routing lives in App.tsx.
 */
export const ROUTES = [
  { path: "/", label: "Dashboard" },
  { path: "/history", label: "History" },
  { path: "/memory", label: "Memory" },
  { path: "/config", label: "Config" },
  { path: "/chat", label: "Chat" },
  { path: "/status", label: "Status" },
] as const;

export type RoutePath = (typeof ROUTES)[number]["path"];
