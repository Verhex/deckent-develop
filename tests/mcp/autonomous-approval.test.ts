import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAutonomousApproveTool,
  registerAutonomousRejectTool,
  registerAutonomousApprovalTools,
} from '../../src/mcp/tools/autonomous-approval.js';

// ─── Mock server (mirrors tests/mcp/autonomous-surface.test.ts) ─────────────

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

// ─── Hermetic tmpdir fixture ─────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'autonomous-approval-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function autonomousDir(root: string): string {
  return join(root, '.deckent', 'autonomous');
}

function pendingFilePath(root: string): string {
  return join(autonomousDir(root), 'pending.json');
}

function decisionsFilePath(root: string): string {
  return join(autonomousDir(root), 'decisions.json');
}

function writePendingFixture(root: string, entries: unknown[]): void {
  mkdirSync(autonomousDir(root), { recursive: true });
  writeFileSync(pendingFilePath(root), JSON.stringify(entries, null, 2), 'utf-8');
}

// ─── registry-unit smoke ─────────────────────────────────────────────────────

describe('registerAutonomousApprovalTools', () => {
  it('registers both tools', () => {
    const server = createMockServer();
    registerAutonomousApprovalTools(server as unknown as McpServer);
    expect(server.tools.has('deckent_autonomous_approve')).toBe(true);
    expect(server.tools.has('deckent_autonomous_reject')).toBe(true);
    expect(server.tools.size).toBe(2);
  });

  it('both tools are mutating (non-read-only, non-destructive, non-idempotent)', () => {
    const server = createMockServer();
    registerAutonomousApprovalTools(server as unknown as McpServer);

    for (const name of ['deckent_autonomous_approve', 'deckent_autonomous_reject']) {
      const cfg = server.tools.get(name)!.config as Record<string, unknown>;
      const annotations = cfg.annotations as Record<string, unknown>;
      expect(annotations.readOnlyHint, `${name} readOnlyHint`).toBe(false);
      expect(annotations.destructiveHint, `${name} destructiveHint`).toBe(false);
      expect(annotations.idempotentHint, `${name} idempotentHint`).toBe(false);
    }
  });
});

// ─── deckent_autonomous_approve ──────────────────────────────────────────────

describe('deckent_autonomous_approve', () => {
  function getHandler(): ToolHandler {
    const server = createMockServer();
    registerAutonomousApproveTool(server as unknown as McpServer);
    return server.tools.get('deckent_autonomous_approve')!.handler;
  }

  it('approves a fixture-parked trigger and writes an approved decision to disk', async () => {
    writePendingFixture(tmpDir, [
      { triggerId: 't-1', action: 'sprint.run', requestedBy: 'policy-gate', enqueuedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const handler = getHandler();
    const result = await handler({ id: 't-1', root: tmpDir });
    const parsed = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.approved).toBe(true);
    expect(parsed.triggerId).toBe('t-1');
    expect(parsed.wasPending).toBe(true);

    expect(existsSync(decisionsFilePath(tmpDir))).toBe(true);
    const decisions = JSON.parse(readFileSync(decisionsFilePath(tmpDir), 'utf-8'));
    expect(decisions['t-1']).toEqual({ outcome: 'approved', reason: 'user accepted' });
  });

  it('propagates a custom reason into the recorded decision', async () => {
    writePendingFixture(tmpDir, [
      { triggerId: 't-2', action: 'sprint.run', requestedBy: 'policy-gate', enqueuedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const handler = getHandler();
    await handler({ triggerId: 't-2', reason: 'looks safe', root: tmpDir });

    const decisions = JSON.parse(readFileSync(decisionsFilePath(tmpDir), 'utf-8'));
    expect(decisions['t-2']).toEqual({ outcome: 'approved', reason: 'looks safe' });
  });

  it('prefers triggerId over id when both are supplied', async () => {
    writePendingFixture(tmpDir, [
      { triggerId: 't-preferred', action: 'a', requestedBy: 'r', enqueuedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const handler = getHandler();
    const result = await handler({ id: 't-ignored', triggerId: 't-preferred', root: tmpDir });
    const parsed = parseResult(result);

    expect(parsed.triggerId).toBe('t-preferred');
    const decisions = JSON.parse(readFileSync(decisionsFilePath(tmpDir), 'utf-8'));
    expect(decisions['t-preferred']).toBeDefined();
    expect(decisions['t-ignored']).toBeUndefined();
  });

  // APPROVAL-001 T1 (2026-08-09): an id the gate never saw pending is a forged or
  // stale decision, so it is refused fail-closed and NO decision is persisted.
  // This suite previously encoded the pre-T1 "no-validation" contract, where the
  // same call manufactured an `approved` outcome for an unknown id — exactly the
  // hole T1 closed. The MCP surface must expose that refusal as a tool error.
  it('refuses to approve an id absent from pending.json and persists no decision', async () => {
    const handler = getHandler();
    const result = await handler({ id: 'ghost', root: tmpDir });

    expect(result.isError).toBe(true);
    expect(parseResult(result).message).toContain('not a known pending request');
    expect(existsSync(decisionsFilePath(tmpDir))).toBe(false);
  });

  it('returns an error when neither id nor triggerId is supplied', async () => {
    const handler = getHandler();
    const result = await handler({ root: tmpDir });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('triggerId (or id) is required');
    expect(existsSync(decisionsFilePath(tmpDir))).toBe(false);
  });
});

// ─── deckent_autonomous_reject ───────────────────────────────────────────────

describe('deckent_autonomous_reject', () => {
  function getHandler(): ToolHandler {
    const server = createMockServer();
    registerAutonomousRejectTool(server as unknown as McpServer);
    return server.tools.get('deckent_autonomous_reject')!.handler;
  }

  it('rejects a fixture-parked trigger and writes a rejected decision to disk', async () => {
    writePendingFixture(tmpDir, [
      { triggerId: 't-3', action: 'sprint.run', requestedBy: 'policy-gate', enqueuedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const handler = getHandler();
    const result = await handler({ id: 't-3', root: tmpDir });
    const parsed = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.rejected).toBe(true);
    expect(parsed.triggerId).toBe('t-3');
    expect(parsed.wasPending).toBe(true);

    const decisions = JSON.parse(readFileSync(decisionsFilePath(tmpDir), 'utf-8'));
    expect(decisions['t-3']).toEqual({ outcome: 'rejected', reason: 'user rejected' });
  });

  it('propagates a custom reason into the recorded decision', async () => {
    writePendingFixture(tmpDir, [
      { triggerId: 't-4', action: 'sprint.run', requestedBy: 'policy-gate', enqueuedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const handler = getHandler();
    await handler({ triggerId: 't-4', reason: 'too risky', root: tmpDir });

    const decisions = JSON.parse(readFileSync(decisionsFilePath(tmpDir), 'utf-8'));
    expect(decisions['t-4']).toEqual({ outcome: 'rejected', reason: 'too risky' });
  });

  // APPROVAL-001 T1: the reject path is fenced by the same authority — a decision
  // for a request the gate never parked is refused, not silently recorded.
  it('refuses to reject an id absent from pending.json and persists no decision', async () => {
    const handler = getHandler();
    const result = await handler({ id: 'ghost-2', root: tmpDir });

    expect(result.isError).toBe(true);
    expect(parseResult(result).message).toContain('not a known pending request');
    expect(existsSync(decisionsFilePath(tmpDir))).toBe(false);
  });

  it('returns an error when neither id nor triggerId is supplied', async () => {
    const handler = getHandler();
    const result = await handler({ root: tmpDir });
    const parsed = parseResult(result);

    expect(result.isError).toBe(true);
    expect(parsed.message).toContain('triggerId (or id) is required');
    expect(existsSync(decisionsFilePath(tmpDir))).toBe(false);
  });
});
