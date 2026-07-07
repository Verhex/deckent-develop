// ═══ Rule store — lifetime persistence (SP-1 §6) ════════════════════════════
// Lifetimes: 'once' (no memory), 'session' (in-memory only), 'always'
// (in-memory + .deckent/settings.local.json under permissions.rules).
// Migrates legacy permissions.allow:[toolName] → { tool, pattern: '**' }.
// Evolves chat-permissions.ts (tool-name set → rule set), same file location.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { PermissionRule } from './permission-types.js';
import { WorkerApprovalGate, type WorkerActionDescriptor, type GateVerdict, type FallbackResolver } from '../core/approval-worker-gate.js';
import { ApprovalBroker } from '../core/approval-broker.js';
import type { Requester } from '../core/approval-contract.js';

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
  try {
    if (existsSync(p)) doc = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    doc = {};
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
}

export interface WorkerApprovalGateHandle {
  gate: WorkerApprovalGate;
  /** The gate's underlying broker — exposed so a caller can share it with
   *  other consumers (e.g. a relay/dashboard channel) or, in tests, call
   *  `decide()` directly to resolve a submitted request. */
  broker: ApprovalBroker;
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
  const gate = new WorkerApprovalGate({
    broker,
    requester,
    tenantId: opts.tenantId ?? 'local',
    userId: opts.userId ?? 'local-user',
    timeoutMs: opts.timeoutMs,
    fallbackResolver: opts.fallbackResolver,
  });
  return { gate, broker };
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
