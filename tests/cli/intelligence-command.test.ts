import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface CliResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runBuiltCli(args: readonly string[]): Promise<CliResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [resolve('dist/cli/entry.js'), ...args],
      {
        cwd: process.cwd(),
        env: { ...process.env, DECKENT_LANGUAGE: 'en' },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', rejectRun);
    child.once('close', (code) => resolveRun({ code, stdout, stderr }));
  });
}

describe('deckent intelligence real binary', () => {
  it.skip(
    'host owns the build ritual and runs real-binary proof after sprint settlement',
    async () => {
      const result = await runBuiltCli(['intelligence', '--help']);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('watch');
      expect(result.stdout).toContain('schedule');
      expect(result.stdout).toContain('status');
    },
  );
});
