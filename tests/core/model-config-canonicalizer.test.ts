import { describe, expect, it } from 'vitest';
import {
  canonicalizeModelConfigAliases,
  hasLegacyModelConfigAliases,
} from '../../src/core/model-config-canonicalizer.js';

describe('canonicalizeModelConfigAliases', () => {
  it('canonicalizes every supported model-bearing config path with layer evidence', () => {
    const input = {
      brain_model: 'fable',
      default_model: 'gpt-5',
      native_model: 'opus',
      bot_agent: { model: 'haiku', enabled: true },
      modes: {
        balanced: { brain_model: 'sonnet', default_model: 'opus' },
        custom: { brain_model: 'gpt-5.6', default_model: 'gemini-2.5-pro' },
      },
    };

    const result = canonicalizeModelConfigAliases(input, 'project');

    expect(result.config).toMatchObject({
      brain_model: 'claude-fable-5',
      default_model: 'gpt-5.5',
      native_model: 'claude-opus-4-8',
      bot_agent: { model: 'claude-haiku-4-5-20251001', enabled: true },
      modes: {
        balanced: { brain_model: 'claude-sonnet-5', default_model: 'claude-opus-4-8' },
        custom: { brain_model: 'gpt-5.6-sol', default_model: 'gemini-2.5-pro' },
      },
    });
    expect(result.changes.map(({ layer, path }) => ({ layer, path }))).toEqual([
      { layer: 'project', path: 'brain_model' },
      { layer: 'project', path: 'default_model' },
      { layer: 'project', path: 'native_model' },
      { layer: 'project', path: 'bot_agent.model' },
      { layer: 'project', path: 'modes.balanced.brain_model' },
      { layer: 'project', path: 'modes.balanced.default_model' },
      { layer: 'project', path: 'modes.custom.brain_model' },
    ]);
  });

  it('does not mutate input and is idempotent for canonical IDs', () => {
    const input = { modes: { balanced: { brain_model: 'sonnet', default_model: 'gpt-5.6-sol' } } };
    const before = structuredClone(input);
    const first = canonicalizeModelConfigAliases(input, 'global');
    const second = canonicalizeModelConfigAliases(first.config, 'global');
    expect(input).toEqual(before);
    expect(second.config).toEqual(first.config);
    expect(second.changes).toEqual([]);
  });

  it('leaves unknown values for normal validation and detects only legacy aliases', () => {
    const input = { modes: { balanced: { brain_model: 'vendor/model-v9', default_model: 42 } } };
    expect(canonicalizeModelConfigAliases(input, 'partial')).toEqual({ config: input, changes: [] });
    expect(hasLegacyModelConfigAliases(input)).toBe(false);
    expect(hasLegacyModelConfigAliases({ native_model: 'opus' })).toBe(true);
  });
});
