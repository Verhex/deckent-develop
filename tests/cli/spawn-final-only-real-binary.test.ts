import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TaskStatus } from '../../src/core/task-types.js';

function runBuiltCli(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [resolve('dist/cli/entry.js'), ...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolveRun({ code, stdout, stderr }));
  });
}

describe('built CLI final-only manual spawn admission', () => {
  let base = '';

  afterEach(() => {
    if (base) rmSync(base, { recursive: true, force: true });
    base = '';
  });

  it('fails a canonical task with a missing owner grant before Docker/provider work', async () => {
    base = mkdtempSync(join(tmpdir(), 'deckent-final-only-binary-'));
    const projectRoot = join(base, 'project');
    const hostRoot = join(base, 'host');
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    mkdirSync(hostRoot, { recursive: true });

    writeFileSync(join(projectRoot, '.deckent', 'config.json'), `${JSON.stringify({
      language: 'en',
      spawn_backend: 'docker',
    }, null, 2)}\n`);

    const taskId = 'fo-real-binary-missing-grant';
    writeFileSync(join(projectRoot, '.tasks', `task-${taskId}.json`), `${JSON.stringify({
      id: taskId,
      title: 'Final-only negative canary',
      description: 'Must stop before provider work.',
      model: 'gpt-5.6-sol',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'real-binary admission proof',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'no provider work', noGoCriteria: 'provider starts', techDebtAcceptable: 'none' },
      status: TaskStatus.PENDING,
      provider: 'codex',
      budget: { maxTurns: 1 },
      budgetPolicy: {
        state: 'allow',
        role: 'worker',
        resolvedProvider: 'codex',
        executionCostClass: 'remote',
        profileRef: 'execution_budget.roles.worker.default',
        policyDigest: 'a'.repeat(64),
        admissionMode: 'unattended',
        landingPolicy: { reserve_ratio: 0.25 },
      },
    }, null, 2)}\n`);

    const result = await runBuiltCli(projectRoot, ['spawn', taskId], {
      ...process.env,
      DECKENT_HOME: hostRoot,
    });

    expect(result.code).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('owner-authorization-missing');
    expect(result.stdout).not.toContain('Worker spawned');
    expect(result.stderr).not.toContain('docker run');
  }, 30_000);
});
