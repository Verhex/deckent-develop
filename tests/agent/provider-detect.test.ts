import { describe, it, expect } from 'vitest';
import { detectTransport } from '../../src/agent/provider-detect.js';

describe('detectTransport', () => {
  it('detects anthropic-api from ANTHROPIC_API_KEY', () => {
    const t = detectTransport({ ANTHROPIC_API_KEY: 'sk-ant-x' }, {});
    expect(t.kind).toBe('anthropic-api');
  });
  it('detects openai-compatible from OPENAI_API_KEY', () => {
    const t = detectTransport({ OPENAI_API_KEY: 'sk-x' }, {});
    expect(t.kind).toBe('openai-compatible');
  });
  it('detects openai-compatible from a config base_url even without env key', () => {
    const t = detectTransport({}, { openai_base_url: 'http://localhost:8000/v1' });
    expect(t.kind).toBe('openai-compatible');
  });
  it('detects ollama from config ollama_host', () => {
    const t = detectTransport({}, { ollama_host: 'http://127.0.0.1:11434' });
    expect(t.kind).toBe('ollama');
  });
  it('returns none with an honest reason when nothing is configured', () => {
    const t = detectTransport({}, {});
    expect(t.kind).toBe('none');
    expect(t.reason.toLowerCase()).toMatch(/api|ollama|model/);
  });
  it('prefers anthropic-api over ollama when both are present', () => {
    const t = detectTransport({ ANTHROPIC_API_KEY: 'sk-ant-x' }, { ollama_host: 'http://127.0.0.1:11434' });
    expect(t.kind).toBe('anthropic-api');
  });
});
