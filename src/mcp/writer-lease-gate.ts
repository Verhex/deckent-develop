/**
 * Writer-lease gate (MCP-W1). Single choke-point installed over
 * server.registerTool: any tool registered with readOnlyHint:false has its
 * handler wrapped with a writer-lease check. Mixed read/write tools get a
 * per-action predicate so their read actions stay ungated. Denials are
 * graceful tool-results — the gate never throws to the transport (no -32000).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { acquireOrCheckWriterLease, type LeaseOpts } from './writer-lease.js';
import { getMessage } from '../cli/helpers/messages.js';
import { formatErrorResponse, wrapResponse } from './helpers/format.js';

export interface WriterLeaseGateContext {
  projectRoot: string;
  lang: string;
  ttlMs?: number;
  isAlive?: (pid: number) => boolean;
  now?: () => number;
}

// Per-action write predicates for MIXED tools (one tool, both read and write
// actions). A gated tool NOT listed here is always a write.
// Action strings mirror each tool's inputSchema enum — verify on edit.
export const WRITE_ACTION_PREDICATES: Record<string, (args: any) => boolean> = {
  deckent_config: (a) => a?.action === 'set',
  deckent_docs: (a) => ['add', 'remove', 'update', 'run', 'track-scan'].includes(a?.action),
  deckent_autonomous: (a) =>
    ['start', 'stop', 'backlog_add', 'backlog_remove', 'approve', 'reject'].includes(a?.action),
  deckent_nervous_config: (a) => ['set_preset', 'set_override', 'reset'].includes(a?.action),
};

export function isWriteCall(toolName: string, args: unknown): boolean {
  const predicate = WRITE_ACTION_PREDICATES[toolName];
  return predicate ? predicate(args) : true;
}

export function buildLeaseDenialResponse(
  toolName: string,
  ownerPid: number,
  lang: string,
): { content: { type: 'text'; text: string }[]; isError: true } {
  const message = getMessage('mcp.writer_lease.denied', lang, { tool: toolName, pid: String(ownerPid) });
  const errData = { error: true, success: false, code: 'WRITER_LEASE_DENIED', ownerPid, message };
  const errSummary = formatErrorResponse({ code: 'WRITER_LEASE_DENIED', message });
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(errData, errSummary)) }],
    isError: true,
  };
}

export function installWriterLeaseGate(server: McpServer, ctx: WriterLeaseGateContext): void {
  type RegisterFn = (name: string, config: any, cb: any) => unknown;
  const original = (server.registerTool as RegisterFn).bind(server);
  const leaseOpts: LeaseOpts = { ttlMs: ctx.ttlMs, isAlive: ctx.isAlive, now: ctx.now };

  (server as { registerTool: RegisterFn }).registerTool = (name, config, cb) => {
    const readOnly = config?.annotations?.readOnlyHint === true;
    if (readOnly) return original(name, config, cb);

    const gated = async (args: unknown, extra: unknown): Promise<unknown> => {
      if (!isWriteCall(name, args)) return cb(args, extra);
      const lease = acquireOrCheckWriterLease(ctx.projectRoot, leaseOpts);
      if (!lease.ok) return buildLeaseDenialResponse(name, lease.ownerPid, ctx.lang);
      return cb(args, extra);
    };
    return original(name, config, gated);
  };
}
