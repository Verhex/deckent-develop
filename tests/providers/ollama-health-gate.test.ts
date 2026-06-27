/**
 * Hermetic tests for OllamaAdapter.checkHealthGate() — AS-2 §4A Phase-2 hardening.
 *
 * All network calls go through the injectable `fetchImpl`; no real Ollama server is touched.
 *
 * Coverage:
 *   - /api/tags returns models → gate true with model list
 *   - host down (rejected fetch) → gate false + actionable reason, no throw, no hang
 *   - requested model absent → gate false + reason names the model
 *   - requested model present → gate true
 *   - /api/tags returns empty models → gate false
 *   - /api/tags returns non-2xx → gate false
 */
import { describe, it, expect } from 'vitest';

import { OllamaAdapter } from '../../src/providers/ollama.js';

const PROJECT_DIR = '/tmp/test-ollama-health-gate';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeFetch(fn: () => Response | Promise<Response>): typeof fetch {
  return (async (_input: RequestInfo | URL, _init?: RequestInit) => fn()) as unknown as typeof fetch;
}

function rejectFetch(message: string): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

describe('OllamaAdapter.checkHealthGate', () => {
  it('returns available=true with populated model list when /api/tags returns models', async () => {
    const fetchImpl = makeFetch(() =>
      jsonResponse({ models: [{ name: 'qwen2.5-coder:7b' }, { name: 'llama3:8b' }] }),
    );
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const result = await adapter.checkHealthGate();

    expect(result.available).toBe(true);
    expect(result.models).toEqual(['qwen2.5-coder:7b', 'llama3:8b']);
    expect(result.reason).toMatch(/ready|available/i);
  });

  it('returns available=false with actionable reason when host is down — no throw, no hang', async () => {
    const fetchImpl = rejectFetch('ECONNREFUSED');
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });

    // Must not throw
    const result = await adapter.checkHealthGate();

    expect(result.available).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.reason).toMatch(/unreachable|ECONNREFUSED/i);
  });

  it('returns available=false when the requested model is not installed', async () => {
    const fetchImpl = makeFetch(() =>
      jsonResponse({ models: [{ name: 'llama3:8b' }] }),
    );
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const result = await adapter.checkHealthGate('qwen2.5-coder:7b');

    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/qwen2\.5-coder:7b/);
    // Installed list still surfaced so caller can suggest alternatives
    expect(result.models).toContain('llama3:8b');
  });

  it('returns available=true when the requested model is present', async () => {
    const fetchImpl = makeFetch(() =>
      jsonResponse({ models: [{ name: 'qwen2.5-coder:7b' }, { name: 'llama3:8b' }] }),
    );
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const result = await adapter.checkHealthGate('qwen2.5-coder:7b');

    expect(result.available).toBe(true);
    expect(result.models).toContain('qwen2.5-coder:7b');
  });

  it('returns available=false when /api/tags responds with an empty model list', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({ models: [] }));
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const result = await adapter.checkHealthGate();

    expect(result.available).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.reason).toMatch(/no models|not found/i);
  });

  it('returns available=false when /api/tags returns non-2xx status', async () => {
    const fetchImpl = makeFetch(() => new Response('Internal Error', { status: 500 }));
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const result = await adapter.checkHealthGate();

    expect(result.available).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.reason).toMatch(/500/);
  });

  it('returns available=false when /api/tags body has no models field', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({}));
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const result = await adapter.checkHealthGate();

    expect(result.available).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('does not fall back to another provider — honest-fail on error', async () => {
    const fetchImpl = rejectFetch('network timeout');
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const result = await adapter.checkHealthGate('qwen2.5-coder:7b');

    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/unreachable|timeout/i);
    // Verify: result type, no provider name leaking a fallback
    expect(result.reason).not.toMatch(/claude|codex|gemini/i);
  });
});
