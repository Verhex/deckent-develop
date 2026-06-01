import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeProvider,
  registerDynamicProvider,
} from '../../src/core/model-catalog.js';

describe('PROVIDER_MAP extensions (deepseek/qwen/zhipu/dynamic)', () => {
  it('deepseek map — resolves to deepseek', () => {
    expect(normalizeProvider('deepseek')).toBe('deepseek');
    expect(normalizeProvider('DeepSeek')).toBe('deepseek');
  });

  it('qwen map — resolves to qwen (dashscope alias too)', () => {
    expect(normalizeProvider('qwen')).toBe('qwen');
    expect(normalizeProvider('dashscope')).toBe('qwen');
  });

  it('glm/zhipu map — glm resolves to zhipu', () => {
    expect(normalizeProvider('glm')).toBe('zhipu');
    expect(normalizeProvider('zhipu')).toBe('zhipu');
  });

  it('unknown provider — returns null gracefully', () => {
    expect(normalizeProvider('unknown-xyz-provider')).toBeNull();
    expect(normalizeProvider('totally-made-up')).toBeNull();
    expect(normalizeProvider('')).toBeNull();
  });

  it('existing canonical providers still resolve', () => {
    expect(normalizeProvider('claude')).toBe('claude');
    expect(normalizeProvider('codex')).toBe('codex');
    expect(normalizeProvider('gemini')).toBe('gemini');
    expect(normalizeProvider('anthropic')).toBe('claude');
    expect(normalizeProvider('openai')).toBe('codex');
  });

  describe('registerDynamicProvider', () => {
    it('registers a new provider that normalizeProvider can resolve', () => {
      registerDynamicProvider('my-custom-llm');
      expect(normalizeProvider('my-custom-llm')).toBe('my-custom-llm');
    });

    it('supports canonical name alias via second argument', () => {
      registerDynamicProvider('mistral-cloud', 'openai-compat');
      expect(normalizeProvider('mistral-cloud')).toBe('openai-compat');
    });

    it('unregistered dynamic providers return null', () => {
      expect(normalizeProvider('not-registered-provider')).toBeNull();
    });

    it('is case-insensitive for registered providers', () => {
      registerDynamicProvider('MyProvider');
      expect(normalizeProvider('myprovider')).toBe('myprovider');
      expect(normalizeProvider('MyProvider')).toBe('myprovider');
    });
  });
});
