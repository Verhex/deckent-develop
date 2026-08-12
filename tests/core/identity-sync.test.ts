import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncIdentityToDb } from '../../src/core/identity-generator.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { MEMORY_DB_FILE, BRAIN_DIR, WORKSPACE_DIR } from '../../src/core/constants.js';

// B9 (Memory V2): the memory.db `identity` entry froze because nothing
// refreshed it post-sprint. syncIdentityToDb mirrors the managed
// .deckent/workspace/IDENTITY.md doc (the identity source of truth, ADR-046)
// into the DB entry so `deckent recall` / memory queries stay current.

const IDENTITY_BODY = '# Project Identity\nName: deckent\nSprint: sprint-200\n';

describe('syncIdentityToDb — Memory V2 identity entry refresh (B9)', () => {
  let root: string;
  let dbPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'identity-sync-'));
    mkdirSync(join(root, BRAIN_DIR), { recursive: true });
    mkdirSync(join(root, WORKSPACE_DIR), { recursive: true });
    dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
    new MemoryStore(dbPath).close();
    writeFileSync(join(root, WORKSPACE_DIR, 'IDENTITY.md'), IDENTITY_BODY, 'utf-8');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function readIdentity() {
    const store = new MemoryStore(dbPath);
    try {
      return store.getByType('identity');
    } finally {
      store.close();
    }
  }

  it('creates the DB identity entry from IDENTITY.md when none exists', async () => {
    const res = await syncIdentityToDb(root);
    expect(res.success).toBe(true);

    const entries = readIdentity();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.type).toBe('identity');
    expect(entries[0]!.content).toBe(IDENTITY_BODY);
    expect(entries[0]!.source).toBe('user');
  });

  it('records detector identity as a digest-bound system projection', async () => {
    const detected = '<!-- DECKENT:WORKSPACE id="identity" schema="1" authority="user" provenance="stack-detector" -->\nLanguage: TypeScript\n';
    writeFileSync(join(root, WORKSPACE_DIR, 'IDENTITY.md'), detected, 'utf-8');

    const res = await syncIdentityToDb(root);
    expect(res.success).toBe(true);
    const [entry] = readIdentity();
    const metadata = JSON.parse(entry?.metadata ?? '{}') as Record<string, unknown>;
    expect(entry?.source).toBe('system');
    expect(metadata).toMatchObject({
      projectionOf: '.deckent/workspace/IDENTITY.md',
      workspaceArtifactSchema: 1,
      workspaceArtifactProvenance: 'stack-detector',
    });
    expect(metadata['contentSha256']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refreshes an existing (stale) identity entry in place — no duplicate', async () => {
    const seed = new MemoryStore(dbPath);
    seed.insert({
      id: 'project-identity',
      type: 'identity',
      title: 'Project Identity',
      content: '# stale identity (2026-04-16)',
      source: 'system',
      status: 'active',
      decay_exempt: true,
      tags: ['identity', 'project'],
    });
    seed.close();

    const res = await syncIdentityToDb(root);
    expect(res.success).toBe(true);
    expect(res.entryId).toBe('project-identity');

    const entries = readIdentity();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.content).toBe(IDENTITY_BODY);
  });

  it('is a no-op when IDENTITY.md is absent', async () => {
    rmSync(join(root, WORKSPACE_DIR, 'IDENTITY.md'));
    const res = await syncIdentityToDb(root);
    expect(res.success).toBe(false);
    expect(readIdentity()).toHaveLength(0);
  });

  it('is a graceful no-op when memory.db is absent', async () => {
    const freshRoot = mkdtempSync(join(tmpdir(), 'identity-sync-nodb-'));
    mkdirSync(join(freshRoot, WORKSPACE_DIR), { recursive: true });
    writeFileSync(join(freshRoot, WORKSPACE_DIR, 'IDENTITY.md'), IDENTITY_BODY, 'utf-8');
    try {
      const res = await syncIdentityToDb(freshRoot);
      expect(res.success).toBe(false);
      expect(existsSync(join(freshRoot, BRAIN_DIR, MEMORY_DB_FILE))).toBe(false);
    } finally {
      rmSync(freshRoot, { recursive: true, force: true });
    }
  });
});
