// tests/agent/anthropic-parallel-toolresult.test.ts
// born-532: sibling tool_results from one parallel tool-use round must be
// merged into ONE user message (Anthropic message-shape contract) instead
// of being sent as N separate consecutive user messages.
import { describe, it, expect } from 'vitest';
import { createAnthropicAdapter } from '../../src/agent/provider-tooluse/anthropic.js';
import type { ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

/** fakeFetch that captures the parsed JSON request body for inspection. */
function capturingFetch(sse: string): { fetchImpl: typeof fetch; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string) as Record<string, unknown>);
    return { ok: true, status: 200, body: (async function* () { yield new TextEncoder().encode(sse); })() };
  }) as unknown as typeof fetch;
  return { fetchImpl, bodies };
}

async function drain(fetchImpl: typeof fetch, req: ProviderRequest): Promise<ProviderEvent[]> {
  const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl });
  const out: ProviderEvent[] = [];
  for await (const e of a.send(req)) out.push(e);
  return out;
}

const DONE_SSE = 'event: message_stop\ndata: {}\n\n';

describe('createAnthropicAdapter — parallel tool_result merge (born-532)', () => {
  it('merges 2 consecutive sibling tool results into ONE user message', async () => {
    const { fetchImpl, bodies } = capturingFetch(DONE_SSE);
    const req: ProviderRequest = {
      system: 'sys', model: 'claude-fable-5',
      messages: [
        { role: 'user', content: 'read x and y' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'read_file', args: { path: 'x.txt' } }, { id: 'b', name: 'read_file', args: { path: 'y.txt' } }] },
        { role: 'tool', content: 'BODY:x.txt', toolCallId: 'a' },
        { role: 'tool', content: 'BODY:y.txt', toolCallId: 'b' },
      ],
      tools: [],
    };
    await drain(fetchImpl, req);
    const sent = bodies[0]!['messages'] as Array<{ role: string; content: unknown }>;
    // exactly 3 wire messages: user, assistant(tool_use x2), ONE merged user(tool_result x2)
    expect(sent).toHaveLength(3);
    const toolResultMsg = sent[2]!;
    expect(toolResultMsg.role).toBe('user');
    expect(toolResultMsg.content).toEqual([
      { type: 'tool_result', tool_use_id: 'a', content: 'BODY:x.txt' },
      { type: 'tool_result', tool_use_id: 'b', content: 'BODY:y.txt' },
    ]);
  });

  it('merges 3+ sibling tool results into one message, preserving order', async () => {
    const { fetchImpl, bodies } = capturingFetch(DONE_SSE);
    const req: ProviderRequest = {
      system: 'sys', model: 'claude-fable-5',
      messages: [
        { role: 'tool', content: 'R1', toolCallId: '1' },
        { role: 'tool', content: 'R2', toolCallId: '2' },
        { role: 'tool', content: 'R3', toolCallId: '3' },
      ],
      tools: [],
    };
    await drain(fetchImpl, req);
    const sent = bodies[0]!['messages'] as Array<{ role: string; content: unknown }>;
    expect(sent).toHaveLength(1);
    expect(sent[0]!.content).toEqual([
      { type: 'tool_result', tool_use_id: '1', content: 'R1' },
      { type: 'tool_result', tool_use_id: '2', content: 'R2' },
      { type: 'tool_result', tool_use_id: '3', content: 'R3' },
    ]);
  });

  it('single-tool path is unchanged: one tool result -> one user message, one-element content array', async () => {
    const { fetchImpl, bodies } = capturingFetch(DONE_SSE);
    const req: ProviderRequest = {
      system: 'sys', model: 'claude-fable-5',
      messages: [
        { role: 'user', content: 'read x' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'read_file', args: { path: 'x.txt' } }] },
        { role: 'tool', content: 'BODY:x.txt', toolCallId: 'a' },
      ],
      tools: [],
    };
    await drain(fetchImpl, req);
    const sent = bodies[0]!['messages'] as Array<{ role: string; content: unknown }>;
    expect(sent).toHaveLength(3);
    expect(sent[2]!).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'BODY:x.txt' }] });
  });

  it('does not merge across a non-tool message: two separate rounds stay two separate user messages', async () => {
    const { fetchImpl, bodies } = capturingFetch(DONE_SSE);
    const req: ProviderRequest = {
      system: 'sys', model: 'claude-fable-5',
      messages: [
        { role: 'tool', content: 'R1', toolCallId: '1' },
        { role: 'assistant', content: 'interim note' },
        { role: 'tool', content: 'R2', toolCallId: '2' },
      ],
      tools: [],
    };
    await drain(fetchImpl, req);
    const sent = bodies[0]!['messages'] as Array<{ role: string; content: unknown }>;
    expect(sent).toHaveLength(3);
    expect(sent[0]!).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'R1' }] });
    expect(sent[1]!).toEqual({ role: 'assistant', content: 'interim note' });
    expect(sent[2]!).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: '2', content: 'R2' }] });
  });
});
