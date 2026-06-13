// ═══ Capability Broker — F8-001 (CapabilityTarget consumer) ══════════════════
// The non-code execution path. Where `scope.filesWrite` describes file-scoped
// work, an `ExecutionRequest.capabilityTarget` describes work that isn't a code
// edit — mail.send / erp.read / db.query / calendar.create. This broker resolves
// such a target to one of N registered backend handlers and invokes it.
//
// Design tenets:
//  • Least-privilege — every handler DECLARES the `Capability` it exercises; an
//    optional granted-capability set on the context gates invocation.
//  • Graceful — `invoke` NEVER throws; every outcome is a `CapabilityResult`
//    discriminated union (ok / not-found / denied / failed). Enterprise callers
//    branch on `result.ok`, never wrap in try/catch.
//  • Extensible — register any number of handlers under a verb or a connector id.
//  • Pure-where-possible — the registry holds no I/O; only concrete handlers do.
//
// ADR-010 (single runtime dependency): no new deps — Node built-ins only.
// ADR-008 (core/ must not import orchestra/): imports types from work-model only.

import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import type {
  Capability,
  CapabilityTarget,
  ActorContext,
  ExecutionRequest,
} from './work-model.js';
import { DeckentError } from './errors.js';

// ─── Result + context types ──────────────────────────────────────────────────

/** Why an invocation did not produce a value. */
export type CapabilityErrorCode =
  | 'CAPABILITY_NOT_FOUND'
  | 'CAPABILITY_DENIED'
  | 'CAPABILITY_FAILED';

/** Outcome of {@link CapabilityRegistry.invoke} — never thrown, always returned. */
export type CapabilityResult =
  | { ok: true; capability: string; handler: string; value: unknown }
  | { ok: false; capability: string; code: CapabilityErrorCode; error: string };

/** Ambient context for an invocation. All fields optional + backward-safe. */
export interface InvocationContext {
  /** When provided, a handler whose `requiredCapability` is absent here is DENIED.
   *  When absent, the least-privilege gate is permissive (opt-in enforcement). */
  grantedCapabilities?: Capability[];
  /** WHO is invoking (RBAC / tenant) — carried from `ExecutionRequest.actor`. */
  actor?: ActorContext;
  /** Root the fs-read handler resolves relative paths under (containment). */
  projectRoot?: string;
  /** Audit lineage (ENT-3) — propagated, not interpreted, by the broker. */
  correlationId?: string;
  causationId?: string;
}

/** A registered backend. Declares the capability it needs (least-privilege). */
export interface CapabilityHandler {
  /** The single `Capability` this handler exercises — gated against the grant set. */
  requiredCapability: Capability;
  description?: string;
  /** Do the work. May be async. May throw — the registry converts a throw into
   *  a `CAPABILITY_FAILED` result, so handlers need not be defensive themselves. */
  invoke(args: Record<string, unknown>, ctx: InvocationContext): unknown | Promise<unknown>;
}

/** Per-backend registration options (F8-002 — multi-backend selection). */
export interface RegisterCapabilityOptions {
  /** Higher wins when multiple backends share a name. Default `0`. */
  priority?: number;
  /** Gate — a backend whose `isAvailable()` returns false is skipped during
   *  resolution. Default: always available. A predicate that THROWS is treated as
   *  unavailable (fail-safe), so a faulty probe never propagates out of the registry. */
  isAvailable?: () => boolean;
}

// ─── Registry ────────────────────────────────────────────────────────────────

/** A single registered backend under a name — handler + selection metadata. */
interface BackendEntry {
  handler: CapabilityHandler;
  priority: number;
  isAvailable?: () => boolean;
}

/**
 * Holds named backends and routes a {@link CapabilityTarget} to one of them.
 * A name may hold MULTIPLE backends (F8-002): resolution picks the highest-
 * `priority` AVAILABLE backend, ties broken to the most-recently registered.
 * Across the connector/verb axis, an explicit `target.connector` is preferred
 * (when it has an available backend) and falls back to `target.capability`.
 */
export class CapabilityRegistry {
  private readonly backends = new Map<string, BackendEntry[]>();

  /**
   * Register `handler` as a backend under `name` (a verb like 'mail.send' or a
   * connector id like 'imap'). ADDITIVE: a name may hold MANY backends.
   * Resolution picks the highest-`priority` AVAILABLE backend; ties break to the
   * most-recently registered — so with a single backend, or several at equal
   * priority, the newest wins (the historical "last writer wins" behavior is
   * preserved). `opts.isAvailable` (default: always available; a throwing
   * predicate counts as unavailable) lets a backend opt out at resolution time.
   */
  register(name: string, handler: CapabilityHandler, opts?: RegisterCapabilityOptions): void {
    const entry: BackendEntry = {
      handler,
      priority: opts?.priority ?? 0,
      isAvailable: opts?.isAvailable,
    };
    const list = this.backends.get(name);
    if (list) list.push(entry);
    else this.backends.set(name, [entry]);
  }

  has(name: string): boolean {
    return this.backends.has(name);
  }

  /** The selected handler for `name` (highest priority, ties most-recent),
   *  IGNORING availability so `has(name) ⟺ get(name) !== undefined` holds. */
  get(name: string): CapabilityHandler | undefined {
    return this.selectEntry(name, false)?.handler;
  }

  /** Registered names, sorted for stable, order-independent output. */
  list(): string[] {
    return [...this.backends.keys()].sort();
  }

  /** Introspection — labels of every backend under `name`, in resolution-
   *  preference order (priority desc, ties most-recent first). `[]` if absent. */
  listBackends(name: string): string[] {
    const list = this.backends.get(name);
    if (list === undefined) return [];
    return list
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => b.entry.priority - a.entry.priority || b.index - a.index)
      .map(({ entry }) => entry.handler.description ?? entry.handler.requiredCapability);
  }

  /** Remove ALL backends registered under `name`. */
  unregister(name: string): boolean {
    return this.backends.delete(name);
  }

  clear(): void {
    this.backends.clear();
  }

  /** Is this backend selectable right now? A missing predicate ⇒ always; a
   *  throwing predicate ⇒ unavailable (fail-safe — never propagates a throw). */
  private isEntryAvailable(entry: BackendEntry): boolean {
    if (entry.isAvailable === undefined) return true;
    try {
      return entry.isAvailable() === true;
    } catch {
      return false;
    }
  }

  /** Best backend under `name`: highest priority, ties most-recent. When
   *  `availableOnly`, unavailable backends are skipped. `undefined` if none. */
  private selectEntry(name: string, availableOnly: boolean): BackendEntry | undefined {
    const list = this.backends.get(name);
    if (list === undefined) return undefined;
    let best: BackendEntry | undefined;
    // Iterate in insertion order; `>=` lets a later equal-priority entry replace
    // an earlier one, yielding "max priority, ties → most-recent" for free.
    for (const entry of list) {
      if (availableOnly && !this.isEntryAvailable(entry)) continue;
      if (best === undefined || entry.priority >= best.priority) best = entry;
    }
    return best;
  }

  /** Resolve `target` to an available backend: connector first, then verb. */
  private resolveEntry(
    target: CapabilityTarget,
  ): { name: string; handler: CapabilityHandler } | undefined {
    const candidates = target.connector
      ? [target.connector, target.capability]
      : [target.capability];
    for (const name of candidates) {
      const entry = this.selectEntry(name, true);
      if (entry) return { name, handler: entry.handler };
    }
    return undefined;
  }

  /**
   * Resolve `target` to a handler and invoke it. Never throws; every path returns
   * a {@link CapabilityResult}. Applies the least-privilege gate before invoking.
   */
  async invoke(target: CapabilityTarget, ctx: InvocationContext = {}): Promise<CapabilityResult> {
    const verb = target.capability;
    const resolved = this.resolveEntry(target);
    if (resolved === undefined) {
      // Distinguish "nothing registered" from "registered but all unavailable".
      const registered =
        this.has(target.capability) ||
        (target.connector !== undefined && this.has(target.connector));
      const suffix = target.connector ? ` or connector '${target.connector}'` : '';
      return {
        ok: false,
        capability: verb,
        code: 'CAPABILITY_NOT_FOUND',
        error: registered
          ? `no available handler for capability '${verb}'${suffix} (all backends unavailable)`
          : `no handler registered for capability '${verb}'${suffix}`,
      };
    }

    const { name, handler } = resolved;

    if (
      ctx.grantedCapabilities !== undefined &&
      !ctx.grantedCapabilities.includes(handler.requiredCapability)
    ) {
      return {
        ok: false,
        capability: verb,
        code: 'CAPABILITY_DENIED',
        error: `handler '${name}' requires capability '${handler.requiredCapability}' which is not granted`,
      };
    }

    try {
      const value = await handler.invoke(target.args ?? {}, ctx);
      return { ok: true, capability: verb, handler: name, value };
    } catch (err) {
      return {
        ok: false,
        capability: verb,
        code: 'CAPABILITY_FAILED',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ─── Reference handlers (prove the pattern) ──────────────────────────────────

/**
 * No-op reference handler — echoes its args back verbatim. Touches nothing
 * external; declares `mcp-tool` as its nominal least-privilege capability (the
 * `Capability` union has no `'none'` member, and a generic tool-invoke is the
 * closest benign verb for "I read/write no real resource").
 */
export const echoHandler: CapabilityHandler = {
  requiredCapability: 'mcp-tool',
  description: 'Returns the provided args unchanged — reference / smoke handler.',
  invoke: (args) => ({ echoed: args }),
};

/**
 * Reference fs-read handler — performs a REAL read of `args.path`. When
 * `ctx.projectRoot` is set, the path is resolved under it and reads that escape
 * the root are refused (path-traversal containment, least-privilege). Returns
 * `{ path, content }`. A missing file / non-string path / escaping path throws,
 * which the registry surfaces as `CAPABILITY_FAILED`.
 */
export const fsReadHandler: CapabilityHandler = {
  requiredCapability: 'fs-read',
  description: 'Reads a UTF-8 file at args.path (contained under ctx.projectRoot when set).',
  invoke: async (args, ctx) => {
    const rawPath = args.path;
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      throw new DeckentError('DECKENT_E039', 'fs-read requires a non-empty string args.path');
    }
    let target = rawPath;
    if (ctx.projectRoot) {
      target = resolve(ctx.projectRoot, rawPath);
      const rel = relative(ctx.projectRoot, target);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new DeckentError('DECKENT_E005', `fs-read path escapes projectRoot: ${rawPath}`);
      }
    }
    const content = await readFile(target, 'utf8');
    return { path: target, content };
  },
};

/** Install the reference handlers ({@link echoHandler}, {@link fsReadHandler}). */
export function installReferenceHandlers(registry: CapabilityRegistry): void {
  registry.register('echo', echoHandler);
  registry.register('fs.read', fsReadHandler);
}

/** Build a fresh registry preloaded with the reference handlers. */
export function createDefaultRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  installReferenceHandlers(registry);
  return registry;
}

// ─── Module-level default registry + convenience surface ─────────────────────

let defaultRegistry = createDefaultRegistry();

/** Accessor for the process-wide default registry (echo + fs.read preinstalled).
 *  A function, not a constant, because {@link resetDefaultCapabilityRegistry}
 *  rebinds the underlying instance. */
export function getDefaultRegistry(): CapabilityRegistry {
  return defaultRegistry;
}

/** Register a handler on the default registry. Forwards multi-backend
 *  selection {@link RegisterCapabilityOptions} (priority / isAvailable). */
export function registerCapability(
  name: string,
  handler: CapabilityHandler,
  opts?: RegisterCapabilityOptions,
): void {
  defaultRegistry.register(name, handler, opts);
}

/** Invoke a capability target against the default registry. Never throws. */
export function invokeCapability(
  target: CapabilityTarget,
  ctx: InvocationContext = {},
): Promise<CapabilityResult> {
  return defaultRegistry.invoke(target, ctx);
}

export function hasCapability(name: string): boolean {
  return defaultRegistry.has(name);
}

export function listCapabilities(): string[] {
  return defaultRegistry.list();
}

/** Reset the default registry to its initial state (echo + fs.read only).
 *  Test helper — restores a clean baseline so registrations don't leak. */
export function resetDefaultCapabilityRegistry(): void {
  defaultRegistry = createDefaultRegistry();
}

// ─── ExecutionRequest consumer ───────────────────────────────────────────────

/**
 * Invoke the `capabilityTarget` carried on an {@link ExecutionRequest}. This is
 * the concrete consumer of the WM-1 contract's `capabilityTarget` envelope field
 * for non-code work. Derives the invocation context from the request — granted
 * capabilities from `requirements.capabilities`, plus actor / projectRoot /
 * audit lineage — with explicit `ctx` overrides taking precedence.
 */
export function invokeFromRequest(
  req: ExecutionRequest,
  ctx: InvocationContext = {},
  registry: CapabilityRegistry = defaultRegistry,
): Promise<CapabilityResult> {
  const target = req.capabilityTarget;
  if (!target) {
    return Promise.resolve({
      ok: false,
      capability: '',
      code: 'CAPABILITY_NOT_FOUND',
      error: 'request has no capabilityTarget',
    });
  }

  const merged: InvocationContext = {
    grantedCapabilities: ctx.grantedCapabilities ?? req.requirements?.capabilities,
    actor: ctx.actor ?? req.actor,
    projectRoot: ctx.projectRoot ?? req.projectRoot,
    correlationId: ctx.correlationId ?? req.correlationId,
    causationId: ctx.causationId ?? req.causationId,
  };

  return registry.invoke(target, merged);
}
