// @vitest-environment happy-dom
// Task 410-001 — MASTER-PLAN 494 (W3-DASH-PERF): React.lazy route-splitting + istek-dedup.
//
// Discovery note (see .tasks/task-410-001.plan for the full trail): both fixes this task
// describes were already implemented by sprint-377 (commit c8e839aa, 377-002 + 377-003) and
// are already covered by tests/dashboard/lazy-routes.test.tsx, tests/dashboard/layout.test.ts,
// tests/dashboard/request-dedup.test.ts and tests/dashboard/use-live-data.test.ts. App.tsx and
// use-live-data.ts are therefore left untouched by this task — this file is the dedicated
// MASTER-PLAN-494 proof artifact, adding evidence the sibling suites don't already carry
// (a literal 3-concurrent-caller dedup fixture, per the task's explicit ask) plus a focused
// eager-import regression pin scoped to this task's page list.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook, waitFor } from "@testing-library/react";
import { dedupedFetch } from "../../src/dashboard/src/lib/request-cache";
import { useLiveData } from "../../src/dashboard/src/lib/use-live-data";

const APP_PATH = join(process.cwd(), "src", "dashboard", "src", "App.tsx");
const readApp = () => readFileSync(APP_PATH, "utf-8");

// ─── (1) Eager-import list — RED-önce evidence ─────────────────────────────
// These 9 pages must ship as separate chunks (React.lazy), never as a static
// top-level import. If any regresses back to eager, this assertion fails —
// that failure IS the "RED" this task asks for (proven locally by temporarily
// reverting one entry to a static import and observing the matching
// assertion fail, before restoring the file — no source change is committed).
const MUST_BE_LAZY_PAGES = [
  "HistoryPage",
  "MemoryPage",
  "ConfigPage",
  "StatusPage",
  "AutonomousPage",
  "DocsHealthPage",
  "MissionsPage",
  "LoginPage",
  "CallbackPage",
];

describe("MASTER-PLAN 494 — App.tsx route-splitting (eager-import regression pin)", () => {
  it.each(MUST_BE_LAZY_PAGES)(
    "%s is NOT a static top-level import (must stay lazy-loaded)",
    (page) => {
      const src = readApp();
      expect(src).not.toMatch(new RegExp(`^import ${page} from ["']\\./pages/${page}["']`, "m"));
      expect(src).toMatch(new RegExp(`const ${page} = lazy\\(\\(\\) => import\\(`));
    },
  );

  it("lazy+Suspense are live: App.tsx imports both and wires a Suspense fallback", () => {
    const src = readApp();
    expect(src).toMatch(/import\s+\{[^}]*\blazy\b[^}]*\}\s+from\s+["']react["']/);
    expect(src).toMatch(/import\s+\{[^}]*\bSuspense\b[^}]*\}\s+from\s+["']react["']/);
    expect(src).toContain("<Suspense fallback={");
  });

  it("contains no emoji characters (NO_GO condition)", () => {
    const src = readApp();
    // eslint-disable-next-line no-misleading-character-class
    const emojiRange = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiRange.test(src)).toBe(false);
  });
});

// ─── (2) Multi-fetch dedup fixture — literal 3-concurrent-caller evidence ──

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("MASTER-PLAN 494 — istek-dedup: 3 concurrent callers, 1 fetch (fake-fetch fixture)", () => {
  it("three simultaneous callers to the same URL share exactly one underlying fetch", async () => {
    let resolveFetch: ((r: Response) => void) | undefined;
    const mockFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const handleA = dedupedFetch("/api/status", {}, mockFetch as unknown as typeof fetch);
    const handleB = dedupedFetch("/api/status", {}, mockFetch as unknown as typeof fetch);
    const handleC = dedupedFetch("/api/status", {}, mockFetch as unknown as typeof fetch);

    // Three concurrent callers, same URL, all in flight at once -> ONE network call.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const response = okResponse({ n: 1 });
    resolveFetch?.(response);

    const [resA, resB, resC] = await Promise.all([
      handleA.promise,
      handleB.promise,
      handleC.promise,
    ]);
    expect(resA).toBe(response);
    expect(resB).toBe(response);
    expect(resC).toBe(response);

    handleA.release();
    handleB.release();
    handleC.release();
  });

  it("polling-storm shape: 3 useLiveData consumers polling the same URL still issue 1 fetch", async () => {
    const mockFetch = vi.fn(() => Promise.resolve(okResponse({ n: 1 })));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const hooks = [
      renderHook(() => useLiveData<{ n: number }>("/api/shared", { pollIntervalMs: 60_000 })),
      renderHook(() => useLiveData<{ n: number }>("/api/shared", { pollIntervalMs: 60_000 })),
      renderHook(() => useLiveData<{ n: number }>("/api/shared", { pollIntervalMs: 60_000 })),
    ];

    await waitFor(() => {
      for (const { result } of hooks) {
        expect(result.current.data).toEqual({ n: 1 });
      }
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    for (const { unmount } of hooks) unmount();
  });
});

// ─── (3) Abort-on-unmount pin ───────────────────────────────────────────────

describe("MASTER-PLAN 494 — dedup+abort testli: useLiveData cancels in-flight fetch on unmount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aborts the underlying request and issues no further polls after unmount", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFetch: ((r: Response) => void) | undefined;
    const mockFetch = vi.fn((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { unmount } = renderHook(() =>
      useLiveData<{ n: number }>("/api/abort-pin", { pollIntervalMs: 30, retryDelayMs: 30 }),
    );

    await waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);

    resolveFetch?.(okResponse({ n: 1 }));
    await new Promise((r) => setTimeout(r, 100));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
