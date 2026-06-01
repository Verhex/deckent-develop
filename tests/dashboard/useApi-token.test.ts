import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useApi } from "../../src/dashboard/src/lib/useApi.js";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch;
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ok: true }),
    statusText: "OK",
  });
});

afterEach(() => {
  delete (globalThis as { window?: { __DECKENT_API_TOKEN__?: string } }).window
    ?.__DECKENT_API_TOKEN__;
});

describe("useApi — token injection", () => {
  it("GET with token attaches Authorization: Bearer header", async () => {
    (globalThis as { window: { __DECKENT_API_TOKEN__?: string } }).window = {
      __DECKENT_API_TOKEN__: "test-token-123",
    };

    const { result } = renderHook(() => useApi());
    await result.current.get("/api/status");

    expect(mockFetch).toHaveBeenCalledWith("/api/status", {
      headers: { Authorization: "Bearer test-token-123" },
    });
  });

  it("GET without token sends no Authorization header", async () => {
    (globalThis as { window: { __DECKENT_API_TOKEN__?: string } }).window = {};

    const { result } = renderHook(() => useApi());
    await result.current.get("/api/status");

    expect(mockFetch).toHaveBeenCalledWith("/api/status", { headers: {} });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("POST with token attaches Authorization: Bearer header", async () => {
    (globalThis as { window: { __DECKENT_API_TOKEN__?: string } }).window = {
      __DECKENT_API_TOKEN__: "tok-abc",
    };

    const { result } = renderHook(() => useApi());
    await result.current.post("/api/start", { autoApprove: true });

    expect(mockFetch).toHaveBeenCalledWith("/api/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tok-abc",
      },
      body: JSON.stringify({ autoApprove: true }),
    });
  });

  it("POST without token omits Authorization header", async () => {
    (globalThis as { window: { __DECKENT_API_TOKEN__?: string } }).window = {};

    const { result } = renderHook(() => useApi());
    await result.current.post("/api/start", { autoApprove: false });

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBeUndefined();
  });
});
