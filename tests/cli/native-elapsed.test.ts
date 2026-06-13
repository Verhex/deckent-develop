// tests/cli/native-elapsed.test.ts
import { describe, it, expect } from 'vitest';
import { measuredOnTurnEnd } from '../../src/cli/repl/native-elapsed.js';

describe('measuredOnTurnEnd', () => {
  it('reports a non-negative elapsedMs and forwards tokens', () => {
    const seen: Array<{ elapsedMs: number; tokens?: number }> = [];
    const start = 1000;
    const now = () => 1042;
    const handler = measuredOnTurnEnd(start, now, (s) => seen.push(s));
    handler({ outputTokens: 7 });
    expect(seen[0]!.elapsedMs).toBe(42);
    expect(seen[0]!.tokens).toBe(7);
  });
  it('omits tokens when outputTokens is undefined', () => {
    const seen: Array<{ elapsedMs: number; tokens?: number }> = [];
    const handler = measuredOnTurnEnd(0, () => 5, (s) => seen.push(s));
    handler({});
    expect(seen[0]!.elapsedMs).toBe(5);
    expect('tokens' in seen[0]!).toBe(false);
  });
});
