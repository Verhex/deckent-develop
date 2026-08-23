import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  publishMaintenanceArchive,
  replayMaintenanceArchive,
  verifyMaintenanceArchive,
} from '../../src/core/maintenance-archive.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'maintenance-archive-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function source(path: string, bytes: string): void {
  const absolute = join(root, path);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, bytes);
}

describe('maintenance archive authority', () => {
  it('deduplicates concurrent identical publication without a mutable pointer', async () => {
    source('runtime/evidence.log', 'same bytes');
    const publications = await Promise.all(Array.from({ length: 12 }, async () => publishMaintenanceArchive(root, {
      source: 'runtime/evidence.log', lineage: 'maintenance-run-1',
    })));
    expect(new Set(publications.map(item => item.contentPath))).toHaveLength(1);
    expect(new Set(publications.map(item => item.manifestPath))).toHaveLength(1);
    expect(publications.filter(item => item.state === 'published')).toHaveLength(1);
    expect(publications.filter(item => item.state === 'deduplicated')).toHaveLength(11);
    expect(existsSync(join(root, '.deckent/archive/maintenance/latest'))).toBe(false);
  });

  it('preserves differing bytes as separate immutable objects', () => {
    source('runtime/a.log', 'alpha');
    source('runtime/b.log', 'beta');
    const a = publishMaintenanceArchive(root, { source: 'runtime/a.log', lineage: 'run-a' });
    const b = publishMaintenanceArchive(root, { source: 'runtime/b.log', lineage: 'run-b' });
    expect(a.contentDigest).not.toBe(b.contentDigest);
    expect(readFileSync(join(root, a.contentPath), 'utf8')).toBe('alpha');
    expect(readFileSync(join(root, b.contentPath), 'utf8')).toBe('beta');
  });

  it('restarts from a manifest, verifies fresh bytes, and replays bytes and mode exactly', () => {
    source('runtime/tool.sh', '#!/bin/sh\necho safe\n');
    chmodSync(join(root, 'runtime/tool.sh'), 0o750);
    const publication = publishMaintenanceArchive(root, {
      source: 'runtime/tool.sh', lineage: 'cleanup:42', retireSource: true,
    });
    expect(publication.sourceRetired).toBe(true);
    expect(existsSync(join(root, 'runtime/tool.sh'))).toBe(false);

    // Verification takes only durable project-relative identity: a new process
    // does not need the publication object or any in-memory state.
    expect(verifyMaintenanceArchive(root, publication.manifestPath)).toMatchObject({ ok: true });
    replayMaintenanceArchive(root, publication.manifestPath, 'restored/tool.sh');
    expect(readFileSync(join(root, 'restored/tool.sh'), 'utf8')).toBe('#!/bin/sh\necho safe\n');
    expect(statSync(join(root, 'restored/tool.sh')).mode & 0o777).toBe(0o750);
  });

  it('detects content and manifest tampering on fresh reads', () => {
    source('runtime/proof.json', '{"ok":true}');
    const publication = publishMaintenanceArchive(root, { source: 'runtime/proof.json', lineage: 'proof' });
    chmodSync(join(root, publication.contentPath), 0o600);
    writeFileSync(join(root, publication.contentPath), 'tampered');
    expect(verifyMaintenanceArchive(root, publication.manifestPath).ok).toBe(false);

    source('runtime/second.json', '{"ok":2}');
    const second = publishMaintenanceArchive(root, { source: 'runtime/second.json', lineage: 'second' });
    chmodSync(join(root, second.manifestPath), 0o600);
    writeFileSync(join(root, second.manifestPath), '{}');
    expect(verifyMaintenanceArchive(root, second.manifestPath).manifestDigestValid).toBe(false);
  });

  it('rejects path escape, absolute paths, and symlink sources or destinations', () => {
    source('outside.txt', 'outside');
    expect(() => publishMaintenanceArchive(root, { source: '../outside.txt', lineage: 'x' })).toThrow();
    expect(() => publishMaintenanceArchive(root, { source: join(root, 'outside.txt'), lineage: 'x' })).toThrow();
    symlinkSync(join(root, 'outside.txt'), join(root, 'linked.txt'));
    expect(() => publishMaintenanceArchive(root, { source: 'linked.txt', lineage: 'x' })).toThrow(/SYMLINK/u);

    const publication = publishMaintenanceArchive(root, { source: 'outside.txt', lineage: 'x' });
    symlinkSync(join(root, 'outside.txt'), join(root, 'destination-link'));
    expect(() => replayMaintenanceArchive(root, publication.manifestPath, 'destination-link')).toThrow(/SYMLINK/u);
    const manifest = JSON.parse(readFileSync(join(root, publication.manifestPath), 'utf8')) as Record<string, unknown>;
    expect(String(manifest['source']).startsWith(root)).toBe(false);
    expect(String(manifest['contentPath']).startsWith(root)).toBe(false);
  });
});
