/**
 * Sprint 228 Task 228-002 — manifest-autonomous hermetic tests.
 *
 * Verifies that autonomous-runtime is present in FEATURE_DEFINITIONS (source-level),
 * that the script writes it to the manifest, and that it lands in the active bucket.
 *
 * Hermetic: no gitignored state reads (.deckent/config.json, .brain/memory.db),
 * async spawn only (no spawnSync), cleanup in afterEach.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const PROJECT_ROOT = join(__dirname, '../../');
const SYNC_MANIFEST_PATH = join(PROJECT_ROOT, 'scripts/sync-manifest.mjs');
const MANIFEST_PATH = join(PROJECT_ROOT, '.deckent/features-manifest.json');

// ─── helper: run script, collect stdout ──────────────────────────────────────

function runSyncManifest(args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SYNC_MANIFEST_PATH, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
    });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, code: code ?? 1 }));
  });
}

// ─── Test 1: FEATURE_DEFINITIONS source contains autonomous-runtime ──────────

describe('FEATURE_DEFINITIONS — autonomous-runtime present in source', () => {
  it('sync-manifest.mjs source file contains the autonomous-runtime id string', () => {
    const source = readFileSync(SYNC_MANIFEST_PATH, 'utf-8');
    expect(source).toContain('autonomous-runtime');
  });

  it('sync-manifest.mjs source file contains the F3-009 label string', () => {
    const source = readFileSync(SYNC_MANIFEST_PATH, 'utf-8');
    expect(source).toContain('Autonomous Execution Engine — F3-009 backlog-driven authority-bounded loop');
  });
});

// ─── Test 2: regenerate writes autonomous-runtime to manifest output ─────────

describe('regenerate — script outputs autonomous-runtime', () => {
  it('--dry-run --json output includes autonomous-runtime in active array', async () => {
    const { stdout, code } = await runSyncManifest(['--dry-run', '--json']);
    expect(code).toBe(0);
    const manifest = JSON.parse(stdout);
    const found = manifest.active.some((f: { id: string }) => f.id === 'autonomous-runtime');
    expect(found).toBe(true);
  }, 30_000);

  it('--dry-run --json active entry has the correct F3-009 label', async () => {
    const { stdout, code } = await runSyncManifest(['--dry-run', '--json']);
    expect(code).toBe(0);
    const manifest = JSON.parse(stdout);
    const entry = manifest.active.find((f: { id: string }) => f.id === 'autonomous-runtime');
    expect(entry).toBeDefined();
    expect(entry.label).toBe('Autonomous Execution Engine — F3-009 backlog-driven authority-bounded loop');
  }, 30_000);
});

// ─── Test 3: committed manifest has autonomous-runtime in active bucket ───────

describe('committed manifest — autonomous-runtime in active bucket', () => {
  it('features-manifest.json active array contains autonomous-runtime', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const found = manifest.active.some((f: { id: string }) => f.id === 'autonomous-runtime');
    expect(found).toBe(true);
  });

  it('features-manifest.json autonomous-runtime entry has expected files', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const entry = manifest.active.find((f: { id: string }) => f.id === 'autonomous-runtime');
    expect(entry).toBeDefined();
    expect(entry.files).toContain('src/orchestra/autonomous/runtime-loop.ts');
    expect(entry.files).toContain('src/cli/commands/autonomous.ts');
  });
});
