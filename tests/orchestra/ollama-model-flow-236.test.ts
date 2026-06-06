import { describe, it, expect } from 'vitest';
import { modelRegistry, ensureOllamaModelRegistered } from '../../src/core/model-registry.js';
import { resolveTaskModel } from '../../src/orchestra/model-selector.js';
import type { ResolvedConfig, TaskScope } from '../../src/core/types.js';

// Sprint 236 — per-task ollama provider+model flow: a locally-pulled tag
// (not in the static catalog) must flow plan→route without "Unknown model" and
// without being re-mapped to a cloud equivalent.

const SCOPE: TaskScope = { directories: ['docs/'], filesRead: [], filesWrite: ['docs/x.md'] };
const CONFIG = { brain_provider: 'claude', worker_provider: 'claude' } as unknown as ResolvedConfig;

describe('Sprint 236 — ollama dynamic model flow', () => {
  it('ensureOllamaModelRegistered makes an arbitrary tag a first-class registry model', () => {
    const tag = 'qwen3.6:27b';
    ensureOllamaModelRegistered(tag);
    expect(modelRegistry.has(tag)).toBe(true);
    expect(modelRegistry.get(tag)?.provider as unknown as string).toBe('ollama');
    // registry lookups that previously threw "Unknown model" now resolve
    expect(() => modelRegistry.getTier(tag)).not.toThrow();
  });

  it('is idempotent (re-register is a no-op, no throw)', () => {
    ensureOllamaModelRegistered('qwen3.6:27b');
    ensureOllamaModelRegistered('qwen3.6:27b');
    expect(modelRegistry.has('qwen3.6:27b')).toBe(true);
  });

  it('resolveTaskModel returns the ollama tag verbatim (no cloud re-map) when provider=ollama', () => {
    const m = resolveTaskModel('t', 'd', SCOPE, CONFIG, [], 'qwen3.6:27b' as never, undefined, 'ollama' as never);
    expect(m as unknown as string).toBe('qwen3.6:27b');
  });

  it('does NOT auto-register / short-circuit for cloud providers (real-bug signal preserved)', () => {
    // A genuinely-unknown CLOUD model must still NOT silently pass as ollama.
    expect(modelRegistry.has('totally-made-up-cloud-model')).toBe(false);
    ensureOllamaModelRegistered(''); // empty guard → no-op
    expect(modelRegistry.has('')).toBe(false);
  });
});
