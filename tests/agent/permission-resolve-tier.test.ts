import { describe, it, expect } from 'vitest';
import { resolveTier } from '../../src/agent/permission.js';
import { SAFE_DEFAULT_POLICY, type PermissionPolicy } from '../../src/agent/permission-policy.js';

const tool = { name: 'write_file', category: 'coding', tier: 'confirm' as const };

describe('resolveTier (policy tierMap overrides ToolDefinition.tier)', () => {
  it('falls back to the tool default tier when policy has no override', () => {
    expect(resolveTier(tool, SAFE_DEFAULT_POLICY)).toBe('confirm');
  });
  it('a name override wins over the tool default', () => {
    const policy: PermissionPolicy = { ...SAFE_DEFAULT_POLICY, tierMap: { write_file: 'always' } };
    expect(resolveTier(tool, policy)).toBe('always');
  });
  it('a category override applies when no name override exists', () => {
    const policy: PermissionPolicy = { ...SAFE_DEFAULT_POLICY, tierMap: { coding: 'silent' } };
    expect(resolveTier(tool, policy)).toBe('silent');
  });
  it('a name override beats a category override', () => {
    const policy: PermissionPolicy = { ...SAFE_DEFAULT_POLICY, tierMap: { write_file: 'always', coding: 'silent' } };
    expect(resolveTier(tool, policy)).toBe('always');
  });
});
