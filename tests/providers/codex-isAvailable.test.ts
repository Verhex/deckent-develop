/**
 * Tests for CodexAdapter.diagnoseAvailability() + isAvailable()
 *
 * Sprint 189 Task 7 — verifies 3-layer probe with both API key and
 * ChatGPT subscription auth paths.
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
import { CodexAdapter } from '../../src/providers/codex.js';

const mockSpawnSync = spawnSync as unknown as MockInstance;

describe('CodexAdapter.diagnoseAvailability', () => {
  const PROJECT_DIR = '/tmp/test-project';
  let originalOpenAIKey: string | undefined;
  let originalDeckentKey: string | undefined;

  beforeEach(() => {
    originalOpenAIKey = process.env['OPENAI_API_KEY'];
    originalDeckentKey = process.env['DECKENT_OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['DECKENT_OPENAI_API_KEY'];
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalOpenAIKey !== undefined) process.env['OPENAI_API_KEY'] = originalOpenAIKey;
    if (originalDeckentKey !== undefined) process.env['DECKENT_OPENAI_API_KEY'] = originalDeckentKey;
  });

  it('binary missing → available=false, partial=false', async () => {
    mockSpawnSync.mockImplementation(() => ({ status: 1, stdout: '', stderr: 'command not found' }));
    const adapter = new CodexAdapter(PROJECT_DIR);
    const diag = await adapter.diagnoseAvailability();
    expect(diag.binaryFound).toBe(false);
    expect(diag.available).toBe(false);
    expect(diag.partial).toBe(false);
    expect(diag.versionStatus).toBe('missing');
    expect(diag.reason).toMatch(/not found in PATH/i);
  });

  it('binary OK + no auth (no API key, no subscription) → partial=true', async () => {
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0, stdout: '/usr/local/bin/codex\n', stderr: '' };
      if (cmd === 'codex' && args[0] === '--version') return { status: 0, stdout: 'codex 0.5.1\n', stderr: '' };
      if (cmd === 'codex' && args[0] === 'auth') return { status: 1, stdout: '', stderr: 'not logged in' };
      return { status: 1, stdout: '', stderr: '' };
    });
    const adapter = new CodexAdapter(PROJECT_DIR);
    const diag = await adapter.diagnoseAvailability();
    expect(diag.binaryFound).toBe(true);
    expect(diag.available).toBe(false);
    expect(diag.partial).toBe(true);
    expect(diag.authMethod).toBe('none');
    expect(diag.authStatus).toBe('missing');
    expect(diag.hints.length).toBeGreaterThan(0);
    expect(diag.hints.some(h => h.includes('OPENAI_API_KEY'))).toBe(true);
    expect(diag.hints.some(h => h.includes('codex login'))).toBe(true);
  });

  it('binary OK + OPENAI_API_KEY → available=true, authMethod=api_key', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-testKey123';
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0, stdout: '/usr/local/bin/codex\n', stderr: '' };
      if (cmd === 'codex' && args[0] === '--version') return { status: 0, stdout: 'codex 0.5.1\n', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    });
    const adapter = new CodexAdapter(PROJECT_DIR);
    const diag = await adapter.diagnoseAvailability();
    expect(diag.binaryFound).toBe(true);
    expect(diag.available).toBe(true);
    expect(diag.partial).toBe(false);
    expect(diag.authMethod).toBe('api_key');
    expect(diag.authStatus).toBe('ok');
    expect(diag.version).toBe('0.5.1');
  });

  it('binary OK + subscription auth → available=true, authMethod=session', async () => {
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0, stdout: '/usr/local/bin/codex\n', stderr: '' };
      if (cmd === 'codex' && args[0] === '--version') return { status: 0, stdout: 'codex 0.5.1', stderr: '' };
      if (cmd === 'codex' && args[0] === 'auth') return { status: 0, stdout: 'You are logged in as user@example.com', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    });
    const adapter = new CodexAdapter(PROJECT_DIR);
    const diag = await adapter.diagnoseAvailability();
    expect(diag.binaryFound).toBe(true);
    expect(diag.available).toBe(true);
    expect(diag.partial).toBe(false);
    expect(diag.authMethod).toBe('session');
    expect(diag.authStatus).toBe('ok');
  });
});
