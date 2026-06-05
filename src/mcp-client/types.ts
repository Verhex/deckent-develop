/**
 * MCP-Client public types (Sprint 229 — AS-5·P1 MCP-Client).
 *
 * `McpServerDef` is the merged config record (Task 229-002 will produce these from
 * `.mcp.json`). Two transport variants:
 *  - stdio: spawn a local subprocess and exchange JSON-RPC over stdin/stdout
 *  - http : connect to a remote URL via StreamableHTTP transport
 *
 * `McpToolCallRecord` is the audit shape passed to `onCall` so Task 5 (REPL bridge)
 * can persist it via the existing event-stream sink.
 */

export interface McpStdioServerDef {
  transport: 'stdio';
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
  cwd?: string;
}

export interface McpHttpServerDef {
  transport: 'http';
  url: string;
  headers?: Readonly<Record<string, string>>;
}

export type McpServerDef = McpStdioServerDef | McpHttpServerDef;

/** Tool descriptor as surfaced by the broker (subset of the SDK shape). */
export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Audit record emitted for every callTool invocation. */
export interface McpToolCallRecord {
  server: string;
  tool: string;
  args: Record<string, unknown> | undefined;
  startedAt: string;
  durationMs: number;
  outcome: 'ok' | 'error';
  error?: string;
}

/** Constructor options for the broker — `onCall` lets Task 5 inject an audit sink. */
export interface McpClientBrokerOptions {
  onCall?: (record: McpToolCallRecord) => void;
  clientName?: string;
  clientVersion?: string;
}
