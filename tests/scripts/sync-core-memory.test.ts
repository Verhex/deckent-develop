import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';

function runSync(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [join(process.cwd(), 'scripts/sync-core-memory.mjs'), ...args],
      {
        env: { ...process.env, ...env },
        encoding: 'utf-8',
      },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error);
          return;
        }
        resolve({
          status: error && typeof error.code === 'number' ? error.code : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

function readEntry(dir: string, name: string): string | null {
  const path = join(dir, name);
  return existsSync(path) ? readFileSync(path, 'utf-8') : null;
}

describe('sync-core-memory one-way projection', () => {
  let tempRoot: string;
  let authorityDir: string;
  let projectionDir: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'sync-mem-test-'));
    authorityDir = join(tempRoot, 'authority');
    projectionDir = join(tempRoot, 'projection');
    mkdirSync(authorityDir, { recursive: true });
    mkdirSync(projectionDir, { recursive: true });
    writeFileSync(join(authorityDir, 'MEMORY.md'), '# Canonical memory\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('projects repo authority to the configured host directory', async () => {
    writeFileSync(join(authorityDir, 'law.md'), '# Law\n', 'utf-8');

    const result = await runSync(['--target', projectionDir], {
      DECKENT_CORE_MEMORY_PATH: authorityDir,
    });

    expect(result.status).toBe(0);
    expect(readEntry(projectionDir, 'MEMORY.md')).toBe('# Canonical memory\n');
    expect(readEntry(projectionDir, 'law.md')).toBe('# Law\n');
  });

  it('overwrites projection drift and removes projection-only markdown', async () => {
    writeFileSync(join(authorityDir, 'law.md'), 'authority', 'utf-8');
    writeFileSync(join(projectionDir, 'law.md'), 'host drift', 'utf-8');
    writeFileSync(join(projectionDir, 'stale.md'), 'stale', 'utf-8');

    const result = await runSync(['--target', projectionDir], {
      DECKENT_CORE_MEMORY_PATH: authorityDir,
    });

    expect(result.status).toBe(0);
    expect(readEntry(projectionDir, 'law.md')).toBe('authority');
    expect(existsSync(join(projectionDir, 'stale.md'))).toBe(false);
  });

  it('is idempotent when authority and projection are equal', async () => {
    writeFileSync(join(projectionDir, 'MEMORY.md'), '# Canonical memory\n', 'utf-8');
    const beforeMtime = statSync(join(projectionDir, 'MEMORY.md')).mtimeMs;

    const result = await runSync(['--target', projectionDir], {
      DECKENT_CORE_MEMORY_PATH: authorityDir,
    });

    expect(result.status).toBe(0);
    expect(statSync(join(projectionDir, 'MEMORY.md')).mtimeMs).toBe(beforeMtime);
  });

  it('check mode reports drift without mutating the projection', async () => {
    writeFileSync(join(authorityDir, 'law.md'), 'authority', 'utf-8');
    writeFileSync(join(projectionDir, 'law.md'), 'host drift', 'utf-8');

    const result = await runSync(['--target', projectionDir, '--check'], {
      DECKENT_CORE_MEMORY_PATH: authorityDir,
    });

    expect(result.status).toBe(1);
    expect(readEntry(projectionDir, 'law.md')).toBe('host drift');
  });

  it('rejects removed host-to-authority modes', async () => {
    const result = await runSync(['--backup', '--target', projectionDir], {
      DECKENT_CORE_MEMORY_PATH: authorityDir,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('repo-local core-memory is the only authority');
  });

  it('requires an explicit absolute projection target', async () => {
    const missing = await runSync([], {
      DECKENT_CORE_MEMORY_PATH: authorityDir,
      DECKENT_MEMORY_PROJECTION_PATH: '',
      DECKENT_USER_MEMORY_PATH: '',
    });
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('No projection target configured');

    const relative = await runSync(['--target', 'relative/path'], {
      DECKENT_CORE_MEMORY_PATH: authorityDir,
    });
    expect(relative.status).not.toBe(0);
    expect(relative.stderr).toContain('must be absolute');
  });
});
