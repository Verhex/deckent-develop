import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseChartData } from "../../src/dashboard/src/components/SprintChart.js";
import { parseDebtMarkdown } from "../../src/dashboard/src/components/DebtTable.js";

const DASHBOARD_DIR = join(process.cwd(), "src", "dashboard");

// ─── SprintChart ────────────────────────────────────────────────────

describe("dashboard/components — SprintChart", () => {
  const filePath = join(DASHBOARD_DIR, "src/components/SprintChart.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("uses recharts components", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("ResponsiveContainer");
    expect(content).toContain("LineChart");
    expect(content).toContain("Line");
    expect(content).toContain("XAxis");
    expect(content).toContain("YAxis");
    expect(content).toContain("CartesianGrid");
    expect(content).toContain("Tooltip");
    expect(content).toContain("Legend");
  });

  it("has left Y axis (tests) and right Y axis (coverage)", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('yAxisId="left"');
    expect(content).toContain('yAxisId="right"');
    expect(content).toContain('orientation="right"');
  });

  it("uses blue for tests and green for coverage", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("#60a5fa"); // blue
    expect(content).toContain("#4ade80"); // green
  });

  it("has custom tooltip formatter", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("tooltipFormatter");
  });

  it("exports parseChartData function", () => {
    expect(typeof parseChartData).toBe("function");
  });

  it("renders empty state when no data", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("No chart data available");
  });
});

describe("parseChartData()", () => {
  it("parses history records into chart entries", () => {
    const history = [
      { id: "sprint-001", sprint: "Sprint 1", tasks: "4", coverage: "85%" },
      { id: "sprint-002", sprint: "Sprint 2", tasks: "6", coverage: "92.5%" },
    ];
    const result = parseChartData(history);
    expect(result).toEqual([
      { sprintId: "sprint-001", taskCount: 4, coverage: 85 },
      { sprintId: "sprint-002", taskCount: 6, coverage: 92.5 },
    ]);
  });

  it("handles missing fields with defaults", () => {
    const result = parseChartData([{}]);
    expect(result).toEqual([{ sprintId: "unknown", taskCount: 0, coverage: 0 }]);
  });

  it("handles empty array", () => {
    expect(parseChartData([])).toEqual([]);
  });

  it("handles non-numeric tasks", () => {
    const result = parseChartData([{ id: "s1", tasks: "-", coverage: "N/A" }]);
    expect(result).toEqual([{ sprintId: "s1", taskCount: 0, coverage: 0 }]);
  });

  it("uses id over sprint for sprintId", () => {
    const result = parseChartData([{ id: "id-val", sprint: "sprint-val" }]);
    expect(result[0]!.sprintId).toBe("id-val");
  });

  it("falls back to sprint when id missing", () => {
    const result = parseChartData([{ sprint: "sprint-val" }]);
    expect(result[0]!.sprintId).toBe("sprint-val");
  });

  it("strips % from coverage", () => {
    const result = parseChartData([{ id: "s1", coverage: "95.5%" }]);
    expect(result[0]!.coverage).toBe(95.5);
  });
});

// ─── DebtTable ──────────────────────────────────────────────────────

describe("dashboard/components — DebtTable", () => {
  const filePath = join(DASHBOARD_DIR, "src/components/DebtTable.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("renders table with correct columns", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("ID");
    expect(content).toContain("Description");
    expect(content).toContain("Priority");
    expect(content).toContain("Sprint");
    expect(content).toContain("Status");
  });

  it("has priority badge styling", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("bg-red-900");
    expect(content).toContain("bg-amber-900");
    expect(content).toContain("bg-green-900");
  });

  it("renders empty state", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("No technical debt entries");
  });

  it("exports parseDebtMarkdown function", () => {
    expect(typeof parseDebtMarkdown).toBe("function");
  });
});

describe("parseDebtMarkdown()", () => {
  const sampleTable = `| ID | Description | Priority | Sprint | Status |
|---|---|---|---|---|
| D-001 | Fix auth middleware | High | sprint-005 | Open |
| D-002 | Refactor utils | Low | sprint-006 | Resolved |
| D-003 | Update dependencies | Medium | sprint-007 | Open |`;

  it("parses valid markdown table", () => {
    const rows = parseDebtMarkdown(sampleTable);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      id: "D-001",
      description: "Fix auth middleware",
      priority: "High",
      sprint: "sprint-005",
      status: "Open",
    });
  });

  it("parses all rows correctly", () => {
    const rows = parseDebtMarkdown(sampleTable);
    expect(rows[1]!.id).toBe("D-002");
    expect(rows[1]!.priority).toBe("Low");
    expect(rows[2]!.id).toBe("D-003");
    expect(rows[2]!.priority).toBe("Medium");
  });

  it("returns empty array for empty string", () => {
    expect(parseDebtMarkdown("")).toEqual([]);
  });

  it("returns empty array for content without table", () => {
    expect(parseDebtMarkdown("# No table here\nJust some text.")).toEqual([]);
  });

  it("returns empty array when only header and separator", () => {
    const input = `| ID | Description |
|---|---|`;
    expect(parseDebtMarkdown(input)).toEqual([]);
  });

  it("handles rows with fewer columns gracefully", () => {
    const input = `| ID | Description | Priority | Sprint | Status |
|---|---|---|---|---|
| D-001 | Fix it | High | sprint-005 | Open |
| D-002 | Short |`;
    const rows = parseDebtMarkdown(input);
    // Second row has < 4 cols, should be filtered out
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("D-001");
  });

  it("handles missing status column", () => {
    const input = `| ID | Description | Priority | Sprint |
|---|---|---|---|
| D-001 | Fix it | High | sprint-005 |`;
    const rows = parseDebtMarkdown(input);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("");
  });

  it("trims whitespace from cells", () => {
    const input = `| ID | Description | Priority | Sprint | Status |
|---|---|---|---|---|
|  D-001  |  Fix auth  |  High  |  sprint-005  |  Open  |`;
    const rows = parseDebtMarkdown(input);
    expect(rows[0]!.id).toBe("D-001");
    expect(rows[0]!.description).toBe("Fix auth");
    expect(rows[0]!.priority).toBe("High");
  });
});

// ─── Tabs component ─────────────────────────────────────────────────

describe("dashboard/components/ui — tabs", () => {
  const filePath = join(DASHBOARD_DIR, "src/components/ui/tabs.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("exports Tabs, TabsList, TabsTrigger, TabsContent", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("export function Tabs");
    expect(content).toContain("export const TabsList");
    expect(content).toContain("export const TabsTrigger");
    expect(content).toContain("export const TabsContent");
  });

  it("uses context for state management", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("createContext");
    expect(content).toContain("useContext");
  });

  it("supports defaultValue prop", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("defaultValue");
  });

  it("TabsTrigger has role=tab and aria-selected", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('role="tab"');
    expect(content).toContain("aria-selected");
  });

  it("TabsContent has role=tabpanel", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('role="tabpanel"');
  });

  it("TabsList has role=tablist", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('role="tablist"');
  });

  it("has active/inactive state styling", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("active");
    expect(content).toContain("inactive");
    expect(content).toContain("bg-zinc-900");
  });

  it("uses cn utility for className merging", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("cn(");
  });
});
