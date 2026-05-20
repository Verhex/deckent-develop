import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import {
  regenerateConfigSafe,
  REGEN_TEMPLATE_DEFAULTS,
} from '../../src/core/config.js';

// ─── Helpers ────────────────────────────────────────────────────────

function createTmpProject(suffix: string): string {
  const dir = join(tmpdir(), `deckent-regen-${suffix}-${Date.now()}`);
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  return dir;
}

function cleanupTmpProject(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writeConfig(dir: string, config: Record<string, unknown>): void {
  writeFileSync(join(dir, '.deckent', 'config.json'), JSON.stringify(config, null, 2));
}

function readConfig(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, '.deckent', 'config.json'), 'utf-8')) as Record<string, unknown>;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('regenerateConfigSafe', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpProject('guard');
  });

  afterEach(() => {
    cleanupTmpProject(tmpDir);
  });

  it('merge preserves user fields — existing values are not overwritten by template', () => {
    // User has custom spawn_backend — template default is 'docker' but user wins
    writeConfig(tmpDir, {
      spawn_backend: 'subprocess',
      mode: 'balanced',
      dependency_pipeline_enabled: true,
    });

    const result = regenerateConfigSafe(tmpDir);

    expect(result.merged['spawn_backend']).toBe('subprocess');
    expect(result.merged['mode']).toBe('balanced');
    expect(result.merged['dependency_pipeline_enabled']).toBe(true);

    const onDisk = readConfig(tmpDir);
    expect(onDisk['spawn_backend']).toBe('subprocess');
    expect(onDisk['mode']).toBe('balanced');
  });

  it('backup is created at .deckent/config.json.bak.regen-{iso} before write', () => {
    const original = { spawn_backend: 'tmux', mode: 'performance' };
    writeConfig(tmpDir, original);

    const result = regenerateConfigSafe(tmpDir);

    // Backup file must exist
    expect(existsSync(result.backupPath)).toBe(true);
    // Backup path must match the expected pattern
    expect(result.backupPath).toMatch(/\.deckent[\\/]config\.json\.bak\.regen-/);
    // Backup content must equal the original (pre-merge snapshot)
    const backupContent = JSON.parse(readFileSync(result.backupPath, 'utf-8')) as Record<string, unknown>;
    expect(backupContent['spawn_backend']).toBe('tmux');
    expect(backupContent['mode']).toBe('performance');
  });

  it('missing-field add — template fields absent from user config are injected', () => {
    // User config has no dependency_pipeline_enabled, haiku_allowed, or brain_planning
    writeConfig(tmpDir, {
      mode: 'economic',
      spawn_backend: 'docker',
    });

    const result = regenerateConfigSafe(tmpDir);

    // Fields missing in user config must be added from template
    expect(result.merged['dependency_pipeline_enabled']).toBe(false);
    expect(result.merged['haiku_allowed']).toBe(false);
    expect(result.merged['brain_planning']).toBe('structured');

    // added array must list the injected keys
    expect(result.added).toContain('dependency_pipeline_enabled');
    expect(result.added).toContain('haiku_allowed');
    expect(result.added).toContain('brain_planning');

    // spawn_backend was already present — must NOT appear in added
    expect(result.added).not.toContain('spawn_backend');

    // Merged config on disk must contain the added fields
    const onDisk = readConfig(tmpDir);
    expect(onDisk['dependency_pipeline_enabled']).toBe(false);
    expect(onDisk['haiku_allowed']).toBe(false);
  });
});

describe('REGEN_TEMPLATE_DEFAULTS', () => {
  it('contains the four required safe defaults', () => {
    expect(REGEN_TEMPLATE_DEFAULTS['spawn_backend']).toBe('docker');
    expect(REGEN_TEMPLATE_DEFAULTS['dependency_pipeline_enabled']).toBe(false);
    expect(REGEN_TEMPLATE_DEFAULTS['haiku_allowed']).toBe(false);
    expect(REGEN_TEMPLATE_DEFAULTS['brain_planning']).toBe('structured');
  });
});
