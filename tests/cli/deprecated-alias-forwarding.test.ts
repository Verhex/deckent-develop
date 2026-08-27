import { describe, expect, it } from 'vitest';
import { DEPRECATED_FORWARDING } from '../../src/cli/surface-contract.js';
import { getLanguage, getMessage } from '../../src/cli/helpers/messages.js';

describe('deprecated forwarding catalog', () => {
  it('defines one non-empty, single-line typed warning for every deprecated command', () => {
    expect(DEPRECATED_FORWARDING).toHaveLength(12);
    for (const surface of DEPRECATED_FORWARDING) {
      const warning = getMessage(surface.warningKey, getLanguage(undefined));
      expect(warning).not.toBe(surface.warningKey);
      expect(warning).not.toContain('\n');
    }
  });
});
