import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installCrashHandlers,
  _resetCrashHandlersForTesting,
  type CrashContext,
} from '../../src/orchestra/sprint-runner-entry.js';

describe('Sprint Runner Crash Handlers', () => {
  let ipcDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ipcDir = mkdtempSync(join(tmpdir(), 'deckent-crash-'));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
      throw new Error('process.exit called');
    }) as never);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    _resetCrashHandlersForTesting();
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('SIGTERM');
  });

  afterEach(() => {
    rmSync(ipcDir, { recursive: true, force: true });
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('SIGTERM');
    _resetCrashHandlersForTesting();
  });

  it('writes error.json with redacted payload on uncaughtException', () => {
    const ctx: CrashContext = { ipcDir, jobId: 'test-job-1' };
    installCrashHandlers(ctx);
    const err = new Error('boom api_key=sk-leakedsecret1234567');

    expect(() => process.emit('uncaughtException', err)).toThrow('process.exit called');

    const errorJsonPath = join(ipcDir, 'error.json');
    expect(existsSync(errorJsonPath)).toBe(true);
    const payload = JSON.parse(readFileSync(errorJsonPath, 'utf-8'));
    expect(payload.kind).toBe('uncaughtException');
    expect(payload.jobId).toBe('test-job-1');
    expect(payload.error.message).toContain('[REDACTED');
    expect(payload.error.message).not.toContain('sk-leakedsecret1234567');
    expect(typeof payload.timestamp).toBe('string');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('writes error.json on unhandledRejection', () => {
    installCrashHandlers({ ipcDir, jobId: 'test-job-2' });

    const rejection = new Error('rejected');
    expect(() => process.emit('unhandledRejection', rejection, Promise.resolve()))
      .toThrow('process.exit called');

    const payload = JSON.parse(readFileSync(join(ipcDir, 'error.json'), 'utf-8'));
    expect(payload.kind).toBe('unhandledRejection');
    expect(payload.error.message).toContain('rejected');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles SIGTERM with graceful exit code 143', () => {
    installCrashHandlers({ ipcDir, jobId: 'test-job-3' });

    expect(() => process.emit('SIGTERM')).toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(143);
    const status = JSON.parse(readFileSync(join(ipcDir, 'status.json'), 'utf-8'));
    expect(status.terminatedBy).toBe('SIGTERM');
    expect(status.jobId).toBe('test-job-3');
    expect(status.phase).toBe('TERMINATED');
  });

  it('idempotent — installCrashHandlers iki kez çağrılırsa tek listener kalır', () => {
    installCrashHandlers({ ipcDir, jobId: 'idem' });
    installCrashHandlers({ ipcDir, jobId: 'idem' });
    expect(process.listenerCount('uncaughtException')).toBe(1);
    expect(process.listenerCount('unhandledRejection')).toBe(1);
    expect(process.listenerCount('SIGTERM')).toBe(1);
  });

  it('writes error.json even when IPC dir does not pre-exist content', () => {
    installCrashHandlers({ ipcDir, jobId: 'disk-test' });
    expect(() => process.emit('uncaughtException', new Error('test'))).toThrow();
    expect(existsSync(join(ipcDir, 'error.json'))).toBe(true);
  });
});
