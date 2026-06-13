import { describe, it, expect } from 'vitest';
import { decide, type PermissionContext } from '../../src/agent/permission.js';
import type { PermissionRule } from '../../src/agent/permission-types.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';

const ctx = (over: Partial<PermissionContext> = {}): PermissionContext => ({
  rules: [],
  denies: [],
  policy: SAFE_DEFAULT_POLICY,
  mode: 'suggest',
  ...over,
});
const r = (tool: string, pattern: string): PermissionRule => ({ tool, pattern });

describe('decide — precedence (deny > floor > allow-rule > tier > mode)', () => {
  it('silent tier auto-allows with no rule', () => {
    expect(decide('read_file', 'src/x.ts', 'silent', ctx())).toBe('allow');
  });
  it('confirm tier asks with no rule in suggest mode', () => {
    expect(decide('write_file', 'src/x.ts', 'confirm', ctx())).toBe('ask');
  });
  it('an allow-rule auto-allows a confirm-tier tool', () => {
    expect(decide('write_file', 'src/x.ts', 'confirm', ctx({ rules: [r('write_file', 'src/**')] }))).toBe('allow');
  });
  it('a deny-rule overrides an allow-rule', () => {
    expect(decide('write_file', 'src/x.ts', 'confirm', ctx({
      rules: [r('write_file', 'src/**')], denies: [r('write_file', 'src/secret/**')],
    }))).toBe('allow');
    expect(decide('write_file', 'src/secret/k.ts', 'confirm', ctx({
      rules: [r('write_file', 'src/**')], denies: [r('write_file', 'src/secret/**')],
    }))).toBe('deny');
  });
  it('always-floor tool asks even with an allow-rule', () => {
    expect(decide('deckent_kill', '', 'confirm', ctx({ rules: [r('deckent_kill', '**')] }))).toBe('ask');
  });
  it('full-auto auto-allows confirm tier BUT never overrides the floor', () => {
    expect(decide('write_file', 'x', 'confirm', ctx({ mode: 'full-auto' }))).toBe('allow');
    expect(decide('deckent_kill', '', 'always', ctx({ mode: 'full-auto' }))).toBe('ask');
  });
  it('auto-edit auto-allows non-bash confirm, still asks bash', () => {
    expect(decide('write_file', 'x', 'confirm', ctx({ mode: 'auto-edit' }))).toBe('allow');
    expect(decide('bash', 'ls', 'confirm', ctx({ mode: 'auto-edit' }))).toBe('ask');
  });
});
