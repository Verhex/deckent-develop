/**
 * Tests for Docker provider binary resolution in the provider-free smoke script.
 * Sprint 203 Task 203-004.
 *
 * Validates that each provider maps to the correct CLI binary inside Docker
 * containers without spawning real containers.
 */

import { describe, it, expect } from 'vitest';
import { getProviderBinaryForModel } from '../../src/orchestra/spawn-backend-docker.js';
import type { ModelType } from '../../src/core/types.js';

describe('Docker provider binary resolution (provider-free smoke)', () => {
  it('resolves claude provider models to "claude" binary', () => {
    expect(getProviderBinaryForModel('claude-sonnet-5' as ModelType)).toBe('claude');
    expect(getProviderBinaryForModel('claude-opus-4-8' as ModelType)).toBe('claude');
    expect(getProviderBinaryForModel('claude-haiku-4-5-20251001' as ModelType)).toBe('claude');
  });

  it('resolves codex provider models to "codex" binary', () => {
    expect(getProviderBinaryForModel('gpt-4.1' as ModelType)).toBe('codex');
    expect(getProviderBinaryForModel('gpt-5.5' as ModelType)).toBe('codex');
  });

  it('resolves gemini provider models to "gemini" binary', () => {
    expect(getProviderBinaryForModel('gemini-2.5-flash' as ModelType)).toBe('gemini');
    expect(getProviderBinaryForModel('gemini-2.5-pro' as ModelType)).toBe('gemini');
  });

  it('resolves ollama to "claude" binary (HTTP-based — Docker fallback)', () => {
    // Ollama uses HTTP transport, not a CLI binary; Docker workers fall back to claude
    expect(getProviderBinaryForModel('ollama' as ModelType)).toBe('claude');
  });

  it('resolves unknown model to "claude" binary (safe fallback)', () => {
    expect(getProviderBinaryForModel('unknown-xyz' as ModelType)).toBe('claude');
  });
});
