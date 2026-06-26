import { describe, it, expect } from 'vitest';
import { classifyArchetype, cacheVerifyField } from '../../src/core/catalog/cache-archetype.js';
import { CACHE_ARCHETYPE } from '../../src/core/catalog/types.js';

// ─── classifyArchetype ────────────────────────────────────────────────────────

describe('classifyArchetype', () => {
  describe('A – IMPLICIT_AUTO (auto-caches; no client marker)', () => {
    const providers = [
      'openai', 'deepseek', 'gemini-impl', 'mistral', 'xai',
      'glm', 'groq', 'together', 'togetherai', 'fireworks',
      'fireworks-ai', 'qwen-impl', 'claude-cli',
    ];
    it.each(providers)('%s → IMPLICIT_AUTO', (id) => {
      expect(classifyArchetype(id)).toBe(CACHE_ARCHETYPE.IMPLICIT_AUTO);
    });
  });

  describe('B – EXPLICIT_MARKER (client marks cache boundaries)', () => {
    it('anthropic-api → EXPLICIT_MARKER', () => {
      expect(classifyArchetype('anthropic-api')).toBe(CACHE_ARCHETYPE.EXPLICIT_MARKER);
    });
    it('bedrock → EXPLICIT_MARKER', () => {
      expect(classifyArchetype('bedrock')).toBe(CACHE_ARCHETYPE.EXPLICIT_MARKER);
    });
    it('vertex → EXPLICIT_MARKER', () => {
      expect(classifyArchetype('vertex')).toBe(CACHE_ARCHETYPE.EXPLICIT_MARKER);
    });
    it('qwen-explicit → EXPLICIT_MARKER', () => {
      expect(classifyArchetype('qwen-explicit')).toBe(CACHE_ARCHETYPE.EXPLICIT_MARKER);
    });
  });

  describe('C – EXPLICIT_RESOURCE (client references pre-uploaded resource)', () => {
    it('gemini-cachedcontent → EXPLICIT_RESOURCE', () => {
      expect(classifyArchetype('gemini-cachedcontent')).toBe(CACHE_ARCHETYPE.EXPLICIT_RESOURCE);
    });
    it('moonshotai → EXPLICIT_RESOURCE', () => {
      expect(classifyArchetype('moonshotai')).toBe(CACHE_ARCHETYPE.EXPLICIT_RESOURCE);
    });
  });

  describe('D – LOCAL_KV (client-managed local cache)', () => {
    it.each(['vllm', 'llamacpp', 'ollama'])('%s → LOCAL_KV', (id) => {
      expect(classifyArchetype(id)).toBe(CACHE_ARCHETYPE.LOCAL_KV);
    });
  });

  describe('E – NONE (no caching mechanism)', () => {
    it('cohere → NONE', () => {
      expect(classifyArchetype('cohere')).toBe(CACHE_ARCHETYPE.NONE);
    });
  });

  describe('unknown providers — honest signal (Law #2)', () => {
    it('returns null for unknown provider — never silently defaults', () => {
      expect(classifyArchetype('unknown-provider')).toBeNull();
    });
    it('returns null for empty string', () => {
      expect(classifyArchetype('')).toBeNull();
    });
    it('returns null for custom/private LLM identifier', () => {
      expect(classifyArchetype('my-private-llm')).toBeNull();
    });
    it('does not treat aliases without explicit entry as known', () => {
      // 'anthropic' (raw) is NOT in the map; the classifier only knows 'anthropic-api'
      expect(classifyArchetype('anthropic')).toBeNull();
    });
  });
});

// ─── cacheVerifyField ─────────────────────────────────────────────────────────

describe('cacheVerifyField', () => {
  describe('deepseek (unique cache-hit field)', () => {
    it('deepseek → prompt_cache_hit_tokens', () => {
      expect(cacheVerifyField('deepseek')).toBe('prompt_cache_hit_tokens');
    });
  });

  describe('anthropic family → cache_read_input_tokens', () => {
    it('anthropic-api → cache_read_input_tokens', () => {
      expect(cacheVerifyField('anthropic-api')).toBe('cache_read_input_tokens');
    });
    it('bedrock → cache_read_input_tokens', () => {
      expect(cacheVerifyField('bedrock')).toBe('cache_read_input_tokens');
    });
    it('vertex → cache_read_input_tokens', () => {
      expect(cacheVerifyField('vertex')).toBe('cache_read_input_tokens');
    });
  });

  describe('gemini family → cachedContentTokenCount', () => {
    it('gemini-impl → cachedContentTokenCount', () => {
      expect(cacheVerifyField('gemini-impl')).toBe('cachedContentTokenCount');
    });
    it('gemini-cachedcontent → cachedContentTokenCount', () => {
      expect(cacheVerifyField('gemini-cachedcontent')).toBe('cachedContentTokenCount');
    });
  });

  describe('LOCAL_KV → empty string (no server-side verify)', () => {
    it.each(['ollama', 'vllm', 'llamacpp'])('%s → ""', (id) => {
      expect(cacheVerifyField(id)).toBe('');
    });
  });

  describe('NONE → empty string (no caching)', () => {
    it('cohere → ""', () => {
      expect(cacheVerifyField('cohere')).toBe('');
    });
  });

  describe('IMPLICIT_AUTO default → prompt_tokens_details.cached_tokens', () => {
    it('openai → prompt_tokens_details.cached_tokens', () => {
      expect(cacheVerifyField('openai')).toBe('prompt_tokens_details.cached_tokens');
    });
    it('groq → prompt_tokens_details.cached_tokens', () => {
      expect(cacheVerifyField('groq')).toBe('prompt_tokens_details.cached_tokens');
    });
    it('mistral → prompt_tokens_details.cached_tokens', () => {
      expect(cacheVerifyField('mistral')).toBe('prompt_tokens_details.cached_tokens');
    });
    it('xai → prompt_tokens_details.cached_tokens', () => {
      expect(cacheVerifyField('xai')).toBe('prompt_tokens_details.cached_tokens');
    });
    it('together → prompt_tokens_details.cached_tokens', () => {
      expect(cacheVerifyField('together')).toBe('prompt_tokens_details.cached_tokens');
    });
    it('claude-cli → prompt_tokens_details.cached_tokens', () => {
      expect(cacheVerifyField('claude-cli')).toBe('prompt_tokens_details.cached_tokens');
    });
    it('qwen-explicit → prompt_tokens_details.cached_tokens (EXPLICIT_MARKER, no override)', () => {
      expect(cacheVerifyField('qwen-explicit')).toBe('prompt_tokens_details.cached_tokens');
    });
    it('moonshotai → prompt_tokens_details.cached_tokens (EXPLICIT_RESOURCE, no override)', () => {
      expect(cacheVerifyField('moonshotai')).toBe('prompt_tokens_details.cached_tokens');
    });
  });

  describe('unknown providers — honest signal (Law #2)', () => {
    it('unknown provider → null (not empty string, not a default)', () => {
      expect(cacheVerifyField('unknown-llm')).toBeNull();
    });
    it('empty string → null', () => {
      expect(cacheVerifyField('')).toBeNull();
    });
    it('raw anthropic (no -api suffix) → null', () => {
      expect(cacheVerifyField('anthropic')).toBeNull();
    });
  });
});
