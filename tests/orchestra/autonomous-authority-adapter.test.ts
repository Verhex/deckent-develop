import { describe, it, expect } from 'vitest';
import { makeAuthorityChecker } from '../../src/orchestra/autonomous/authority-adapter.js';

describe('makeAuthorityChecker', () => {
  it('allowed-map: brain reading returns allowed', () => {
    const checker = makeAuthorityChecker();
    const result = checker.check('read_status', 'brain');
    expect(result.outcome).toBe('allowed');
    expect(result.reason).toBeTruthy();
  });

  it('needs_approval-map: worker writing to unknown target returns needs_approval', () => {
    const checker = makeAuthorityChecker();
    // 'write_config' maps to ActionType 'write', target 'write_config' has no
    // matching rule in the authority matrix → falls to default warn → needs_approval
    const result = checker.check('write_config', 'worker');
    expect(result.outcome).toBe('needs_approval');
    expect(result.reason).toBeTruthy();
  });

  it('denied-map: unrecognized requestedBy subject returns denied', () => {
    const checker = makeAuthorityChecker();
    const result = checker.check('deploy', 'external_user');
    expect(result.outcome).toBe('denied');
    expect(result.reason).toContain('external_user');
  });

  it('bilinmeyen→default-deny: empty requestedBy returns denied without calling checkAuthority', () => {
    const checker = makeAuthorityChecker();
    const result = checker.check('unknown_action', '');
    expect(result.outcome).toBe('denied');
    expect(result.reason).toContain('default-deny');
  });

  it('system requestedBy is treated as brain role and can read', () => {
    const checker = makeAuthorityChecker();
    const result = checker.check('read_memory', 'system');
    expect(result.outcome).toBe('allowed');
  });

  it('worker:tenant prefix resolves to worker role', () => {
    const checker = makeAuthorityChecker();
    // worker:tenant-1 → role=worker, read action → allowed
    const result = checker.check('get_status', 'worker:tenant-1');
    expect(result.outcome).toBe('allowed');
  });
});
