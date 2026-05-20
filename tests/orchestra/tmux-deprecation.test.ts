import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * TDD tests for tmux backend deprecation (Sprint 177, Task 177-003).
 *
 * 3 tests:
 *  1. default→docker: resolveBackend('auto') returns 'docker'
 *  2. explicit-warns: resolveBackend('tmux') emits deprecation warning
 *  3. warn-once: warning emitted only once per sprint lifecycle
 */

describe('resolveBackend — tmux deprecation', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let resolveBackend: (backend: string) => string;
  let resetTmuxDeprecationWarning: () => void;

  beforeEach(async () => {
    // Clear module cache to reset module-level deprecation tracking Set
    vi.resetModules();
    const mod = await import('../../src/orchestra/spawn-backend.js');
    resolveBackend = (mod as unknown as { resolveBackend: (b: string) => string }).resolveBackend;
    resetTmuxDeprecationWarning = (mod as unknown as { resetTmuxDeprecationWarning: () => void }).resetTmuxDeprecationWarning;

    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('default→docker: resolveBackend("auto") returns "docker"', () => {
    const result = resolveBackend('auto');
    expect(result).toBe('docker');
  });

  it('explicit-warns: resolveBackend("tmux") emits deprecation warning', () => {
    resetTmuxDeprecationWarning();
    resolveBackend('tmux');
    expect(warnSpy).toHaveBeenCalledOnce();
    const warnArg = warnSpy.mock.calls[0][0] as string;
    expect(warnArg).toContain('tmux');
    expect(warnArg.toLowerCase()).toMatch(/deprecat/);
  });

  it('warn-once: deprecation warning emitted only once per sprint lifecycle', () => {
    resetTmuxDeprecationWarning();
    resolveBackend('tmux');
    resolveBackend('tmux');
    resolveBackend('tmux');
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});
