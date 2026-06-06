/**
 * Sprint 238 İŞ9 — Ollama stream UTF-8 chunk-boundary safety (F11-012).
 *
 * Audit conclusion (2026-06-06): the streaming decode path is ALREADY UTF-8-safe
 * — `OllamaAdapter.stream()` uses `new TextDecoder()` + `decode(value, { stream:
 * true })`, which buffers incomplete multi-byte sequences across reader chunks,
 * and gemini's stream + `set-directives` stdin (Buffer.concat → toString) are
 * likewise safe. Turkish letters (ı ş ğ İ ç ö ü) are single BMP code points
 * (display width 1 = .length 1), so REPL line-editing width math is unaffected.
 *
 * This is therefore a REGRESSION GUARD: it locks in the chunk-boundary safety so
 * a future refactor to per-chunk `.toString('utf-8')` (which WOULD corrupt a
 * multi-byte char split across two network reads) is caught. It feeds bytes
 * ONE AT A TIME, guaranteeing every multi-byte UTF-8 sequence is split across
 * read() boundaries — the worst case.
 *
 * Hermetic: fetchImpl is injected; no network, no disk.
 */
import { describe, it, expect } from 'vitest';
import { OllamaAdapter } from '../../src/providers/ollama.js';
import type { ModelType } from '../../src/core/types.js';

const PROJECT_DIR = '/tmp/ollama-utf8-test';
const MODEL = 'qwen3.6:27b' as ModelType;

/**
 * A reader that yields the byte array ONE byte per read() — guaranteeing every
 * multi-byte UTF-8 sequence (ş = 0xC5 0x9F, etc.) is split across boundaries.
 */
function oneBytePerReadReader(bytes: Uint8Array) {
  let i = 0;
  return {
    read: async () => {
      if (i >= bytes.length) return { done: true, value: undefined };
      const value = bytes.subarray(i, i + 1);
      i += 1;
      return { done: false, value };
    },
    releaseLock() { /* no-op */ },
    cancel: async () => { /* no-op */ },
  };
}

/** fetchImpl that answers /api/tags (model probe) + /api/chat (byte-split stream). */
function makeFetchImpl(ndjsonLines: string[]): typeof fetch {
  const bytes = new TextEncoder().encode(ndjsonLines.join(''));
  return (async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/api/tags')) {
      return { ok: true, status: 200, json: async () => ({ models: [{ name: 'qwen3.6:27b' }] }) } as unknown as Response;
    }
    // /api/chat — body.getReader() drips one byte at a time.
    return { ok: true, status: 200, body: { getReader: () => oneBytePerReadReader(bytes) } } as unknown as Response;
  }) as unknown as typeof fetch;
}

async function collect(gen: AsyncGenerator<string, void, void>): Promise<string> {
  let out = '';
  for await (const c of gen) out += c;
  return out;
}

describe('Sprint 238 İŞ9 — Ollama stream UTF-8 chunk-boundary safety (F11-012)', () => {
  it('reassembles Turkish multi-byte chars split byte-by-byte across reads', async () => {
    const content = 'şahane çözüm: ığİ düğün öğün ÇŞĞÜÖİ';
    const line = JSON.stringify({ message: { content }, done: true }) + '\n';
    const adapter = new OllamaAdapter(PROJECT_DIR, { host: 'http://localhost:11434', fetchImpl: makeFetchImpl([line]) });
    await adapter.refreshSupportedModels();

    const out = await collect(adapter.stream('hi', MODEL));
    expect(out).toBe(content);
  });

  it('reassembles across multiple NDJSON lines, each split mid-character', async () => {
    const parts = ['şa', 'ha', 'ne ', 'çöz', 'üm ', 'ğİ ışık'];
    const lines = parts.map((p) => JSON.stringify({ message: { content: p } }) + '\n');
    const adapter = new OllamaAdapter(PROJECT_DIR, { host: 'http://localhost:11434', fetchImpl: makeFetchImpl(lines) });
    await adapter.refreshSupportedModels();

    const out = await collect(adapter.stream('hi', MODEL));
    expect(out).toBe(parts.join(''));
    // The classic Turkish trap: dotted-İ and dotless-ı both survive intact.
    expect(out).toContain('İ');
    expect(out).toContain('ı');
  });

  it('does not corrupt a 3-byte / 4-byte sequence (em-dash + emoji) interleaved with Turkish', async () => {
    const content = 'çözüm — tamam 🚀 ışık';
    const line = JSON.stringify({ message: { content }, done: true }) + '\n';
    const adapter = new OllamaAdapter(PROJECT_DIR, { host: 'http://localhost:11434', fetchImpl: makeFetchImpl([line]) });
    await adapter.refreshSupportedModels();

    const out = await collect(adapter.stream('hi', MODEL));
    expect(out).toBe(content);
  });
});
