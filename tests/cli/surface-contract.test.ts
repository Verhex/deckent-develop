import { describe, expect, it } from 'vitest';
import { DEPRECATED_FORWARDING, LIMITS_PROVIDER_FILTERS, SURFACE_CONTRACT, SURFACE_SUBCOMMAND_GROUPS } from '../../src/cli/surface-contract.js';

describe('702-001 surface contract', () => {
  it('declares all deprecated forwarding mappings', () => {
    expect(DEPRECATED_FORWARDING).toHaveLength(12);
    expect(Object.fromEntries(DEPRECATED_FORWARDING.map(row => [row.command, row.replacement]))).toEqual({
      dashboard: 'status --watch', attach: 'watch', output: 'watch --logs', 'plan-nl': 'do',
      'archive-debt': 'status --debt', confirmations: 'approvals', checkpoint: 'approvals',
      'audit-verify': 'audit verify', 'autonomous-mission': 'autonomous mission', explain: 'retro --explain',
      recall: 'memory recall', remember: 'memory remember',
    });
  });
  it('declares option and subcommand groups', () => {
    expect(SURFACE_CONTRACT.approvals.option).toBe('--class <class>');
    expect(SURFACE_CONTRACT.approvals.classes).toHaveLength(7);
    expect(LIMITS_PROVIDER_FILTERS.map(row => row.option)).toEqual(['--claude', '--codex', '--cursor']);
    expect(SURFACE_SUBCOMMAND_GROUPS).toEqual({ audit: ['verify'], autonomous: ['mission'], memory: ['recall', 'remember'] });
    expect(SURFACE_CONTRACT.retro.map(row => row.option)).toEqual(['--explain', '--task <id>']);
  });
});
