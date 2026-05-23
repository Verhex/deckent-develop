/**
 * Tests for `deckent doctor --providers` flag + runProviderDiagnostics helper.
 *
 * Sprint 189 Task 7 — verifies that the CLI prints diagnostic output and JSON
 * mode emits structured detail.
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
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  openSync: vi.fn().mockReturnValue(3),
  closeSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  accessSync: vi.fn(),
  constants: { W_OK: 2 },
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
import { runProviderDiagnostics } from '../../src/cli/commands/doctor-checks.js';
import { formatProviderDiagnostics } from '../../src/core/provider.js';

const mockSpawnSync = spawnSync as unknown as MockInstance;

describe('runProviderDiagnostics helper', () => {
  const PROJECT_DIR = '/tmp/doctor-providers-test';

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['OPENAI_API_KEY'];
    delete process.env['DECKENT_OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['DECKENT_GOOGLE_API_KEY'];
  });

  it('returns one ProviderAvailabilityDetail per built-in provider', async () => {
    mockSpawnSync.mockImplementation(() => ({ status: 1, stdout: '', stderr: 'not found' }));
    const diagnostics = await runProviderDiagnostics(PROJECT_DIR);
    expect(diagnostics).toHaveLength(3);
    const names = diagnostics.map(d => d.name).sort();
    expect(names).toEqual(['claude', 'codex', 'gemini']);
  });

  it('reflects partial state for codex when binary OK but no auth', async () => {
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' || cmd === 'where') {
        return { status: 0, stdout: '/usr/local/bin/codex\n', stderr: '' };
      }
      if (cmd === 'codex' && args[0] === '--version') {
        return { status: 0, stdout: 'codex 0.5.1\n', stderr: '' };
      }
      if (cmd === 'codex' && args[0] === 'auth') {
        return { status: 1, stdout: '', stderr: 'not logged in' };
      }
      // claude/gemini also probed — return not-found to isolate codex
      return { status: 1, stdout: '', stderr: '' };
    });
    const diagnostics = await runProviderDiagnostics(PROJECT_DIR);
    const codex = diagnostics.find(d => d.name === 'codex');
    expect(codex).toBeDefined();
    expect(codex!.partial).toBe(true);
    expect(codex!.available).toBe(false);
    expect(codex!.hints.some(h => h.includes('OPENAI_API_KEY'))).toBe(true);
  });

  it('formatProviderDiagnostics produces a human-readable table with OK/PARTIAL/MISSING markers', async () => {
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' || cmd === 'where') {
        // Claude binary found, others missing
        if (args[0] === 'claude') return { status: 0, stdout: '/usr/local/bin/claude\n', stderr: '' };
        return { status: 1, stdout: '', stderr: '' };
      }
      if (cmd === 'claude' && args[0] === '--version') {
        return { status: 0, stdout: '1.0.45\n', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });
    const diagnostics = await runProviderDiagnostics(PROJECT_DIR);
    const formatted = formatProviderDiagnostics(diagnostics);
    expect(formatted).toContain('Provider Diagnostics:');
    expect(formatted).toMatch(/\[OK\].*claude/i);
    expect(formatted).toMatch(/\[MISSING\].*codex|gemini/i);
  });
});
