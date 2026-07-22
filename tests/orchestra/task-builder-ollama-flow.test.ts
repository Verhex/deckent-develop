// Sprint 235 Task 235-001 — Per-task ollama provider+model plan-time acceptance.
// Hermetic unit tests for task-builder.ts directive parsing — no subprocess, no fs I/O.
// Verifies the two parse sites (parseStructuredDirectives + parseBulletOrNumberedTasks)
// accept `- Provider: ollama` and pass raw `- Model: <ollama-tag>` through without
// dropping it against ALL_MODELS, while preserving non-adapter (claude/codex/gemini)
// model validation behavior.

import { describe, it, expect } from 'vitest';
import {
  parseStructuredDirectives,
  parseBulletOrNumberedTasks,
} from '../../src/orchestra/task-builder.js';

describe('parseStructuredDirectives — ollama provider+model pass-through', () => {
  it('accepts "- Provider: ollama" (no drop)', () => {
    const content = '## Task 1: Ollama Provider Only\n- Provider: ollama\n- Scope: src/core/\n\n### Description\nUse ollama.';
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].provider).toBe('ollama');
  });

  it('passes raw ollama model tag through (not in ALL_MODELS)', () => {
    const content = '## Task 1: Ollama With Tag\n- Provider: ollama\n- Model: qwen3.6:27b\n- Scope: src/core/\n\n### Description\nReal ollama task.';
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].provider).toBe('ollama');
    expect(tasks[0].forceModel).toBe('qwen3.6:27b');
  });

  it('fails loudly for claude + unknown cloud model', () => {
    const content = '## Task 1: Claude Bad Model\n- Provider: claude\n- Model: gibberish99\n- Scope: src/core/\n\n### Description\nNon-adapter validates against ALL_MODELS.';
    expect(() => parseStructuredDirectives(content)).toThrow('Cloud pricing evidence is required');
  });

  it('rejects a retired alias at the input boundary', () => {
    const content = '## Task 1: Classic\n- Provider: claude\n- Model: opus\n- Scope: src/core/\n\n### Description\nClassic path.';
    expect(() => parseStructuredDirectives(content)).toThrow('E_LEGACY_MODEL_ALIAS');
  });

  it('accepts ollama model tag case-insensitively (input lower-cased)', () => {
    const content = '## Task 1: Mixed Case\n- Provider: OLLAMA\n- Model: QwEn3.6:27B\n- Scope: src/core/\n\n### Description\nCase test.';
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].provider).toBe('ollama');
    expect(tasks[0].forceModel).toBe('QwEn3.6:27B');
  });
});

describe('parseBulletOrNumberedTasks — ollama provider+model pass-through', () => {
  it('accepts ollama provider + tag at bullet-list parse site', () => {
    const content = [
      '- Task: Run ollama in bullet form',
      '  - Provider: ollama',
      '  - Model: qwen3.6:27b',
      '  - Scope: src/core/',
    ].join('\n');
    const tasks = parseBulletOrNumberedTasks(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].provider).toBe('ollama');
    expect(tasks[0].forceModel).toBe('qwen3.6:27b');
  });

  it('fails loudly for bullet-list claude + unknown cloud model', () => {
    const content = [
      '- Task: Claude bad model in bullet form',
      '  - Provider: claude',
      '  - Model: gibberish99',
      '  - Scope: src/core/',
    ].join('\n');
    expect(() => parseBulletOrNumberedTasks(content)).toThrow('Cloud pricing evidence is required');
  });
});
