import { describe, expect, it } from 'vitest';
import { decide, type PermissionContext } from '../../src/agent/permission.js';
import {
  grantPatternFor,
  type PermissionRule,
} from '../../src/agent/permission-types.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { isTerminalEvent, type PermissionAutoDecisionEvent } from '../../src/agent/events.js';

const rule = (tool: string, pattern: string): PermissionRule => ({ tool, pattern });

const context = (overrides: Partial<PermissionContext> = {}): PermissionContext => ({
  rules: [],
  denies: [],
  policy: SAFE_DEFAULT_POLICY,
  mode: 'suggest',
  ...overrides,
});

describe('remembered permission grants', () => {
  it.each(['session', 'always'] as const)(
    'uses tool-wide coverage for a %s grant',
    (lifetime) => {
      expect(grantPatternFor('deckent_bash', 'npm test', lifetime)).toBe('**');
    },
  );

  it('pins deny → floor → silent → grant → mode precedence', () => {
    const broadGrant = rule('write_file', '**');
    const broadDeny = rule('write_file', '**');

    // 1. An explicit deny outranks every lower step.
    expect(decide('write_file', 'src/x.ts', 'silent', context({
      denies: [broadDeny],
      rules: [broadGrant],
      mode: 'full-auto',
    }))).toBe('deny');

    // 2. The always-floor outranks silent, grants, and mode.
    expect(decide('write_file', 'src/x.ts', 'always', context({
      rules: [broadGrant],
      mode: 'full-auto',
    }))).toBe('ask');

    // 3. Silent auto-allows without consulting a lower grant or mode.
    expect(decide('read_file', 'src/x.ts', 'silent', context())).toBe('allow');

    // 4. A matching grant outranks suggest mode for confirm-tier calls.
    expect(decide('write_file', 'src/x.ts', 'confirm', context({
      rules: [broadGrant],
    }))).toBe('allow');

    // 5. Mode decides only after no higher-precedence condition matched.
    expect(decide('write_file', 'src/x.ts', 'confirm', context({
      mode: 'full-auto',
    }))).toBe('allow');
  });

  it('never lets a tool-wide grant cover an always-tier call', () => {
    const pattern = grantPatternFor('deckent_bash', 'npm test', 'session');
    expect(decide('deckent_bash', 'rm -rf tmp', 'always', context({
      rules: [rule('deckent_bash', pattern)],
      mode: 'full-auto',
    }))).toBe('ask');
  });
});

describe('PermissionAutoDecisionEvent', () => {
  it('is an intermediate AgentEvent with the complete audit shape', () => {
    const event: PermissionAutoDecisionEvent = {
      type: 'permission-auto-decision',
      tool: 'deckent_bash',
      resource: 'ls',
      resourceClass: 'safe-read',
      decision: 'allow',
      matchedRule: null,
      mode: 'full-auto',
      tier: 'silent',
      grantLifetime: 'none',
      floor: false,
    };

    expect(event).toEqual({
      type: 'permission-auto-decision',
      tool: 'deckent_bash',
      resource: 'ls',
      resourceClass: 'safe-read',
      decision: 'allow',
      matchedRule: null,
      mode: 'full-auto',
      tier: 'silent',
      grantLifetime: 'none',
      floor: false,
    });
    expect(isTerminalEvent(event)).toBe(false);
  });
});
