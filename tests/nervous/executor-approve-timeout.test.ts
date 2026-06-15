// tests/nervous/executor-approve-timeout.test.ts
// make-usable #3 — the auto-proceed timer is configurable: a non-safety-floor
// 'approve' action auto-proceeds after the timeout, UNLESS the timeout is
// disabled (<=0 = never auto-proceed → stays pending until the user decides).
// Safety-floor (locked) actions never auto-proceed regardless.
import { describe, it, expect } from 'vitest';
import { shouldArmAutoProceed } from '../../src/nervous/executor.js';

describe('shouldArmAutoProceed (nervous approve auto-proceed gate)', () => {
  it('arms the timer for a non-safety-floor action with a positive timeout', () => {
    expect(shouldArmAutoProceed(false, 10_000)).toBe(true);
  });

  it('never arms for a safety-floor (locked) action — explicit approval required', () => {
    expect(shouldArmAutoProceed(true, 10_000)).toBe(false);
  });

  it('does not arm when auto-proceed is disabled (timeout <= 0 = never auto-proceed)', () => {
    expect(shouldArmAutoProceed(false, 0)).toBe(false);
    expect(shouldArmAutoProceed(false, -1)).toBe(false);
  });
});
