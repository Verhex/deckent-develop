import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pruneConfigBackups, migrateConfig } from '../../src/core/config-migration.js';

describe('pruneConfigBackups', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-backup-test-'));
    configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, '{}');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('keeps 3 newest timestamped backups, deletes older ones', () => {
    const timestamps = [
      '2026-04-06T05-51-08-434Z',
      '2026-04-06T09-31-53-237Z',
      '2026-04-06T10-05-03-651Z',
      '2026-04-07T07-16-25-409Z',
      '2026-04-09T12-32-56-142Z',
    ];
    for (const ts of timestamps) {
      writeFileSync(join(tmpDir, `config.json.bak.${ts}`), 'snapshot');
    }

    const deleted = pruneConfigBackups(configPath, 3);

    expect(deleted).toHaveLength(2);
    const remaining = readdirSync(tmpDir).filter((f) => f.startsWith('config.json.bak.'));
    expect(remaining).toHaveLength(3);
    expect(remaining).toContain('config.json.bak.2026-04-09T12-32-56-142Z');
    expect(remaining).toContain('config.json.bak.2026-04-07T07-16-25-409Z');
    expect(remaining).toContain('config.json.bak.2026-04-06T10-05-03-651Z');
  });

  it('preserves legacy timestamp-less config.json.bak', () => {
    writeFileSync(join(tmpDir, 'config.json.bak'), 'legacy-snapshot');
    const timestamps = [
      '2026-04-06T05-51-08-434Z',
      '2026-04-07T07-16-25-409Z',
      '2026-04-08T07-16-25-409Z',
      '2026-04-09T12-32-56-142Z',
    ];
    for (const ts of timestamps) {
      writeFileSync(join(tmpDir, `config.json.bak.${ts}`), 'snapshot');
    }

    const deleted = pruneConfigBackups(configPath, 3);

    expect(deleted).toHaveLength(1);
    const remaining = readdirSync(tmpDir);
    expect(remaining).toContain('config.json.bak');
    expect(remaining).toContain('config.json.bak.2026-04-09T12-32-56-142Z');
    expect(remaining).toContain('config.json.bak.2026-04-08T07-16-25-409Z');
    expect(remaining).toContain('config.json.bak.2026-04-07T07-16-25-409Z');
    expect(remaining).not.toContain('config.json.bak.2026-04-06T05-51-08-434Z');
  });

  it('is a no-op when no backups exist', () => {
    const deleted = pruneConfigBackups(configPath, 3);
    expect(deleted).toEqual([]);
  });

  it('is a no-op when backup count <= keepCount', () => {
    writeFileSync(join(tmpDir, 'config.json.bak.2026-04-09T12-32-56-142Z'), 's');
    writeFileSync(join(tmpDir, 'config.json.bak.2026-04-08T12-32-56-142Z'), 's');

    const deleted = pruneConfigBackups(configPath, 3);

    expect(deleted).toEqual([]);
    const remaining = readdirSync(tmpDir).filter((f) => f.startsWith('config.json.bak.'));
    expect(remaining).toHaveLength(2);
  });

  it('ignores unrelated files matching different prefixes', () => {
    writeFileSync(join(tmpDir, 'other.bak.2026-04-09T12-32-56-142Z'), 'unrelated');
    writeFileSync(join(tmpDir, 'config.json.bak.2026-04-06T05-51-08-434Z'), 's');
    writeFileSync(join(tmpDir, 'config.json.bak.2026-04-07T07-16-25-409Z'), 's');
    writeFileSync(join(tmpDir, 'config.json.bak.2026-04-08T07-16-25-409Z'), 's');
    writeFileSync(join(tmpDir, 'config.json.bak.2026-04-09T12-32-56-142Z'), 's');

    const deleted = pruneConfigBackups(configPath, 3);

    expect(deleted).toHaveLength(1);
    const remaining = readdirSync(tmpDir);
    expect(remaining).toContain('other.bak.2026-04-09T12-32-56-142Z');
    expect(remaining).not.toContain('config.json.bak.2026-04-06T05-51-08-434Z');
  });
});

describe('migrateConfig integration with pruneConfigBackups', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-migrate-test-'));
    configPath = join(tmpDir, 'config.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prunes old backups after a migration write', () => {
    writeFileSync(configPath, JSON.stringify({ version: '0.1.0' }));
    for (const ts of [
      '2026-04-01T10-00-00-000Z',
      '2026-04-02T10-00-00-000Z',
      '2026-04-03T10-00-00-000Z',
      '2026-04-04T10-00-00-000Z',
    ]) {
      writeFileSync(join(tmpDir, `config.json.bak.${ts}`), 'old');
    }

    const result = migrateConfig(configPath);

    expect(result.migrated).toBe(true);
    const backups = readdirSync(tmpDir).filter((f) =>
      /^config\.json\.bak\.\d{4}-\d{2}-\d{2}T/.test(f),
    );
    expect(backups.length).toBeLessThanOrEqual(3);
  });
});
