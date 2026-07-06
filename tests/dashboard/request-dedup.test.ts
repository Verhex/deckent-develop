// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { dedupedFetch } from "../../src/dashboard/src/lib/request-cache";

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("dedupedFetch — in-flight request dedup", () => {
  it("concurrent calls to the same URL share a single underlying fetch", async () => {
    let resolveFetch: ((r: Response) => void) | undefined;
    const mockFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const handleA = dedupedFetch("/api/status", {}, mockFetch as unknown as typeof fetch);
    const handleB = dedupedFetch("/api/status", {}, mockFetch as unknown as typeof fetch);

    // Two concurrent callers, same URL, in flight at once → ONE network call.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const response = okResponse({ n: 1 });
    resolveFetch?.(response);

    const [resA, resB] = await Promise.all([handleA.promise, handleB.promise]);
    expect(resA).toBe(response);
    expect(resB).toBe(response);

    handleA.release();
    handleB.release();
  });

  it("issues a fresh fetch after the previous in-flight request has settled (no TTL)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ n: 1 }))
      .mockResolvedValueOnce(okResponse({ n: 2 }));

    const handle1 = dedupedFetch("/api/status", {}, mockFetch as unknown as typeof fetch);
    await handle1.promise;
    handle1.release();

    const handle2 = dedupedFetch("/api/status", {}, mockFetch as unknown as typeof fetch);
    await handle2.promise;
    handle2.release();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not fetch twice for two DIFFERENT URLs (dedup keys by URL)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ n: 1 }))
      .mockResolvedValueOnce(okResponse({ n: 2 }));

    const handleA = dedupedFetch("/api/status", {}, mockFetch as unknown as typeof fetch);
    const handleB = dedupedFetch("/api/other", {}, mockFetch as unknown as typeof fetch);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    await Promise.all([handleA.promise, handleB.promise]);
    handleA.release();
    handleB.release();
  });

  it("reference-counts release: an underlying request is only aborted once every subscriber has released it", async () => {
    let resolveFetch: ((r: Response) => void) | undefined;
    let capturedSignal: AbortSignal | undefined;
    const mockFetch = vi.fn((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });

    const handleA = dedupedFetch("/api/status", {}, mockFetch as unknown as typeof fetch);
    const handleB = dedupedFetch("/api/status", {}, mockFetch as unknown as typeof fetch);

    // A releases first — B is still awaiting the same in-flight request.
    handleA.release();
    expect(capturedSignal?.aborted).toBe(false);

    // B releases (the LAST subscriber) — only now is the request aborted.
    handleB.release();
    expect(capturedSignal?.aborted).toBe(true);

    resolveFetch?.(okResponse({ n: 1 }));
  });
});
