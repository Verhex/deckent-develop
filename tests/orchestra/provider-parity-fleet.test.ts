import { describe, it, expect } from 'vitest';
import { isAdapterProvider } from '../../src/orchestra/sprint-utils.js';
import { modelRegistry } from '../../src/core/model-registry.js';

describe('Sprint 248 provider-parity contract', () => {
  describe('isAdapterProvider', () => {
    it('returns true for ollama', () => {
      expect(isAdapterProvider('ollama')).toBe(true);
    });

    it('returns true for codex', () => {
      expect(isAdapterProvider('codex')).toBe(true);
    });

    it('returns true for gemini', () => {
      expect(isAdapterProvider('gemini')).toBe(true);
    });

    it('returns false for claude', () => {
      expect(isAdapterProvider('claude')).toBe(false);
    });
  });

  describe('modelRegistry codex wire model', () => {
    it('preserves the exact GPT-5.5 API identity', () => {
      expect(modelRegistry.get('gpt-5.5')?.apiId).toBe('gpt-5.5');
    });
  });
});
