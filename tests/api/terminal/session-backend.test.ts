import { describe, it, expect } from 'vitest';
import { LocalPtyBackend } from '../../../src/api/terminal/session-backend.js';

describe('LocalPtyBackend', () => {
  it('spawns a process, streams output, and reports exit', async () => {
    const be = new LocalPtyBackend();
    const chunks: string[] = [];
    let exitCode: number | undefined;
    const h = be.spawn(
      { file: 'bash', args: ['-c', 'echo hello-pty'], cwd: process.cwd() },
      (d) => chunks.push(d),
      (code) => {
        exitCode = code;
      },
    );
    await new Promise<void>((r) => {
      const t = setInterval(() => {
        if (exitCode !== undefined) {
          clearInterval(t);
          r();
        }
      }, 20);
    });
    expect(chunks.join('')).toContain('hello-pty');
    expect(exitCode).toBe(0);
    h.kill();
  });
});
