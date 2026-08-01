import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { executeAdmittedTypeScriptVerification } from '../../src/orchestra/worker-verify-tool.js';

describe('admitted TypeScript executor wire', () => {
  it('executes only the adapter-provided argv without a shell and preserves exit evidence', async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    Object.assign(child.stdout, { setEncoding: vi.fn() });
    Object.assign(child.stderr, { setEncoding: vi.fn() });
    child.kill = vi.fn();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => {
        child.stdout.emit('data', 'checked');
        child.stderr.emit('data', 'warning');
        child.emit('close', 2);
      });
      return child;
    });

    const result = await executeAdmittedTypeScriptVerification({
      executable: 'tsc',
      argv: ['--noEmit', '--pretty', 'false', '--project', 'tsconfig.json'],
      cwd: '/immutable-snapshot', timeoutMs: 1_000, shell: false,
    });

    expect(spawnMock).toHaveBeenCalledWith('tsc', ['--noEmit', '--pretty', 'false', '--project', 'tsconfig.json'], {
      cwd: '/immutable-snapshot', shell: false,
    });
    expect(result).toEqual({ exitCode: 2, stdout: 'checked', stderr: 'warning', timedOut: false });
  });
});
