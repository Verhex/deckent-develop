import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock homedir to use temp directory for global config
let mockHomeDir: string;
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => mockHomeDir,
  };
});

import { generateGeminiConfig } from '../../../src/cli/helpers/gemini-config.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('gemini-config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-gemini-test-'));
    mockHomeDir = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── Creation ─────────────────────────────────────────────────────

  it('creates ~/.gemini/settings.json when missing', () => {
    const result = generateGeminiConfig(tempDir);
    expect(existsSync(result.settingsPath)).toBe(true);
  });

  it('returns correct settings path', () => {
    const result = generateGeminiConfig(tempDir);
    expect(result.settingsPath).toBe(join(tempDir, '.gemini', 'settings.json'));
  });

  it('creates .gemini directory if missing', () => {
    expect(existsSync(join(tempDir, '.gemini'))).toBe(false);
    generateGeminiConfig(tempDir);
    expect(existsSync(join(tempDir, '.gemini'))).toBe(true);
  });

  it('writes valid JSON with mcpServers.deckent', () => {
    generateGeminiConfig(tempDir);
    const raw = readFileSync(join(tempDir, '.gemini', 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.deckent).toEqual({
      command: 'npx',
      args: ['deckent', 'mcp-server'],
      timeout: 600,
    });
  });

  // ─── Merge with existing ──────────────────────────────────────────

  it('preserves existing settings when merging', () => {
    const geminiDir = join(tempDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, 'settings.json'),
      JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'other' } } }),
      'utf-8',
    );

    generateGeminiConfig(tempDir);

    const raw = readFileSync(join(geminiDir, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.theme).toBe('dark');
    expect(parsed.mcpServers.other.command).toBe('other');
    expect(parsed.mcpServers.deckent.command).toBe('npx');
  });

  it('updates existing deckent entry', () => {
    const geminiDir = join(tempDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, 'settings.json'),
      JSON.stringify({ mcpServers: { deckent: { command: 'old', args: ['old'] } } }),
      'utf-8',
    );

    generateGeminiConfig(tempDir);

    const raw = readFileSync(join(geminiDir, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.deckent.command).toBe('npx');
    expect(parsed.mcpServers.deckent.args).toEqual(['deckent', 'mcp-server']);
  });

  // ─── Duplicate prevention ────────────────────────────────────────

  it('is idempotent — running twice produces same result', () => {
    generateGeminiConfig(tempDir);
    const first = readFileSync(join(tempDir, '.gemini', 'settings.json'), 'utf-8');
    generateGeminiConfig(tempDir);
    const second = readFileSync(join(tempDir, '.gemini', 'settings.json'), 'utf-8');
    expect(first).toBe(second);
  });

  // ─── Invalid existing file ───────────────────────────────────────

  it('handles invalid JSON gracefully', () => {
    const geminiDir = join(tempDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(join(geminiDir, 'settings.json'), '{{not json}}', 'utf-8');

    expect(() => generateGeminiConfig(tempDir)).not.toThrow();
    const raw = readFileSync(join(geminiDir, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.deckent.command).toBe('npx');
  });

  it('handles array as existing settings (resets to object)', () => {
    const geminiDir = join(tempDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(join(geminiDir, 'settings.json'), '[1,2,3]', 'utf-8');

    expect(() => generateGeminiConfig(tempDir)).not.toThrow();
    const raw = readFileSync(join(geminiDir, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.deckent.command).toBe('npx');
  });

  it('handles mcpServers being a non-object (resets to object)', () => {
    const geminiDir = join(tempDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, 'settings.json'),
      JSON.stringify({ mcpServers: 'not-an-object' }),
      'utf-8',
    );

    generateGeminiConfig(tempDir);

    const raw = readFileSync(join(geminiDir, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.deckent.command).toBe('npx');
  });
});
