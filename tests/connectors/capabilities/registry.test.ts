import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { CapabilityRegistry } from '../../../src/connectors/capabilities/registry.js';
import type { Capability } from '../../../src/connectors/capabilities/types.js';

const fakeCap: Capability = {
  id: 'noop', titleKey: 'cap.noop.title', tier: 'read', defaultPolicy: 'auto', edition: 'solo',
  paramsSchema: z.object({}), preview: () => 'noop', run: async () => ({ text: 'ok' }),
};

describe('CapabilityRegistry', () => {
  it('registers and retrieves by id', () => {
    const r = new CapabilityRegistry();
    r.register(fakeCap);
    expect(r.has('noop')).toBe(true);
    expect(r.get('noop')).toBe(fakeCap);
    expect(r.list()).toHaveLength(1);
  });
  it('returns undefined / false for unknown id', () => {
    const r = new CapabilityRegistry();
    expect(r.get('ghost')).toBeUndefined();
    expect(r.has('ghost')).toBe(false);
  });
});
