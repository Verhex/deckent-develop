// ═══ Rule store — lifetime persistence (SP-1 §6) ════════════════════════════
// Lifetimes: 'once' (no memory), 'session' (in-memory only), 'always'
// (in-memory + .deckent/settings.local.json under permissions.rules).
// Migrates legacy permissions.allow:[toolName] → { tool, pattern: '**' }.
// Evolves chat-permissions.ts (tool-name set → rule set), same file location.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { PermissionRule } from './permission-types.js';
import {
  WorkerApprovalGate,
  type WorkerActionDescriptor,
  type GateVerdict,
  type FallbackResolver,
  type ApprovalAllowScopeLike,
} from '../core/approval-worker-gate.js';
import { ApprovalBroker } from '../core/approval-broker.js';
import type { Requester } from '../core/approval-contract.js';
import { ApprovalAllowScopeStore } from '../core/approval-allowscope.js';

export type GrantLifetime = 'once' | 'session' | 'always';

export interface RuleStore {
  /** Add a rule for the given lifetime. */
  grant(rule: PermissionRule, lifetime: GrantLifetime): void;
  /** Remove a matching rule from memory + persisted store. */
  revoke(rule: PermissionRule): void;
  /** All currently-active allow rules (session + persisted). */
  activeRules(): PermissionRule[];
  /** Persisted explicit DENY rules (permissions.deny) — highest precedence in decide(). */
  activeDenies(): PermissionRule[];
}

function settingsPath(cwd: string): string {
  return join(cwd, '.deckent', 'settings.local.json');
}

function sameRule(a: PermissionRule, b: PermissionRule): boolean {
  return a.tool === b.tool && a.pattern === b.pattern;
}

function loadPersisted(cwd: string): PermissionRule[] {
  const p = settingsPath(cwd);
  if (!existsSync(p)) return [];
  try {
    const doc = JSON.parse(readFileSync(p, 'utf-8')) as {
      permissions?: { rules?: unknown; allow?: unknown };
    };
    const rules: PermissionRule[] = [];
    const raw = doc.permissions?.rules;
    if (Array.isArray(raw)) {
      for (const x of raw) {
        if (x && typeof x === 'object' && typeof (x as PermissionRule).tool === 'string' && typeof (x as PermissionRule).pattern === 'string') {
          rules.push({ tool: (x as PermissionRule).tool, pattern: (x as PermissionRule).pattern });
        }
      }
    }
    // legacy migration: permissions.allow:[toolName] → tool(**)
    const legacy = doc.permissions?.allow;
    if (Array.isArray(legacy)) {
      for (const t of legacy) {
        if (typeof t === 'string') rules.push({ tool: t, pattern: '**' });
      }
    }
    return rules;
  } catch {
    return [];
  }
}

/** Load explicit deny rules from permissions.deny. Fail-safe: malformed → []. */
function loadDenies(cwd: string): PermissionRule[] {
  const p = settingsPath(cwd);
  if (!existsSync(p)) return [];
  try {
    const doc = JSON.parse(readFileSync(p, 'utf-8')) as { permissions?: { deny?: unknown } };
    const raw = doc.permissions?.deny;
    const rules: PermissionRule[] = [];
    if (Array.isArray(raw)) {
      for (const x of raw) {
        if (x && typeof x === 'object' && typeof (x as PermissionRule).tool === 'string' && typeof (x as PermissionRule).pattern === 'string') {
          rules.push({ tool: (x as PermissionRule).tool, pattern: (x as PermissionRule).pattern });
        }
      }
    }
    return rules;
  } catch {
    return [];
  }
}

function persist(cwd: string, rules: PermissionRule[]): void {
  const p = settingsPath(cwd);
  let doc: Record<string, unknown> = {};
  if (existsSync(p)) {
    try {
      doc = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
    } catch {
      // Malformed JSON (e.g. crash mid-write, hand-edit typo): we cannot
      // structurally merge unparseable content, but we must never silently
      // destroy it. Back up the corrupted bytes before falling back to a
      // fresh doc, and warn — read-merge-write's contract is "never erase
      // unrelated content without a trace", even on the failure path.
      const backupPath = `${p}.corrupted-${Date.now()}.bak`;
      try {
        copyFileSync(p, backupPath);
        console.error(`[permission-store] ${p} is not valid JSON — backed up original content to ${backupPath} before rewriting permissions.`);
      } catch {
        console.error(`[permission-store] ${p} is not valid JSON and could not be backed up — rewriting with permissions only.`);
      }
      doc = {};
    }
  }
  const permissions = (doc['permissions'] && typeof doc['permissions'] === 'object' && !Array.isArray(doc['permissions']))
    ? (doc['permissions'] as Record<string, unknown>)
    : {};
  permissions['rules'] = rules;
  // SP-1 M3 coexistence: while the native path (rules) runs behind a flag
  // alongside the legacy default path (allow), do NOT delete permissions.allow —
  // a native "always" grant must not wipe the legacy allow-list. The allow→rules
  // migration still happens in-memory on load; only the on-disk delete is gated.
  // M4 (legacy delete) removes this guard and resumes the cleanup.
  doc['permissions'] = permissions;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}

export function createRuleStore(cwd: string): RuleStore {
  const persisted = loadPersisted(cwd);
  const denies = loadDenies(cwd);
  const session: PermissionRule[] = [];
  const active = (): PermissionRule[] => {
    const all = [...persisted];
    for (const s of session) if (!all.some((a) => sameRule(a, s))) all.push(s);
    return all;
  };
  return {
    grant(rule, lifetime) {
      if (lifetime === 'once') return;
      if (lifetime === 'session') {
        if (!session.some((s) => sameRule(s, rule))) session.push(rule);
        return;
      }
      if (!persisted.some((s) => sameRule(s, rule))) persisted.push(rule);
      persist(cwd, persisted);
    },
    revoke(rule) {
      for (let i = session.length - 1; i >= 0; i--) if (sameRule(session[i]!, rule)) session.splice(i, 1);
      const before = persisted.length;
      for (let i = persisted.length - 1; i >= 0; i--) if (sameRule(persisted[i]!, rule)) persisted.splice(i, 1);
      if (persisted.length !== before) persist(cwd, persisted);
    },
    activeRules: active,
    activeDenies: () => [...denies],
  };
}

// ─── WorkerApprovalGate wiring (APR-WORKERGATE-WIRE, task 380-003) ───────────
//
// `WorkerApprovalGate` (core/approval-worker-gate.ts) had zero real production
// `new` call sites anywhere in the codebase (audit §4.4 item 7) — code + tests
// existed, but nothing ever instantiated it outside test fakes. This section
// is the actual, disk-backed (non-mock) instantiation point for the
// native-agent ("worker" in the SP-1 sense: the loop executing tool calls on
// the user's behalf) side of the gate, plus the `permission-store` consumption
// path the task asked for: a real 'allow' verdict is persisted as an 'always'
// RuleStore grant, so a repeat of the exact same (tool, resource) short-circuits
// locally via `decide()`'s existing rule-check step instead of re-asking the
// broker every time.

export interface WorkerApprovalGateFactoryOptions {
  tenantId?: string;
  userId?: string;
  timeoutMs?: number;
  fallbackResolver?: FallbackResolver;
  /**
   * born-630 (APPROVAL-QOL) — optional override for tests. Defaults to a
   * real, disk-backed `ApprovalAllowScopeStore(cwd)` (the same store a
   * terminal "always allow" decision persists a grant to,
   * `.deckent/settings/approval-allows.json`). Wiring this in is what makes
   * `WorkerApprovalGate`'s existing guard-önü `matchesAllow` composition
   * (358-008, core/approval-worker-gate.ts) actually fire on the worker
   * path — before this, `allowStore` was never constructed here, so a live
   * always-allow grant was structurally dead for every worker gate.
   */
  allowStore?: ApprovalAllowScopeLike;
}

export interface WorkerApprovalGateHandle {
  gate: WorkerApprovalGate;
  /** The gate's underlying broker — exposed so a caller can share it with
   *  other consumers (e.g. a relay/dashboard channel) or, in tests, call
   *  `decide()` directly to resolve a submitted request. */
  broker: ApprovalBroker;
  /** The gate's always-allow lookup (see {@link WorkerApprovalGateFactoryOptions.allowStore}) —
   *  exposed so a caller can `grantAllow(...)` into the SAME store instance. */
  allowStore: ApprovalAllowScopeLike;
  /**
   * born-630 (APPROVAL-QOL) — releases this handle's process-local deny-cache
   * (see `guard()` wrapping below). Idempotent. A caller that layers its own
   * dispose lifecycle on top (e.g. `agents/worker-approval-env.ts`'s
   * `setupWorkerApprovalGateFromEnv`) MUST chain this in.
   */
  dispose: () => void;
}

/**
 * Real instantiation point: builds a disk-backed `ApprovalBroker` (persists to
 * `.deckent/approvals/` under `cwd`, same store `cli/repl/run.tsx`'s terminal
 * broker uses) and wraps it in a real `WorkerApprovalGate`. Not a fake/mock —
 * `guard()` on the returned gate does a genuine submit + await-decision (or
 * fallback-on-timeout) round trip.
 */
export function createWorkerApprovalGate(
  cwd: string,
  requester: Requester,
  opts: WorkerApprovalGateFactoryOptions = {},
): WorkerApprovalGateHandle {
  const broker = new ApprovalBroker(cwd);
  // born-611 R1 (advisor-confirmed cross-process race): a decision written by
  // ANOTHER process (terminal/API) moments before the gate's timeout must WIN
  // over the fallback guess — otherwise the fallback's decide() overwrites the
  // human's allow on disk while the UI shows "approved". Flushing the external-
  // decision seam right before resolving the fallback settles any real decision
  // first; the gate's own decide() then throws APR_ALREADY_DECIDED and its
  // catch path returns the GENUINE decision instead.
  const baseResolver = opts.fallbackResolver;
  const flushingResolver: FallbackResolver = (ctx) => {
    try { broker.checkForExternalDecisions(); } catch { /* fail-soft: fallback still applies */ }
    return baseResolver ? baseResolver(ctx) : 'deny';
  };
  const allowStore = opts.allowStore ?? new ApprovalAllowScopeStore(cwd);
  const gate = new WorkerApprovalGate({
    broker,
    requester,
    tenantId: opts.tenantId ?? 'local',
    userId: opts.userId ?? 'local-user',
    timeoutMs: opts.timeoutMs,
    fallbackResolver: flushingResolver,
    allowStore,
  });

  // ─── born-630 (APPROVAL-QOL) item 2: process-local deny-cache ────────────
  // A denied `[approval-denied] ...` verdict comes back to the model as a
  // normal tool result (both real callers — agents/worker.ts
  // guardRiskyWorkerAction, agents/agentic-worker-tools.ts
  // wrapDispatcherWithApprovalGate — deliberately surface a denial this way
  // so the model can self-correct) — but a model that does NOT self-correct
  // re-issues the exact same command, and every re-issue is a brand-new
  // broker submit(), i.e. a fresh notification. This cache short-circuits a
  // repeat of the SAME (scopeId, scope, cmd) after its first real denial —
  // no second broker round-trip, no second notification. Cleared by
  // `dispose()`.
  //
  // Cache-hit THROWS rather than resolving 'deny' directly: both existing
  // call sites already wrap `gate.guard()` in try/catch and fold a thrown
  // error's `.message` into the `[approval-denied] ... (gate error: ...)`
  // tool-result text — the only channel available here (out of this task's
  // write scope) to carry a "don't retry" instruction through to the model.
  const deniedKeys = new Set<string>();
  const originalGuard = gate.guard.bind(gate);
  gate.guard = async (action: WorkerActionDescriptor): Promise<GateVerdict> => {
    const key = denyCacheKey(action);
    if (key !== null && deniedKeys.has(key)) {
      throw new Error(
        `command already denied earlier this run (scopeId=${action.scopeId}, scope=${action.scope}) — do not retry it`,
      );
    }
    const verdict = await originalGuard(action);
    if (verdict === 'deny' && key !== null) deniedKeys.add(key);
    return verdict;
  };

  return {
    gate,
    broker,
    allowStore,
    dispose: () => { deniedKeys.clear(); },
  };
}

/** Deny-cache key for {@link createWorkerApprovalGate}'s process-local cache —
 *  `(scopeId, scope, cmd)`, `cmd` read from `rawArgs.cmd`/`rawArgs.command`
 *  (mirrors the exact extraction the risky-command classifiers already use).
 *  An action with no discernible `cmd` string is never cached — conservative,
 *  avoids collapsing unrelated non-shell actions onto the same empty-cmd key. */
function denyCacheKey(action: WorkerActionDescriptor): string | null {
  const rawCmd = action.rawArgs?.['cmd'] ?? action.rawArgs?.['command'];
  if (typeof rawCmd !== 'string' || rawCmd.length === 0) return null;
  return `${action.scopeId} ${action.scope} ${rawCmd}`;
}

export interface RiskyToolCallGuardResult {
  verdict: GateVerdict;
  /** True when the 'allow' verdict was persisted to the RuleStore as an
   *  'always' grant (consumption "via permission-store"). */
  persisted: boolean;
}

/**
 * Consult a real `WorkerApprovalGate` for a risky tool call, then CONSUME the
 * decision through the `RuleStore`: an 'allow' verdict is persisted as an
 * 'always' grant for `(tool, resource)` — mirroring the native loop's own
 * decide-resume grant pattern (agent/loop.ts's `ruleStore.grant(...)` call on
 * a non-'once' permission response) — so the broker is consulted once per
 * distinct (tool, resource), not on every repeat. A 'deny' verdict is never
 * persisted (fail-closed; asking again next time is the safe default).
 */
export async function guardRiskyToolCall(
  gate: WorkerApprovalGate,
  ruleStore: RuleStore,
  tool: string,
  resource: string,
  action: WorkerActionDescriptor,
): Promise<RiskyToolCallGuardResult> {
  const verdict = await gate.guard(action);
  if (verdict === 'allow') {
    ruleStore.grant({ tool, pattern: resource || '**' }, 'always');
    return { verdict, persisted: true };
  }
  return { verdict, persisted: false };
}
