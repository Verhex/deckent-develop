import { describe, expect, it } from 'vitest';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';
import { DEPRECATED_FORWARDING, SURFACE_CONTRACT } from '../../src/cli/surface-contract.js';

describe('702-001 surface contract catalog', () => {
  it('has bilingual rows for every batch key', () => {
    const keys = [
      ...DEPRECATED_FORWARDING.map(row => row.warningKey), 'cli.batch.deprecated_forwarding',
      'cli.batch.limits.unavailable', 'cli.batch.truth.no_proof',
      ...SURFACE_CONTRACT.approvals.classes.map(name => `approvals.federated.class.${name}`),
      'approvals.opt_class', 'approvals.class_invalid', 'limits.opt_claude', 'limits.opt_codex',
      'limits.opt_cursor', 'cli.audit.verify.desc', 'cli.autonomous.mission.desc',
      'cli.memory.recall.desc', 'cli.memory.remember.desc', 'cli.retro.opt.explain', 'cli.retro.opt.task',
    ];
    for (const key of keys) {
      expect(getMessageLanguages(key), key).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en'), key).not.toBe(key);
      expect(getMessage(key, 'tr'), key).not.toBe(key);
    }
  });
  it('interpolates the shared deprecation template', () => {
    expect(getMessage('cli.batch.deprecated_forwarding', 'en', { oldCommand: 'legacy', replacement: 'new' })).toContain('legacy');
  });
});
