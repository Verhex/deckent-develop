// @vitest-environment happy-dom
/**
 * Task 326-011: WorkerLogViewer + ResultPanel — faithful DOM tests.
 *
 * Test strategy:
 *   1. Source inspection — files exist, export the right symbols, use correct patterns.
 *   2. DOM render (WorkerLogViewer) — mock EventSource, fire log-backfill / log events,
 *      assert events appear in the DOM in seq order.
 *   3. DOM render (ResultPanel) — render with mock TaskResult data, assert all sections
 *      present and their key fields visible.
 *
 * EventSource is mocked globally (happy-dom provides one, but we need full control over
 * named-event dispatch). Pattern matches chat-stream-client.test.ts.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Import components ────────────────────────────────────────────────────────

import {
  WorkerLogViewer,
} from "../../src/dashboard/src/components/WorkerLogViewer";

import {
  ResultPanel,
  type PartialTaskResult,
} from "../../src/dashboard/src/components/ResultPanel";

// ─── Mock api helpers ─────────────────────────────────────────────────────────

vi.mock("../../src/dashboard/src/lib/api", () => ({
  buildSseUrl: vi.fn((url: string) => url),
  getBootstrapApiToken: vi.fn(() => null),
  fetchJson: vi.fn().mockResolvedValue({}),
  postJson: vi.fn().mockResolvedValue({}),
}));

// ─── Mock EventSource ─────────────────────────────────────────────────────────
//
// We need full control over named-event dispatch (log-backfill, log, done),
// so we replace the global EventSource with a controllable fake.

interface ESInstance {
  url: string;
  onopen: (() => void) | null;
  onerror: ((e?: unknown) => void) | null;
  _listeners: Map<string, Array<(e: Event) => void>>;
  addEventListener: (name: string, fn: (e: Event) => void) => void;
  removeEventListener: (name: string, fn: (e: Event) => void) => void;
  close: () => void;
  /** Fire a named SSE event with JSON-serialised payload. */
  fire: (name: string, data: unknown) => void;
  /** Trigger onerror. */
  error: () => void;
}

let latestEs: ESInstance | null = null;

class MockEventSource {
  url: string;
  onopen: (() => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  _listeners: Map<string, Array<(e: Event) => void>> = new Map();

  constructor(url: string) {
    this.url = url;
    latestEs = this as unknown as ESInstance;
    // Fire onopen asynchronously to simulate real EventSource behaviour.
    Promise.resolve().then(() => {
      if (this.onopen) this.onopen();
    });
  }

  addEventListener(name: string, fn: (e: Event) => void) {
    const list = this._listeners.get(name) ?? [];
    list.push(fn);
    this._listeners.set(name, list);
  }

  removeEventListener(name: string, fn: (e: Event) => void) {
    const list = this._listeners.get(name) ?? [];
    this._listeners.set(name, list.filter((f) => f !== fn));
  }

  close() {
    // no-op for mock
  }

  fire(name: string, data: unknown) {
    const list = this._listeners.get(name) ?? [];
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    for (const fn of list) fn(ev);
  }

  error() {
    if (this.onerror) this.onerror();
  }
}

const _originalES = (globalThis as { EventSource?: unknown }).EventSource;

beforeEach(() => {
  vi.clearAllMocks();
  latestEs = null;
  (globalThis as { EventSource: unknown }).EventSource = MockEventSource;
  // Provide a window without API token for most tests.
  (globalThis as { window: unknown }).window = {};
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  latestEs = null;
  if (_originalES === undefined) {
    delete (globalThis as { EventSource?: unknown }).EventSource;
  } else {
    (globalThis as { EventSource: unknown }).EventSource = _originalES;
  }
});

// ─── Paths ────────────────────────────────────────────────────────────────────

const COMPONENTS_DIR = join(process.cwd(), "src", "dashboard", "src", "components");
const LOG_VIEWER_PATH = join(COMPONENTS_DIR, "WorkerLogViewer.tsx");
const RESULT_PANEL_PATH = join(COMPONENTS_DIR, "ResultPanel.tsx");

// ─── 1. Source inspection ─────────────────────────────────────────────────────

describe("WorkerLogViewer — source file", () => {
  it("WorkerLogViewer.tsx exists", () => {
    expect(existsSync(LOG_VIEWER_PATH)).toBe(true);
  });

  it("exports WorkerLogViewer function component", () => {
    const src = readFileSync(LOG_VIEWER_PATH, "utf-8");
    expect(src).toContain("export function WorkerLogViewer");
  });

  it("subscribes to log-backfill SSE event", () => {
    const src = readFileSync(LOG_VIEWER_PATH, "utf-8");
    expect(src).toContain('"log-backfill"');
  });

  it("subscribes to log SSE event for live appends", () => {
    const src = readFileSync(LOG_VIEWER_PATH, "utf-8");
    expect(src).toContain('"log"');
  });

  it("subscribes to done SSE event for stream termination", () => {
    const src = readFileSync(LOG_VIEWER_PATH, "utf-8");
    expect(src).toContain('"done"');
  });

  it("uses EventSource for SSE connection", () => {
    const src = readFileSync(LOG_VIEWER_PATH, "utf-8");
    expect(src).toContain("new EventSource");
  });

  it("uses buildSseUrl for auth token injection", () => {
    const src = readFileSync(LOG_VIEWER_PATH, "utf-8");
    expect(src).toContain("buildSseUrl");
  });

  it("has no emoji characters", () => {
    const src = readFileSync(LOG_VIEWER_PATH, "utf-8");
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/u;
    expect(emojiRe.test(src)).toBe(false);
  });

  it("renders events ordered by seq (sort by seq ascending)", () => {
    const src = readFileSync(LOG_VIEWER_PATH, "utf-8");
    expect(src).toContain("seq");
  });
});

describe("ResultPanel — source file", () => {
  it("ResultPanel.tsx exists", () => {
    expect(existsSync(RESULT_PANEL_PATH)).toBe(true);
  });

  it("exports ResultPanel function component", () => {
    const src = readFileSync(RESULT_PANEL_PATH, "utf-8");
    expect(src).toContain("export function ResultPanel");
  });

  it("renders token usage fields", () => {
    const src = readFileSync(RESULT_PANEL_PATH, "utf-8");
    expect(src).toContain("inputTokens");
    expect(src).toContain("outputTokens");
    expect(src).toContain("totalTokens");
  });

  it("renders cost fields", () => {
    const src = readFileSync(RESULT_PANEL_PATH, "utf-8");
    expect(src).toContain("cost");
    expect(src).toContain("usd");
    expect(src).toContain("isLocal");
  });

  it("renders files changed section", () => {
    const src = readFileSync(RESULT_PANEL_PATH, "utf-8");
    expect(src).toContain("filesChanged");
    expect(src).toContain("linesAdded");
    expect(src).toContain("linesRemoved");
  });

  it("renders tests section", () => {
    const src = readFileSync(RESULT_PANEL_PATH, "utf-8");
    expect(src).toContain("tests");
    expect(src).toContain("passed");
    expect(src).toContain("failed");
  });

  it("has no emoji characters", () => {
    const src = readFileSync(RESULT_PANEL_PATH, "utf-8");
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}]/u;
    expect(emojiRe.test(src)).toBe(false);
  });

  it("uses lucide-react icons, not emoji", () => {
    const src = readFileSync(RESULT_PANEL_PATH, "utf-8");
    expect(src).toContain("lucide-react");
  });
});

// ─── 2. WorkerLogViewer — DOM render tests ───────────────────────────────────

describe("WorkerLogViewer — DOM render", () => {
  it("renders the viewer container", () => {
    render(<WorkerLogViewer taskId="test-001" />);
    expect(screen.getByTestId("worker-log-viewer")).toBeDefined();
  });

  it("shows empty state before any events", () => {
    render(<WorkerLogViewer taskId="test-001" />);
    expect(screen.getByTestId("log-empty-message")).toBeDefined();
  });

  it("renders events from log-backfill in seq order", async () => {
    render(<WorkerLogViewer taskId="test-002" />);

    await act(async () => {
      latestEs?.fire("log-backfill", {
        taskId: "test-002",
        events: [
          { seq: 2, ts: "2026-06-26T10:00:01.000Z", type: "text", content: "second line" },
          { seq: 1, ts: "2026-06-26T10:00:00.000Z", type: "text", content: "first line" },
          { seq: 3, ts: "2026-06-26T10:00:02.000Z", type: "text", content: "third line" },
        ],
        lastSeq: 3,
      });
    });

    const textEvents = screen.getAllByTestId("log-event-text");
    expect(textEvents.length).toBe(3);
    // Events must be sorted by seq: seq=1, seq=2, seq=3
    expect(textEvents[0]?.getAttribute("data-seq")).toBe("1");
    expect(textEvents[1]?.getAttribute("data-seq")).toBe("2");
    expect(textEvents[2]?.getAttribute("data-seq")).toBe("3");
  });

  it("appends new events from live log pushes without duplicating", async () => {
    render(<WorkerLogViewer taskId="test-003" />);

    await act(async () => {
      latestEs?.fire("log-backfill", {
        taskId: "test-003",
        events: [{ seq: 1, ts: "2026-06-26T10:00:00.000Z", type: "text", content: "first" }],
        lastSeq: 1,
      });
    });

    await act(async () => {
      latestEs?.fire("log", {
        taskId: "test-003",
        events: [{ seq: 2, ts: "2026-06-26T10:00:01.000Z", type: "text", content: "second" }],
        lastSeq: 2,
      });
    });

    const textEvents = screen.getAllByTestId("log-event-text");
    // Should have 2 events total (1 from backfill + 1 live), not a duplicate
    expect(textEvents.length).toBe(2);
    expect(textEvents[0]?.getAttribute("data-seq")).toBe("1");
    expect(textEvents[1]?.getAttribute("data-seq")).toBe("2");
  });

  it("does not duplicate events with the same seq already in view", async () => {
    render(<WorkerLogViewer taskId="test-004" />);

    await act(async () => {
      latestEs?.fire("log-backfill", {
        taskId: "test-004",
        events: [{ seq: 5, ts: "2026-06-26T10:00:00.000Z", type: "text", content: "event5" }],
        lastSeq: 5,
      });
    });

    // Push the same seq again — should be filtered out (seq <= lastSeq)
    await act(async () => {
      latestEs?.fire("log", {
        taskId: "test-004",
        events: [{ seq: 5, ts: "2026-06-26T10:00:00.000Z", type: "text", content: "event5" }],
        lastSeq: 5,
      });
    });

    const textEvents = screen.getAllByTestId("log-event-text");
    expect(textEvents.length).toBe(1);
  });

  it("renders turn events with the turn data-testid", async () => {
    render(<WorkerLogViewer taskId="test-005" />);

    await act(async () => {
      latestEs?.fire("log-backfill", {
        taskId: "test-005",
        events: [{ seq: 1, ts: "2026-06-26T10:00:00.000Z", type: "turn", content: {} }],
        lastSeq: 1,
      });
    });

    expect(screen.getByTestId("log-event-turn")).toBeDefined();
  });

  it("renders tool_use events with the tool_use data-testid", async () => {
    render(<WorkerLogViewer taskId="test-006" />);

    await act(async () => {
      latestEs?.fire("log-backfill", {
        taskId: "test-006",
        events: [
          {
            seq: 1,
            ts: "2026-06-26T10:00:00.000Z",
            type: "tool_use",
            content: { name: "Read", input: {} },
          },
        ],
        lastSeq: 1,
      });
    });

    expect(screen.getByTestId("log-event-tool_use")).toBeDefined();
  });

  it("renders stderr events with stderr data-testid", async () => {
    render(<WorkerLogViewer taskId="test-007" />);

    await act(async () => {
      latestEs?.fire("log-backfill", {
        taskId: "test-007",
        events: [{ seq: 1, ts: "2026-06-26T10:00:00.000Z", type: "stderr", content: "error!" }],
        lastSeq: 1,
      });
    });

    expect(screen.getByTestId("log-event-stderr")).toBeDefined();
  });

  it("renders usage events with usage data-testid", async () => {
    render(<WorkerLogViewer taskId="test-008" />);

    await act(async () => {
      latestEs?.fire("log-backfill", {
        taskId: "test-008",
        events: [
          {
            seq: 1,
            ts: "2026-06-26T10:00:00.000Z",
            type: "usage",
            content: { usage: { input_tokens: 100, output_tokens: 200 } },
          },
        ],
        lastSeq: 1,
      });
    });

    expect(screen.getByTestId("log-event-usage")).toBeDefined();
  });

  it("marks stream as done when done event received", async () => {
    render(<WorkerLogViewer taskId="test-009" />);

    // Wait for onopen to fire
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      latestEs?.fire("done", {});
    });

    expect(screen.getByTestId("status-done")).toBeDefined();
  });

  it("accepts label overrides for i18n", () => {
    render(
      <WorkerLogViewer
        taskId="test-010"
        labels={{ empty: "No events yet (custom)" }}
      />,
    );
    expect(screen.getByText("No events yet (custom)")).toBeDefined();
  });

  it("shows close button when onClose prop is provided", () => {
    const onClose = vi.fn();
    render(<WorkerLogViewer taskId="test-011" onClose={onClose} />);
    expect(screen.getByTestId("log-viewer-close")).toBeDefined();
  });

  it("does not show close button when onClose is not provided", () => {
    render(<WorkerLogViewer taskId="test-012" />);
    expect(screen.queryByTestId("log-viewer-close")).toBeNull();
  });
});

// ─── 3. ResultPanel — DOM render tests ───────────────────────────────────────

describe("ResultPanel — DOM render", () => {
  it("renders the panel container", () => {
    render(<ResultPanel result={{}} />);
    expect(screen.getByTestId("result-panel")).toBeDefined();
  });

  it("renders loading skeleton when result is null", () => {
    render(<ResultPanel result={null} />);
    expect(screen.getByTestId("result-panel-loading")).toBeDefined();
  });

  it("renders loading skeleton when result is undefined", () => {
    render(<ResultPanel result={undefined} />);
    expect(screen.getByTestId("result-panel-loading")).toBeDefined();
  });

  it("renders assessment section for DONE verdict", () => {
    const result: PartialTaskResult = { selfAssessment: "DONE", provider: "claude", model: "sonnet" };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-assessment")).toBeDefined();
    expect(screen.getByTestId("verdict-badge")).toBeDefined();
    expect(screen.getByTestId("verdict-badge").textContent).toContain("Done");
  });

  it("renders assessment section for NO_GO verdict", () => {
    const result: PartialTaskResult = { selfAssessment: "NO_GO" };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("verdict-badge").textContent).toContain("No-Go");
  });

  it("renders assessment section for GO_WITH_TECH_DEBT verdict", () => {
    const result: PartialTaskResult = { selfAssessment: "GO_WITH_TECH_DEBT" };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("verdict-badge").textContent).toContain("Tech Debt");
  });

  it("renders tokens section with input/output/total", () => {
    const result: PartialTaskResult = {
      tokenUsage: {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        source: "provider-adapter",
      },
    };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-tokens")).toBeDefined();
    expect(screen.getByTestId("section-tokens").textContent).toContain("1,000");
    expect(screen.getByTestId("section-tokens").textContent).toContain("500");
    expect(screen.getByTestId("section-tokens").textContent).toContain("1,500");
  });

  it("shows provider badge in tokens section", () => {
    const result: PartialTaskResult = {
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        source: "provider-adapter",
      },
    };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-tokens").textContent).toContain("provider");
  });

  it("shows estimated badge for tokenizer-fallback source", () => {
    const result: PartialTaskResult = {
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        source: "tokenizer-fallback",
      },
    };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-tokens").textContent).toContain("estimated");
  });

  it("renders cost section with usd value", () => {
    const result: PartialTaskResult = {
      cost: { usd: 0.0123, currency: "USD", pricingSource: "anthropic", isLocal: false },
    };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-cost")).toBeDefined();
    expect(screen.getByTestId("section-cost").textContent).toContain("0.0123");
  });

  it("shows Local label for isLocal cost", () => {
    const result: PartialTaskResult = {
      cost: { usd: 0, isLocal: true, currency: "USD", pricingSource: "local" },
    };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-cost").textContent).toContain("Local");
  });

  it("renders files section with file rows", () => {
    const result: PartialTaskResult = {
      filesChanged: [
        { path: "src/foo.ts", status: "added", linesAdded: 10, linesRemoved: 0 },
        { path: "src/bar.ts", status: "modified", linesAdded: 5, linesRemoved: 3 },
      ],
      totalLinesAdded: 15,
      totalLinesRemoved: 3,
    };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-files")).toBeDefined();
    const fileRows = screen.getAllByTestId("file-row");
    expect(fileRows.length).toBe(2);
    expect(screen.getByTestId("section-files").textContent).toContain("+10");
    expect(screen.getByTestId("section-files").textContent).toContain("+5");
    expect(screen.getByTestId("section-files").textContent).toContain("-3");
  });

  it("renders tests section with passed/failed/total", () => {
    const result: PartialTaskResult = {
      tests: {
        passed: 42,
        failed: 0,
        total: 42,
        coverage: 87.5,
        command: "npx vitest run foo.test.ts",
      },
    };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-tests")).toBeDefined();
    const content = screen.getByTestId("section-tests").textContent ?? "";
    expect(content).toContain("42");
    expect(content).toContain("87.5");
  });

  it("renders TSC section for clean build", () => {
    const result: PartialTaskResult = { tsc: { clean: true, errors: 0 } };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-tsc")).toBeDefined();
    expect(screen.getByTestId("section-tsc").textContent).toContain("yes");
  });

  it("renders TSC section with error count for failing build", () => {
    const result: PartialTaskResult = { tsc: { clean: false, errors: 3 } };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-tsc").textContent).toContain("no");
    expect(screen.getByTestId("section-tsc").textContent).toContain("3");
  });

  it("renders go-criteria section with met/unmet items", () => {
    const result: PartialTaskResult = {
      goCriteria: [
        { id: "tsc", description: "TSC passes", met: true, evidence: "tsc exit 0" },
        { id: "tests", description: "Tests pass", met: false, evidence: null },
      ],
    };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-go-criteria")).toBeDefined();
    expect(screen.getByTestId("section-go-criteria").textContent).toContain("TSC passes");
    expect(screen.getByTestId("section-go-criteria").textContent).toContain("Tests pass");
  });

  it("renders notes section when notes are present", () => {
    const result: PartialTaskResult = { notes: "All good, no regressions." };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-notes")).toBeDefined();
    expect(screen.getByTestId("section-notes").textContent).toContain("All good");
  });

  it("does not render notes section when notes are empty", () => {
    const result: PartialTaskResult = { notes: "" };
    render(<ResultPanel result={result} />);
    expect(screen.queryByTestId("section-notes")).toBeNull();
  });

  it("renders auditor section with OK status", () => {
    const result: PartialTaskResult = {
      auditorValidation: {
        status: "OK",
        checkedAt: "2026-06-26T10:00:00.000Z",
        missingFields: [],
      },
    };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-auditor")).toBeDefined();
    expect(screen.getByTestId("section-auditor").textContent).toContain("OK");
  });

  it("renders full result with all sections", () => {
    const result: PartialTaskResult = {
      selfAssessment: "DONE",
      provider: "claude",
      model: "sonnet",
      durationMs: 12345,
      tokenUsage: { inputTokens: 1000, outputTokens: 300, totalTokens: 1300, source: "provider-adapter" },
      cost: { usd: 0.0045, currency: "USD", pricingSource: "anthropic", isLocal: false },
      filesChanged: [{ path: "src/a.ts", status: "added", linesAdded: 20, linesRemoved: 0 }],
      tests: { passed: 10, failed: 0, total: 10 },
      tsc: { clean: true, errors: 0 },
      goCriteria: [{ id: "tsc", description: "TSC clean", met: true, evidence: null }],
      notes: "Completed successfully.",
      auditorValidation: { status: "OK", checkedAt: "2026-06-26T10:00:00.000Z" },
    };
    render(<ResultPanel result={result} />);
    expect(screen.getByTestId("section-assessment")).toBeDefined();
    expect(screen.getByTestId("section-timing")).toBeDefined();
    expect(screen.getByTestId("section-tokens")).toBeDefined();
    expect(screen.getByTestId("section-cost")).toBeDefined();
    expect(screen.getByTestId("section-files")).toBeDefined();
    expect(screen.getByTestId("section-tests")).toBeDefined();
    expect(screen.getByTestId("section-tsc")).toBeDefined();
    expect(screen.getByTestId("section-go-criteria")).toBeDefined();
    expect(screen.getByTestId("section-notes")).toBeDefined();
    expect(screen.getByTestId("section-auditor")).toBeDefined();
  });

  it("accepts label overrides for i18n", () => {
    const result: PartialTaskResult = { selfAssessment: "DONE" };
    render(
      <ResultPanel
        result={result}
        labels={{
          verdicts: { DONE: "Bitti", GO_WITH_TECH_DEBT: "Borç", NO_GO: "Red" },
        }}
      />,
    );
    expect(screen.getByTestId("verdict-badge").textContent).toContain("Bitti");
  });
});
