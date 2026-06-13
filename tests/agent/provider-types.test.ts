import { describe, it, expect } from 'vitest';
import {
  validateProviderRequest,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest,
} from '../../src/agent/provider-tooluse/types.js';

const validReq: ProviderRequest = {
  system: 'you are deckent',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ name: 'read_file', description: 'read', input_schema: { type: 'object' } }],
  model: 'claude-fable-5',
};

describe('validateProviderRequest', () => {
  it('returns null for a well-formed request', () => {
    expect(validateProviderRequest(validReq)).toBeNull();
  });
  it('rejects empty model', () => {
    expect(validateProviderRequest({ ...validReq, model: '' })).toMatch(/model/);
  });
  it('rejects a message with an unknown role', () => {
    expect(validateProviderRequest({ ...validReq, messages: [{ role: 'system' as never, content: 'x' }] })).toMatch(/role/);
  });
  it('rejects non-array tools', () => {
    expect(validateProviderRequest({ ...validReq, tools: null as never })).toMatch(/tools/);
  });
});

describe('ProviderAdapter (mock conforms to interface)', () => {
  it('a mock adapter yields normalized ProviderEvents', async () => {
    const mock: ProviderAdapter = {
      name: 'mock',
      async *send() {
        yield { type: 'text-delta', text: 'hel' } as ProviderEvent;
        yield { type: 'tool-call', id: 'c0', name: 'read_file', args: { path: 'x' } };
        yield { type: 'usage', inputTokens: 5, outputTokens: 1 };
        yield { type: 'done' };
      },
    };
    const seen: string[] = [];
    for await (const ev of mock.send(validReq)) seen.push(ev.type);
    expect(seen).toEqual(['text-delta', 'tool-call', 'usage', 'done']);
  });
});
