import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { GeminiAdapter, createGeminiAdapter, parseGeminiOutput } from '../../src/providers/gemini.js';

// ─── Detect if gemini CLI is available ───────────────────────────────

const hasGemini = (() => {
  try {
    return spawnSync('gemini', ['--version'], { encoding: 'utf-8', timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
})();

// ─── Integration Tests (only run when gemini CLI is installed) ───────

describe.skipIf(!hasGemini)('Gemini CLI integration', () => {
  it('gemini --version returns 0', () => {
    const result = spawnSync('gemini', ['--version'], { encoding: 'utf-8', timeout: 5000 });
    expect(result.status).toBe(0);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  it('isCliInstalled returns true', () => {
    const adapter = createGeminiAdapter('/tmp/test-gemini-integration');
    expect(adapter.isCliInstalled()).toBe(true);
  });

  it('buildArgs produces valid argument array', () => {
    const adapter = createGeminiAdapter('/tmp/test-gemini-integration');
    const args = adapter.buildArgs('gemini-2.5-pro', 'Hello');
    expect(args).toEqual(['-p', 'Hello', '--output-format', 'json', '-m', 'gemini-2.5-pro', '--approval-mode', 'yolo', '--skip-trust']);
  });

  it('buildCommand produces valid CLI command string', () => {
    const adapter = createGeminiAdapter('/tmp/test-gemini-integration');
    const cmd = adapter.buildCommand('gemini-2.5-flash', '/tmp/prompt.txt');
    expect(cmd).toBe('gemini -p "$(cat /tmp/prompt.txt)" --output-format json -m gemini-2.5-flash --approval-mode yolo --skip-trust');
  });

  it('buildPlannerCommand uses gemini binary', () => {
    const adapter = createGeminiAdapter('/tmp/test-gemini-integration');
    const result = adapter.buildPlannerCommand('Plan sprint', 'gemini-2.5-pro');
    expect(result.command).toBe('gemini');
    expect(result.args).toContain('-p');
    expect(result.args).toContain('--output-format');
    expect(result.args).toContain('json');
  });

  it('parseGeminiOutput handles structured JSON', () => {
    const output = JSON.stringify({
      response: 'Integration test response',
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 },
    });
    const parsed = parseGeminiOutput(output);
    expect(parsed.response).toBe('Integration test response');
    expect(parsed.stats).toEqual({ inputTokens: 5, outputTokens: 10 });
  });

  it('parseGeminiOutput handles plain text fallback', () => {
    const parsed = parseGeminiOutput('Not JSON at all');
    expect(parsed.response).toBe('Not JSON at all');
    expect(parsed.stats).toBeUndefined();
  });
});

// ─── Unit tests that always run (no CLI required) ────────────────────

describe('Gemini integration helpers (always run)', () => {
  it('parseGeminiOutput returns empty response for empty input', () => {
    const result = parseGeminiOutput('');
    expect(result.response).toBe('');
  });

  it('parseGeminiOutput extracts candidates format', () => {
    const output = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'From candidates' }] } }],
    });
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('From candidates');
  });

  it('parseGeminiOutput prefers response field over candidates', () => {
    const output = JSON.stringify({
      response: 'Direct response',
      candidates: [{ content: { parts: [{ text: 'From candidates' }] } }],
    });
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('Direct response');
  });

  it('adapter name is gemini', () => {
    const adapter = new GeminiAdapter('/tmp/test');
    expect(adapter.name).toBe('gemini');
  });

  it('supported models include gemini-2.5-pro', () => {
    const adapter = new GeminiAdapter('/tmp/test');
    expect(adapter.supportedModels).toContain('gemini-2.5-pro');
  });
});
