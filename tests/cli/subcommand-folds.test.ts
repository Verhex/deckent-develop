import { describe, expect, it } from 'vitest';
import { SURFACE_SUBCOMMAND_GROUPS } from '../../src/cli/surface-contract.js';

describe('subcommand fold contract', () => {
  it('declares every canonical folded command path', () => {
    expect(SURFACE_SUBCOMMAND_GROUPS).toEqual({
      audit: ['verify'],
      autonomous: ['mission'],
      memory: ['recall', 'remember'],
    });
  });
});
