import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAutonomousBacklogTool,
  registerAutonomousStatusTool,
  registerAutonomousSurfaceTools,
} from '../../src/mcp/tools/autonomous-surface.js';

// ─── Mock server (mirrors tests/mcp/catalog-parity.test.ts) ──────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface MockServer {
  tools: Map<string, { config: unknown; handler: ToolHandler }>;
  registerTool: (name: string, config: unknown, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
}

function parseResult(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text);
}

// ─── Hermetic tmpdir fixture (mirrors tests/mcp/catalog-parity.test.ts) ─────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'autonomous-surface-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function backlogFilePath(root: string): string {
  return join(root, '.deckent', 'autonomous', 'backlog.json');
}

function pendingFilePath(root: string): string {
  return join(root, '.deckent', 'autonomous', 'pending.json');
}

function stopFilePath(root: string): string {
  return join(root, '.deckent', 'autonomous', 'stop');
}

function writeBacklogFixture(root: string, entries: unknown[]): void {
  const path = backlogFilePath(root);
  mkdirSync(join(root, '.deckent', 'autonomous'), { recursive: true });
  writeFileSync(path, JSON.stringify({ _version: '1.0', entries }, null, 2), 'utf-8');
}

// ─── registry-unit smoke ─────────────────────────────────────────────────────

describe('registerAutonomousSurfaceTools', () => {
  it('registers both tools', () => {
    const server = createMockServer();
    registerAutonomousSurfaceTools(server as unknown as McpServer);
    expect(server.tools.has('deckent_autonomous_backlog')).toBe(true);
    expect(server.tools.has('deckent_autonomous_status')).toBe(true);
    expect(server.tools.size).toBe(2);
  });

  it('deckent_autonomous_backlog is mutating, deckent_autonomous_status is read-only', () => {
    const server = createMockServer();
    registerAutonomousSurfaceTools(server as unknown as McpServer);

    const backlogCfg = server.tools.get('deckent_autonomous_backlog')!.config as Record<string, unknown>;
    expect((backlogCfg.annotations as Record<string, unknown>).readOnlyHint).toBe(false);

    const statusCfg = server.tools.get('deckent_autonomous_status')!.config as Record<string, unknown>;
    expect((statusCfg.annotations as Record<string, unknown>).readOnlyHint).toBe(true);
  });
});

// ─── deckent_autonomous_backlog ───────────────────────────────────────────────

describe('deckent_autonomous_backlog — list', () => {
  function getHandler(): ToolHandler {
    const server = createMockServer();
    registerAutonomousBacklogTool(server as unknown as McpServer);
    return server.tools.get('deckent_autonomous_backlog')!.handler;
  }

  it('returns an empty list for a fresh project (no backlog file yet)', async () => {
    const handler = getHandler();
    const result = await handler({ action: 'list', root: tmpDir });
    const parsed = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.count).toBe(0);
    expect(parsed.entries).toEqual([]);
  });

  it('lists entries from an existing backlog.json fixture', async () => {
    writeBacklogFixture(tmpDir, [
      {
        id: 'e-1', title: 'First', kind: 'task', spec: { description: 'd' }, policy: 'auto',
        trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null,
      },
    ]);
    const handler = getHandler();
    const result = await handler({ action: 'list', root: tmpDir });
    const parsed = parseResult(result);

    expect(parsed.count).toBe(1);
    expect((parsed.entries as Array<{ id: string }>)[0]!.id).toBe('e-1');
  });
});

describe('deckent_autonomous_backlog — add', () => {
  function getHandler(): ToolHandler {
    const server = createMockServer();
    registerAutonomousBacklogTool(server as unknown as McpServer);
    return server.tools.get('deckent_autonomous_backlog')!.handler;
  }

  it('adds a one-off entry and persists it to disk (round-trip)', async () => {
    const handler = getHandler();
    const result = await handler({
      action: 'add',
      root: tmpDir,
      id: 'new-entry',
      title: 'Fix the bug',
      description: 'Describe the fix',
    });
    const parsed = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.added).toBe(true);
    expect(parsed.id).toBe('new-entry');

    expect(existsSync(backlogFilePath(tmpDir))).toBe(true);
    const onDisk = JSON.parse(readFileSync(backlogFilePath(tmpDir), 'utf-8'));
    expect(onDisk.entries).toHaveLength(1);
    expect(onDisk.entries[0]).toMatchObject({
      id: 'new-entry',
      title: 'Fix the bug',
      kind: 'task',
      policy: 'auto',
      status: 'pending',
      trigger: { type: 'one-off' },
    });

    // Round-trip through the tool's own list action
    const listResult = await handler({ action: 'list', root: tmpDir });
    expect((parseResult(listResult).entries as unknown[])).toHaveLength(1);
  });

  it('adds a recurring entry when a valid cron is given', async () => {
    const handler = getHandler();
    const result = await handler({
      action: 'add', root: tmpDir, id: 'cron-entry', title: 'Nightly', cron: '0 0 * * *',
    });
    const parsed = parseResult(result);

    expect(parsed.added).toBe(true);
    const onDisk = JSON.parse(readFileSync(backlogFilePath(tmpDir), 'utf-8'));
    expect(onDisk.entries[0].trigger).toEqual({ type: 'recurring', cron: '0 0 * * *' });
  });

  it('rejects a malformed cron at intake without writing the file', async () => {
    const handler = getHandler();
    const result = await handler({
      action: 'add', root: tmpDir, id: 'bad-cron', title: 'Bad', cron: 'not-a-cron',
    });

    expect(result.isError).toBe(true);
    expect(existsSync(backlogFilePath(tmpDir))).toBe(false);
  });

  it('returns error when id is missing', async () => {
    const handler = getHandler();
    const result = await handler({ action: 'add', root: tmpDir, title: 'No id' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('id is required');
  });

  it('returns error when title is missing', async () => {
    const handler = getHandler();
    const result = await handler({ action: 'add', root: tmpDir, id: 'e-2' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('title is required');
  });

  it('returns error on duplicate id', async () => {
    const handler = getHandler();
    await handler({ action: 'add', root: tmpDir, id: 'dup', title: 'First' });
    const result = await handler({ action: 'add', root: tmpDir, id: 'dup', title: 'Second' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('already exists');
  });
});

describe('deckent_autonomous_backlog — remove', () => {
  function getHandler(): ToolHandler {
    const server = createMockServer();
    registerAutonomousBacklogTool(server as unknown as McpServer);
    return server.tools.get('deckent_autonomous_backlog')!.handler;
  }

  it('removes an existing entry (add then remove round-trip)', async () => {
    const handler = getHandler();
    await handler({ action: 'add', root: tmpDir, id: 'to-remove', title: 'Temp' });

    const result = await handler({ action: 'remove', root: tmpDir, id: 'to-remove' });
    const parsed = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.removed).toBe(true);

    const onDisk = JSON.parse(readFileSync(backlogFilePath(tmpDir), 'utf-8'));
    expect(onDisk.entries).toHaveLength(0);
  });

  it('returns error when id is missing', async () => {
    const handler = getHandler();
    const result = await handler({ action: 'remove', root: tmpDir });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('id is required');
  });

  it('returns error when entry is not found', async () => {
    const handler = getHandler();
    const result = await handler({ action: 'remove', root: tmpDir, id: 'ghost' });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('not found');
  });
});

// ─── deckent_autonomous_status ────────────────────────────────────────────────

describe('deckent_autonomous_status', () => {
  function getHandler(): ToolHandler {
    const server = createMockServer();
    registerAutonomousStatusTool(server as unknown as McpServer);
    return server.tools.get('deckent_autonomous_status')!.handler;
  }

  it('returns zeroed status for a fresh project (no state files)', async () => {
    const handler = getHandler();
    const result = await handler({ root: tmpDir });
    const parsed = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.stopMarkerPresent).toBe(false);
    expect(parsed.backlogTotal).toBe(0);
    expect(parsed.pendingApprovals).toBe(0);
    expect(parsed.backlogCounts).toEqual({ pending: 0, running: 0, parked: 0, done: 0, failed: 0 });
  });

  it('summarizes backlog counts by status from a fixture', async () => {
    writeBacklogFixture(tmpDir, [
      { id: '1', title: 't1', kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null },
      { id: '2', title: 't2', kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' }, status: 'done', lastRun: null, lastResult: null },
      { id: '3', title: 't3', kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' }, status: 'failed', lastRun: null, lastResult: null },
    ]);

    const handler = getHandler();
    const result = await handler({ root: tmpDir });
    const parsed = parseResult(result);

    expect(parsed.backlogTotal).toBe(3);
    expect(parsed.backlogCounts).toEqual({ pending: 1, running: 0, parked: 0, done: 1, failed: 1 });
  });

  it('reports stop marker present when the file exists', async () => {
    mkdirSync(join(tmpDir, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(stopFilePath(tmpDir), new Date().toISOString(), 'utf-8');

    const handler = getHandler();
    const result = await handler({ root: tmpDir });
    const parsed = parseResult(result);

    expect(parsed.stopMarkerPresent).toBe(true);
  });

  it('counts pending approvals from pending.json', async () => {
    mkdirSync(join(tmpDir, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(pendingFilePath(tmpDir), JSON.stringify([{ triggerId: 'a' }, { triggerId: 'b' }]), 'utf-8');

    const handler = getHandler();
    const result = await handler({ root: tmpDir });
    const parsed = parseResult(result);

    expect(parsed.pendingApprovals).toBe(2);
  });

  it('tolerates a corrupt backlog.json without throwing', async () => {
    mkdirSync(join(tmpDir, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(backlogFilePath(tmpDir), '{not valid json', 'utf-8');

    const handler = getHandler();
    const result = await handler({ root: tmpDir });
    const parsed = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.backlogTotal).toBe(0);
  });
});
