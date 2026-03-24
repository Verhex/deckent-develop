import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { detectEnvironment } from '../../src/core/environment.js';
import type { DetectedEnv } from '../../src/core/environment.js';

/** Keys that detectEnvironment inspects */
const ENV_KEYS = [
  'VSCODE_PID',
  'VSCODE_CWD',
  'TERM_PROGRAM',
  'CURSOR_SESSION',
  'CODEX_SESSION',
  'GEMINI_CLI',
  'TMUX',
] as const;

describe('detectEnvironment', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save current values
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
    }
    // Clear all detection keys
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original values
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('detects VS Code from VSCODE_PID', () => {
    process.env.VSCODE_PID = '12345';
    expect(detectEnvironment()).toBe('vscode');
  });

  it('detects VS Code from VSCODE_CWD', () => {
    process.env.VSCODE_CWD = '/home/user/project';
    expect(detectEnvironment()).toBe('vscode');
  });

  it('detects VS Code from TERM_PROGRAM=vscode', () => {
    process.env.TERM_PROGRAM = 'vscode';
    expect(detectEnvironment()).toBe('vscode');
  });

  it('detects Cursor from CURSOR_SESSION', () => {
    process.env.CURSOR_SESSION = 'abc-123';
    expect(detectEnvironment()).toBe('cursor');
  });

  it('detects Cursor from TERM_PROGRAM=cursor', () => {
    process.env.TERM_PROGRAM = 'cursor';
    expect(detectEnvironment()).toBe('cursor');
  });

  it('detects Codex from CODEX_SESSION', () => {
    process.env.CODEX_SESSION = 'session-xyz';
    expect(detectEnvironment()).toBe('codex');
  });

  it('detects Gemini from GEMINI_CLI', () => {
    process.env.GEMINI_CLI = '1';
    expect(detectEnvironment()).toBe('gemini');
  });

  it('detects tmux from TMUX env var', () => {
    process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
    expect(detectEnvironment()).toBe('tmux');
  });

  it('falls back to shell when no env vars match', () => {
    expect(detectEnvironment()).toBe('shell');
  });

  it('vscode wins over cursor when both env vars are set (priority order)', () => {
    process.env.VSCODE_PID = '99999';
    process.env.CURSOR_SESSION = 'cursor-abc';
    expect(detectEnvironment()).toBe('vscode');
  });

  it('vscode wins over tmux when both are set', () => {
    process.env.VSCODE_CWD = '/workspace';
    process.env.TMUX = '/tmp/tmux-1000/default,1,0';
    expect(detectEnvironment()).toBe('vscode');
  });

  it('cursor wins over codex when both are set', () => {
    process.env.CURSOR_SESSION = 'cur-1';
    process.env.CODEX_SESSION = 'cdx-1';
    expect(detectEnvironment()).toBe('cursor');
  });

  it('return type satisfies DetectedEnv', () => {
    const result: DetectedEnv = detectEnvironment();
    expect(['vscode', 'codex', 'gemini', 'cursor', 'tmux', 'shell']).toContain(result);
  });
});
