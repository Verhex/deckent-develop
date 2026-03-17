import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_DIR = join(process.cwd(), "src", "dashboard");
const SRC = join(DASHBOARD_DIR, "src");

describe("dashboard layout + router + navigation", () => {
  describe("file existence", () => {
    const requiredFiles = [
      "src/components/Layout.tsx",
      "src/components/ThemeProvider.tsx",
      "src/components/ui/sheet.tsx",
      "src/components/ui/scroll-area.tsx",
    ];

    for (const file of requiredFiles) {
      it(`${file} exists`, () => {
        expect(existsSync(join(DASHBOARD_DIR, file))).toBe(true);
      });
    }
  });

  describe("Layout.tsx", () => {
    const layout = () => readFileSync(join(SRC, "components/Layout.tsx"), "utf-8");

    it("exports Layout component", () => {
      expect(layout()).toContain("export function Layout");
    });

    it("has sidebar with 240px width", () => {
      expect(layout()).toContain("w-[240px]");
    });

    it("uses NavLink from react-router-dom", () => {
      expect(layout()).toContain("NavLink");
      expect(layout()).toContain("react-router-dom");
    });

    it("has all four nav items", () => {
      const content = layout();
      expect(content).toContain('to: "/"');
      expect(content).toContain('to: "/settings"');
      expect(content).toContain('to: "/history"');
      expect(content).toContain('to: "/memory"');
    });

    it("has nav labels", () => {
      const content = layout();
      expect(content).toContain('"Dashboard"');
      expect(content).toContain('"Settings"');
      expect(content).toContain('"History"');
      expect(content).toContain('"Memory"');
    });

    it("has active link styling with bg-zinc-800 and blue border", () => {
      const content = layout();
      expect(content).toContain("bg-zinc-800");
      expect(content).toContain("border-blue-500");
    });

    it("sidebar uses bg-zinc-900 border-r border-zinc-800", () => {
      const content = layout();
      expect(content).toContain("bg-zinc-900");
      expect(content).toContain("border-r");
      expect(content).toContain("border-zinc-800");
    });

    it("main content area has correct styling", () => {
      const content = layout();
      expect(content).toContain("flex-1");
      expect(content).toContain("overflow");
      expect(content).toContain("p-6");
    });

    it("has mobile hamburger menu icon", () => {
      const content = layout();
      expect(content).toContain("Menu");
      expect(content).toContain("lucide-react");
    });

    it("uses Sheet for mobile sidebar", () => {
      const content = layout();
      expect(content).toContain("Sheet");
      expect(content).toContain("SheetTrigger");
      expect(content).toContain("SheetContent");
    });

    it("hides desktop sidebar on mobile with md: breakpoint", () => {
      const content = layout();
      expect(content).toContain("hidden md:flex");
    });

    it("uses Outlet for child routes", () => {
      const content = layout();
      expect(content).toContain("Outlet");
    });

    it("has deckent branding", () => {
      const content = layout();
      expect(content).toContain("deckent");
    });

    it("uses lucide-react icons for nav items", () => {
      const content = layout();
      expect(content).toContain("LayoutDashboard");
      expect(content).toContain("Settings");
      expect(content).toContain("History");
      expect(content).toContain("Brain");
    });

    it("uses ScrollArea component", () => {
      expect(layout()).toContain("ScrollArea");
    });

    it("mobile nav closes on link click", () => {
      expect(layout()).toContain("onNavigate");
    });
  });

  describe("ThemeProvider.tsx", () => {
    const theme = () => readFileSync(join(SRC, "components/ThemeProvider.tsx"), "utf-8");

    it("exports ThemeProvider", () => {
      expect(theme()).toContain("export function ThemeProvider");
    });

    it("exports useTheme hook", () => {
      expect(theme()).toContain("export function useTheme");
    });

    it("sets dark class on html element", () => {
      const content = theme();
      expect(content).toContain("documentElement");
      expect(content).toContain("classList");
      expect(content).toContain('"dark"');
    });

    it("uses createContext and useContext", () => {
      const content = theme();
      expect(content).toContain("createContext");
      expect(content).toContain("useContext");
    });

    it("supports dark and light theme types", () => {
      const content = theme();
      expect(content).toContain('"dark"');
      expect(content).toContain('"light"');
    });

    it("defaults to dark theme", () => {
      expect(theme()).toContain('useState<Theme>("dark")');
    });

    it("uses useEffect to apply theme changes", () => {
      expect(theme()).toContain("useEffect");
    });
  });

  describe("sheet.tsx", () => {
    const sheet = () => readFileSync(join(SRC, "components/ui/sheet.tsx"), "utf-8");

    it("exports Sheet, SheetTrigger, SheetContent", () => {
      const content = sheet();
      expect(content).toContain("export function Sheet");
      expect(content).toContain("export function SheetTrigger");
      expect(content).toContain("export const SheetContent");
    });

    it("uses context for open state management", () => {
      const content = sheet();
      expect(content).toContain("createContext");
      expect(content).toContain("useContext");
    });

    it("supports controlled open/onOpenChange props", () => {
      const content = sheet();
      expect(content).toContain("controlledOpen");
      expect(content).toContain("controlledOnChange");
    });

    it("has overlay backdrop", () => {
      expect(sheet()).toContain("bg-black/60");
    });

    it("handles escape key", () => {
      const content = sheet();
      expect(content).toContain("Escape");
      expect(content).toContain("keydown");
    });

    it("supports left and right side positioning", () => {
      const content = sheet();
      expect(content).toContain('"left"');
      expect(content).toContain('"right"');
    });

    it("has close button with X icon", () => {
      const content = sheet();
      expect(content).toContain("X");
      expect(content).toContain("lucide-react");
      expect(content).toContain("Close");
    });

    it("prevents body scroll when open", () => {
      expect(sheet()).toContain("body.style.overflow");
    });

    it("uses cn for className merging", () => {
      expect(sheet()).toContain("cn(");
    });

    it("has correct z-index layering", () => {
      const content = sheet();
      expect(content).toContain("z-40");
      expect(content).toContain("z-50");
    });
  });

  describe("scroll-area.tsx", () => {
    const scrollArea = () => readFileSync(join(SRC, "components/ui/scroll-area.tsx"), "utf-8");

    it("exports ScrollArea component", () => {
      expect(scrollArea()).toContain("ScrollArea");
    });

    it("uses forwardRef", () => {
      expect(scrollArea()).toContain("forwardRef");
    });

    it("has overflow-auto class", () => {
      expect(scrollArea()).toContain("overflow-auto");
    });

    it("uses cn for className merging", () => {
      expect(scrollArea()).toContain("cn(");
    });

    it("has displayName set", () => {
      expect(scrollArea()).toContain('displayName = "ScrollArea"');
    });
  });

  describe("App.tsx updates", () => {
    const app = () => readFileSync(join(SRC, "App.tsx"), "utf-8");

    it("wraps app in ThemeProvider", () => {
      expect(app()).toContain("ThemeProvider");
      expect(app()).toContain("<ThemeProvider>");
    });

    it("uses Layout as route element", () => {
      expect(app()).toContain("<Route element={<Layout />}>");
    });

    it("uses direct imports instead of lazy", () => {
      const content = app();
      expect(content).not.toContain("lazy(");
      expect(content).not.toContain("Suspense");
      expect(content).toContain('import DashboardPage from');
      expect(content).toContain('import SettingsPage from');
      expect(content).toContain('import HistoryPage from');
      expect(content).toContain('import MemoryPage from');
    });

    it("still has BrowserRouter", () => {
      expect(app()).toContain("BrowserRouter");
    });

    it("has all four routes", () => {
      const content = app();
      expect(content).toContain('path="/"');
      expect(content).toContain('path="/settings"');
      expect(content).toContain('path="/history"');
      expect(content).toContain('path="/memory"');
    });
  });

  describe("index.css updates", () => {
    const css = () => readFileSync(join(SRC, "index.css"), "utf-8");

    it("still imports tailwindcss", () => {
      expect(css()).toContain('@import "tailwindcss"');
    });

    it("still has @theme block", () => {
      expect(css()).toContain("@theme");
    });

    it("has dark color scheme", () => {
      expect(css()).toContain("color-scheme: dark");
    });

    it("has scrollbar styling", () => {
      const content = css();
      expect(content).toContain("::-webkit-scrollbar");
      expect(content).toContain("scrollbar-width");
      expect(content).toContain("scrollbar-color");
    });

    it("has body base styles", () => {
      const content = css();
      expect(content).toContain("body");
      expect(content).toContain("#09090b");
      expect(content).toContain("#fafafa");
    });

    it("preserves all theme variables", () => {
      const content = css();
      expect(content).toContain("--color-background");
      expect(content).toContain("--color-foreground");
      expect(content).toContain("--color-card");
      expect(content).toContain("--color-border");
      expect(content).toContain("--color-primary");
      expect(content).toContain("--color-secondary");
      expect(content).toContain("--color-muted");
      expect(content).toContain("--color-accent");
      expect(content).toContain("--color-destructive");
      expect(content).toContain("--radius");
    });
  });
});
