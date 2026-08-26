// 684-003 / row 3315: dispatch-time scope baseline git calls are asynchronous.
// Hermetic proof uses only a tmpdir repository and child_process.spawn.

import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  captureScopeAttributionManifest,
  computeScopeBaselineManifest,
  SCOPE_ATTRIBUTION_HEADER,
  SCOPE_BASELINE_DELIM,
} from '../../src/orchestra/spawn-backend-docker.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runAsync(command: string, args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, [...args], {
      cwd,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    child.once('error', rejectRun);
    child.once('close', code => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited ${code}: ${stderr}`));
    });
  });
}

async function createRepository(): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), 'deckent-docker-git-async-'));
  temporaryDirectories.push(directory);
  await runAsync('git', ['init', '--quiet'], directory);
  writeFileSync(join(directory, 'tracked.ts'), 'export const value = 1;\n', 'utf-8');
  return directory;
}

describe('Docker dispatch git baseline async chain', () => {
  it('returns Promises and preserves the exact hash-object manifest evidence', async () => {
    const repository = await createRepository();

    const contentPromise = computeScopeBaselineManifest(repository, ['tracked.ts']);
    expect(contentPromise).toBeInstanceOf(Promise);
    const contentManifest = await contentPromise;

    const [path, hash] = contentManifest.trim().split(SCOPE_BASELINE_DELIM);
    expect(path).toBe('tracked.ts');
    expect(hash).toMatch(/^[0-9a-f]{40,64}$/);

    const capturePromise = captureScopeAttributionManifest(
      repository,
      'attempt-684-003',
      ['tracked.ts'],
    );
    expect(capturePromise).toBeInstanceOf(Promise);
    const attributionManifest = await capturePromise;
    const [header, entry] = attributionManifest.trimEnd().split('\n');
    expect(header).toMatch(
      new RegExp(
        `^${SCOPE_ATTRIBUTION_HEADER}${SCOPE_BASELINE_DELIM}attempt-684-003`
        + `${SCOPE_BASELINE_DELIM}[0-9a-f]{64}$`,
      ),
    );
    expect(entry).toBe(`tracked.ts${SCOPE_BASELINE_DELIM}${hash}`);
  });

  it('keeps the spawnSync ratchet reduced to the remaining non-git debt', () => {
    const projectRoot = resolve(import.meta.dirname, '../..');
    const source = readFileSync(
      join(projectRoot, 'src/orchestra/spawn-backend-docker.ts'),
      'utf-8',
    );
    const baseline = JSON.parse(
      readFileSync(join(projectRoot, 'scripts/spawnsync-baseline.json'), 'utf-8'),
    ) as {
      hotPathDebt: Array<{ file: string; code: string }>;
    };

    expect(source).not.toMatch(/spawnSync\(\s*['"]git['"]/u);
    expect(
      baseline.hotPathDebt.filter(entry =>
        entry.file === 'src/orchestra/spawn-backend-docker.ts'
        && /spawnSync\(\s*['"]git['"]/u.test(entry.code)),
    ).toEqual([]);
  });
});
