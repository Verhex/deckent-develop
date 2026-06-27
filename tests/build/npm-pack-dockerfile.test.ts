import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

function runNpmPackDryRun(): Promise<string> {
  return new Promise((res, rej) => {
    const proc = spawn('npm', ['pack', '--dry-run', '--json'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        rej(new Error(`npm pack exited ${code}: ${stderr}`));
      } else {
        res(stdout);
      }
    });
    proc.on('error', rej);
  });
}

describe('npm pack manifest — Dockerfile.worker', () => {
  it('includes Dockerfile.worker in the packed tarball file list', async () => {
    const raw = await runNpmPackDryRun();

    // npm pack --json outputs an array even for a single workspace entry
    let packs: Array<{ files: Array<{ path: string }> }>;
    try {
      packs = JSON.parse(raw);
    } catch {
      throw new Error(`Failed to parse npm pack --json output: ${raw.slice(0, 400)}`);
    }

    expect(packs).toBeInstanceOf(Array);
    expect(packs.length).toBeGreaterThan(0);

    const allPaths = packs.flatMap((p) => p.files.map((f) => f.path));
    const hasDockerfile = allPaths.some(
      (p) => p === 'Dockerfile.worker' || p.endsWith('/Dockerfile.worker'),
    );

    expect(
      hasDockerfile,
      `Dockerfile.worker not found in npm pack manifest.\nAll paths: ${allPaths.join(', ')}`,
    ).toBe(true);
  }, 30_000);
});
