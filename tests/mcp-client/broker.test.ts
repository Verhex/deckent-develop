/**
 * Tests for McpClientBroker (Sprint 229 Task 229-001).
 *
 * Hermetic — uses the SDK's `InMemoryTransport.createLinkedPair()` to wire a fake
 * MCP `Server` against the broker in the same process. No subprocess, no network.
 */

import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { McpClientBroker } from '../../src/mcp-client/broker.js';
import type { McpServerDef, McpToolCallRecord } from '../../src/mcp-client/types.js';

const FAKE_DEF: McpServerDef = {
  transport: 'stdio',
  command: '/nonexistent/mcp-server',
};

interface FakeServerHandle {
  client: Client;
  server: McpServer;
}

async function buildFakeServer(): Promise<FakeServerHandle> {
  const server = new McpServer({ name: 'fake-server', version: '0.0.1' });
  server.registerTool(
    'echo',
    {
      description: 'echo the input back',
      inputSchema: {},
    },
    async (_args, _extra) => ({
      content: [{ type: 'text' as const, text: 'echo:ok' }],
    }),
  );
  server.registerTool(
    'ping',
    {
      description: 'returns pong',
      inputSchema: {},
    },
    async (_args, _extra) => ({
      content: [{ type: 'text' as const, text: 'pong' }],
    }),
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: 'test-client', version: '0.0.1' },
    { capabilities: {} },
  );
  await client.connect(clientTransport);

  return { client, server };
}

describe('McpClientBroker', () => {
  it('listTools returns the tools exposed by a connected server', async () => {
    const broker = new McpClientBroker();
    const { client } = await buildFakeServer();
    broker.registerConnection('fake', client, fakeTransport(), FAKE_DEF);

    const tools = await broker.listTools('fake');
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['echo', 'ping']);
    expect(broker.isConnected('fake')).toBe(true);

    await broker.disconnectAll();
  });

  it('callTool returns the server result and fires the onCall audit hook', async () => {
    const records: McpToolCallRecord[] = [];
    const broker = new McpClientBroker({ onCall: (r) => records.push(r) });
    const { client } = await buildFakeServer();
    broker.registerConnection('fake', client, fakeTransport(), FAKE_DEF);

    const result = (await broker.callTool('fake', 'ping')) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(result.content[0]?.text).toBe('pong');

    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.server).toBe('fake');
    expect(rec.tool).toBe('ping');
    expect(rec.outcome).toBe('ok');
    expect(typeof rec.durationMs).toBe('number');

    await broker.disconnectAll();
  });

  it('disconnect removes the server from the pool', async () => {
    const broker = new McpClientBroker();
    const { client } = await buildFakeServer();
    broker.registerConnection('fake', client, fakeTransport(), FAKE_DEF);
    expect(broker.list()).toEqual(['fake']);

    await broker.disconnect('fake');
    expect(broker.isConnected('fake')).toBe(false);
    expect(broker.list()).toEqual([]);

    // listTools on an unknown server must throw a graceful error
    await expect(broker.listTools('fake')).rejects.toThrow(/not connected/);
  });

  it('connect to a non-existent stdio command rejects with a wrapped error', async () => {
    const broker = new McpClientBroker();
    await expect(broker.connect('missing', FAKE_DEF)).rejects.toThrow(
      /connect\(missing\) failed/,
    );
    expect(broker.isConnected('missing')).toBe(false);
  });

  it('callTool on an unknown server throws a graceful error and emits an audit record for errors only when the call reaches the SDK', async () => {
    const broker = new McpClientBroker({ onCall: vi.fn() });
    await expect(broker.callTool('missing', 'whatever')).rejects.toThrow(
      /not connected/,
    );
  });

  it('callTool wraps SDK transport errors and emits an error audit record', async () => {
    const records: McpToolCallRecord[] = [];
    const broker = new McpClientBroker({ onCall: (r) => records.push(r) });
    const { client } = await buildFakeServer();
    broker.registerConnection('fake', client, fakeTransport(), FAKE_DEF);

    // Close the underlying client to force the next callTool to fail at the
    // transport layer — this surfaces an exception that the broker must wrap.
    await client.close();

    await expect(broker.callTool('fake', 'ping')).rejects.toThrow(
      /callTool\(fake\.ping\) failed/,
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.outcome).toBe('error');
    expect(records[0]?.error).toBeTruthy();

    await broker.disconnectAll();
  });
});

/**
 * Lightweight stand-in passed to `registerConnection`. The broker owns it only for
 * eventual `close()` in disconnect; the real transport lives on the Client we built
 * via `buildFakeServer()` (which uses InMemoryTransport).
 */
function fakeTransport(): import('@modelcontextprotocol/sdk/shared/transport.js').Transport {
  return {
    start: async () => undefined,
    close: async () => undefined,
    send: async () => undefined,
  };
}
