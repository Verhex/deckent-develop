// @vitest-environment happy-dom
// Sprint 269 Task 269-002 — Workers/Directives routes + {n} interpolation fix +
// Nervous live-data wire + canonical client unification.
//
// Mock strategy: hooks/useSSE and lib/use-live-data are module-mocked (push/poll
// transports); lib/api is the REAL canonical client driven through a stubbed
// global fetch — so page tests exercise the genuine token-attach/fetch path.
// App.tsx route assertions use source inspection (react-router-dom cannot be
// imported from workspace-root vitest — route-sidebar-wire.test.tsx precedent).
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LanguageProvider, useTranslation } from "../../src/dashboard/src/i18n/LanguageProvider";
import { en } from "../../src/dashboard/src/i18n/en";
import { tr } from "../../src/dashboard/src/i18n/tr";
import { navItems } from "../../src/dashboard/src/components/Sidebar";
import type { DashboardState } from "../../src/dashboard/src/types";

// ── hoisted mock state ──────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  mockSseState: null as unknown,
  liveDataMap: {} as Record<string, unknown>,
  liveDataCalls: [] as Array<{ url: string; opts: Record<string, unknown> }>,
  refreshSpy: vi.fn(),
}));

vi.mock("../../src/dashboard/src/hooks/useSSE", () => ({
  useSSE: vi.fn(() => h.mockSseState),
  useSSEWithStatus: vi.fn(() => ({ data: h.mockSseState, status: "connected" })),
}));

vi.mock("../../src/dashboard/src/lib/use-live-data", () => ({
  useLiveData: vi.fn((url: string, opts: Record<string, unknown> = {}) => {
    h.liveDataCalls.push({ url, opts });
    const enabled = opts.enabled !== false;
    return {
      data: enabled ? (h.liveDataMap[url] ?? null) : null,
      isStale: false,
      isLoading: false,
      error: null,
      status: "connected",
      refresh: h.refreshSpy,
    };
  }),
}));

import WorkersPage from "../../src/dashboard/src/pages/WorkersPage";
import DirectivesPage from "../../src/dashboard/src/pages/DirectivesPage";
import NervousPage from "../../src/dashboard/src/pages/NervousPage";
import {
  fetchJson,
  postJson,
  getBootstrapApiToken,
  buildSseUrl,
} from "../../src/dashboard/src/lib/api";
import * as apiClient from "../../src/dashboard/src/lib/api-client";

// ── fetch stub: "METHOD url" → JSON body ────────────────────────────────────
let fetchRoutes: Record<string, unknown> = {};
const fetchSpy = vi.fn(async (input: unknown, init?: { method?: string }) => {
  const key = `${init?.method ?? "GET"} ${String(input)}`;
  if (key in fetchRoutes) {
    return { ok: true, status: 200, statusText: "OK", json: async () => fetchRoutes[key] };
  }
  return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
});

function tokenWindow(): { __DECKENT_API_TOKEN__?: string } {
  return window as unknown as { __DECKENT_API_TOKEN__?: string };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fetchRoutes = {};
  h.liveDataMap = {};
  h.liveDataCalls.length = 0;
  h.mockSseState = null;
  delete tokenWindow().__DECKENT_API_TOKEN__;
});

function renderWithI18n(node: React.ReactElement) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");
const readApp = () => readFileSync(join(DASHBOARD_SRC, "App.tsx"), "utf-8");

const AGENTS_STATE: DashboardState = {
  sprint: { id: "sprint-269", phase: "EXECUTE", status: "RUNNING" },
  agents: [
    {
      id: "w-1",
      role: "frontend-designer",
      status: "EXECUTING",
      model: "sonnet",
      tmuxWindow: "0",
      taskId: "269-002",
      lastHeartbeat: new Date().toISOString(),
      backend: "tmux",
    },
    {
      id: "w-2",
      role: "api-builder",
      status: "DONE",
      model: "haiku",
      tmuxWindow: "1",
      taskId: "269-001",
      lastHeartbeat: new Date().toISOString(),
      backend: "tmux",
    },
  ],
  progress: { done: 1, active: 1, blocked: 0, total: 2 },
  alerts: [],
  updatedAt: new Date().toISOString(),
};

// ════════════════════════════════════════════════════════════════════════════
describe("App.tsx — /workers and /directives routes registered", () => {
  it('contains exactly 2 matches for path="/workers" | path="/directives" (kanıt grep)', () => {
    const matches = readApp().match(/path="\/workers"|path="\/directives"/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  it("imports both pages and renders them as route elements inside Layout", () => {
    const src = readApp();
    expect(src).toMatch(/from\s+["']\.\/pages\/WorkersPage["']/);
    expect(src).toMatch(/from\s+["']\.\/pages\/DirectivesPage["']/);
    const layoutIdx = src.indexOf("<Route element={<Layout");
    const layoutClose = src.indexOf("</Route>", layoutIdx);
    for (const needle of ['path="/workers"', 'path="/directives"', "<WorkersPage", "<DirectivesPage"]) {
      const idx = src.indexOf(needle);
      expect(idx, `${needle} must be inside the Layout route block`).toBeGreaterThan(layoutIdx);
      expect(idx).toBeLessThan(layoutClose);
    }
  });

  it("Sidebar navItems include /workers and /directives with i18n labelKeys and icons", () => {
    const workers = navItems.find((i) => i.to === "/workers");
    const directives = navItems.find((i) => i.to === "/directives");
    expect(workers?.labelKey).toBe("nav.workers");
    expect(directives?.labelKey).toBe("nav.directives");
    expect(workers?.icon).toBeDefined();
    expect(directives?.icon).toBeDefined();
    // both keys exist in BOTH dictionaries (i18n-FIRST)
    expect(en["nav.workers"]).toBeTruthy();
    expect(tr["nav.workers"]).toBeTruthy();
    expect(en["nav.directives"]).toBeTruthy();
    expect(tr["nav.directives"]).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("WorkersPage — live worker grid", () => {
  it("renders a card per worker with id, task, model and status from SSE state", () => {
    h.mockSseState = AGENTS_STATE;
    renderWithI18n(<WorkersPage />);

    expect(screen.getByTestId("workers-page")).toBeTruthy();
    expect(screen.getByText(/w-1/)).toBeTruthy();
    expect(screen.getByText(/w-2/)).toBeTruthy();
    expect(screen.getByText(/269-002/)).toBeTruthy();
    expect(screen.getByText(/sonnet/)).toBeTruthy();
    expect(screen.getByText("EXECUTING")).toBeTruthy();
    expect(screen.getByText("DONE")).toBeTruthy();
    expect(screen.getByTestId("workers-total").textContent).toContain("2");
    expect(screen.getByTestId("workers-executing").textContent).toContain("1");
  });

  it("shows the empty state when there are no workers", () => {
    h.mockSseState = { ...AGENTS_STATE, agents: [] };
    renderWithI18n(<WorkersPage />);
    expect(screen.getByText(en["worker.no_workers"])).toBeTruthy();
  });

  it("kill button posts to /api/kill/:id and triggers an immediate refresh", async () => {
    h.mockSseState = AGENTS_STATE;
    fetchRoutes["POST /api/kill/w-1"] = { ok: true };
    renderWithI18n(<WorkersPage />);

    // only the EXECUTING worker (w-1) renders a kill button
    const killBtn = screen.getByText(en["dashboard.kill"]).closest("button");
    expect(killBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(killBtn!);
    });

    expect(confirm).toHaveBeenCalled();
    const killCall = fetchSpy.mock.calls.find(
      ([url, init]) => String(url) === "/api/kill/w-1" && init?.method === "POST",
    );
    expect(killCall).toBeTruthy();
    expect(h.refreshSpy).toHaveBeenCalled();
  });

  it("falls back to polling /api/status via useLiveData when SSE has no data", () => {
    h.mockSseState = null;
    h.liveDataMap["/api/status"] = AGENTS_STATE;
    renderWithI18n(<WorkersPage />);

    const statusCall = h.liveDataCalls.find((c) => c.url === "/api/status");
    expect(statusCall).toBeTruthy();
    expect(statusCall!.opts["enabled"]).toBe(true);
    expect(screen.getByText(/w-1/)).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("DirectivesPage — load / edit / save", () => {
  const DIRECTIVES_MD = "# DIRECTIVES — Sprint 270\n\n## Task 1: A\n\n## Task 2: B\n";

  it("loads DIRECTIVES.md from GET /api/directives into the editor", async () => {
    fetchRoutes["GET /api/directives"] = { content: DIRECTIVES_MD };
    renderWithI18n(<DirectivesPage />);

    await waitFor(() => {
      const textarea = screen.getByTestId("directives-page-textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe(DIRECTIVES_MD);
    });
    expect(screen.queryByTestId("directives-load-warning")).toBeNull();
  });

  it("saves edited content via POST /api/directives and confirms with the task count", async () => {
    fetchRoutes["GET /api/directives"] = { content: DIRECTIVES_MD };
    fetchRoutes["POST /api/directives"] = { ok: true };
    renderWithI18n(<DirectivesPage />);

    await waitFor(() => {
      expect((screen.getByTestId("directives-page-textarea") as HTMLTextAreaElement).value).toBe(DIRECTIVES_MD);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("directives-page-save-btn"));
    });

    const saveCall = fetchSpy.mock.calls.find(
      ([url, init]) => String(url) === "/api/directives" && init?.method === "POST",
    );
    expect(saveCall).toBeTruthy();
    expect(JSON.parse((saveCall![1] as { body: string }).body)).toEqual({ content: DIRECTIVES_MD });
    // DIRECTIVES_MD contains 2 "## Task " headings → interpolated saved message
    expect(screen.getByTestId("directives-page-saved").textContent).toContain("2");
  });

  it("shows the load warning when the read endpoint is unavailable but stays editable", async () => {
    // no GET route registered → 404 → load fails
    renderWithI18n(<DirectivesPage />);

    await waitFor(() => {
      expect(screen.getByTestId("directives-load-warning")).toBeTruthy();
    });
    const textarea = screen.getByTestId("directives-page-textarea") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
    fireEvent.change(textarea, { target: { value: "## Task 1: compose" } });
    expect((screen.getByTestId("directives-page-save-btn") as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables save and warns while the content is empty", async () => {
    fetchRoutes["GET /api/directives"] = { content: "" };
    renderWithI18n(<DirectivesPage />);

    await waitFor(() => {
      expect(screen.getByTestId("directives-page-empty-warning")).toBeTruthy();
    });
    expect((screen.getByTestId("directives-page-save-btn") as HTMLButtonElement).disabled).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("A2 — {n} i18n interpolation", () => {
  function SubtitleProbe({ n }: { n: number }) {
    const { t } = useTranslation();
    return <p data-testid="subtitle-probe">{t("dashboard.subtitle", { n })}</p>;
  }

  it("dashboard.subtitle interpolates the worker count instead of a raw {n}", () => {
    renderWithI18n(<SubtitleProbe n={7} />);
    const text = screen.getByTestId("subtitle-probe").textContent ?? "";
    expect(text).toContain("7");
    expect(text).not.toContain("{n}");
    expect(text).not.toContain("{{n}}");
  });

  it("no en/tr dictionary value carries a single-brace placeholder (root-cause sweep)", () => {
    // t() interpolates {{key}} — a single-brace {key} can never be replaced.
    const singleBrace = /(?<!\{)\{[a-zA-Z0-9_]+\}(?!\})/;
    for (const [dictName, dict] of [["en", en], ["tr", tr]] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(
          singleBrace.test(String(value)),
          `${dictName}.${key} contains an un-interpolatable single-brace placeholder: ${String(value)}`,
        ).toBe(false);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("NervousPage — live data wire (one-shot → use-live-data)", () => {
  const PENDING = [
    {
      id: "p1",
      type: "agent-mutation",
      description: "Agent wants to mutate its core prompt",
      detector: "identity-drift-detector",
      createdAt: "2026-06-01T00:00:00Z",
      risk: "high" as const,
    },
  ];
  const STATUS = {
    panicGuard: false,
    detectors: [{ id: "d1", name: "identity-drift-detector", enabled: true, triggerCount: 3 }],
    pendingCount: 1,
  };

  it("routes status + pending through useLiveData with an enabled poll interval", () => {
    h.liveDataMap["/api/nervous/status"] = STATUS;
    h.liveDataMap["/api/nervous/pending"] = PENDING;
    renderWithI18n(<NervousPage />);

    for (const url of ["/api/nervous/status", "/api/nervous/pending"]) {
      const call = h.liveDataCalls.find((c) => c.url === url);
      expect(call, `useLiveData must be wired for ${url}`).toBeTruthy();
      expect(call!.opts["enabled"]).toBe(true);
      expect(typeof call!.opts["pollIntervalMs"]).toBe("number");
    }
    // live data actually renders
    expect(screen.getByTestId("pending-list")).toBeTruthy();
    expect(screen.getByTestId("approval-p1")).toBeTruthy();
  });

  it("accept posts the approval and immediately refreshes both live streams", async () => {
    h.liveDataMap["/api/nervous/status"] = STATUS;
    h.liveDataMap["/api/nervous/pending"] = PENDING;
    fetchRoutes["POST /api/nervous/accept/p1"] = { ok: true };
    renderWithI18n(<NervousPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("accept-p1"));
    });

    const acceptCall = fetchSpy.mock.calls.find(
      ([url, init]) => String(url) === "/api/nervous/accept/p1" && init?.method === "POST",
    );
    expect(acceptCall).toBeTruthy();
    // refetchPending + refetchStatus both map to useLiveData.refresh
    expect(h.refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("Canonical client — single token-read + Bearer attach (lib/api.ts)", () => {
  it("fetchJson attaches Authorization: Bearer when the bootstrap token is injected", async () => {
    tokenWindow().__DECKENT_API_TOKEN__ = "tok-269";
    fetchRoutes["GET /api/ping"] = { pong: true };

    await fetchJson("/api/ping");

    const [, init] = fetchSpy.mock.calls.find(([url]) => String(url) === "/api/ping")!;
    expect((init as { headers: Record<string, string> }).headers["Authorization"]).toBe("Bearer tok-269");
    expect(getBootstrapApiToken()).toBe("tok-269");
  });

  it("fetchJson sends no Authorization header when no token is injected", async () => {
    fetchRoutes["GET /api/ping"] = { pong: true };

    await fetchJson("/api/ping");

    const [, init] = fetchSpy.mock.calls.find(([url]) => String(url) === "/api/ping")!;
    expect((init as { headers: Record<string, string> }).headers["Authorization"]).toBeUndefined();
    expect(getBootstrapApiToken()).toBeUndefined();
  });

  it("api-client.ts re-exports the canonical client (no parallel token path)", () => {
    expect(apiClient.fetchJson).toBe(fetchJson);
    expect(apiClient.postJson).toBe(postJson);
    expect(apiClient.getBootstrapApiToken).toBe(getBootstrapApiToken);
  });

  it("buildSseUrl appends the token as a query parameter for EventSource", () => {
    tokenWindow().__DECKENT_API_TOKEN__ = "sse-tok";
    expect(buildSseUrl("/api/events")).toBe("/api/events?token=sse-tok");
    delete tokenWindow().__DECKENT_API_TOKEN__;
    expect(buildSseUrl("/api/events")).toBe("/api/events");
  });
});
