// src/orchestra/process-controller.ts
// ═══ Process Mode — client-facing execution surface (ADR-067/071) ════════════
// The third execution mode alongside sprint (batch lifecycle) and task (one-shot
// worker). Process mode accepts an ExecutionRequest-shaped submission (from REST /
// MCP / a webhook) and drives it through the SAME governance + execution machinery
// the autonomous engine uses — no duplicated orchestration:
//
//   submit(ctx) → derive BacklogEntry → policy-gate (decidePolicy + EffectClass)
//     → auto:  dispatch the single entry via the execute-dispatcher (deterministic)
//     → park:  leave it approval-required in the durable backlog for human accept
//
// Safe-by-default (ADR-071 human-in-the-loop): entries are `policy:'risk-tagged'`,
// so the EffectClass decides — read-only capabilities (erp.read) auto-run, while
// side-effecting ones (erp.write, db.write) and ambiguous tasks park for approval.
//
// Tenant: carried via actor.tenantId → entry.tenant (the flag+field reality; full
// TenantContext threading is a separate, larger pass — ADR-067 amendment).
//
// Deps are injected (runTask / runSprint / waitForResult / capabilityRegistry) so
// the controller is unit-testable and REST/MCP wire the same primitives the CLI
// autonomous path already builds.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CapabilityRegistry } from '../core/capability-broker.js';
import type { CapabilityTarget } from '../core/work-model.js';
import type { BacklogEntry, BacklogStatus } from './autonomous/backlog-types.js';
import { loadBacklog } from './autonomous/backlog.js';
import { computeEntryEffectClass, decidePolicy } from './autonomous/policy-gate.js';
import {
  makeExecuteDispatcher,
  AUTONOMOUS_EXECUTE_ACTION,
  type ExecuteDispatcherDeps,
} from './autonomous/execute-dispatcher.js';
import type { ProcessStep } from './process-runtime.js';
import { atomicWriteFileSync } from '../agents/worker-lifecycle.js';

/** A single execution submission (the ExecutionRequest envelope, process flavor). */
export interface ProcessSubmitCtx {
  /** What to do (free text — the task description or capability intent). */
  description: string;
  /** task (default) | sprint | capability | process. Inferred 'capability' when a target is set. */
  kind?: 'task' | 'sprint' | 'capability' | 'process';
  /** Non-code work target (erp.read / db.query / mail.send …). */
  capabilityTarget?: CapabilityTarget;
  /** kind=process: ordered steps run sequentially by the process runtime (inline form). */
  steps?: ProcessStep[];
  /** kind=process: path to a JSON process definition ({ steps:[...] }) — file-ref form. */
  processRef?: string;
  /** Scope directory for a code task (drives EffectClass risk). */
  scopeDir?: string;
  provider?: string;
  model?: string;
  /** Tenant id (else derived from actor.tenantId, else 'local'-implicit). */
  tenant?: string;
  /** WHO submitted — RBAC identity + tenant (audit lineage). */
  actor?: { id: string; role?: string; tenantId?: string };
  /** Provenance: 'api' | 'mcp' | 'webhook' | 'scheduled' (audit). */
  origin?: string;
}

export type ProcessStatus = 'completed' | 'failed' | 'pending-approval';

export interface ProcessSubmitResult {
  executionId: string;
  status: ProcessStatus;
  reason?: string;
}

export interface ProcessRecord {
  id: string;
  title: string;
  kind: string;
  status: BacklogStatus;
  lastResult: BacklogEntry['lastResult'];
}

export interface ProcessControllerDeps
  extends Pick<ExecuteDispatcherDeps, 'projectRoot' | 'config' | 'runTask' | 'runSprint' | 'waitForResult' | 'resultTimeoutMs' | 'capabilityRegistry' | 'evaluate' | 'audit' | 'crossVerify'> {
  /** Durable backlog the submitted entry is appended to (and queried from). */
  backlogPath: string;
  /** Unique execution-id generator (injected for deterministic tests). */
  idGen?: () => string;
}

export interface ProcessController {
  submit(ctx: ProcessSubmitCtx): Promise<ProcessSubmitResult>;
  status(executionId: string): ProcessRecord | null;
}

function defaultIdGen(): string {
  return `proc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeProcessController(deps: ProcessControllerDeps): ProcessController {
  const idGen = deps.idGen ?? defaultIdGen;

  function persist(bl: { _version: string; entries: BacklogEntry[] }): void {
    mkdirSync(dirname(deps.backlogPath), { recursive: true });
    atomicWriteFileSync(deps.backlogPath, JSON.stringify(bl, null, 2));
  }

  return {
    async submit(ctx: ProcessSubmitCtx): Promise<ProcessSubmitResult> {
      const id = idGen();
      const kind: BacklogEntry['kind'] = ctx.kind ?? (ctx.capabilityTarget ? 'capability' : 'task');
      const tenant = ctx.tenant ?? ctx.actor?.tenantId;

      // steps/processRef are process-runtime fields, read structurally off the spec
      // (not in the closed BacklogEntry.spec type — validateBacklogEntry tolerates
      // extra spec fields). Cast keeps the entry well-typed for every other consumer.
      const spec = {
        description: ctx.description,
        ...(ctx.scopeDir ? { scopeDir: ctx.scopeDir } : {}),
        ...(ctx.capabilityTarget ? { capabilityTarget: ctx.capabilityTarget } : {}),
        ...(ctx.steps ? { steps: ctx.steps } : {}),
        ...(ctx.processRef ? { processRef: ctx.processRef } : {}),
      } as BacklogEntry['spec'];

      const entry: BacklogEntry = {
        id,
        title: ctx.description.slice(0, 80),
        kind,
        spec,
        // Safe-by-default: the EffectClass (not the submitter) decides auto vs park.
        policy: 'risk-tagged',
        ...(ctx.provider ? { provider: ctx.provider } : {}),
        ...(ctx.model ? { model: ctx.model } : {}),
        trigger: { type: 'one-off' },
        status: 'pending',
        ...(tenant ? { tenant } : {}),
        // Persist the full server-derived principal (not just tenant) so the
        // dispatcher can carry the real OIDC sub into the audit hash-chain.
        ...(ctx.actor ? { actor: ctx.actor } : {}),
        lastRun: null,
        lastResult: null,
      };

      const decision = decidePolicy(entry, computeEntryEffectClass(entry));

      // Append durably so the entry is queryable + the dispatcher's status writeback
      // (loadBacklog → updateStatus by id) has a row to update.
      const bl = loadBacklog(deps.backlogPath);
      bl.entries.push(entry);
      persist(bl);

      if (decision.decision === 'park') {
        // Flip to approval-required so `deckent autonomous pending` / the dashboard
        // surface it as a human-approval item (it stays pending until accepted).
        const reload = loadBacklog(deps.backlogPath);
        const e = reload.entries.find((x) => x.id === id);
        if (e) {
          e.policy = 'approval-required';
          persist(reload);
        }
        return { executionId: id, status: 'pending-approval', reason: decision.reason };
      }

      // auto → dispatch this single entry deterministically through the same
      // execute-dispatcher the autonomous loop uses (status writeback included).
      const dispatcher = makeExecuteDispatcher({
        projectRoot: deps.projectRoot,
        config: deps.config,
        runTask: deps.runTask,
        runSprint: deps.runSprint,
        backlogPath: deps.backlogPath,
        waitForResult: deps.waitForResult,
        ...(deps.resultTimeoutMs !== undefined ? { resultTimeoutMs: deps.resultTimeoutMs } : {}),
        ...(deps.capabilityRegistry ? { capabilityRegistry: deps.capabilityRegistry } : {}),
        // CORE-UNIFORMITY: forward the injectable Brain-Eval/Auditor/Cross-Verify kernels so
        // callers + tests can override them. Production omits them → the dispatcher uses its
        // real defaults (evaluateBacklogResult/auditBacklogResult/crossVerifyBacklogResult).
        ...(deps.evaluate ? { evaluate: deps.evaluate } : {}),
        ...(deps.audit ? { audit: deps.audit } : {}),
        ...(deps.crossVerify ? { crossVerify: deps.crossVerify } : {}),
      });
      const outcome = (await dispatcher(AUTONOMOUS_EXECUTE_ACTION, { entry })) as {
        outcome: 'success' | 'failure';
        error?: string;
      };
      return {
        executionId: id,
        status: outcome.outcome === 'success' ? 'completed' : 'failed',
        ...(outcome.error ? { reason: outcome.error } : {}),
      };
    },

    status(executionId: string): ProcessRecord | null {
      const e = loadBacklog(deps.backlogPath).entries.find((x) => x.id === executionId);
      if (!e) return null;
      return { id: e.id, title: e.title, kind: e.kind, status: e.status, lastResult: e.lastResult };
    },
  };
}

/** Re-export so callers don't reach into core/. */
export type { CapabilityRegistry };
