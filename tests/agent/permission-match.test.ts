import { describe, it, expect } from 'vitest';
import { matchRule, type PermissionRule } from '../../src/agent/permission-types.js';

const rule = (tool: string, pattern: string): PermissionRule => ({ tool, pattern });

describe('matchRule', () => {
  it('matches exact tool + ** pattern (any resource)', () => {
    expect(matchRule(rule('write_file', '**'), 'write_file', 'anything/here.ts')).toBe(true);
  });
  it('respects tool name mismatch', () => {
    expect(matchRule(rule('write_file', '**'), 'bash', 'x')).toBe(false);
  });
  it('matches a directory glob src/**', () => {
    expect(matchRule(rule('write_file', 'src/**'), 'write_file', 'src/agent/loop.ts')).toBe(true);
    expect(matchRule(rule('write_file', 'src/**'), 'write_file', 'docs/x.md')).toBe(false);
  });
  it('matches single-segment * (no slash)', () => {
    expect(matchRule(rule('read_file', 'src/*'), 'read_file', 'src/index.ts')).toBe(true);
    expect(matchRule(rule('read_file', 'src/*'), 'read_file', 'src/agent/loop.ts')).toBe(false);
  });
  it('matches a bash command prefix pattern', () => {
    expect(matchRule(rule('bash', 'npm test*'), 'bash', 'npm test --run')).toBe(true);
    expect(matchRule(rule('bash', 'npm test*'), 'bash', 'rm -rf /')).toBe(false);
  });
});
