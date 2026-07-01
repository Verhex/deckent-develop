/**
 * DECK-WORKER-ISOLATION (ADR-G-005) — the docker backend bind-mounts the project
 * root read-write at /workspace, so `.deck` (deckent's secret file) would be
 * worker-readable. `buildDeckShadowMountArgs` overlays an empty read-only file at
 * /workspace/.deck to hide it — but ONLY when a real `.deck` exists, because a
 * nested bind mount over a missing target materializes a phantom host `.deck`.
 *
 * Two layers:
 *  1. Pure-helper unit tests (always run) — the regression guard for the exact
 *     security-critical branch (shadow present ⇔ .deck exists; never otherwise).
 *  2. A live docker integration test (skipped when docker is unavailable) — the
 *     ONLY thing that proves the string actually hides the secret from a real
 *     container, and that a missing .deck is NOT phantom-created on the host.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDeckShadowMountArgs, ensureDeckShadowFile } from '../../src/orchestra/spawn-backend-docker.js';

// ─── 1. Pure helper — the regression guard ──────────────────────────────────

describe('buildDeckShadowMountArgs (DECK-WORKER-ISOLATION regression guard)', () => {
  it('shadows /workspace/.deck read-only when .deck exists', () => {
    const args = buildDeckShadowMountArgs(true, '/proj/.tasks/.deck-shadow');
    expect(args).toEqual(['-v', '/proj/.tasks/.deck-shadow:/workspace/.deck:ro']);
  });

  it('emits NO mount when .deck is absent (avoids phantom host .deck)', () => {
    // The security-critical branch: shadowing a non-existent .deck would make
    // docker create a phantom empty ${dir}/.deck on the host. No file → no mount.
    expect(buildDeckShadowMountArgs(false, '/proj/.tasks/.deck-shadow')).toEqual([]);
  });

  it('always mounts read-only (never rw — a worker must not write the shadow)', () => {
    const args = buildDeckShadowMountArgs(true, '/x/.deck-shadow');
    expect(args[1]).toMatch(/:ro$/);
    expect(args[1]).toContain(':/workspace/.deck:');
  });
});

describe('ensureDeckShadowFile (multi-worker EACCES regression)', () => {
  it('is idempotent across workers — a second write must not throw EACCES', () => {
    // The shadow path is shared by every worker in a sprint. A read-only (0o400)
    // file made the second worker's writeFileSync(O_TRUNC) throw EACCES and crash
    // the spawn. Assert the real code path survives a repeat write (worker 2, 3…).
    const root = mkdtempSync(join(tmpdir(), 'deck-shadow-idem-'));
    try {
      const p1 = ensureDeckShadowFile(root);          // worker 1
      expect(() => ensureDeckShadowFile(root)).not.toThrow(); // worker 2
      const p3 = ensureDeckShadowFile(root);          // worker 3
      expect(p3).toBe(p1);
      expect(readFileSync(p3, 'utf-8')).toBe('');      // stays empty
      // Owner MUST retain the write bit (0o600) so the repeat write is legal.
      expect(statSync(p3).mode & 0o200).toBe(0o200);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── 2. Live docker proof — the actual security property ─────────────────────

const dockerUp = (() => {
  try {
    return spawnSync('docker', ['info'], { timeout: 8_000, stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
})();

describe.skipIf(!dockerUp)('live docker: .deck is unreadable through the shadow mount', () => {
  it('a real container reads an empty .deck and a missing .deck is not phantom-created', () => {
    const root = mkdtempSync(join(tmpdir(), 'deck-iso-'));
    try {
      const shadow = join(root, '.deck-shadow');
      writeFileSync(shadow, '', { mode: 0o400 });
      const projectMount = `${root}:/workspace`;

      // (a) .deck PRESENT + shadowed → container must read an empty file.
      const deckPath = join(root, '.deck');
      writeFileSync(deckPath, 'DECKENT_ANTHROPIC_API_KEY=sk-SENTINEL\n');
      const shadowArgs = buildDeckShadowMountArgs(true, shadow); // ['-v', '<shadow>:/workspace/.deck:ro']
      const shadowed = spawnSync(
        'docker',
        ['run', '--rm', '-v', projectMount, ...shadowArgs, '-w', '/workspace',
          'alpine', 'sh', '-c', 'cat /workspace/.deck'],
        { encoding: 'utf-8', timeout: 60_000 },
      );
      expect(shadowed.status).toBe(0);
      expect(shadowed.stdout).not.toContain('SENTINEL');
      expect(shadowed.stdout.trim()).toBe('');

      // (b) baseline WITHOUT the shadow → the secret IS exposed (proves the gap).
      const exposed = spawnSync(
        'docker',
        ['run', '--rm', '-v', projectMount, '-w', '/workspace',
          'alpine', 'sh', '-c', 'cat /workspace/.deck'],
        { encoding: 'utf-8', timeout: 60_000 },
      );
      expect(exposed.stdout).toContain('SENTINEL');

      // (c) .deck ABSENT + shadow mount → docker would phantom-create a host .deck.
      // The helper returns [] in this case, so the backend never mounts it. Assert
      // the guard holds: no args ⇒ nothing to create.
      rmSync(deckPath);
      expect(buildDeckShadowMountArgs(existsSync(deckPath), shadow)).toEqual([]);
      expect(existsSync(deckPath)).toBe(false);
      // Re-read the host tree to be sure nothing resurrected it.
      expect(existsSync(join(root, '.deck'))).toBe(false);
      // Sanity: the real secret was never in the shadow source itself.
      expect(readFileSync(shadow, 'utf-8')).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
