import { describe, it, expect, vi } from 'vitest';
import { PtySessionManager, resolveDefaultShell } from '../../src/api/terminal/session-manager.js';
import type { SessionBackend, BackendHandle, SpawnSpec } from '../../src/api/terminal/session-backend.js';

/**
 * Task 387-025 (TERM-SHELL-FALLBACK).
 *
 * session-manager's shell selection used to be `process.env.SHELL ?? 'bash'`
 * with no platform awareness — on win32 (where SHELL is normally unset) this
 * silently fell back to 'bash', which is usually not installed, breaking pty
 * spawn (Law #2: an unsupported platform must fail honestly, not silently).
 * These tests prove resolveDefaultShell() is platform-aware and that the
 * existing POSIX $SHELL-set path is unchanged.
 */
describe('resolveDefaultShell', () => {
  it('POSIX: honors $SHELL when set (existing behavior preserved)', () => {
    expect(resolveDefaultShell('linux', { SHELL: '/usr/bin/zsh' })).toBe('/usr/bin/zsh');
    expect(resolveDefaultShell('darwin', { SHELL: '/bin/zsh' })).toBe('/bin/zsh');
  });

  it('POSIX: falls back to sh (not bash) when SHELL is unset', () => {
    expect(resolveDefaultShell('linux', {})).toBe('sh');
  });

  it('POSIX: falls back to sh when SHELL is an empty string', () => {
    expect(resolveDefaultShell('linux', { SHELL: '' })).toBe('sh');
  });

  it('win32: uses ComSpec when set', () => {
    expect(resolveDefaultShell('win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' })).toBe(
      'C:\\Windows\\System32\\cmd.exe',
    );
  });

  it('win32: honors a ComSpec override to powershell.exe', () => {
    expect(
      resolveDefaultShell('win32', { ComSpec: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' }),
    ).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  });

  it('win32: falls back to cmd.exe when ComSpec is unset', () => {
    expect(resolveDefaultShell('win32', {})).toBe('cmd.exe');
  });

  it('win32: never falls back to bash/sh even if SHELL happens to be set', () => {
    // e.g. a Git Bash / MSYS session leaking SHELL into a native win32 spawn.
    expect(resolveDefaultShell('win32', { SHELL: '/usr/bin/bash' })).toBe('cmd.exe');
  });

  it('defaults to the real process.platform/process.env when called with no args', () => {
    // Smoke check that the injectable defaults line up with the live host —
    // exercises the same code path PtySessionManager.create() uses.
    expect(typeof resolveDefaultShell()).toBe('string');
    expect(resolveDefaultShell().length).toBeGreaterThan(0);
  });
});

function fakeBackend() {
  const captured: SpawnSpec[] = [];
  const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  const be: SessionBackend = {
    spawn: (spec, _onData, _onExit) => {
      captured.push(spec);
      return handle;
    },
  };
  return { be, captured };
}

describe('PtySessionManager shell wiring', () => {
  it('kind=shell spawns the platform-resolved default shell', () => {
    const f = fakeBackend();
    const m = new PtySessionManager(f.be, { scrollbackBytes: 16, idleTimeoutMs: 0 });
    m.create({ kind: 'shell' });
    expect(f.captured).toHaveLength(1);
    expect(f.captured[0]?.file).toBe(resolveDefaultShell());
  });
});
