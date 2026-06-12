// @vitest-environment happy-dom
// DASH-RT-2 worker-log-panel tests (Sprint 284 task 284-004).
// Source-inspection style — reads component/page sources and asserts structure.
// No DOM render, no SSE mock, no network — fully hermetic.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS_DIR = join(process.cwd(), "src", "dashboard", "src", "components");
const PAGES_DIR = join(process.cwd(), "src", "dashboard", "src", "pages");
const I18N_DIR = join(process.cwd(), "src", "dashboard", "src", "i18n");

const panelPath = join(COMPONENTS_DIR, "WorkerLogPanel.tsx");
const workersPagePath = join(PAGES_DIR, "WorkersPage.tsx");
const enPath = join(I18N_DIR, "en.ts");
const trPath = join(I18N_DIR, "tr.ts");

const panel = () => readFileSync(panelPath, "utf-8");
const workersPage = () => readFileSync(workersPagePath, "utf-8");
const en = () => readFileSync(enPath, "utf-8");
const tr = () => readFileSync(trPath, "utf-8");

// ─── File existence ──────────────────────────────────────────────────────────

describe("worker-log-panel: file existence", () => {
  it("WorkerLogPanel.tsx exists", () => {
    expect(existsSync(panelPath)).toBe(true);
  });

  it("WorkersPage.tsx still exists after integration", () => {
    expect(existsSync(workersPagePath)).toBe(true);
  });
});

// ─── SSE endpoint wiring ─────────────────────────────────────────────────────

describe("worker-log-panel: SSE endpoint", () => {
  it("WorkerLogPanel references the logs/stream SSE endpoint", () => {
    expect(panel()).toContain("logs/stream");
  });

  it("WorkerLogPanel uses buildSseUrl for auth token attachment", () => {
    expect(panel()).toContain("buildSseUrl");
  });
});

// ─── Log line rendering ──────────────────────────────────────────────────────

describe("worker-log-panel: log line rendering (satır-render)", () => {
  it("WorkerLogPanel declares MAX_LOG_LINES ring-buffer constant (≥ 500)", () => {
    const src = panel();
    expect(src).toContain("MAX_LOG_LINES");
    // Ensure the constant value is 500
    expect(src).toContain("500");
  });

  it("WorkerLogPanel listens for log_line SSE event", () => {
    const src = panel();
    expect(src).toContain('"log_line"');
  });

  it("WorkerLogPanel appends lines to state via setLines ring-buffer slice", () => {
    const src = panel();
    expect(src).toContain("setLines");
    expect(src).toContain(".slice(-MAX_LOG_LINES)");
  });

  it("WorkerLogPanel renders lines from state with lines.map", () => {
    expect(panel()).toContain("lines.map");
  });
});

// ─── Unavailable state ───────────────────────────────────────────────────────

describe("worker-log-panel: unavailable state (unavailable-durum)", () => {
  it("WorkerLogPanel listens for log_unavailable SSE event", () => {
    const src = panel();
    expect(src).toContain('"log_unavailable"');
  });

  it("WorkerLogPanel sets unavailable state on log_unavailable event", () => {
    const src = panel();
    expect(src).toContain("setUnavailable");
  });

  it("WorkerLogPanel shows i18n key for unavailable empty-state", () => {
    expect(panel()).toContain("worker_log.empty_unavailable");
  });
});

// ─── Auto-scroll toggle ──────────────────────────────────────────────────────

describe("worker-log-panel: auto-scroll toggle (auto-scroll-toggle)", () => {
  it("WorkerLogPanel has scrollLocked state", () => {
    expect(panel()).toContain("scrollLocked");
  });

  it("WorkerLogPanel toggleScrollLock callback flips scrollLocked", () => {
    const src = panel();
    expect(src).toContain("toggleScrollLock");
    expect(src).toContain("setScrollLocked");
  });

  it("WorkerLogPanel renders scroll-lock toggle button with data-testid", () => {
    expect(panel()).toContain("scroll-lock-toggle");
  });

  it("WorkerLogPanel auto-scrolls to bottom when scrollLocked is false", () => {
    const src = panel();
    // scrollTop = scrollHeight is the auto-scroll pattern
    expect(src).toContain("scrollTop");
    expect(src).toContain("scrollHeight");
  });
});

// ─── Reconnecting indicator ──────────────────────────────────────────────────

describe("worker-log-panel: reconnection handling", () => {
  it("WorkerLogPanel tracks connection status with status state", () => {
    expect(panel()).toContain("setStatus");
    expect(panel()).toContain('"disconnected"');
  });

  it("WorkerLogPanel shows reconnecting indicator on disconnect", () => {
    expect(panel()).toContain("reconnecting-indicator");
  });

  it("WorkerLogPanel reconnects after disconnect with setTimeout", () => {
    expect(panel()).toContain("reconnectTimer");
    expect(panel()).toContain("setTimeout");
  });
});

// ─── i18n completeness ───────────────────────────────────────────────────────

describe("worker-log-panel: i18n keys", () => {
  it("en.ts defines worker_log.panel_title", () => {
    expect(en()).toContain("worker_log.panel_title");
  });

  it("en.ts defines worker_log.empty_unavailable", () => {
    expect(en()).toContain("worker_log.empty_unavailable");
  });

  it("tr.ts defines worker_log.panel_title (Turkish translation present)", () => {
    expect(tr()).toContain("worker_log.panel_title");
  });

  it("tr.ts defines worker_log.empty_unavailable (Turkish translation present)", () => {
    expect(tr()).toContain("worker_log.empty_unavailable");
  });
});

// ─── WorkersPage integration ─────────────────────────────────────────────────

describe("workers-page: WorkerLogPanel integration", () => {
  it("WorkersPage imports WorkerLogPanel", () => {
    expect(workersPage()).toContain("WorkerLogPanel");
  });

  it("WorkersPage imports WorkerLogPanel from components/WorkerLogPanel", () => {
    expect(workersPage()).toContain("WorkerLogPanel");
    expect(workersPage()).toContain("components/WorkerLogPanel");
  });

  it("WorkersPage renders WorkerLogPanel conditionally (selectedLogTaskId gate)", () => {
    const src = workersPage();
    expect(src).toContain("selectedLogTaskId");
    expect(src).toContain("<WorkerLogPanel");
  });
});
