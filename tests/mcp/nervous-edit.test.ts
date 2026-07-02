// tests/mcp/nervous-edit.test.ts
//
// Sprint 361 Task 361-014 (DEFER-002-NERVOUS, Sıra-75).
// Covers: DiskNervousPendingStore (disk-backed, tmpdir), handleNervousEdit /
// handleNervousUndo pure handlers (fake + real-tmpdir default-injection paths),
// and the two `deckent_nervous_*` MCP tool registrations.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  handleNervousEdit,
  handleNervousUndo,
  registerNervousEditTool,
  registerNervousUndoTool,
  registerNervousEditTools,
  type NervousUndoHistorySource,
} from '../../src/mcp/tools/nervous-edit.js';
import type { NervousPendingStore } from '../../src/cli/repl/nervous-bridge.js';
import { NervousHistory } from '../../src/nervous/history.js';
import { NERVOUS_PENDING_FILE } from '../../src/core/constants.js';
import type { NervousNotification, ExecutionRecord } from '../../src/core/nervous-types.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    shortCode: 'ab12c',
    type: 'test-type',
    title: 'Test notification',
    message: 'A test message',
    severity: 'warning',
    createdAt: '2026-07-01T00:00:00.000Z',
    detectorId: 'test-detector',
    actions: [
      { id: 'TEST_ACTION', label: 'Test Action', policy: 'approve', risk: 'medium', isSafetyFloor: false },
    ],
    timeoutMs: null,
    ...overrides,
  };
}

function makeStore(notifications: readonly NervousNotification[]): NervousPendingStore {
  return { listPending: () => notifications };
}

function makeRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2, 8)}`,
    notificationId: 'notif-001',
    actionId: 'ORPHAN_TASK_ARCHIVE',
    decision: 'accepted',
    decidedBy: 'user',
    executedAt: new Date().toISOString(),
    outcome: 'success',
    reversible: true,
    payload: {},
    ...overrides,
  };
}

function makeHistorySource(records: ExecutionRecord[]): NervousUndoHistorySource {
  return {
    findRecentReversible: async (limit = 10) =>
      records.filter(r => r.reversible && r.outcome === 'success').slice(-limit).reverse(),
    findById: async (id: string) => records.find(r => r.id === id) ?? null,
  };
}

// ─── Mock MCP server ────────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function createMockServer() {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  const server = {
    registerTool: (name: string, config: unknown, handler: ToolHandler) => {
      tools.set(name, { config, handler });
    },
  } as unknown as McpServer;
  return { server, tools };
}

async function callTool(tools: Map<string, { config: unknown; handler: ToolHandler }>, name: string, args: Record<string, unknown> = {}) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.handler(args);
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

// ─── DiskNervousPendingStore (via handleNervousEdit's default injection) ────

describe('handleNervousEdit — disk-backed default store (tmpdir, no mocks)', () => {
  let root: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'nervous-edit-test-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('missing pending file → not found (fail-safe empty list)', () => {
    const result = handleNervousEdit({ id: 'whatever', modifiedPayload: { a: 1 }, root });
    expect(result).toEqual({ found: false, id: 'whatever' });
  });

  it('corrupt pending file → not found (fail-safe, never throws)', () => {
    const pendingPath = join(root, NERVOUS_PENDING_FILE);
    mkdirSync(join(root, '.deckent', 'nervous'), { recursive: true });
    writeFileSync(pendingPath, '{ not valid json', 'utf-8');

    const result = handleNervousEdit({ id: 'whatever', modifiedPayload: { a: 1 }, root });
    expect(result).toEqual({ found: false, id: 'whatever' });
  });

  it('real pending file on disk → builds accept-with-edit plan (proof-of-function)', () => {
    const notification = makeNotification({ id: 'disk-target', shortCode: 'dk123' });
    const pendingPath = join(root, NERVOUS_PENDING_FILE);
    mkdirSync(join(root, '.deckent', 'nervous'), { recursive: true });
    writeFileSync(pendingPath, JSON.stringify([notification]), 'utf-8');

    const result = handleNervousEdit({ id: 'disk-target', modifiedPayload: { priority: 'high' }, root });

    expect(result.found).toBe(true);
    if (!result.found) throw new Error('unreachable');
    expect(result.plan.notification).toEqual(notification);
    expect(result.plan.resolution).toBe('accepted');
    expect(result.plan.modifiedPayload).toEqual({ priority: 'high' });
    expect(result.plan.steps).toEqual([
      { kind: 'resolve-approval', notificationId: 'disk-target' },
      { kind: 'clear-pending', notificationId: 'disk-target' },
    ]);
  });

  it('matches by shortCode against the real disk-backed store', () => {
    const notification = makeNotification({ id: 'full-disk-id', shortCode: 'sc999' });
    mkdirSync(join(root, '.deckent', 'nervous'), { recursive: true });
    writeFileSync(join(root, NERVOUS_PENDING_FILE), JSON.stringify([notification]), 'utf-8');

    const result = handleNervousEdit({ id: 'SC999', modifiedPayload: { x: 1 }, root });
    expect(result.found).toBe(true);
  });
});

// ─── handleNervousEdit — pure handler / injected fake store ────────────────

describe('handleNervousEdit — validation + injected store', () => {
  it('throws when id is empty', () => {
    expect(() => handleNervousEdit({ id: '', modifiedPayload: { a: 1 } }, makeStore([]))).toThrow('id is required');
  });

  it('throws when id is whitespace-only', () => {
    expect(() => handleNervousEdit({ id: '   ', modifiedPayload: { a: 1 } }, makeStore([]))).toThrow('id is required');
  });

  it('throws when modifiedPayload is missing keys (empty object)', () => {
    const n = makeNotification({ id: 'target' });
    expect(() => handleNervousEdit({ id: 'target', modifiedPayload: {} }, makeStore([n])))
      .toThrow('modifiedPayload is required and must be a non-empty object');
  });

  it('delegates to handleEdit against the injected store — found + plan', () => {
    const n = makeNotification({ id: 'target-id' });
    const result = handleNervousEdit({ id: 'target-id', modifiedPayload: { reason: 'ok' } }, makeStore([n]));

    expect(result.found).toBe(true);
    if (!result.found) throw new Error('unreachable');
    expect(result.plan.modifiedPayload).toEqual({ reason: 'ok' });
  });

  it('returns found:false when the injected store has nothing matching', () => {
    const result = handleNervousEdit({ id: 'nope', modifiedPayload: { a: 1 } }, makeStore([]));
    expect(result).toEqual({ found: false, id: 'nope' });
  });
});

// ─── handleNervousUndo — fake history source ────────────────────────────────

describe('handleNervousUndo — injected fake history', () => {
  it('no records at all → supported:false with a reason', async () => {
    const result = await handleNervousUndo({}, makeHistorySource([]));
    expect(result).toEqual({ supported: false, reason: 'No reversible accepted action found in Nervous history' });
  });

  it('most recent reversible+accepted+success record → supported plan with mark-undone step', async () => {
    const older = makeRecord({ id: 'rec-older', executedAt: '2026-06-01T00:00:00.000Z' });
    const newer = makeRecord({ id: 'rec-newer', executedAt: '2026-07-01T00:00:00.000Z' });
    const result = await handleNervousUndo({}, makeHistorySource([older, newer]));

    expect(result.supported).toBe(true);
    if (!result.supported) throw new Error('unreachable');
    expect(result.plan.record.id).toBe('rec-newer');
    expect(result.plan.steps).toEqual([{ kind: 'mark-undone', recordId: 'rec-newer' }]);
    expect(result.plan.note).toContain('does not roll back');
  });

  it('skips non-accepted records even if reversible+success (only "accepted" is undoable)', async () => {
    const autonomous = makeRecord({ id: 'rec-auto', decision: 'autonomous' });
    const result = await handleNervousUndo({}, makeHistorySource([autonomous]));
    expect(result).toEqual({ supported: false, reason: 'No reversible accepted action found in Nervous history' });
  });

  it('specific id not found → supported:false naming the id', async () => {
    const result = await handleNervousUndo({ id: 'missing-id' }, makeHistorySource([]));
    expect(result).toEqual({ supported: false, reason: 'No execution record found for id: missing-id', recordId: 'missing-id' });
  });

  it('specific id found but not reversible → honest unsupported with reason', async () => {
    const rec = makeRecord({ id: 'rec-1', reversible: false });
    const result = await handleNervousUndo({ id: 'rec-1' }, makeHistorySource([rec]));
    expect(result.supported).toBe(false);
    if (result.supported) throw new Error('unreachable');
    expect(result.reason).toContain('reversible=false');
    expect(result.recordId).toBe('rec-1');
  });

  it('specific id found but decision is not accepted → honest unsupported', async () => {
    const rec = makeRecord({ id: 'rec-2', decision: 'rejected', outcome: 'pending' });
    const result = await handleNervousUndo({ id: 'rec-2' }, makeHistorySource([rec]));
    expect(result.supported).toBe(false);
    if (result.supported) throw new Error('unreachable');
    expect(result.reason).toContain('decision=rejected');
  });

  it('specific id found, reversible+accepted+success → supported plan', async () => {
    const rec = makeRecord({ id: 'rec-good' });
    const result = await handleNervousUndo({ id: 'rec-good' }, makeHistorySource([rec]));
    expect(result.supported).toBe(true);
    if (!result.supported) throw new Error('unreachable');
    expect(result.plan.record.id).toBe('rec-good');
  });
});

// ─── handleNervousUndo — real NervousHistory default injection (tmpdir) ────

describe('handleNervousUndo — disk-backed default history (tmpdir, no mocks)', () => {
  let root: string;
  let history: NervousHistory;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'nervous-undo-test-'));
    await mkdir(join(root, '.deckent'), { recursive: true });
    history = new NervousHistory(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('no history file on disk → supported:false (never throws)', async () => {
    const result = await handleNervousUndo({ root });
    expect(result).toEqual({ supported: false, reason: 'No reversible accepted action found in Nervous history' });
  });

  it('real appended record on disk → default NervousHistory produces an undo plan (proof-of-function)', async () => {
    await history.append(makeRecord({ id: 'disk-rec-1' }));

    const result = await handleNervousUndo({ root });

    expect(result.supported).toBe(true);
    if (!result.supported) throw new Error('unreachable');
    expect(result.plan.record.id).toBe('disk-rec-1');
    expect(result.plan.steps).toEqual([{ kind: 'mark-undone', recordId: 'disk-rec-1' }]);
  });

  it('never calls markUndone itself — history file still has only the original record', async () => {
    await history.append(makeRecord({ id: 'disk-rec-2' }));
    await handleNervousUndo({ root });

    const all = await history.readAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('disk-rec-2');
  });
});

// ─── Tool registrations ─────────────────────────────────────────────────────

describe('deckent_nervous_edit tool', () => {
  it('registers with readOnly annotations', () => {
    const { server, tools } = createMockServer();
    registerNervousEditTool(server);
    const tool = tools.get('deckent_nervous_edit');
    expect(tool).toBeDefined();
    const config = tool!.config as { annotations: { readOnlyHint: boolean; destructiveHint: boolean } };
    expect(config.annotations.readOnlyHint).toBe(true);
    expect(config.annotations.destructiveHint).toBe(false);
  });

  it('happy path returns the plan as JSON', async () => {
    const { server, tools } = createMockServer();
    registerNervousEditTool(server);
    const root = mkdtempSync(join(tmpdir(), 'nervous-edit-tool-test-'));
    try {
      const notification = makeNotification({ id: 'tool-target' });
      mkdirSync(join(root, '.deckent', 'nervous'), { recursive: true });
      writeFileSync(join(root, NERVOUS_PENDING_FILE), JSON.stringify([notification]), 'utf-8');

      const result = await callTool(tools, 'deckent_nervous_edit', { id: 'tool-target', modifiedPayload: { a: 1 }, root });
      const parsed = parseResult(result);
      expect(parsed.found).toBe(true);
      expect(parsed.plan.modifiedPayload).toEqual({ a: 1 });
      expect(result.isError).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('missing id → isError with message', async () => {
    const { server, tools } = createMockServer();
    registerNervousEditTool(server);

    const result = await callTool(tools, 'deckent_nervous_edit', { id: '', modifiedPayload: { a: 1 } });
    expect(result.isError).toBe(true);
    expect(parseResult(result).message).toBe('id is required');
  });

  it('empty modifiedPayload → isError with message', async () => {
    const { server, tools } = createMockServer();
    registerNervousEditTool(server);

    const result = await callTool(tools, 'deckent_nervous_edit', { id: 'x', modifiedPayload: {} });
    expect(result.isError).toBe(true);
    expect(parseResult(result).message).toBe('modifiedPayload is required and must be a non-empty object');
  });
});

describe('deckent_nervous_undo tool', () => {
  it('registers with readOnly annotations', () => {
    const { server, tools } = createMockServer();
    registerNervousUndoTool(server);
    const tool = tools.get('deckent_nervous_undo');
    expect(tool).toBeDefined();
    const config = tool!.config as { annotations: { readOnlyHint: boolean; destructiveHint: boolean } };
    expect(config.annotations.readOnlyHint).toBe(true);
    expect(config.annotations.destructiveHint).toBe(false);
  });

  it('happy path — real disk-backed history returns a plan', async () => {
    const { server, tools } = createMockServer();
    registerNervousUndoTool(server);
    const root = mkdtempSync(join(tmpdir(), 'nervous-undo-tool-test-'));
    try {
      const history = new NervousHistory(root);
      await mkdir(join(root, '.deckent'), { recursive: true });
      await history.append(makeRecord({ id: 'tool-undo-rec' }));

      const result = await callTool(tools, 'deckent_nervous_undo', { root });
      const parsed = parseResult(result);
      expect(parsed.supported).toBe(true);
      expect(parsed.plan.record.id).toBe('tool-undo-rec');
      expect(result.isError).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('nothing undoable → supported:false, not an error', async () => {
    const { server, tools } = createMockServer();
    registerNervousUndoTool(server);
    const root = mkdtempSync(join(tmpdir(), 'nervous-undo-tool-empty-'));
    try {
      const result = await callTool(tools, 'deckent_nervous_undo', { root });
      const parsed = parseResult(result);
      expect(parsed.supported).toBe(false);
      expect(result.isError).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('registerNervousEditTools barrel', () => {
  it('registers exactly the 2 tools', () => {
    const { server, tools } = createMockServer();
    registerNervousEditTools(server);
    expect([...tools.keys()].sort()).toEqual(['deckent_nervous_edit', 'deckent_nervous_undo']);
  });
});
