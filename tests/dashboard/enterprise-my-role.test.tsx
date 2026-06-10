// @vitest-environment happy-dom
// EnterprisePage "BENİM rolüm" — source-inspection tests (Sprint 277, Task 277-009).
// Fully hermetic — reads .tsx source, no network, no gitignored state.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PAGE_PATH = join(process.cwd(), "src", "dashboard", "src", "pages", "EnterprisePage.tsx");
const src = () => readFileSync(PAGE_PATH, "utf-8");

describe("EnterprisePage — my role highlight (277-009)", () => {
  it("EnterprisePage.tsx exists", () => {
    expect(existsSync(PAGE_PATH)).toBe(true);
  });

  it("imports useAuth hook", () => {
    const content = src();
    expect(content).toContain("useAuth");
    expect(content).toContain("identity");
  });

  it("oidc-role: renders 'You are: <role>' badge when identity.role is present", () => {
    const content = src();
    expect(content).toContain("You are:");
    expect(content).toContain("my-role-badge");
    expect(content).toContain("identity?.role");
  });

  it("static-mode: renders 'local (full access)' badge when mode is static and no role", () => {
    const content = src();
    expect(content).toContain("local (full access)");
    expect(content).toContain("static");
  });

  it("rbac-matrix: highlights user's own role row with my-role-row data-testid", () => {
    const content = src();
    expect(content).toContain("my-role-row");
    expect(content).toContain("isMyRole");
    expect(content).toContain("identity?.role === entry.role");
  });

  it("rbac-matrix: shows 'You' indicator badge inside the matched role row", () => {
    const content = src();
    expect(content).toContain("my-role-indicator");
    expect(content).toMatch(/>\s*You\s*</);
  });
});
