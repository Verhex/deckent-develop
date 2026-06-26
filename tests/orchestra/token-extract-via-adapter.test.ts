import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tryExtractUsageViaAdapter, tryLoadCliLogTokens } from '../../src/orchestra/token-counter.js';
import type { ProviderAdapter } from '../../src/core/provider.js';

// Worker Output Contract — Step 1 wiring: provider-AGNOSTIC token capture.
// Closes the long-standing gap where non-Claude workers always reported 0/0
// (tryLoadCliLogTokens is Claude-CLI-specific via extractTokenUsageFromClaudeCli).
describe('tryExtractUsageViaAdapter — provider-agnostic token capture', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  function withLog(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'tok-adapter-'));
    dirs.push(dir);
    mkdirSync(join(dir, '.tasks'), { recursive: true });
    writeFileSync(join(dir, '.tasks', 'task-T1.log'), content);
    return dir;
  }

  // A fake OpenAI-compatible-style adapter (DeepSeek/Qwen/vLLM shape).
  const fakeAdapter = {
    name: 'fake-openai',
    extractUsage(raw: string) {
      const m = /"prompt_tokens"\s*:\s*(\d+)[\s\S]*"completion_tokens"\s*:\s*(\d+)/.exec(raw);
      if (!m) return null;
      return {
        inputTokens: Number(m[1]),
        outputTokens: Number(m[2]),
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: Number(m[1]) + Number(m[2]),
        source: 'provider-adapter' as const,
      };
    },
  } as unknown as ProviderAdapter;

  it('captures usage via the provider adapter (non-Claude usage format)', () => {
    const dir = withLog('{"usage":{"prompt_tokens":120,"completion_tokens":48}}');
    const usage = tryExtractUsageViaAdapter(dir, 'T1', fakeAdapter);
    expect(usage).not.toBeNull();
    expect(usage!.inputTokens).toBe(120);
    expect(usage!.outputTokens).toBe(48);
  });

  it('the Claude-CLI-specific path returns null for the same non-Claude log (the gap this closes)', () => {
    const dir = withLog('{"usage":{"prompt_tokens":120,"completion_tokens":48}}');
    expect(tryLoadCliLogTokens(dir, 'T1')).toBeNull();
  });

  it('returns null when the adapter has no extractUsage', () => {
    const dir = withLog('{"usage":{"prompt_tokens":120,"completion_tokens":48}}');
    expect(tryExtractUsageViaAdapter(dir, 'T1', { name: 'x' } as unknown as ProviderAdapter)).toBeNull();
  });

  it('returns null when the adapter is undefined or the log is absent', () => {
    const dir = withLog('irrelevant');
    expect(tryExtractUsageViaAdapter(dir, 'T1', undefined)).toBeNull();
    expect(tryExtractUsageViaAdapter(dir, 'NO-SUCH-TASK', fakeAdapter)).toBeNull();
  });
});
