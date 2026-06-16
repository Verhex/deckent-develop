// tests/cli/nervous-accept-panic.test.ts
//
// Sprint 180 W4-2 (Task 180-010) — Panic guard onay UI.
// Sprint 179 dogfood keşfi: PanicGuard "kill blocked — user approval required"
// diyor ama hiçbir kanaldan onay UI yoktu. Bu testler 3 path'i doğrular:
//
//   1. CLI: `deckent nervous accept-panic <task-id>` → file-based IPC marker yazar
//   2. MCP: `deckent_nervous_subscribe` event akışında PANIC_GUARD_KILL_PENDING
//      panic event'leri pendingPanics olarak akışa katar
//   3. MCP: `deckent_nervous_accept` id="panic:<taskId>" formatıyla CLI ile
//      aynı IPC marker'ı yazar (resolveApproval analoğu)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createTmpRoot(): string {
  const root = join(tmpdir(), `panic-accept-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(join(root, '.deckent', 'nervous'), { recursive: true });
  return root;
}

let panicCounter = 0;
function writePanicEvent(root: string, sprintId: string, taskId: string, workerId: string): string {
  // Use counter to guarantee unique filenames even if Date.now() resolution collides.
  panicCounter += 1;
  const timestamp = new Date(Date.now() + panicCounter).toISOString();
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  const filename = `${sprintId}-panic-${safeTimestamp}-${panicCounter}.json`;
  const logPath = join(root, '.deckent', filename);
  const event = {
    taskId,
    workerId,
    sprintId,
    reason: 'stale_heartbeat',
    timestamp,
    blocked: true,
    details: `Task: ${taskId}, Worker: ${workerId}`,
  };
  writeFileSync(logPath, JSON.stringify(event, null, 2) + '\n', 'utf-8');
  return logPath;
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

let testRoot: string;

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
  handleCliError: (err: unknown) => { throw err; },
}));

// ─── Capture stdout ─────────────────────────────────────────────────────────

function captureOutput(fn: () => void | Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stdout.write;

  return Promise.resolve(fn()).finally(() => {
    process.stdout.write = originalWrite;
  }).then(() => chunks.join(''));
}

// ─── Mock McpServer for MCP tests ───────────────────────────────────────────

interface CapturedTool {
  metadata: unknown;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

function createMockMcpServer(): { server: unknown; tools: Map<string, CapturedTool> } {
  const tools = new Map<string, CapturedTool>();
  const server = {
    registerTool: vi.fn((name: string, metadata: unknown, handler: CapturedTool['handler']) => {
      tools.set(name, { metadata, handler });
    }),
  };
  return { server, tools };
}

async function callMcpTool(
  tools: Map<string, CapturedTool>,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.handler(args);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Panic guard approval UI (Sprint 180 W4-2)', () => {
  beforeEach(() => {
    testRoot = createTmpRoot();
    process.exitCode = undefined;
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ─── Test 1: CLI accept-panic → IPC marker write ─────────────────────────
  it('CLI accept-panic <task-id> writes a file-based IPC marker', async () => {
    // Arrange — simulate a panic event from PanicGuard.
    writePanicEvent(testRoot, 'sprint-180', '180-007', 'w-180-007');

    // Act — invoke CLI subcommand
    const { registerNervous } = await import('../../src/cli/commands/nervous.js');
    const { Command } = await import('commander');
    const program = new Command();
    registerNervous(program);

    const output = await captureOutput(async () => {
      await program.parseAsync(['node', 'deckent', 'nervous', 'accept-panic', '180-007'], { from: 'node' });
    });

    // Assert — IPC marker written
    const ipcDir = join(testRoot, '.deckent', 'nervous', 'panic-ipc', 'pending');
    expect(existsSync(ipcDir)).toBe(true);

    const files = readdirSync(ipcDir);
    const markerFile = files.find(f => f.includes('180-007'));
    expect(markerFile).toBeDefined();

    const marker = JSON.parse(readFileSync(join(ipcDir, markerFile!), 'utf-8'));
    expect(marker.taskId).toBe('180-007');
    expect(marker.acceptedBy).toBe('user-cli');
    expect(typeof marker.acceptedAt).toBe('string');

    expect(output).toContain('Panic approval queued');
    expect(output).toContain('180-007');
  });

  // ─── Test 2: MCP subscribe → PANIC_GUARD_KILL_PENDING in event stream ────
  it('MCP deckent_nervous_subscribe surfaces pending panic events as PANIC_GUARD_KILL_PENDING', async () => {
    // Arrange — write two panic events; one is already resolved, one is pending.
    writePanicEvent(testRoot, 'sprint-180', '180-007', 'w-180-007');
    writePanicEvent(testRoot, 'sprint-180', '180-009', 'w-180-009');

    // Pre-write resolved marker for 180-009 to assert filtering
    const resolvedDir = join(testRoot, '.deckent', 'nervous', 'panic-ipc', 'resolved');
    mkdirSync(resolvedDir, { recursive: true });
    writeFileSync(
      join(resolvedDir, '180-009.json'),
      JSON.stringify({ taskId: '180-009', acceptedAt: new Date().toISOString() }),
      'utf-8',
    );

    // Act
    const { registerNervousTools } = await import('../../src/mcp/tools/nervous.js');
    const { server, tools } = createMockMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerNervousTools(server as any);

    const result = await callMcpTool(tools, 'deckent_nervous_subscribe', {
      sprintId: 'sprint-180',
      root: testRoot,
    });
    const data = JSON.parse(result.content[0]!.text);

    // Assert
    expect(data.subscribed).toBe(true);
    expect(Array.isArray(data.pendingPanics)).toBe(true);

    const panicChannels = (data.pendingPanics as Array<{ channel: string; taskId: string }>).map(p => p.channel);
    expect(panicChannels).toContain('PANIC_GUARD_KILL_PENDING');

    const taskIds = (data.pendingPanics as Array<{ channel: string; taskId: string }>).map(p => p.taskId);
    expect(taskIds).toContain('180-007');
    // 180-009 already resolved → must NOT appear
    expect(taskIds).not.toContain('180-009');
  });

  // ─── Test 3: MCP accept "panic:<taskId>" → IPC marker (resolveApproval) ──
  it('MCP deckent_nervous_accept with id="panic:<taskId>" writes IPC marker', async () => {
    // Arrange — a pending panic
    writePanicEvent(testRoot, 'sprint-180', '180-011', 'w-180-011');

    // Act
    const { registerNervousTools } = await import('../../src/mcp/tools/nervous.js');
    const { server, tools } = createMockMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerNervousTools(server as any);

    const result = await callMcpTool(tools, 'deckent_nervous_accept', {
      id: 'panic:180-011',
      root: testRoot,
    });
    const data = JSON.parse(result.content[0]!.text);

    // Assert — IPC marker present
    expect(data.accepted).toBe(true);
    expect(data.notificationId).toBe('panic:180-011');

    const ipcDir = join(testRoot, '.deckent', 'nervous', 'panic-ipc', 'pending');
    expect(existsSync(ipcDir)).toBe(true);

    const files = readdirSync(ipcDir);
    const markerFile = files.find(f => f.includes('180-011'));
    expect(markerFile).toBeDefined();

    const marker = JSON.parse(readFileSync(join(ipcDir, markerFile!), 'utf-8'));
    expect(marker.taskId).toBe('180-011');
    expect(marker.acceptedBy).toBe('user-mcp');
  });
});
