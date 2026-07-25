import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'sync-manifest.mjs');
const sandboxes: string[] = [];

function runGenerator(root: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [SCRIPT, '--root', root], {
      cwd: REPO_ROOT,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolveRun({ code, stderr }));
  });
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('sync-manifest last-known sprint provenance', () => {
  it('preserves valid prior sprint metadata when isolated runtime evidence is absent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-manifest-metadata-'));
    sandboxes.push(root);
    const settings = join(root, '.deckent', 'settings');
    mkdirSync(settings, { recursive: true });
    writeFileSync(join(settings, 'features-manifest.json'), JSON.stringify({
      _meta: {
        sprintId: 'sprint-452',
      },
    }));

    const run = await runGenerator(root);
    expect(run, run.stderr).toMatchObject({ code: 0 });

    const generated = JSON.parse(
      readFileSync(join(settings, 'features-manifest.json'), 'utf8'),
    ) as {
      _meta: {
        sprintId: string;
        sourceAnalysis: { sprintsChecked: string[] };
      };
    };
    expect(generated._meta.sprintId).toBe('sprint-452');
    expect(generated._meta.sourceAnalysis.sprintsChecked).toEqual([
      'sprint-443',
      'sprint-444',
      'sprint-445',
      'sprint-446',
      'sprint-447',
      'sprint-448',
      'sprint-449',
      'sprint-450',
      'sprint-451',
      'sprint-452',
    ]);
  });
});
