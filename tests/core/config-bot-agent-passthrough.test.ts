// BOT-1 — loadConfig must PRESERVE the native-transport + bot_agent fields. They
// used to be stripped by the explicit `resolved` projection (config.ts:1404), so a
// configured bot_agent / ollama_host silently vanished after load. This locks the
// passthrough (the same fix also un-breaks the REPL native agent's config ollama).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, clearConfigCache } from '../../src/core/config.js';

const dirs: string[] = [];
function project(cfg: Record<string, unknown>): string {
  const d = mkdtempSync(join(tmpdir(), 'cfg-bot-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  writeFileSync(join(d, '.deckent', 'config.json'), JSON.stringify({ mode: 'balanced', ...cfg }));
  return d;
}
afterEach(() => {
  clearConfigCache();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('loadConfig — native transport + bot_agent passthrough (BOT-1)', () => {
  it('preserves ollama_host / native_model / openai_base_url / bot_agent (not stripped)', async () => {
    clearConfigCache();
    const d = project({
      ollama_host: 'http://127.0.0.1:11434',
      native_model: 'qwen3.6:27b',
      openai_base_url: 'https://api.openai.com/v1',
      bot_agent: { enabled: true, lang: 'tr', persona: 'warm', providers: ['ollama', 'claude'] },
    });
    const cfg = await loadConfig(d, { force: true });
    expect(cfg.ollama_host).toBe('http://127.0.0.1:11434');
    expect(cfg.native_model).toBe('qwen3.6:27b');
    expect(cfg.openai_base_url).toBe('https://api.openai.com/v1');
    expect(cfg.bot_agent?.enabled).toBe(true);
    expect(cfg.bot_agent?.persona).toBe('warm');
    expect(cfg.bot_agent?.providers).toEqual(['ollama', 'claude']);
  });
});
