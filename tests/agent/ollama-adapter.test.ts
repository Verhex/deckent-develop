// tests/agent/ollama-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { createOllamaAdapter } from '../../src/agent/provider-tooluse/ollama.js';
import type { ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const req: ProviderRequest = { system: 'sys', model: 'qwen3', messages: [{ role: 'user', content: 'hi' }], tools: [] };

describe('createOllamaAdapter', () => {
  it('has name "ollama" and streams via the OpenAI-compatible path at the ollama host', async () => {
    let calledUrl = '';
    const fetchImpl = (async (url: string) => {
      calledUrl = url;
      return { ok: true, status: 200, body: (async function* () { yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hey"}}]}\n\ndata: [DONE]\n\n'); })() };
    }) as unknown as typeof fetch;

    const a = createOllamaAdapter({ host: 'http://127.0.0.1:11434', fetchImpl });
    expect(a.name).toBe('ollama');
    const out: ProviderEvent[] = [];
    for await (const e of a.send(req)) out.push(e);
    expect(calledUrl).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(out).toContainEqual({ type: 'text-delta', text: 'hey' });
    expect(out[out.length - 1]).toEqual({ type: 'done' });
  });
});
