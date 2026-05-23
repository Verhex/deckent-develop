/**
 * Tests for GeminiAdapter.diagnoseAvailability() + isAvailable()
 *
 * Sprint 189 Task 7 — 3-layer probe (binary / version / auth) with rich
 * ProviderAvailabilityDetail output. Verifies that:
 *   - missing binary returns available=false, partial=false
 *   - binary OK + missing API key returns available=false, partial=true
 *   - binary OK + API key returns available=true, partial=false
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  openSync: vi.fn().mockReturnValue(3),
  closeSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { GeminiAdapter } from '../../src/providers/gemini.js';

const mockSpawnSync = spawnSync as unknown as MockInstance;

describe('GeminiAdapter.diagnoseAvailability', () => {
  const PROJECT_DIR = '/tmp/test-project';
  let originalGoogleKey: string | undefined;
  let originalDeckentKey: string | undefined;

  beforeEach(() => {
    originalGoogleKey = process.env['GOOGLE_API_KEY'];
    originalDeckentKey = process.env['DECKENT_GOOGLE_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['DECKENT_GOOGLE_API_KEY'];
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalGoogleKey !== undefined) process.env['GOOGLE_API_KEY'] = originalGoogleKey;
    if (originalDeckentKey !== undefined) process.env['DECKENT_GOOGLE_API_KEY'] = originalDeckentKey;
  });

  it('binary missing → available=false, partial=false, hints to install', async () => {
    mockSpawnSync.mockImplementation(() => ({ status: 1, stdout: '', stderr: 'command not found' }));
    const adapter = new GeminiAdapter(PROJECT_DIR);
    const diag = await adapter.diagnoseAvailability();
    expect(diag.binaryFound).toBe(false);
    expect(diag.available).toBe(false);
    expect(diag.partial).toBe(false);
    expect(diag.versionStatus).toBe('missing');
    expect(diag.reason).toMatch(/not found in PATH/i);
    expect(diag.hints.some(h => h.includes('npm i -g'))).toBe(true);
  });

  it('binary OK + no API key → available=false, partial=true (with hints)', async () => {
    // First call: `which gemini` → returns path
    // Second call: `gemini --version` → returns 0.18.2
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' || cmd === 'where') {
        return { status: 0, stdout: '/usr/local/bin/gemini\n', stderr: '' };
      }
      if (cmd === 'gemini' && args[0] === '--version') {
        return { status: 0, stdout: '0.18.2\n', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });
    const adapter = new GeminiAdapter(PROJECT_DIR);
    const diag = await adapter.diagnoseAvailability();
    expect(diag.binaryFound).toBe(true);
    expect(diag.version).toBe('0.18.2');
    expect(diag.available).toBe(false);
    expect(diag.partial).toBe(true);
    expect(diag.authMethod).toBe('none');
    expect(diag.authStatus).toBe('missing');
    expect(diag.reason).toMatch(/GOOGLE_API_KEY/);
    expect(diag.hints.some(h => h.includes('GOOGLE_API_KEY'))).toBe(true);
    expect(diag.binaryPath).toBe('/usr/local/bin/gemini');
  });

  it('binary OK + GOOGLE_API_KEY set → available=true, partial=false', async () => {
    process.env['GOOGLE_API_KEY'] = 'AIzaTestKey123456789';
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' || cmd === 'where') {
        return { status: 0, stdout: '/usr/local/bin/gemini\n', stderr: '' };
      }
      if (cmd === 'gemini' && args[0] === '--version') {
        return { status: 0, stdout: 'gemini-cli 0.18.2\n', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });
    const adapter = new GeminiAdapter(PROJECT_DIR);
    const diag = await adapter.diagnoseAvailability();
    expect(diag.binaryFound).toBe(true);
    expect(diag.available).toBe(true);
    expect(diag.partial).toBe(false);
    expect(diag.authMethod).toBe('api_key');
    expect(diag.authStatus).toBe('ok');
    expect(diag.version).toBe('0.18.2');
  });

  it('isAvailable() returns true when binary OK + API key set', async () => {
    process.env['GOOGLE_API_KEY'] = 'AIzaTestKey123456789';
    mockSpawnSync.mockImplementation((cmd: string) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0, stdout: '/usr/local/bin/gemini\n', stderr: '' };
      return { status: 0, stdout: '0.18.2', stderr: '' };
    });
    const adapter = new GeminiAdapter(PROJECT_DIR);
    expect(await adapter.isAvailable()).toBe(true);
  });
});
