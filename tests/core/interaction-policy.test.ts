import { describe, it, expect } from 'vitest';
import { resolveInteractionPolicy } from '../../src/core/interaction-policy.js';

describe('resolveInteractionPolicy', () => {
  it('batch → non-interactive, auto-approve, no stream', () => {
    const policy = resolveInteractionPolicy('batch');
    expect(policy.autoApproveDefault).toBe(true);
    expect(policy.promptUser).toBe(false);
    expect(policy.streamOutput).toBe(false);
  });

  it('interactive → prompt user, no auto-approve, no stream', () => {
    const policy = resolveInteractionPolicy('interactive');
    expect(policy.autoApproveDefault).toBe(false);
    expect(policy.promptUser).toBe(true);
    expect(policy.streamOutput).toBe(false);
  });

  it('streaming → like interactive plus stream output', () => {
    const policy = resolveInteractionPolicy('streaming');
    expect(policy.autoApproveDefault).toBe(false);
    expect(policy.promptUser).toBe(true);
    expect(policy.streamOutput).toBe(true);
  });

  it('undefined mode → conservative interactive default', () => {
    const policy = resolveInteractionPolicy(undefined);
    expect(policy.autoApproveDefault).toBe(false);
    expect(policy.promptUser).toBe(true);
    expect(policy.streamOutput).toBe(false);
  });

  it('absent mode (no arg) → conservative interactive default', () => {
    const policy = resolveInteractionPolicy();
    expect(policy.autoApproveDefault).toBe(false);
    expect(policy.promptUser).toBe(true);
    expect(policy.streamOutput).toBe(false);
  });

  it('unknown/future mode → conservative interactive default', () => {
    // Cast to test runtime fallback for unrecognised future modes
    const policy = resolveInteractionPolicy('unknown' as never);
    expect(policy.autoApproveDefault).toBe(false);
    expect(policy.promptUser).toBe(true);
    expect(policy.streamOutput).toBe(false);
  });
});
