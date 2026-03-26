import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_DIR = join(process.cwd(), "src", "dashboard");

describe("dashboard/pages — HistoryPage", () => {
  const filePath = join(DASHBOARD_DIR, "src/pages/HistoryPage.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("imports useApi hook", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("useApi");
  });

  it("fetches /api/history", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("/api/history");
  });

  it("imports SprintChart component", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("SprintChart");
    expect(content).toContain("parseChartData");
  });

  it("renders history table columns", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Sprint ID");
    expect(content).toContain("Tasks");
    expect(content).toContain("Done");
    expect(content).toContain("No-Go");
    expect(content).toContain("Coverage");
    expect(content).toContain("Duration");
  });

  it("renders loading state", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("loading");
    expect(content).toContain("Loading history");
  });

  it("renders error state", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("error");
    expect(content).toContain("Error:");
  });

  it("renders empty state", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("No sprint history found");
  });

  it("uses Card components", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Card");
    expect(content).toContain("CardHeader");
    expect(content).toContain("CardContent");
  });

  it("has dark theme classes", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("bg-zinc-900");
    expect(content).toContain("border-zinc-800");
    expect(content).toContain("text-zinc-100");
  });

  it("maps over data records", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("data.map");
  });
});

describe("dashboard/pages — MemoryPage", () => {
  const filePath = join(DASHBOARD_DIR, "src/pages/MemoryPage.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("imports Tabs components", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Tabs");
    expect(content).toContain("TabsList");
    expect(content).toContain("TabsTrigger");
    expect(content).toContain("TabsContent");
  });

  it("fetches /api/memory", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("/api/memory");
  });

  it("fetches /api/debt", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("/api/debt");
  });

  it("has Memory and Debt tabs", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('value="memory"');
    expect(content).toContain('value="debt"');
    expect(content).toContain(">Memory<");
    expect(content).toContain(">Debt<");
  });

  it("renders memory content using SimpleMarkdown component", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("SimpleMarkdown");
    expect(content).toContain("memoryData.content");
  });

  it("imports DebtTable and parseDebtMarkdown", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("DebtTable");
    expect(content).toContain("parseDebtMarkdown");
  });

  it("uses useApi hook for both endpoints", () => {
    const content = readFileSync(filePath, "utf-8");
    const apiMatches = content.match(/useApi/g);
    expect(apiMatches).not.toBeNull();
    expect(apiMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it("renders loading states", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Loading memory");
    expect(content).toContain("Loading debt");
  });

  it("renders error states", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("memError");
    expect(content).toContain("debtError");
  });

  it("has dark theme classes", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("bg-zinc-900");
    expect(content).toContain("bg-zinc-950");
    expect(content).toContain("text-zinc-100");
  });
});
