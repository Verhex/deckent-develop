import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_DIR = join(process.cwd(), "src", "dashboard");

describe("dashboard page — DashboardPage.tsx", () => {
  const filePath = join(DASHBOARD_DIR, "src/pages/DashboardPage.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("imports useSSE hook for real-time updates", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("useSSE");
    expect(content).toContain("/api/events");
  });

  it("has fallback fetch to /api/status", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("/api/status");
    expect(content).toContain("fetchJson");
  });

  it("displays sprint status card with sprint ID, phase, status, updated", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("dashboard.sprint_id");
    expect(content).toContain("dashboard.phase");
    expect(content).toContain("dashboard.status");
    expect(content).toContain("dashboard.updated");
  });

  it("renders worker cards and agent detail components", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("WorkerCardGrid");
    expect(content).toContain("AgentDetail");
    expect(content).toContain("onKill");
    expect(content).toContain("onSelect");
  });

  it("has Kill button with POST /api/kill/:workerId", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Kill");
    expect(content).toContain("/api/kill/");
    expect(content).toContain("postJson");
    expect(content).toContain("confirm");
  });

  it("has progress bar with done, active, pending segments", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Progress");
    expect(content).toContain("bg-green-500");
    expect(content).toContain("bg-blue-500");
    expect(content).toContain("bg-zinc-600");
    expect(content).toContain("done");
    expect(content).toContain("active");
    expect(content).toContain("pending");
  });

  it("has alert section with level badges", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Alerts");
    expect(content).toContain("alert.level");
    expect(content).toContain("ALERT_VARIANT");
  });

  it("has new sprint button that opens modal", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("dashboard.new_sprint");
    expect(content).toContain("setModalOpen(true)");
    expect(content).toContain("NewSprintModal");
  });

  it("uses dark theme classes", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("bg-zinc-900");
    expect(content).toContain("border-zinc-800");
    expect(content).toContain("text-zinc-100");
  });

  it("has phase color mapping for badges", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("PHASE_COLORS");
    expect(content).toContain("DIRECTIVE");
    expect(content).toContain("PLAN");
    expect(content).toContain("EXECUTE");
    expect(content).toContain("COMPLETE");
  });

  it("has elapsed time helper function", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("function relativeTime");
  });
});

describe("dashboard page — NewSprintModal.tsx", () => {
  const filePath = join(DASHBOARD_DIR, "src/components/NewSprintModal.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("implements multi-step modal flow", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("directives");
    expect(content).toContain("planning");
    expect(content).toContain("review");
    expect(content).toContain("starting");
    expect(content).toContain("done");
    expect(content).toContain("error");
  });

  it("has textarea for directive content", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Textarea");
    expect(content).toContain("directives");
  });

  it("calls POST /api/set-directives", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("/api/set-directives");
    expect(content).toContain("content: directives");
  });

  it("calls POST /api/plan and shows plan", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("/api/plan");
    expect(content).toContain("plan.tasks");
  });

  it("calls POST /api/start on confirm", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("/api/start");
    expect(content).toContain("modal.confirm_start");
  });

  it("shows task count from set-directives response", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("taskCount");
  });

  it("has error handling with try-again", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("modal.try_again");
    expect(content).toContain("error");
  });

  it("uses Dialog component", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Dialog");
    expect(content).toContain("DialogContent");
    expect(content).toContain("DialogHeader");
    expect(content).toContain("DialogTitle");
    expect(content).toContain("DialogFooter");
  });
});

describe("dashboard page — ConfigPage.tsx", () => {
  const filePath = join(DASHBOARD_DIR, "src/pages/ConfigPage.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("has Memory category fields in CONFIG_FIELDS", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('"Memory"');
    expect(content).toContain('memory_budget');
    expect(content).toContain('decay_after_sprints');
    expect(content).toContain('patterns_enabled');
    expect(content).toContain('project_identity_enabled');
  });

  it("has Auditor category fields in CONFIG_FIELDS", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('"Auditor"');
    expect(content).toContain('scan_interval');
    expect(content).toContain('heartbeat_timeout');
    expect(content).toContain('boundary_enforcement');
  });

  it("has Rollback category fields in CONFIG_FIELDS", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('"Rollback"');
    expect(content).toContain('rollback_policy');
  });

  it("has Project category fields in CONFIG_FIELDS", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('"Project"');
    expect(content).toContain('"language"');
    expect(content).toContain('"projectName"');
    expect(content).toContain('"version"');
  });

  it("has Advanced category fields in CONFIG_FIELDS", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('"Advanced"');
    expect(content).toContain('auto_clean_locks');
  });

  it("has Sprint fix_phase_enabled and max_fix_retries fields", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('fix_phase_enabled');
    expect(content).toContain('max_fix_retries');
  });

  it("CATEGORIES array has 14 categories", () => {
    const content = readFileSync(filePath, "utf-8");
    const categoriesMatch = content.match(/const CATEGORIES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/);
    expect(categoriesMatch).not.toBeNull();
    const categoriesBlock = categoriesMatch![1];
    // Count quoted strings
    const categories = categoriesBlock.match(/"[^"]+"/g);
    expect(categories).not.toBeNull();
    expect(categories!.length).toBe(14);
  });

  it("CATEGORIES includes all required category names", () => {
    const content = readFileSync(filePath, "utf-8");
    const required = ["Provider", "Sprint", "Memory", "Auditor", "Output", "Search",
      "Notifications", "Telemetry", "Environment", "Skill Routing", "Rollback", "Project", "Advanced"];
    for (const cat of required) {
      expect(content).toContain(`"${cat}"`);
    }
  });
});

// Usage card removed — no real token tracking available via Claude CLI
// Tests removed in Sprint 086

describe("dashboard page — UI components", () => {
  it("badge.tsx exists with variants", () => {
    const filePath = join(DASHBOARD_DIR, "src/components/ui/badge.tsx");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("badgeVariants");
    expect(content).toContain("info");
    expect(content).toContain("warning");
    expect(content).toContain("critical");
    expect(content).toContain("success");
    expect(content).toContain("secondary");
    expect(content).toContain("destructive");
  });

  it("dialog.tsx exists with all sub-components", () => {
    const filePath = join(DASHBOARD_DIR, "src/components/ui/dialog.tsx");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Dialog");
    expect(content).toContain("DialogTrigger");
    expect(content).toContain("DialogContent");
    expect(content).toContain("DialogHeader");
    expect(content).toContain("DialogTitle");
    expect(content).toContain("DialogFooter");
    expect(content).toContain("DialogOverlay");
    expect(content).toContain("Escape");
  });

  it("table.tsx exists with all sub-components", () => {
    const filePath = join(DASHBOARD_DIR, "src/components/ui/table.tsx");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Table");
    expect(content).toContain("TableHeader");
    expect(content).toContain("TableBody");
    expect(content).toContain("TableRow");
    expect(content).toContain("TableHead");
    expect(content).toContain("TableCell");
  });

  it("textarea.tsx exists with dark theme", () => {
    const filePath = join(DASHBOARD_DIR, "src/components/ui/textarea.tsx");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Textarea");
    expect(content).toContain("bg-zinc-950");
    expect(content).toContain("border-zinc-800");
  });

  it("progress.tsx exists with segments support", () => {
    const filePath = join(DASHBOARD_DIR, "src/components/ui/progress.tsx");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Progress");
    expect(content).toContain("segments");
    expect(content).toContain("progressbar");
    expect(content).toContain("total");
  });
});
