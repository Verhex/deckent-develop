/**
 * tests/core/memory-tenant-scope.test.ts — MEM-TENANT (born-609, sprint-405 405-001).
 *
 * RED-KANIT: before this task, `MemoryQueryParams` had no `tenantId` field and
 * `buildFilterClauses` (memory-query.ts) had zero tenant-awareness — a caller could
 * not scope `searchMemory` by tenant even though `entries.tenant_id` is already
 * populated by MemoryStore.insert(). The GREEN assertions below (a tenant-A query
 * never sees tenant-B's rows, both via the structured AND the FTS path) are the
 * proof: pre-fix, the exact same fixture DB would return BOTH tenants' rows for
 * either query, because no tenant predicate existed anywhere in the query layer.
 * (No git-stash-and-rerun in this shared worktree — see feedback:
 * never_git_stash_shared_worktree — the diff + these assertions are the evidence.)
 *
 * Covers:
 *  - structured-search tenant scoping (no text)
 *  - FTS-search tenant scoping (dual-layer predicate, text present)
 *  - fail-closed default: a NULL-tenant (legacy) row never matches an explicit
 *    tenantId query — mirrors MemoryStore's born-563 default for getById/getByType/
 *    getByTags (tests/core/memory-tenant-isolation.test.ts). Note: the LEGACY-NULL
 *    policy itself (fallback vs. migration for pre-existing NULL-tenant rows) is an
 *    open Alperen decision per the task spec — this suite only locks in that the
 *    *query layer* now carries forward the same already-shipped fail-closed default,
 *    it does not decide the legacy-row policy.
 *  - regression pin: the tenant-less path (no tenantId passed) is byte-identical —
 *    still returns every tenant's + the NULL-tenant's rows, unfiltered.
 *  - honest column-missing skip: a DB opened against a table with no `tenant_id`
 *    column never throws — the predicate is silently skipped (with a warn).
 *  - endpoint principal->tenant threading: registerMemorySearch (memory-search-endpoint.ts)
 *    derives tenantId from the request principal (deriveRequestPrincipal, the same
 *    resolution source ws-gateway/audit already use) and narrows results accordingly;
 *    no req / no tenant claim -> unfiltered tenant-less path (unchanged legacy behavior).
 *
 * Hermetic: every fixture lives under os.tmpdir(); no real HTTP server, no
 * spawnSync, no project/HOME state read.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import Database from 'better-sqlite3';
import { MemoryStore } from '../../src/core/memory-store.js';
import { searchMemory } from '../../src/core/memory-query.js';
import type { MemorySearchResult } from '../../src/core/memory-types.js';
import { registerMemorySearch } from '../../src/api/memory-search-endpoint.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../src/core/constants.js';

// ─── Fixture DB (tenant-A / tenant-B / legacy NULL-tenant rows) ─────────────────

let store: MemoryStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mem-tenant-scope-'));
  store = new MemoryStore(join(tmpDir, 'test.db'));

  store.insert({
    id: 'a-1',
    type: 'memory',
    title: 'Tenant A secret note',
    content: 'alpha payload docker heartbeat detail',
    tags: ['scope-test'],
    tenant_id: 'tenant-a',
    sprint_num: 10,
  });
  store.insert({
    id: 'b-1',
    type: 'memory',
    title: 'Tenant B secret note',
    content: 'beta payload docker heartbeat detail',
    tags: ['scope-test'],
    tenant_id: 'tenant-b',
    sprint_num: 20,
  });
  store.insert({
    id: 'n-1',
    type: 'memory',
    title: 'Legacy NULL-tenant note',
    content: 'legacy payload docker heartbeat detail',
    tags: ['scope-test'],
    // no tenant_id → NULL (legacy/single-tenant row)
    sprint_num: 30,
  });
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Structured-search (no text) ────────────────────────────────────────────────

describe('searchMemory tenant scoping — structured (no text)', () => {
  it('tenantId="tenant-a" returns only tenant-a rows', () => {
    const results = searchMemory(store, { tenantId: 'tenant-a' });
    expect(results.map(r => r.entry.id)).toEqual(['a-1']);
  });

  it('tenantId="tenant-b" returns only tenant-b rows', () => {
    const results = searchMemory(store, { tenantId: 'tenant-b' });
    expect(results.map(r => r.entry.id)).toEqual(['b-1']);
  });

  it('fail-closed: a NULL-tenant row never matches an explicit tenantId query', () => {
    for (const tenantId of ['tenant-a', 'tenant-b', 'tenant-c']) {
      const results = searchMemory(store, { tenantId });
      expect(results.map(r => r.entry.id)).not.toContain('n-1');
    }
  });

  it('tenantId composes with other structured filters (type + tenantId)', () => {
    store.insert({
      id: 'a-2',
      type: 'debt',
      title: 'Tenant A debt row',
      content: 'debt content',
      tenant_id: 'tenant-a',
      sprint_num: 40,
    });
    const results = searchMemory(store, { tenantId: 'tenant-a', type: ['debt'] });
    expect(results.map(r => r.entry.id)).toEqual(['a-2']);
  });
});

// ─── FTS-search (text present, dual-layer predicate) ────────────────────────────

describe('searchMemory tenant scoping — FTS (text present)', () => {
  it('tenantId="tenant-a" scopes FTS results to only tenant-a', () => {
    const results = searchMemory(store, { text: 'docker heartbeat', tenantId: 'tenant-a' });
    expect(results.map(r => r.entry.id)).toEqual(['a-1']);
  });

  it('tenantId="tenant-b" scopes FTS results to only tenant-b', () => {
    const results = searchMemory(store, { text: 'docker heartbeat', tenantId: 'tenant-b' });
    expect(results.map(r => r.entry.id)).toEqual(['b-1']);
  });

  it('fail-closed: NULL-tenant row is excluded from FTS results under an explicit tenantId', () => {
    const results = searchMemory(store, { text: 'docker heartbeat', tenantId: 'tenant-a' });
    expect(results.map(r => r.entry.id)).not.toContain('n-1');
  });
});

// ─── Regression pin: tenant-less path is byte-identical ─────────────────────────

describe('regression pin — omitting tenantId leaves existing behavior unchanged', () => {
  it('structured search without tenantId returns every row (all tenants + NULL)', () => {
    const results = searchMemory(store, {});
    expect(results.map(r => r.entry.id).sort()).toEqual(['a-1', 'b-1', 'n-1']);
  });

  it('FTS search without tenantId returns every matching row (all tenants + NULL)', () => {
    const results = searchMemory(store, { text: 'docker heartbeat' });
    expect(results.map(r => r.entry.id).sort()).toEqual(['a-1', 'b-1', 'n-1']);
  });

  it('existing memory-query.test.ts-style calls are unaffected (type filter, no tenantId)', () => {
    const results = searchMemory(store, { type: ['memory'] });
    expect(results.map(r => r.entry.id).sort()).toEqual(['a-1', 'b-1', 'n-1']);
  });
});

// ─── Honest skip when entries.tenant_id column does not exist ───────────────────

describe('honest skip when entries.tenant_id column is missing', () => {
  function makeColumnlessDb(): { db: InstanceType<typeof Database>; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'mem-tenant-scope-nocolumn-'));
    const db = new Database(join(dir, 'nocol.db'));
    // Minimal `entries` table WITHOUT tenant_id — mirrors the columns
    // structuredSearch's `SELECT e.*` / rowToEntry actually consume.
    db.exec(`
      CREATE TABLE entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'system',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        tag_text TEXT NOT NULL DEFAULT '',
        title_norm TEXT NOT NULL DEFAULT '',
        content_norm TEXT NOT NULL DEFAULT '',
        summary_norm TEXT NOT NULL DEFAULT '',
        tag_norm TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        priority TEXT NOT NULL DEFAULT 'normal',
        sprint_id TEXT,
        sprint_num INTEGER NOT NULL DEFAULT 0,
        lang TEXT NOT NULL DEFAULT 'en',
        decay_exempt INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      );
    `);
    db.prepare(
      `INSERT INTO entries (id, type, title, content) VALUES (?, ?, ?, ?)`,
    ).run('nocol-1', 'memory', 'No tenant column row', 'content body');
    return { db, dir };
  }

  it('does not throw and returns unfiltered rows (structured path)', () => {
    const { db, dir } = makeColumnlessDb();
    try {
      const fakeStore = { getRawDb: () => db } as unknown as MemoryStore;
      let results: MemorySearchResult[] | undefined;
      expect(() => {
        results = searchMemory(fakeStore, { tenantId: 'tenant-a' });
      }).not.toThrow();
      expect(results!.map(r => r.entry.id)).toEqual(['nocol-1']);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits an honest warn (not silent) when the column is missing', () => {
    const { db, dir } = makeColumnlessDb();
    const prevDebug = process.env['DECKENT_DEBUG'];
    process.env['DECKENT_DEBUG'] = '1';
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const fakeStore = { getRawDb: () => db } as unknown as MemoryStore;
      searchMemory(fakeStore, { tenantId: 'tenant-a' });
      const warned = writeSpy.mock.calls.some(
        call => typeof call[0] === 'string' && call[0].includes('tenant_id column does not exist'),
      );
      expect(warned).toBe(true);
    } finally {
      writeSpy.mockRestore();
      if (prevDebug === undefined) delete process.env['DECKENT_DEBUG'];
      else process.env['DECKENT_DEBUG'] = prevDebug;
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Endpoint principal→tenant threading (registerMemorySearch) ─────────────────

describe('registerMemorySearch — principal→tenant threading', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'mem-tenant-scope-endpoint-'));
    mkdirSync(join(projectRoot, BRAIN_DIR), { recursive: true });
    const epStore = new MemoryStore(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE));
    epStore.insert({
      id: 'ep-a-1',
      type: 'memory',
      title: 'Endpoint tenant A row',
      content: 'endpoint docker heartbeat payload alpha',
      tenant_id: 'tenant-a',
    });
    epStore.insert({
      id: 'ep-b-1',
      type: 'memory',
      title: 'Endpoint tenant B row',
      content: 'endpoint docker heartbeat payload beta',
      tenant_id: 'tenant-b',
    });
    epStore.close();
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  /** Unsigned-shape JWT — parseOidcClaims only base64-decodes the payload (no sig check). */
  function fakeJwt(claims: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${header}.${payload}.fakesig`;
  }

  function mockReq(tenantId?: string): IncomingMessage {
    if (tenantId === undefined) return { headers: {} } as unknown as IncomingMessage;
    const claims = { sub: `user-${tenantId}`, tenant: tenantId };
    return { headers: { authorization: `Bearer ${fakeJwt(claims)}` } } as unknown as IncomingMessage;
  }

  interface ResCapture {
    status: number | null;
    body: string;
  }
  function mockRes(): { res: ServerResponse; cap: ResCapture } {
    const cap: ResCapture = { status: null, body: '' };
    const res = {
      writeHead(code: number) {
        cap.status = code;
        return res;
      },
      end(chunk?: unknown) {
        if (typeof chunk === 'string') cap.body += chunk;
        return res;
      },
    } as unknown as ServerResponse;
    return { res, cap };
  }

  function ids(cap: ResCapture): string[] {
    const body = JSON.parse(cap.body) as MemorySearchResult[];
    return body.map(r => r.entry.id);
  }

  it('req carrying tenant-a claim → only tenant-a rows returned', () => {
    const { res, cap } = mockRes();
    const handled = registerMemorySearch(
      '/api/memory/search?q=docker',
      res,
      projectRoot,
      mockReq('tenant-a'),
    );
    expect(handled).toBe(true);
    expect(cap.status).toBe(200);
    expect(ids(cap)).toEqual(['ep-a-1']);
  });

  it('req carrying tenant-b claim → only tenant-b rows returned', () => {
    const { res, cap } = mockRes();
    registerMemorySearch('/api/memory/search?q=docker', res, projectRoot, mockReq('tenant-b'));
    expect(ids(cap)).toEqual(['ep-b-1']);
  });

  it('no req at all (server.ts call site without req) → tenant-less legacy path, both rows', () => {
    const { res, cap } = mockRes();
    registerMemorySearch('/api/memory/search?q=docker', res, projectRoot);
    expect(ids(cap).sort()).toEqual(['ep-a-1', 'ep-b-1']);
  });

  it('req present but no resolvable tenant claim → tenant-less path, both rows', () => {
    const { res, cap } = mockRes();
    registerMemorySearch('/api/memory/search?q=docker', res, projectRoot, mockReq(undefined));
    expect(ids(cap).sort()).toEqual(['ep-a-1', 'ep-b-1']);
  });
});
