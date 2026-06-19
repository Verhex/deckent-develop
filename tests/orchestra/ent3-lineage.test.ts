/**
 * ENT-3 causal-lineage propagation tests (hermetic).
 *
 * Verifies the full ENT-3 chain:
 *   1. enqueueCandidates stamps new entries with correlationId
 *   2. writeAuditEvent + readAuditEventsByCorrelationId returns events in insertion order
 *   3. buildCausalChain reconstructs the causal order (spawn event → result event)
 *   4. GET /api/autonomous/lineage/:correlationId returns the causal tree
 *
 * All file I/O uses tmpdir — CI-hermeticity per ADR-087.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  enqueueCandidates,
  loadBacklog,
} from '../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry } from '../../src/orchestra/autonomous/backlog-types.js';
import {
  writeAuditEvent,
  _resetChainHead,
} from '../../src/core/audit-writer.js';
import {
  readAuditEvents,
  readAuditEventsByCorrelationId,
  buildCausalChain,
} from '../../src/core/audit-query.js';
import { registerAutonomousRoutes } from '../../src/api/autonomous-endpoint.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEntry(over: Partial<BacklogEntry> = {}): BacklogEntry {
  return {
    id: 'e1', title: 'demo', kind: 'task',
    spec: { description: 'do x', scopeDir: '.' },
    policy: 'auto', trigger: { type: 'one-off' },
    status: 'pending', lastRun: null, lastResult: null, ...over,
  };
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ent3-'));
  mkdirSync(join(root, '.deckent', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.deckent', 'autonomous'), { recursive: true });
  return root;
}

// Minimal mock IncomingMessage / ServerResponse for endpoint unit-tests.
function mockReq(method: string, url: string): IncomingMessage {
  return { method, url, headers: {} } as unknown as IncomingMessage;
}

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  asServerResponse(): ServerResponse;
}

function mockRes(): MockRes {
  const mock: MockRes = {
    statusCode: 200,
    headers: {},
    body: '',
    asServerResponse() {
      return {
        writeHead(status: number, headers: Record<string, string>) {
          mock.statusCode = status;
          Object.assign(mock.headers, headers);
        },
        end(data: string) {
          mock.body = data;
        },
      } as unknown as ServerResponse;
    },
  };
  return mock;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ENT-3: enqueueCandidates assigns correlationId', () => {
  let dir: string;
  let backlogPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ent3-backlog-'));
    backlogPath = join(dir, 'backlog.json');
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [] }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('stamps fresh entries with the provided correlationId', () => {
    const bl = loadBacklog(backlogPath);
    const enqueued = enqueueCandidates(
      backlogPath, bl, [makeEntry({ id: 'task-a' }), makeEntry({ id: 'task-b' })], 'corr-X',
    );
    expect(enqueued).toHaveLength(2);
    // correlationId is stored on the persisted entry
    const reloaded = loadBacklog(backlogPath);
    const entryA = reloaded.entries.find((e) => e.id === 'task-a') as BacklogEntry & { correlationId?: string };
    expect(entryA?.correlationId).toBe('corr-X');
  });

  it('does not assign correlationId when omitted (backward-safe)', () => {
    const bl = loadBacklog(backlogPath);
    enqueueCandidates(backlogPath, bl, [makeEntry({ id: 'task-c' })]);
    const reloaded = loadBacklog(backlogPath);
    const entryC = reloaded.entries.find((e) => e.id === 'task-c') as BacklogEntry & { correlationId?: string };
    expect(entryC?.correlationId).toBeUndefined();
  });

  it('deduplicates entries — already-present ids are skipped', () => {
    const bl = loadBacklog(backlogPath);
    enqueueCandidates(backlogPath, bl, [makeEntry({ id: 'dup' })], 'corr-Y');
    const bl2 = loadBacklog(backlogPath);
    const enqueued2 = enqueueCandidates(backlogPath, bl2, [makeEntry({ id: 'dup' })], 'corr-Y');
    expect(enqueued2).toHaveLength(0); // duplicate, skipped
    expect(loadBacklog(backlogPath).entries).toHaveLength(1);
  });
});

describe('ENT-3: audit chain — correlationId + causationId propagation', () => {
  let root: string;

  beforeEach(() => {
    root = makeProjectRoot();
    _resetChainHead(); // deterministic chain for each test
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    _resetChainHead();
  });

  it('task-A(corr=X) → audit event carries correlationId=X', () => {
    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local', actor: 'system',
      action: 'task.spawned', target: 'task-run-001',
      correlationId: 'corr-X',
      metadata: { entryId: 'task-a' },
    });
    const events = readAuditEventsByCorrelationId(root, 'autonomous', 'corr-X');
    expect(events).toHaveLength(1);
    expect(events[0]?.correlationId).toBe('corr-X');
    expect(events[0]?.action).toBe('task.spawned');
  });

  it('A→B spawn: B.causationId=A.hmac forms a causal chain', () => {
    // Write event A (spawn)
    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local', actor: 'system',
      action: 'task.spawned', target: 'task-run-001',
      correlationId: 'corr-X',
      metadata: { entryId: 'task-a' },
    });
    const eventsAfterA = readAuditEvents(root, 'autonomous');
    const aHmac = eventsAfterA[eventsAfterA.length - 1]?.hmac;
    expect(aHmac).toBeTruthy();

    // Write event B (result) with causationId = A's hmac
    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local', actor: 'system',
      action: 'task.succeeded', target: 'task-run-001',
      correlationId: 'corr-X',
      causationId: aHmac,
      metadata: { entryId: 'task-a', decision: 'DONE' },
    });

    const events = readAuditEventsByCorrelationId(root, 'autonomous', 'corr-X');
    expect(events).toHaveLength(2);
    expect(events[0]?.action).toBe('task.spawned');
    expect(events[1]?.action).toBe('task.succeeded');
    expect(events[1]?.causationId).toBe(aHmac);
  });

  it('readAuditEventsByCorrelationId(X) → [A,B] in insertion order', () => {
    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local', actor: 'system', action: 'task.spawned',
      correlationId: 'corr-X', metadata: { seq: 1 },
    });
    const allAfterA = readAuditEvents(root, 'autonomous');
    const aHmac = allAfterA[allAfterA.length - 1]?.hmac;

    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local', actor: 'system', action: 'task.succeeded',
      correlationId: 'corr-X', causationId: aHmac, metadata: { seq: 2 },
    });

    // A third event with a different correlationId (must not appear in results)
    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local', actor: 'system', action: 'capability.success',
      correlationId: 'other-corr', metadata: { seq: 3 },
    });

    const events = readAuditEventsByCorrelationId(root, 'autonomous', 'corr-X');
    expect(events).toHaveLength(2);
    expect(events[0]?.action).toBe('task.spawned');
    expect(events[1]?.action).toBe('task.succeeded');
  });

  it('buildCausalChain orders events: spawn before result', () => {
    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local', actor: 'system', action: 'task.spawned',
      correlationId: 'corr-X',
    });
    const allAfterA = readAuditEvents(root, 'autonomous');
    const aHmac = allAfterA[allAfterA.length - 1]?.hmac;

    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local', actor: 'system', action: 'task.succeeded',
      correlationId: 'corr-X', causationId: aHmac,
    });

    const events = readAuditEventsByCorrelationId(root, 'autonomous', 'corr-X');
    const chain = buildCausalChain(events, 'corr-X');
    expect(chain).toHaveLength(2);
    expect(chain[0]?.action).toBe('task.spawned');
    expect(chain[1]?.action).toBe('task.succeeded');
    // causation is correctly threaded
    expect(chain[1]?.causationId).toBe(chain[0]?.hmac);
  });
});

describe('ENT-3: GET /api/autonomous/lineage/:correlationId', () => {
  let root: string;

  beforeEach(() => {
    root = makeProjectRoot();
    _resetChainHead();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    _resetChainHead();
  });

  it('returns 200 with causal-tree JSON for a known correlationId', () => {
    // Seed the event stream with two linked events
    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local', actor: 'system', action: 'task.spawned',
      correlationId: 'corr-Y', metadata: { entryId: 'task-b' },
    });
    const eventsAfterSpawn = readAuditEvents(root, 'autonomous');
    const spawnHmac = eventsAfterSpawn[eventsAfterSpawn.length - 1]?.hmac;

    writeAuditEvent(root, 'autonomous', {
      tenantId: 'local', actor: 'system', action: 'task.succeeded',
      correlationId: 'corr-Y', causationId: spawnHmac,
    });

    const res = mockRes();
    const matched = registerAutonomousRoutes(
      '/api/autonomous/lineage/corr-Y', 'GET',
      res.asServerResponse(), root,
    );
    expect(matched).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { correlationId: string; events: unknown[]; totalEvents: number };
    expect(body.correlationId).toBe('corr-Y');
    expect(body.totalEvents).toBe(2);
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events).toHaveLength(2);
  });

  it('returns 200 with empty events for an unknown correlationId', () => {
    const res = mockRes();
    const matched = registerAutonomousRoutes(
      '/api/autonomous/lineage/unknown-corr', 'GET',
      res.asServerResponse(), root,
    );
    expect(matched).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { correlationId: string; events: unknown[]; totalEvents: number };
    expect(body.correlationId).toBe('unknown-corr');
    expect(body.totalEvents).toBe(0);
    expect(body.events).toEqual([]);
  });

  it('returns 400 when correlationId segment is empty', () => {
    const res = mockRes();
    // path = '/api/autonomous/lineage/' → empty correlationId
    const matched = registerAutonomousRoutes(
      '/api/autonomous/lineage/', 'GET',
      res.asServerResponse(), root,
    );
    expect(matched).toBe(true);
    expect(res.statusCode).toBe(400);
  });

  it('does not match non-GET requests to lineage path (falls through)', () => {
    const res = mockRes();
    // POST to the lineage path should fall through to the gate/approve handlers
    // — the lineage handler is GET-only.
    const matched = registerAutonomousRoutes(
      '/api/autonomous/lineage/corr-Z', 'POST',
      res.asServerResponse(), root,
    );
    // POST to lineage should NOT match the lineage handler — falls through to other
    // handlers or returns false. The existing approve/reject handlers only match
    // their specific prefix, so this should return false.
    expect(matched).toBe(false);
  });
});
