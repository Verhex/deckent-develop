import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { resolveBackend, resetTmuxDeprecationWarning, _resetDockerProbeForTests } from '../../src/orchestra/spawn-backend.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

afterEach(() => {
  vi.restoreAllMocks();
  resetTmuxDeprecationWarning();
  _resetDockerProbeForTests();
});

describe('resolveBackend — platform-aware auto resolution', () => {
  it('resolves auto → subprocess on win32', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    expect(resolveBackend('auto')).toBe('subprocess');
  });

  // KN2 (GR-2026-08-08-DOGFOOD-KN2-01): 'auto' is capability-probed on
  // non-win32 — docker only when the daemon is reachable, subprocess otherwise
  // (the 2026-08-07 cold-start smoke measured a docker-less host getting the
  // docker backend and every spawn dying before provider work).
  it('resolves auto → docker on linux when the docker daemon is reachable', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    _resetDockerProbeForTests(true);
    expect(resolveBackend('auto')).toBe('docker');
  });

  it('resolves auto → docker on darwin when the docker daemon is reachable', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    _resetDockerProbeForTests(true);
    expect(resolveBackend('auto')).toBe('docker');
  });

  it('resolves auto → subprocess with a one-time typed notice when docker is unreachable', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    _resetDockerProbeForTests(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveBackend('auto')).toBe('subprocess');
    expect(resolveBackend('auto')).toBe('subprocess');
    const notices = warn.mock.calls.filter((c) => String(c[0]).includes('docker daemon is not reachable'));
    expect(notices).toHaveLength(1); // one-time, never a silent fallback
  });

  it('explicit docker stays docker even when the daemon is unreachable (honest hard failure downstream)', () => {
    _resetDockerProbeForTests(false);
    expect(resolveBackend('docker')).toBe('docker');
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
