import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { LayoutDashboard, Settings, History, Brain, Menu } from "lucide-react";
import { cn } from "../lib/utils";
import { Sheet, SheetTrigger, SheetContent } from "./ui/sheet";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { useSSE } from "../hooks/useSSE";
import type { DashboardState } from "../types";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/history", label: "History", icon: History },
  { to: "/memory", label: "Memory", icon: Brain },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-zinc-800 text-zinc-100 border-l-2 border-blue-500"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent",
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarContent({ onNavigate, sseState }: { onNavigate?: () => void; sseState: DashboardState | null }) {
  return (
    <>
      <div className="mb-4 px-3">
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight">
          deckent
        </h1>
        <p className="text-xs text-zinc-500">agent orchestration</p>
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
        <span className="text-xs text-zinc-400">Auditor:</span>
        {sseState?.auditorLastScan ? (
          <Badge variant="success" className="text-[10px]">Active</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
        )}
      </div>
      <NavLinks onNavigate={onNavigate} />
    </>
  );
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const sseState = useSSE("/api/events");

  return (
    <div className="flex h-screen bg-zinc-950">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] flex-col border-r border-zinc-800 bg-zinc-900 p-4">
        <SidebarContent sseState={sseState} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[240px] p-4">
          <SidebarContent onNavigate={() => setMobileOpen(false)} sseState={sseState} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex md:hidden items-center border-b border-zinc-800 bg-zinc-900 px-4 py-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger aria-label="Toggle menu">
              <Menu className="h-5 w-5 text-zinc-400" />
            </SheetTrigger>
          </Sheet>
          <span className="ml-3 text-sm font-bold text-zinc-100">deckent</span>
        </header>

        <ScrollArea className="flex-1 p-6">
          <Outlet />
        </ScrollArea>
      </div>
    </div>
  );
}
