/**
 * tests/orchestra/docker-provider-binary.test.ts
 *
 * Tests for getProviderBinaryForModel() — Docker spawn backend provider binary selection.
 * Sprint 203 Task 203-001.
 */

import { describe, it, expect } from 'vitest';
import { getProviderBinaryForModel } from '../../src/orchestra/spawn-backend-docker.js';
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

  it('returns "claude" as fallback for an unknown model', () => {
    // Unknown model — getProviderForModel throws UnknownModelError → fallback 'claude'
    const binary = getProviderBinaryForModel('unknown-model-xyz' as ModelType);
    expect(binary).toBe('claude');
  });

  it('returns "claude" for an ollama model (Docker special case)', () => {
    // Ollama is HTTP-based and not supported inside Docker containers; fallback to claude
    const binary = getProviderBinaryForModel('ollama' as ModelType);
    expect(binary).toBe('claude');
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
