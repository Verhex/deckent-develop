import { describe, it, expect } from 'vitest';
import { OutboundLimiter } from '../../src/api/terminal/outbound-limiter.js';

describe('outbound-limiter (I5 tenant isolation)', () => {
  it('(a) per-tenant isolation: tenant A exhausting does not affect tenant B', () => {
    const lim = new OutboundLimiter({ quotaBytes: 100, warnFraction: 0.5 });
    expect(lim.track('A', 60).action).toBe('warn');
    expect(lim.track('A', 50).action).toBe('kill');
    // Tenant B unaffected
    expect(lim.track('B', 10).action).toBe('pass');
    expect(lim.usage('B')).toBe(10);
    expect(lim.usage('A')).toBeGreaterThanOrEqual(100);
  });

  it('(b) warn one-shot: first crossing of warn threshold emits warn, subsequent calls pass', () => {
    const lim = new OutboundLimiter({ quotaBytes: 100, warnFraction: 0.5 });
    expect(lim.track('A', 60).action).toBe('warn');
    expect(lim.track('A', 10).action).toBe('pass'); // still under quota, warn already emitted
    expect(lim.track('A', 5).action).toBe('pass');
  });

  it('(c) kill threshold: bytesUsed >= quota triggers kill', () => {
    const lim = new OutboundLimiter({ quotaBytes: 100 });
    expect(lim.track('A', 100).action).toBe('kill');
  });

  it('(d) window reset: after windowMs elapses, state rotates', () => {
    let t = 1000;
    const lim = new OutboundLimiter({
      quotaBytes: 100,
      windowMs: 1000,
      now: () => t,
    });
    lim.track('A', 100); // kill
    expect(lim.track('A', 1).action).toBe('kill'); // still in window
    t += 1001; // advance past windowMs
    const result = lim.track('A', 1);
    expect(result.action).toBe('pass');
    expect(result.bytesUsed).toBe(1);
  });
});
