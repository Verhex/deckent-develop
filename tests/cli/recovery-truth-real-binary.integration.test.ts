import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

const entryPath = resolve('dist/cli/entry.js');

interface BinaryResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runBinary(args: readonly string[], cwd: string): Promise<BinaryResult> {
  return new Promise((resolveResult, rejectResult) => {
    const env = { ...process.env, NO_COLOR: '1', DECKENT_OFFLINE: '1' };
    for (const key of [
      'VITEST', 'VITEST_POOL_ID', 'VITEST_WORKER_ID', 'NODE_ENV',
      'DECKENT_TEST_HERMETICITY', 'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE',
    ]) delete env[key];
    const child = spawn(process.execPath, [entryPath, ...args], {
      cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectResult(new Error('real recovery binary exceeded 15s'));
    }, 15_000);
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', error => { clearTimeout(timer); rejectResult(error); });
    child.once('close', code => {
      clearTimeout(timer);
      resolveResult({ code: code ?? 1, stdout, stderr });
    });
  });
}

describe('recovery truth real binary terminal', () => {
  it('runs the compiled entrypoint asynchronously and proves replay/no-delete at the terminal JSON surface', async () => {
    expect(existsSync(entryPath), `required real binary missing: ${entryPath}`).toBe(true);
    const projectRoot = mkdtempSync(join(tmpdir(), 'recovery-truth-binary-'));
    onTestFinished(() => rmSync(projectRoot, { recursive: true, force: true }));
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'recovery-truth', version: '1.0.0' }));
    writeFileSync(join(projectRoot, '.deckent', 'config.json'), JSON.stringify({ language: 'en' }));
    writeFileSync(join(projectRoot, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId: 'sprint-622', phase: 'EXECUTE', status: 'PAUSED', taskIds: ['622-001'],
    }));
    writeFileSync(join(projectRoot, '.deckent', 'pause-state.json'), JSON.stringify({
      sprintId: 'sprint-622', phase: 'EXECUTE', status: 'PAUSED',
    }));
    const taskPath = join(projectRoot, '.tasks', 'task-622-001.json');
    const checkpointPath = join(projectRoot, '.deckent', 'sprint-622-checkpoint.json');
    writeFileSync(taskPath, JSON.stringify({ id: '622-001', sprintId: 'sprint-622', status: 'PAUSED' }));
    writeFileSync(checkpointPath, JSON.stringify({
      sprintId: 'sprint-622', checkpointNumber: 9, timestamp: new Date().toISOString(),
      completedTasks: [], pendingTasks: ['622-001'], activeWorkers: [],
      brainPhase: 'EXECUTE', eventStreamOffset: 9,
    }));
    const taskBefore = readFileSync(taskPath);
    const checkpointBefore = readFileSync(checkpointPath);

    const first = await runBinary(['recover', 'sprint-622', '--dry-run', '--json'], projectRoot);
    const replay = await runBinary(['recover', 'sprint-622', '--dry-run', '--json'], projectRoot);

    expect(first.code, JSON.stringify(first)).toBe(0);
    expect(replay.code, JSON.stringify(replay)).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      sprintId: 'sprint-622',
      dryRun: true,
      identity: { executionId: 'sprint-622', taskId: 'sprint-622' },
      taskFilesPreserved: 1,
    });
    expect(JSON.parse(replay.stdout)).toEqual(JSON.parse(first.stdout));
    expect(readFileSync(taskPath)).toEqual(taskBefore);
    expect(readFileSync(checkpointPath)).toEqual(checkpointBefore);
  }, 30_000);
});
