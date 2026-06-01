// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLiveData } from "../../src/dashboard/src/lib/use-live-data";

type Json = { ok: boolean; n?: number };

function jsonResponse(body: Json, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

describe("useLiveData — stale-while-revalidate", () => {
  it("keeps previous data on next-poll failure (does NOT reset to null) and flips isStale=true", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ ok: true, n: 1 }))
      .mockRejectedValueOnce(new Error("network down"));

    // Slow poll so the first success state is observable before the next tick.
    const { result } = renderHook(() =>
      useLiveData<Json>("/api/test", { pollIntervalMs: 200, retryDelayMs: 200 }),
    );

    // initial fetch resolves — data populated, NOT stale
    await waitFor(() => {
      expect(result.current.data).toEqual({ ok: true, n: 1 });
      expect(result.current.isStale).toBe(false);
      expect(result.current.status).toBe("connected");
    });

    // next poll rejects → status reconnecting, but previous data is PRESERVED
    await waitFor(
      () => {
        expect(result.current.status).toBe("reconnecting");
      },
      { timeout: 2000 },
    );
    expect(result.current.data).toEqual({ ok: true, n: 1 });
    expect(result.current.isStale).toBe(true);
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe("useLiveData — retry on disconnect", () => {
  it("retries fetch after disconnect and recovers", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jsonResponse({ ok: true, n: 2 }));

    const { result } = renderHook(() =>
      useLiveData<Json>("/api/test", { pollIntervalMs: 60_000, retryDelayMs: 30 }),
    );

    // retry kicks in after retryDelayMs and succeeds
    await waitFor(() => {
      expect(result.current.data).toEqual({ ok: true, n: 2 });
      expect(result.current.status).toBe("connected");
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // after recovery, error is cleared and data is fresh
    expect(result.current.error).toBeNull();
    expect(result.current.isStale).toBe(false);
  });
});

describe("useLiveData — abort on unmount", () => {
  it("aborts in-flight request and stops polling when component unmounts", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFetch: ((r: Response) => void) | undefined;
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      capturedSignal = init.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });

    const { unmount } = renderHook(() =>
      useLiveData<Json>("/api/test", { pollIntervalMs: 30, retryDelayMs: 30 }),
    );

    // wait until the hook has registered the abort signal
    await waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);

    // resolve the dangling promise; the hook must not schedule further polls
    resolveFetch?.(jsonResponse({ ok: true, n: 99 }));
    await new Promise((r) => setTimeout(r, 100));

    // only the initial fetch was called — no further polls scheduled
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("useLiveData — graceful error handling", () => {
  it("populates error and flips status to reconnecting when fetch returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: false }, false));

    const { result } = renderHook(() =>
      useLiveData<Json>("/api/test", { pollIntervalMs: 60_000, retryDelayMs: 60_000 }),
    );

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });
    expect(result.current.error?.message).toContain("500");
    expect(result.current.status).toBe("reconnecting");
    expect(result.current.data).toBeNull();
    expect(result.current.isStale).toBe(true);
  });
});
