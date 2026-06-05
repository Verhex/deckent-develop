import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { resolveBackend, resetTmuxDeprecationWarning } from '../../src/orchestra/spawn-backend.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

afterEach(() => {
  vi.restoreAllMocks();
  resetTmuxDeprecationWarning();
});

describe('resolveBackend — platform-aware auto resolution', () => {
  it('resolves auto → subprocess on win32', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    expect(resolveBackend('auto')).toBe('subprocess');
  });

  it('resolves auto → docker on linux', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    expect(resolveBackend('auto')).toBe('docker');
  });

  it('resolves auto → docker on darwin', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    expect(resolveBackend('auto')).toBe('docker');
  });

  it('passes through explicit subprocess unchanged', () => {
    expect(resolveBackend('subprocess')).toBe('subprocess');
  });

  it('passes through explicit docker unchanged', () => {
    expect(resolveBackend('docker')).toBe('docker');
  });
});

describe('Node timer sleep — cross-platform Atomics.wait availability', () => {
  it('Atomics.wait is available and resolves quickly for short sleeps', () => {
    const buf = new SharedArrayBuffer(4);
    const arr = new Int32Array(buf);
    const result = Atomics.wait(arr, 0, 0, 1);
    expect(['timed-out', 'ok', 'not-equal']).toContain(result);
  });

  it('spawn-backend.ts contains process.platform win32 guard for auto resolution', () => {
    const src = readFileSync(
      join(projectRoot, 'src', 'orchestra', 'spawn-backend.ts'),
      'utf-8',
    );
    expect(src).toMatch(/process\.platform\s*===\s*['"`]win32['"`]/);
  });

  it('kill() polling loop uses Atomics.wait instead of POSIX sleep for 500ms poll', () => {
    const src = readFileSync(
      join(projectRoot, 'src', 'orchestra', 'spawn-backend-docker.ts'),
      'utf-8',
    );
    // The kill() result-file poll loop must use Atomics.wait, not spawnSync('sleep', ['0.5'])
    expect(src).toMatch(/Atomics\.wait\b/);
    // Verify it does NOT use spawnSync('sleep', ['0.5'] in a loop (500ms poll fix)
    expect(src).not.toMatch(/spawnSync\(\s*['"`]sleep['"`],\s*\[['"`]0\.5['"`]\]/);
  });
});
