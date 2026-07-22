import { describe, expect, it } from 'vitest';
import { resolveProviderExecutionCostClass } from '../../src/core/provider-execution-profile.js';

describe('provider execution-cost authority', () => {
  it('resolves built-in local and unknown remote providers from one catalog', () => {
    expect(resolveProviderExecutionCostClass('ollama')).toBe('local');
    expect(resolveProviderExecutionCostClass('future-cloud')).toBe('remote');
  });

  it('accepts a parametric custom local adapter declaration', () => {
    expect(resolveProviderExecutionCostClass('local-lab', 'local')).toBe('local');
  });

  it('fails loudly when catalog and adapter authorities disagree', () => {
    expect(() => resolveProviderExecutionCostClass('ollama', 'remote'))
      .toThrow('catalog=local, adapter=remote');
  });
});
