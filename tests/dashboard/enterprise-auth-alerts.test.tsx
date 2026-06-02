// @vitest-environment happy-dom
// Enterprise page auth-wire + alerts dedup (sprint-220 task 220-010/011).
// Source-inspection style — reads .tsx source, fully hermetic (no network, no gitignored state).

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PAGE_PATH = join(process.cwd(), "src", "dashboard", "src", "pages", "EnterprisePage.tsx");
const src = () => readFileSync(PAGE_PATH, "utf-8");

describe("EnterprisePage — auth-wire + alerts dedup (220-011)", () => {
  it("EnterprisePage.tsx exists", () => {
    expect(existsSync(PAGE_PATH)).toBe(true);
  });

  it("enterprise auth-data: uses __DECKENT_API_TOKEN__ and exposes Authorization bearer indicator", () => {
    const content = src();
    expect(content).toContain("__DECKENT_API_TOKEN__");
    expect(content).toContain("Authorization");
    // Auth status badge renders "Authenticated" / "No auth token"
    expect(content).toContain("enterprise-auth-status");
  });

  it("tenant render: tenant-list section is present and renders tenant rows", () => {
    const content = src();
    expect(content).toContain("tenant-list");
    expect(content).toContain("/api/enterprise/tenants");
    expect(content).toContain("tenant.name");
  });

  it("alert-dedup tek: dedupDocSyncAlerts reduces multiple doc-sync alerts to one entry", () => {
    const content = src();
    // Dedup function must exist
    expect(content).toContain("dedupDocSyncAlerts");
    // Pattern must match CLAUDE.md and GEMINI.md doc-sync triggers
    expect(content).toContain("DOC_SYNC_RE");
    // Result is a single alert (docSyncSeen flag prevents duplicates)
    expect(content).toContain("docSyncSeen");
    // Alert section rendered from dedupedAlerts
    expect(content).toContain("dedupedAlerts");
    expect(content).toContain("enterprise-alerts");
  });

  it("provider-neutral: alert message includes CLAUDE/GEMINI/AGENTS, not just CLAUDE", () => {
    const content = src();
    // Provider label must be multi-provider
    expect(content).toContain("CLAUDE/GEMINI/AGENTS");
    // Must mention GEMINI (not only CLAUDE)
    expect(content).toContain("GEMINI");
    // Provider-neutral message string
    expect(content).toContain("Provider docs not synced");
  });
});
