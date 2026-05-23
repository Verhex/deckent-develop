/**
 * Tests for ClaudeAdapter.diagnoseAvailability() + isAvailable()
 *
 * Sprint 189 Task 7 — verifies 3-layer probe for Claude. Claude CLI manages
 * OAuth/session internally, so binary presence implies session-OK.
 * MCP backend always reports unavailable (not implemented).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  readdirSync: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  ensureSession: vi.fn(),
  isSessionActive: vi.fn().mockReturnValue(true),
  cleanupPromptFile: vi.fn(),
}));

vi.mock('../../src/core/active-workers.js', () => ({
  getActiveWorkerIds: vi.fn().mockReturnValue([]),
}));

import { spawnSync } from 'node:child_process';
import { ClaudeAdapter } from '../../src/providers/claude.js';

const mockSpawnSync = spawnSync as unknown as MockInstance;

describe('ClaudeAdapter.diagnoseAvailability', () => {
  const PROJECT_DIR = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mcp backend → available=false with informative reason', async () => {
    const adapter = new ClaudeAdapter(PROJECT_DIR, { claude_backend: 'mcp' });
    const diag = await adapter.diagnoseAvailability();
    expect(diag.available).toBe(false);
    expect(diag.partial).toBe(false);
    expect(diag.reason).toMatch(/MCP backend/i);
    expect(diag.hints.some(h => h.includes('tmux') || h.includes('subprocess'))).toBe(true);
  });

  it('binary missing → available=false with install hint', async () => {
    mockSpawnSync.mockImplementation(() => ({ status: 1, stdout: '', stderr: 'command not found' }));
    const adapter = new ClaudeAdapter(PROJECT_DIR);
    const diag = await adapter.diagnoseAvailability();
    expect(diag.binaryFound).toBe(false);
    expect(diag.available).toBe(false);
    expect(diag.versionStatus).toBe('missing');
    expect(diag.hints.some(h => h.includes('npm i -g'))).toBe(true);
  });

  it('binary OK (tmux backend) → available=true with session auth', async () => {
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0, stdout: '/usr/local/bin/claude\n', stderr: '' };
      if (cmd === 'claude' && args[0] === '--version') return { status: 0, stdout: '1.0.45 (Claude Code)\n', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    });
    const adapter = new ClaudeAdapter(PROJECT_DIR);
    const diag = await adapter.diagnoseAvailability();
    expect(diag.binaryFound).toBe(true);
    expect(diag.available).toBe(true);
    expect(diag.partial).toBe(false);
    expect(diag.authMethod).toBe('session');
    expect(diag.authStatus).toBe('ok');
    expect(diag.version).toBe('1.0.45');
    expect(diag.binaryPath).toBe('/usr/local/bin/claude');
  });

  it('isAvailable() returns true when binary is callable (tmux backend)', async () => {
    mockSpawnSync.mockImplementation((cmd: string) => {
      if (cmd === 'which' || cmd === 'where') return { status: 0, stdout: '/usr/local/bin/claude\n', stderr: '' };
      return { status: 0, stdout: '1.0.45', stderr: '' };
    });
    const adapter = new ClaudeAdapter(PROJECT_DIR);
    expect(await adapter.isAvailable()).toBe(true);
  });
});
