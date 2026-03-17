import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchJson, postJson, ApiError } from "../../src/dashboard/src/lib/api.js";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch;
});

describe("dashboard/lib/api", () => {
  describe("fetchJson()", () => {
    it("returns parsed JSON on success", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: "test" }),
      });

      const result = await fetchJson("/api/status");
      expect(result).toEqual({ data: "test" });
      expect(mockFetch).toHaveBeenCalledWith("/api/status");
    });

    it("throws ApiError on non-ok response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(fetchJson("/api/missing")).rejects.toThrow(ApiError);
      await expect(fetchJson("/api/missing")).rejects.toThrow("GET /api/missing failed: Not Found");
    });

    it("ApiError has correct status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      try {
        await fetchJson("/api/fail");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(500);
      }
    });
  });

  describe("postJson()", () => {
    it("sends POST with JSON body", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await postJson("/api/start", { autoApprove: true });
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoApprove: true }),
      });
    });

    it("sends POST without body when undefined", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await postJson("/api/action");
      expect(mockFetch).toHaveBeenCalledWith("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: undefined,
      });
    });

    it("throws ApiError on failure", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
      });

      await expect(postJson("/api/start", {})).rejects.toThrow(ApiError);
      await expect(postJson("/api/start", {})).rejects.toThrow("POST /api/start failed: Conflict");
    });
  });

  describe("ApiError", () => {
    it("has correct name and properties", () => {
      const err = new ApiError(422, "Validation failed");
      expect(err.name).toBe("ApiError");
      expect(err.status).toBe(422);
      expect(err.message).toBe("Validation failed");
      expect(err).toBeInstanceOf(Error);
    });
  });
});
