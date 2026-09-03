// tests/cli/native-mock-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { resolveNativeProvider } from '../../src/cli/repl/native-transport.js';
import type { ProviderEvent } from '../../src/agent/provider-tooluse/types.js';

describe('DECKENT_NATIVE_MOCK', () => {
  it('returns a scripted adapter that replays the mock script, ignoring real transport', async () => {
    const script: ProviderEvent[][] = [[{ type: 'text-delta', text: 'mocked' }, { type: 'done' }]];
    const r = resolveNativeProvider({ DECKENT_NATIVE_MOCK: JSON.stringify(script) }, {}, process.cwd());
    expect('adapter' in r).toBe(true);
    if ('adapter' in r) {
      const out: ProviderEvent[] = [];
      for await (const e of r.adapter.send({ system: 's', model: 'm', messages: [], tools: [] })) out.push(e);
      expect(out).toEqual([{ type: 'text-delta', text: 'mocked' }, { type: 'done' }]);
    }
  });
});
