/**
 * McpClientBroker — central manager for outgoing MCP connections (Sprint 229 Task 229-001).
 *
 * Wraps the official `@modelcontextprotocol/sdk` `Client` with the stdio + StreamableHTTP
 * transports and exposes a small, deckent-shaped surface: connect / listTools / callTool /
 * disconnect. An injectable `onCall` audit hook fires for every tool invocation so Task 5
 * can route records into the existing event-stream sink — the broker itself does not
 * import event-stream (one-way dependency per ADR-008).
 *
 * No new runtime dependency: the SDK is already in package.json (ADR-010 + ADR-017).
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type {
  McpClientBrokerOptions,
  McpServerDef,
  McpToolCallRecord,
  McpToolDescriptor,
} from './types.js';

interface PoolEntry {
  client: Client;
  transport: Transport;
  def: McpServerDef;
}

const DEFAULT_CLIENT_NAME = 'deckent-mcp-client';
const DEFAULT_CLIENT_VERSION = '1.0.0';

export class McpClientBroker {
  private readonly pool = new Map<string, PoolEntry>();
  private readonly onCall: ((record: McpToolCallRecord) => void) | undefined;
  private readonly clientName: string;
  private readonly clientVersion: string;

  constructor(options: McpClientBrokerOptions = {}) {
    this.onCall = options.onCall;
    this.clientName = options.clientName ?? DEFAULT_CLIENT_NAME;
    this.clientVersion = options.clientVersion ?? DEFAULT_CLIENT_VERSION;
  }

  /**
   * Inject a pre-built Client+Transport pair (in-memory tests).
   * The broker assumes ownership; `disconnect(name)` will close both.
   */
  registerConnection(name: string, client: Client, transport: Transport, def: McpServerDef): void {
    if (this.pool.has(name)) {
      throw new Error(`McpClientBroker: server "${name}" already connected`);
    }
    this.pool.set(name, { client, transport, def });
  }

  async connect(name: string, def: McpServerDef): Promise<void> {
    if (this.pool.has(name)) {
      return;
    }
    const transport = createTransport(def);
    const client = new Client(
      { name: this.clientName, version: this.clientVersion },
      { capabilities: {} },
    );
    try {
      await client.connect(transport);
    } catch (err) {
      await safeClose(transport);
      throw wrapError(`connect(${name}) failed`, err);
    }
    this.pool.set(name, { client, transport, def });
  }

  isConnected(name: string): boolean {
    return this.pool.has(name);
  }

  list(): string[] {
    return Array.from(this.pool.keys());
  }

  async listTools(name: string): Promise<McpToolDescriptor[]> {
    const entry = this.requireEntry(name);
    const result = await entry.client.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(
    name: string,
    tool: string,
    args?: Record<string, unknown>,
  ): Promise<unknown> {
    const entry = this.requireEntry(name);
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      const result = await entry.client.callTool({ name: tool, arguments: args ?? {} });
      this.emitCall({
        server: name,
        tool,
        args,
        startedAt,
        durationMs: Date.now() - t0,
        outcome: 'ok',
      });
      return result;
    } catch (err) {
      this.emitCall({
        server: name,
        tool,
        args,
        startedAt,
        durationMs: Date.now() - t0,
        outcome: 'error',
        error: errorMessage(err),
      });
      throw wrapError(`callTool(${name}.${tool}) failed`, err);
    }
  }

  async disconnect(name: string): Promise<void> {
    const entry = this.pool.get(name);
    if (!entry) return;
    this.pool.delete(name);
    try {
      await entry.client.close();
    } catch {
      // swallow — transport.close() is best-effort
    }
    await safeClose(entry.transport);
  }

  async disconnectAll(): Promise<void> {
    const names = Array.from(this.pool.keys());
    for (const n of names) {
      await this.disconnect(n);
    }
  }

  private requireEntry(name: string): PoolEntry {
    const entry = this.pool.get(name);
    if (!entry) {
      throw new Error(`McpClientBroker: server "${name}" is not connected`);
    }
    return entry;
  }

  private emitCall(record: McpToolCallRecord): void {
    if (!this.onCall) return;
    try {
      this.onCall(record);
    } catch {
      // never let an audit-hook failure mask a tool result
    }
  }
}

function createTransport(def: McpServerDef): Transport {
  if (def.transport === 'stdio') {
    const params: ConstructorParameters<typeof StdioClientTransport>[0] = {
      command: def.command,
    };
    if (def.args) params.args = [...def.args];
    if (def.env) params.env = { ...def.env };
    if (def.cwd) params.cwd = def.cwd;
    return new StdioClientTransport(params);
  }
  const url = new URL(def.url);
  if (def.headers) {
    return new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { ...def.headers } },
    });
  }
  return new StreamableHTTPClientTransport(url);
}

async function safeClose(transport: Transport): Promise<void> {
  try {
    await transport.close();
  } catch {
    // best-effort
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function wrapError(prefix: string, err: unknown): Error {
  const msg = errorMessage(err);
  const wrapped = new Error(`${prefix}: ${msg}`);
  if (err instanceof Error && err.stack) {
    wrapped.stack = err.stack;
  }
  return wrapped;
}
