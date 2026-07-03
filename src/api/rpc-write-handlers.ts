// ─── TERM-RPC write-method handlers (363-003 — RPC-WRITE-METHODS, dilim-2c) ──
// 362-008 (RPC-API-WIRE, slice-2a) wired 4 READ methods into server.ts's
// injectable RpcHandlerMap and deliberately left `run.start-detached` and
// `approval.decide` unwired — dispatchRpcRequest's own METHOD_NOT_IMPLEMENTED
// path was the honest "unsupported" answer for them until this task.
//
// This module owns the two WRITE methods, as a standalone, independently
// testable handler-map builder — server.ts is NOT touched (out of this
// task's write scope). Wiring them into the live `/api/rpc` route is a
// one-line follow-up (see the docImpact note in this task's .result), done
// by merging `buildRpcWriteHandlerMap(...)` into the object already passed to
// dispatchRpcRequest in server.ts's POST /api/rpc branch:
//
//   const rpcResponse = await dispatchRpcRequest(parsedRpc.data, {
//     ...buildRpcHandlerMap(projectRoot, terminalManager),
//     ...buildRpcWriteHandlerMap({ projectRoot, requester: deriveRequestPrincipal(req).id }),
//   });
//
// ─── Why this does NOT import cli/helpers/detached-start.ts ─────────────────
// The task names detached-start.ts (358-003) for reuse. That module lives
// under src/cli/helpers/. ADR-D-004 C3 (accepted, binding) forbids api/ from
// importing cli/ — the EXACT boundary 362-008's own comment block already hit
// when it wanted session-registry/run-state-feed for session.list/run.status
// and substituted PtySessionManager (a same-layer api/ module) instead. There
// is no same-layer equivalent for a detached-CLI-spawn here, so this module
// reimplements the mechanism locally: own process group, log-redirected
// stdio, unref'd, spawning `process.execPath <resolved dist/cli/entry.js>
// <tokenized argv>` — i.e. still restricted to invoking deckent's OWN CLI
// (never an arbitrary external binary), matching detached-start.ts's actual
// behavior and security posture rather than turning `run.start-detached` into
// a generic exec-anything primitive. The entry path is resolved via
// import.meta.url relative to THIS file's own compiled location
// (dist/api/ -> ../cli/entry.js), which is a filesystem-path convention, not
// a module import across the cli/↔api/ boundary.

import { spawn } from 'node:child_process';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECENT_WORKS_DIR } from '../core/constants.js';
import { ApprovalBroker } from '../core/approval-broker.js';
import type { RpcHandler, RpcHandlerMap } from '../core/term-rpc.js';

// ─── Injectable detached-spawn seam (hermetic tests supply a fake) ──────────

/** Minimal shape the detached-spawn seam needs back from a spawn call. */
export interface RpcSpawnHandle {
  pid?: number;
  unref(): void;
}

/** The exact option shape passed to the (possibly injected) spawn primitive. */
export interface RpcSpawnOptions {
  detached: true;
  stdio: ['ignore', number, number];
  cwd: string;
  env: NodeJS.ProcessEnv;
  windowsHide: true;
}

/** Injectable spawn primitive — tests supply a fake to stay hermetic (no real subprocess). */
export type RpcSpawnFn = (command: string, args: readonly string[], options: RpcSpawnOptions) => RpcSpawnHandle;

function defaultRpcSpawnFn(command: string, args: readonly string[], options: RpcSpawnOptions): RpcSpawnHandle {
  return spawn(command, [...args], options);
}

/** dist/api/rpc-write-handlers.js -> ../cli/entry.js == dist/cli/entry.js. */
function resolveEntryPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, '..', 'cli', 'entry.js');
}

/** Quote-aware whitespace tokenizer (no shell involved — spawn always takes
 *  an argv array) so a caller can pass e.g. `run "fix bug in X"` and have the
 *  quoted description survive as one argv element, same as deckent_run's own
 *  cliArgs building in chat-tool-bridge.ts. */
function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}

// ─── Shared deps ─────────────────────────────────────────────────────────────

export interface RpcWriteHandlerDeps {
  /** Project root — resolves `.deckent/recently-works/` and the default ApprovalBroker store. */
  projectRoot: string;
  /**
   * Identity of the caller triggering this write RPC call — mandatory for the
   * audit trail even though the HTTP layer has already authenticated the
   * request (bearer token) before `/api/rpc` dispatch ever runs. Auth
   * upstream answers "is this request allowed at all"; this answers "who,
   * specifically, is responsible for this write" for the audit trail.
   * Wiring code derives it via `deriveRequestPrincipal(req).id`
   * (auth-me-endpoint.ts) — the same idiom already used by
   * kpi-endpoint.ts/autonomous-endpoint.ts/missions-route.ts/process-endpoint.ts
   * and server.ts's own POST /api/approvals/:id/decision.
   */
  requester: string;
  /** Inject a fake ApprovalBroker for hermetic tests; defaults to a real one rooted at projectRoot. */
  approvalBroker?: ApprovalBroker;
  /** Inject a fake spawn for hermetic tests; omit for the real node:child_process spawn. */
  spawnFn?: RpcSpawnFn;
}

/**
 * TERM-RPC write methods NOT yet covered by this module — still answer
 * METHOD_NOT_IMPLEMENTED via dispatchRpcRequest's own honest-unsupported path
 * until a follow-up task wires them. Kept here (rather than only in
 * server.ts's 362-008 comment, which this task makes stale) so the current
 * unsupported set stays discoverable from one place.
 */
export const RPC_WRITE_METHODS_STILL_UNSUPPORTED = ['session.resume'] as const;

// ─── run.start-detached ───────────────────────────────────────────────────────

function buildRunStartDetachedHandler(deps: RpcWriteHandlerDeps): RpcHandler<'run.start-detached'> {
  const spawnFn = deps.spawnFn ?? defaultRpcSpawnFn;
  return async (params) => {
    const argv = tokenizeCommand(params.command);
    if (argv.length === 0) {
      throw new Error('run.start-detached requires a non-empty command');
    }

    const recentWorksDir = join(deps.projectRoot, RECENT_WORKS_DIR);
    mkdirSync(recentWorksDir, { recursive: true });
    const label = (argv[0] ?? 'cmd').replace(/[^a-zA-Z0-9_-]/g, '_');
    const logPath = join(recentWorksDir, `rpc-${label}-${Date.now()}.log`);
    const logFd = openSync(logPath, 'a');

    let handle: RpcSpawnHandle;
    try {
      handle = spawnFn(process.execPath, [resolveEntryPath(), ...argv], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        cwd: params.cwd ?? deps.projectRoot,
        // deps.requester is appended LAST so client-supplied `env` can never spoof the audit identity.
        env: { ...process.env, ...(params.env ?? {}), DECKENT_RPC_REQUESTER: deps.requester },
        windowsHide: true,
      });
    } finally {
      closeSync(logFd);
    }
    handle.unref();

    const runId = handle.pid !== undefined ? String(handle.pid) : randomUUID();
    return { runId };
  };
}

// ─── approval.decide ─────────────────────────────────────────────────────────

function buildApprovalDecideHandler(deps: RpcWriteHandlerDeps): RpcHandler<'approval.decide'> {
  const broker = deps.approvalBroker ?? new ApprovalBroker(deps.projectRoot);
  return async (params) => {
    // Defense-in-depth beyond TERM_RPC_METHOD_SCHEMAS' own `decidedBy: z.string().min(1)` — a
    // hermetic test (or a future caller) invoking this handler directly bypasses
    // dispatchRpcRequest's schema parse entirely, so the audit-identity requirement is
    // re-checked here rather than trusted from the wire.
    const decidedBy = params.decidedBy.trim();
    if (decidedBy.length === 0) {
      throw new Error('approval.decide requires a non-empty decidedBy (requester) for the audit trail');
    }
    broker.decide(params.requestId, {
      decision: params.decision,
      decidedBy,
      channel: 'rpc',
      decidedAt: new Date().toISOString(),
      reason: params.reason ?? '',
    });
    return { ok: true as const };
  };
}

// ─── Public entrypoint ───────────────────────────────────────────────────────

/**
 * Build the `run.start-detached` + `approval.decide` slice of an
 * RpcHandlerMap. Throws synchronously if `deps.requester` is blank — every
 * TERM-RPC write call must carry an attributable identity for the audit
 * trail, so a caller cannot even construct these handlers without one.
 */
export function buildRpcWriteHandlerMap(deps: RpcWriteHandlerDeps): RpcHandlerMap {
  if (deps.requester.trim().length === 0) {
    throw new Error(
      'RpcWriteHandlerDeps.requester is mandatory — every TERM-RPC write method call must carry ' +
        'an audit-trail identity even though upstream HTTP auth already gated the request',
    );
  }
  return {
    'run.start-detached': buildRunStartDetachedHandler(deps),
    'approval.decide': buildApprovalDecideHandler(deps),
  };
}
