// ═══ orchestra/worker.ts — orchestra-fleet WorkerApprovalGate wiring ════════
// (APR-WORKERGATE-WIRE, task 380-003)
//
// Companion to `src/agents/worker.ts` (task claim/heartbeat/lock/result),
// mirroring the existing `worker-liveness.ts` precedent of small orchestra-side
// `worker-*` modules that operate alongside the agents/ worker-lifecycle file
// without duplicating it. This module owns the ORCHESTRA-fleet's real,
// disk-backed instantiation of `WorkerApprovalGate` (core/approval-worker-gate.ts)
// for a Brain-orchestrated worker's risky shell/git/network actions — the class
// had zero real `new` call sites anywhere in the codebase (audit §4.4 item 7,
// MASTER-PLAN row 34 APR-WORKERGATE marked DONE but disk-verify contradicted).
//
// Classification mirrors `src/agents/agentic-worker-tools.ts`'s
// `classifyRiskyToolCall`/`RISKY_APPROVAL_SCOPES` convention (git-mutation >
// network > shell-exec priority) so the two worker domains (native-agent loop
// vs. orchestra CLI-spawned fleet) apply the same risk taxonomy — kept as an
// independent, self-contained copy rather than a cross-import: `src/agents/`
// is outside this task's read/write scope, and ADR-D-004 does not name it as
// an approved orchestra/ dependency.
//
// Slack/Teams multi-channel fan-out is explicitly OUT of this task's scope
// (born-570, separate) — `guard()`'s decision may still be settled by any
// channel already wired into the shared `ApprovalBroker` (terminal today), but
// this module adds none of its own.

import { ApprovalBroker } from '../core/approval-broker.js';
import { WorkerApprovalGate, type FallbackResolver, type GateVerdict } from '../core/approval-worker-gate.js';
import type { ApprovalScope, ApprovalRisk, Requester } from '../core/approval-contract.js';

// ─── Risky-action classification (mirrors agentic-worker-tools.ts) ──────────

export const RISKY_APPROVAL_SCOPES: readonly ApprovalScope[] = ['shell-exec', 'git-mutation', 'network'] as const;

export interface RiskyClassification {
  scope: ApprovalScope;
  risk: ApprovalRisk;
  reason: string;
}

interface RiskPattern {
  re: RegExp;
  risk: ApprovalRisk;
  reason: string;
}

// Ordered most- to least-severe; the FIRST match wins within each class.
const GIT_MUTATION_PATTERNS: readonly RiskPattern[] = [
  { re: /\bgit\s+push\b[^|;&]*(--force\b|-f\b)/i, risk: 'critical', reason: 'git push --force' },
  { re: /\bgit\s+reset\b[^|;&]*--hard\b/i, risk: 'critical', reason: 'git reset --hard' },
  { re: /\bgit\s+clean\b[^|;&]*-[a-z]*f/i, risk: 'critical', reason: 'git clean -f' },
  { re: /\bgit\s+branch\b[^|;&]*-D\b/i, risk: 'high', reason: 'git branch -D (force delete)' },
  { re: /\bgit\s+push\b/i, risk: 'high', reason: 'git push' },
  {
    re: /\bgit\s+(commit|merge|rebase|reset|tag|cherry-pick|revert|rm|am|filter-branch)\b/i,
    risk: 'high',
    reason: 'git history/state mutation',
  },
];

const NETWORK_PATTERNS: readonly RiskPattern[] = [
  { re: /\b(npm|yarn|pnpm)\s+publish\b/i, risk: 'high', reason: 'package publish' },
  { re: /\b(curl|wget)\b/i, risk: 'medium', reason: 'HTTP client invocation' },
  { re: /\b(ssh|scp|sftp|rsync)\b/i, risk: 'medium', reason: 'remote-host transfer' },
  { re: /\b(npm|yarn|pnpm)\s+(install|i|ci|add|update|up)\b/i, risk: 'medium', reason: 'package registry install' },
  { re: /\bgit\s+(clone|pull|fetch)\b/i, risk: 'low', reason: 'git network fetch' },
];

function matchPattern(cmd: string, patterns: readonly RiskPattern[]): RiskPattern | undefined {
  return patterns.find((p) => p.re.test(cmd));
}

/**
 * Classify a shell command an orchestra worker is about to run into one of the
 * 3 risky `ApprovalScope` classes. Always returns a classification for a
 * non-empty command — shell-exec is itself risky, so an unrecognized command
 * is gated at minimum as shell-exec/medium; a recognized git-mutation or
 * network sub-pattern upgrades scope/risk (git-mutation > network priority,
 * mirroring agentic-worker-tools.ts's own precedence rule).
 */
export function classifyRiskyWorkerCommand(cmd: string): RiskyClassification {
  const gitMatch = matchPattern(cmd, GIT_MUTATION_PATTERNS);
  if (gitMatch) return { scope: 'git-mutation', risk: gitMatch.risk, reason: gitMatch.reason };

  const networkMatch = matchPattern(cmd, NETWORK_PATTERNS);
  if (networkMatch) return { scope: 'network', risk: networkMatch.risk, reason: networkMatch.reason };

  return { scope: 'shell-exec', risk: 'medium', reason: 'shell command execution' };
}

// ─── Real instantiation point ────────────────────────────────────────────────

export interface OrchestraWorkerApprovalGateOptions {
  tenantId?: string;
  userId?: string;
  timeoutMs?: number;
  fallbackResolver?: FallbackResolver;
}

export interface OrchestraWorkerApprovalGateHandle {
  gate: WorkerApprovalGate;
  /** The gate's underlying broker — exposed so a caller can share it with
   *  other consumers (e.g. a relay/dashboard channel) or, in tests, call
   *  `decide()` directly to resolve a submitted request. */
  broker: ApprovalBroker;
}

/**
 * Real, disk-backed instantiation point for the orchestra-fleet side of
 * `WorkerApprovalGate` — builds an `ApprovalBroker` persisting to
 * `.deckent/approvals/` under `projectRoot` (the same store the terminal's own
 * broker and `guardRiskyToolCall` (agent/permission-store.ts) use) and wraps it
 * in a real gate scoped to the given worker's identity. Not a fake/mock —
 * `guard()` does a genuine submit + await-decision (or fallback-on-timeout).
 */
export function createOrchestraWorkerApprovalGate(
  projectRoot: string,
  workerId: string,
  opts: OrchestraWorkerApprovalGateOptions = {},
): OrchestraWorkerApprovalGateHandle {
  const broker = new ApprovalBroker(projectRoot);
  const requester: Requester = { role: 'worker', instanceId: workerId };
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

const SUMMARY_MAX_LENGTH = 200;

function buildSummary(cmd: string, classification: RiskyClassification): string {
  const prefix = `worker run_bash (${classification.scope}): `;
  const budget = SUMMARY_MAX_LENGTH - prefix.length;
  const truncated = cmd.length > budget ? `${cmd.slice(0, Math.max(0, budget - 1))}…` : cmd;
  return `${prefix}${truncated}`;
}

function buildDeniedError(classification: RiskyClassification, extra?: string): string {
  const suffix = extra ? ` (${extra})` : '';
  return `[approval-denied] tool=run_bash scope=${classification.scope} risk=${classification.risk} reason="${classification.reason}"${suffix}`;
}

export interface GuardRiskyWorkerActionResult {
  verdict: GateVerdict;
  /** Structured `[approval-denied] ...` string, present only when verdict === 'deny'. */
  deniedOutput?: string;
}

/**
 * Gate a risky shell command for an orchestra-fleet worker BEFORE it runs.
 * Classifies `cmd`, submits it to the real gate's `guard()`, and on 'deny'
 * returns a structured `[approval-denied] ...` string (same convention as
 * agentic-worker-tools.ts's `wrapDispatcherWithApprovalGate`) so a caller can
 * surface the denial without a second ad-hoc deny path.
 */
export async function guardRiskyWorkerAction(
  gate: WorkerApprovalGate,
  scopeId: string,
  cmd: string,
): Promise<GuardRiskyWorkerActionResult> {
  const classification = classifyRiskyWorkerCommand(cmd);
  try {
    const verdict = await gate.guard({
      summary: buildSummary(cmd, classification),
      details: { tool: 'run_bash', scope: classification.scope, risk: classification.risk, reason: classification.reason },
      scopeId,
      scope: classification.scope,
      risk: classification.risk,
      policy: 'require-approval',
      defaultAction: 'deny',
      rawArgs: { cmd },
    });
    if (verdict === 'deny') return { verdict, deniedOutput: buildDeniedError(classification) };
    return { verdict };
  } catch (err) {
    return {
      verdict: 'deny',
      deniedOutput: buildDeniedError(classification, `gate error: ${err instanceof Error ? err.message : String(err)}`),
    };
  }
}
