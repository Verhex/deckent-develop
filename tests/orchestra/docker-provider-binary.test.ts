/**
 * tests/orchestra/docker-provider-binary.test.ts
 *
 * Tests for getProviderBinaryForModel() — Docker spawn backend provider binary selection.
 * Sprint 203 Task 203-001.
 */

import { describe, it, expect } from 'vitest';
import { getProviderBinaryForModel } from '../../src/orchestra/spawn-backend-docker.js';
import {
  ensureOllamaModelRegistered,
  ensureOpenRouterModelRegistered,
} from '../../src/core/model-registry.js';
import type { ModelType } from '../../src/core/types.js';

describe('getProviderBinaryForModel', () => {
  it('returns "claude" for a Claude API model ID', () => {
    const binary = getProviderBinaryForModel('claude-sonnet-5' as ModelType);
    expect(binary).toBe('claude');
  });

  it('returns "codex" for a codex model (gpt-4.1)', () => {
    const binary = getProviderBinaryForModel('gpt-4.1' as ModelType);
    expect(binary).toBe('codex');
  });

  it('returns "gemini" for a gemini model (gemini-2.5-flash)', () => {
    const binary = getProviderBinaryForModel('gemini-2.5-flash' as ModelType);
    expect(binary).toBe('gemini');
  });

  it('rejects an unknown model before selecting any provider binary', () => {
    expect(() => getProviderBinaryForModel('unknown-model-xyz' as ModelType))
      .toThrow('Unknown model: unknown-model-xyz');
  });

  it('rejects a registered Ollama model at the Docker binary boundary', () => {
    const model = 'm4-088-ollama-fixture';
    ensureOllamaModelRegistered(model);
    expect(() => getProviderBinaryForModel(model as ModelType))
      .toThrow(/Ollama provider cannot use the Docker CLI backend/);
  });

  it('rejects a registered OpenRouter model at the Docker binary boundary', () => {
    const model = 'm4-088/openrouter-fixture:free';
    ensureOpenRouterModelRegistered(model, {
      pricingEvidenceRef: 'test:m4-088',
      costPerMillion: { input: 0, output: 0 },
    });
    expect(() => getProviderBinaryForModel(model as ModelType))
      .toThrow(/OpenRouter provider cannot use the Docker CLI backend/);
  });

  it('returns "claude" for the exact Opus API model ID', () => {
    const binary = getProviderBinaryForModel('claude-opus-4-8' as ModelType);
    expect(binary).toBe('claude');
  });

  it('returns "codex" for the exact GPT-5.5 API model ID', () => {
    const binary = getProviderBinaryForModel('gpt-5.5' as ModelType);
    expect(binary).toBe('codex');
  });

  it('returns "gemini" for gemini-2.5-pro model', () => {
    const binary = getProviderBinaryForModel('gemini-2.5-pro' as ModelType);
    expect(binary).toBe('gemini');
  });
});
