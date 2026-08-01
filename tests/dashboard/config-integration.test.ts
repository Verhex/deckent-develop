import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchJson, postJson, ApiError } from "../../src/dashboard/src/lib/api.js";

const mockFetch = vi.fn();
const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch;
  // Sprint 191 Task 191-010 — api client reads `window.__DECKENT_API_TOKEN__`
  // for the bootstrap Bearer header. Tests run without it, so the header
  // object is empty `{}` on GET and `{ "Content-Type": ... }` on POST.
  (globalThis as { window: unknown }).window = {};
});

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window: unknown }).window = originalWindow;
  }
});

// ─── Config API Integration — Dashboard Client ───────────────────

describe("Config API integration — dashboard client", () => {
  describe("GET /api/config", () => {
    it("returns config object with expected shape", async () => {
      const configData = {
        mode: "balanced",
        max_workers: 4,
        brain_model: "claude-opus-4-8",
        language: "en",
        memory_budget: 600,
      };
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(configData) });

      const result = await fetchJson<typeof configData>("/api/config");

      expect(result.mode).toBe("balanced");
      expect(result.max_workers).toBe(4);
      expect(result.brain_model).toBe("claude-opus-4-8");
      expect(result.language).toBe("en");
      expect(result.memory_budget).toBe(600);
    });

    it("sends GET request to correct URL", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await fetchJson("/api/config");

      // Sprint 191 Task 191-010: fetchJson passes a `headers` object so the
      // bootstrap Authorization header can ride along when present.
      expect(mockFetch).toHaveBeenCalledWith("/api/config", { headers: {} });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("throws ApiError(404) when config not found", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });

      await expect(fetchJson("/api/config")).rejects.toThrow(ApiError);

      try {
        await fetchJson("/api/config");
      } catch (err) {
        expect((err as ApiError).status).toBe(404);
      }
    });
  });

  describe("POST /api/config", () => {
    it("sends correct JSON payload", async () => {
      const payload = { mode: "economic" };
      const merged = { mode: "economic", max_workers: 4 };
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(merged) });

      await postJson("/api/config", payload);

      expect(mockFetch).toHaveBeenCalledWith("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    });

    it("returns merged config from server response", async () => {
      const merged = { mode: "economic", max_workers: 4, brain_model: "claude-opus-4-8" };
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(merged) });

      const result = await postJson<typeof merged>("/api/config", { mode: "economic" });

      expect(result.mode).toBe("economic");
      expect(result.max_workers).toBe(4);
      expect(result.brain_model).toBe("claude-opus-4-8");
    });

    it("throws ApiError(422) on validation failure", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 422, statusText: "Unprocessable Entity" });

      await expect(postJson("/api/config", { max_workers: -1 })).rejects.toThrow(ApiError);

      try {
        await postJson("/api/config", { max_workers: -1 });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(422);
      }
    });

    it("throws ApiError(400) on non-object body", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, statusText: "Bad Request" });

      await expect(postJson("/api/config", "not-an-object")).rejects.toThrow(ApiError);

      try {
        await postJson("/api/config", "not-an-object");
      } catch (err) {
        expect((err as ApiError).status).toBe(400);
      }
    });
  });

  // ─── Round-Trip Simulations ──────────────────────────────────

  describe("Config round-trip — POST → GET", () => {
    it("mode round-trip: POST economic → GET returns economic", async () => {
      const initialConfig = { mode: "balanced", max_workers: 4 };
      const updatedConfig = { mode: "economic", max_workers: 4 };

      // POST call returns merged config
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedConfig),
      });
      // GET call returns the same merged config (simulating disk write then read)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedConfig),
      });

      // Act: POST then GET
      const postResult = await postJson<typeof updatedConfig>("/api/config", { mode: "economic" });
      const getResult = await fetchJson<typeof updatedConfig>("/api/config");

      // Assert: both return same mode value
      expect(postResult.mode).toBe("economic");
      expect(getResult.mode).toBe("economic");
      // Confirm initial unrelated field preserved
      expect(postResult.max_workers).toBe(initialConfig.max_workers);
    });

    it("language round-trip: POST tr → GET returns tr", async () => {
      const updatedConfig = { mode: "balanced", language: "tr" };

      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(updatedConfig) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(updatedConfig) });

      const postResult = await postJson<typeof updatedConfig>("/api/config", { language: "tr" });
      const getResult = await fetchJson<typeof updatedConfig>("/api/config");

      expect(postResult.language).toBe("tr");
      expect(getResult.language).toBe("tr");
    });

    it("5-field round-trip: all fields match after POST → GET", async () => {
      const fullConfig = {
        mode: "performance",
        max_workers: 8,
        brain_model: "claude-opus-4-8",
        language: "tr",
        memory_budget: 900,
      };

      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(fullConfig) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(fullConfig) });

      const postResult = await postJson<typeof fullConfig>("/api/config", fullConfig);
      const getResult = await fetchJson<typeof fullConfig>("/api/config");

      // POST → GET round-trip: all 5 fields must match
      expect(postResult.mode).toBe("performance");
      expect(postResult.max_workers).toBe(8);
      expect(postResult.brain_model).toBe("claude-opus-4-8");
      expect(postResult.language).toBe("tr");
      expect(postResult.memory_budget).toBe(900);

      expect(getResult.mode).toBe(postResult.mode);
      expect(getResult.max_workers).toBe(postResult.max_workers);
      expect(getResult.brain_model).toBe(postResult.brain_model);
      expect(getResult.language).toBe(postResult.language);
      expect(getResult.memory_budget).toBe(postResult.memory_budget);
    });

    it("nested key round-trip: skill_routing.testing preserved after partial update", async () => {
      const merged = {
        mode: "balanced",
        skill_routing: { testing: true, security: true, documentation: true },
      };

      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(merged) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(merged) });

      const postResult = await postJson<typeof merged>("/api/config", {
        skill_routing: { security: true },
      });
      const getResult = await fetchJson<typeof merged>("/api/config");

      // Nested sub-keys preserved in round-trip
      expect(postResult.skill_routing.testing).toBe(true);
      expect(postResult.skill_routing.security).toBe(true);
      expect(getResult.skill_routing.testing).toBe(true);
      expect(getResult.skill_routing.security).toBe(true);
    });

    it("nested key round-trip: modes.performance.max_workers updated, brain_model preserved", async () => {
      const merged = {
        modes: { performance: { max_workers: 8, brain_model: "claude-opus-4-8" }, balanced: { max_workers: 2 } },
      };

      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(merged) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(merged) });

      const postResult = await postJson<typeof merged>("/api/config", {
        modes: { performance: { max_workers: 8 } },
      });
      const getResult = await fetchJson<typeof merged>("/api/config");

      expect(postResult.modes.performance.max_workers).toBe(8);
      expect(postResult.modes.performance.brain_model).toBe("claude-opus-4-8");
      expect(postResult.modes.balanced.max_workers).toBe(2);

      expect(getResult.modes.performance.max_workers).toBe(8);
      expect(getResult.modes.performance.brain_model).toBe("claude-opus-4-8");
    });
  });

  // ─── GET /api/config/defaults ───────────────────────────────

  describe("GET /api/config/defaults", () => {
    it("returns default config object", async () => {
      const defaults = { mode: "balanced", max_workers: 4, brain_model: "claude-opus-4-8" };
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(defaults) });

      const result = await fetchJson<typeof defaults>("/api/config/defaults");

      expect(result).toEqual(defaults);
      expect(mockFetch).toHaveBeenCalledWith("/api/config/defaults", { headers: {} });
    });
  });

  // ─── Error Handling ──────────────────────────────────────────

  describe("Error handling", () => {
    it("GET /api/config propagates network error", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(fetchJson("/api/config")).rejects.toThrow("Network error");
    });

    it("POST /api/config propagates network error", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(postJson("/api/config", { mode: "balanced" })).rejects.toThrow("Network error");
    });

    it("POST /api/config 500 throws ApiError", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });

      try {
        await postJson("/api/config", { mode: "balanced" });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(500);
      }
    });
  });
});
