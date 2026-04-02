import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_DIR = join(process.cwd(), "src", "dashboard");
const CONFIG_PAGE_PATH = join(DASHBOARD_DIR, "src/pages/ConfigPage.tsx");

describe("dashboard/pages — ConfigPage", () => {
  it("file exists", () => {
    expect(existsSync(CONFIG_PAGE_PATH)).toBe(true);
  });

  it("fetches /api/config and /api/config/defaults", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    expect(content).toContain("/api/config");
    expect(content).toContain("/api/config/defaults");
  });

  it("has all config categories", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    const categories = ["Provider", "Sprint", "Output", "Search", "Notifications", "Telemetry", "Environment", "Skill Routing"];
    for (const cat of categories) {
      expect(content).toContain(`"${cat}"`);
    }
  });

  it("defines CONFIG_FIELDS with key, label, description, type, category, defaultValue", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    expect(content).toContain("CONFIG_FIELDS");
    expect(content).toContain("ConfigFieldMeta");
    expect(content).toContain("key:");
    expect(content).toContain("label:");
    expect(content).toContain("description:");
    expect(content).toContain("defaultValue:");
    expect(content).toContain("category:");
  });

  it("has Reset to Default button per field", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    expect(content).toContain("handleResetField");
    expect(content).toContain("Reset");
    expect(content).toContain("RotateCcw");
    expect(content).toContain('data-testid={`reset-${field.key}`}');
  });

  it("shows validation/save feedback messages", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    expect(content).toContain("saveMsg");
    expect(content).toContain("bg-green-900/30");
    expect(content).toContain("bg-red-900/30");
    expect(content).toContain('data-testid="save-message"');
  });

  it("has tooltip/description for each field using Info icon", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    expect(content).toContain("Info");
    expect(content).toContain("field.description");
    expect(content).toContain("fieldT(field");
  });

  it("renders input types: select, boolean, number, text", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    expect(content).toContain('field.type === "select"');
    expect(content).toContain('field.type === "boolean"');
    expect(content).toContain('field.type === "number"');
    expect(content).toContain('field.type === "text"');
  });

  it("shows default value indicator when value differs from default", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    expect(content).toContain("isDefault");
    expect(content).toContain("(default:");
  });

  it("uses POST /api/config to save", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    expect(content).toContain("postJson");
    expect(content).toContain('"/api/config"');
  });

  it("tracks dirty state per field", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    expect(content).toContain("dirty");
    expect(content).toContain("setDirty");
    expect(content).toContain("isModified");
  });

  it("includes all expected config keys", () => {
    const content = readFileSync(CONFIG_PAGE_PATH, "utf-8");
    const expectedKeys = [
      "brain_provider", "worker_provider", "fallback_provider",
      "cost_optimization", "claude_backend", "auth_mode",
      "mode", "output_splash", "output_mode", "output_theme",
      "search_enabled", "search_provider", "search_cache_ttl",
      "notify_on_complete", "notify_channel", "notify_url",
      "telemetry_enabled", "telemetry_anonymous",
      "detected_env", "multi_ide_mode",
      "skill_routing.design", "skill_routing.testing", "skill_routing.docs", "skill_routing.default",
    ];
    for (const key of expectedKeys) {
      expect(content).toContain(`"${key}"`);
    }
  });
});
