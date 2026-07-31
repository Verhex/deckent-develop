import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

const entryPath = resolve('dist/cli/entry.js');

function runBinary(
  args: string[],
  cwd = process.cwd(),
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const childEnv = { ...process.env, NO_COLOR: '1', DECKENT_OFFLINE: '1' };
    delete childEnv['VITEST'];
    delete childEnv['VITEST_POOL_ID'];
    delete childEnv['VITEST_WORKER_ID'];
    delete childEnv['NODE_ENV'];
    delete childEnv['DECKENT_TEST_HERMETICITY'];
    delete childEnv['NODE_CHANNEL_FD'];
    delete childEnv['NODE_CHANNEL_SERIALIZATION_MODE'];
    const child = spawn(process.execPath, [entryPath, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: childEnv,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', code => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

describe('recovery lifecycle real binary', () => {
  it('inspects an isolated paused run read-only and never calls a provider', async () => {
    const root = mkdtempSync(join(tmpdir(), 'recovery-binary-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId: 'sprint-991',
      phase: 'EVALUATE',
      status: 'PAUSED',
    }));
    writeFileSync(join(root, '.deckent', 'pause-state.json'), JSON.stringify({
      sprintId: 'sprint-991',
      phase: 'EVALUATE',
      status: 'PAUSED',
    }));
    writeFileSync(join(root, '.tasks', 'task-991-001.json'), JSON.stringify({
      id: '991-001',
      sprintId: 'sprint-991',
      status: 'PENDING',
    }));

    const before = JSON.stringify({
      state: await import('node:fs/promises').then(fs =>
        fs.readFile(join(root, '.deckent', 'sprint-state.json'), 'utf8')),
      task: await import('node:fs/promises').then(fs =>
        fs.readFile(join(root, '.tasks', 'task-991-001.json'), 'utf8')),
    });
    const result = await runBinary([
      'recover',
      'sprint-991',
      '--dry-run',
      '--json',
    ], root);
    const after = JSON.stringify({
      state: await import('node:fs/promises').then(fs =>
        fs.readFile(join(root, '.deckent', 'sprint-state.json'), 'utf8')),
      task: await import('node:fs/promises').then(fs =>
        fs.readFile(join(root, '.tasks', 'task-991-001.json'), 'utf8')),
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout, JSON.stringify(result)).not.toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      sprintId: 'sprint-991',
      dryRun: true,
      identity: {
        executionId: 'sprint-991',
        generation: 0,
        taskId: 'sprint-991',
        attemptId: 'sprint-991:recovery:0',
      },
      taskFilesPreserved: 1,
    });
    expect(after).toBe(before);
  });
});
