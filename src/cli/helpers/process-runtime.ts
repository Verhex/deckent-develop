// src/cli/helpers/process-runtime.ts
// ═══ Process Mode runtime wiring — builds a live ProcessController ════════════
// The heavy DI assembly (real runTaskMode / runSprint closures with style-scoped
// configs, waitForRunResult, an audited capability registry) shared by the REST
// endpoint (api/process-endpoint) and the MCP tool (mcp/tools/process), so neither
// duplicates it. Lives in cli/ (the layer allowed to import run.ts + the runners),
// mirroring how autonomous.ts handleStart wires buildEngineRuntime.

import { join } from 'node:path';
import { loadConfig } from '../../core/config.js';
import { createAuditedCapabilityRegistry } from '../../core/capability-runtime.js';
import { buildErpConnectorFromConfig } from '../../core/erp/index.js';
import { writeAuditEvent } from '../../core/audit-writer.js';
import { runTaskMode } from '../../orchestra/task-mode-runner.js';
import { runSprint as runSprintLifecycle } from '../../orchestra/sprint-controller.js';
import { makeProcessController, type ProcessController } from '../../orchestra/process-controller.js';
import { waitForRunResult } from '../commands/run.js';
import type { ModelType } from '../../core/types.js';
import { bootstrapApprovalAuthority } from '../../core/approval-authority-bootstrap.js';
import { openLocalProviderAuthorityRuntime } from '../../providers/provider-authority-runtime-bootstrap.js';

/**
 * Assemble a live ProcessController for `projectRoot`. Wires the same execution
 * primitives the autonomous engine uses:
 *   - kind=task     → runTaskMode (style-scoped 'task' config, autoApprove)
 *   - kind=sprint   → runSprint  (style-scoped 'sprint' config)
 *   - kind=capability → audited capability registry (ERP/db/mail handlers; every
 *     invocation lands on the ENT-3 audit hash-chain — the training-data trail)
 * Provider execution remains fail-closed until the shared authority can admit
 * one exact candidate. Capability-only work does not require provider bootstrap.
 */
export async function buildProcessController(projectRoot: string): Promise<ProcessController> {
  const config = await loadConfig(projectRoot);
  const providerAuthority = openLocalProviderAuthorityRuntime(projectRoot, config);
  const approvalAuthority = bootstrapApprovalAuthority(projectRoot, config);
  let closed = false;
  const closeAuthorities = (): void => {
    if (closed) return;
    closed = true;
    let closeError: unknown = null;
    try {
      if (approvalAuthority.state === 'ready') approvalAuthority.runtime.close();
    } catch (error) {
      closeError = error;
    }
    try {
      providerAuthority.close();
    } catch (error) {
      closeError ??= error;
    }
    if (closeError) throw closeError;
  };

  // runTaskMode requires a 'task'-style config; runSprint a 'sprint'-style one —
  // clone per kind so the style guards pass regardless of deckent_style='process'.
  const taskConfig = { ...config, deckent_style: 'task' as const };
  const sprintConfig = { ...config, deckent_style: 'sprint' as const };

  const backlogPath = join(projectRoot, config.autonomous?.backlog_path ?? '.deckent/autonomous/backlog.json');

  // Opt-in ERP connector (config.erp.enabled) → installs the live `erp.read`
  // handler so process capabilities round-trip to a real ERP (IFS/Odoo/SAP/
  // Dynamics). Absent/disabled ⇒ undefined ⇒ no erp.read handler (backward-safe).
  const erpConnector = buildErpConnectorFromConfig(config.erp, process.env);

  const capabilityRegistry = createAuditedCapabilityRegistry((record) => {
    writeAuditEvent(projectRoot, 'process', {
      tenantId: record.actor?.tenantId ?? 'local',
      actor: record.actor?.id ?? 'system',
      action: `capability.${record.outcome}`,
      target: record.capability,
      metadata: { timestamp: record.timestamp, error: record.error },
    });
  }, erpConnector ? { erp: { connector: erpConnector } } : {});

  try {
    return makeProcessController({
      projectRoot,
      config,
      backlogPath,
      capabilityRegistry,
      admitProviderExecution: (entry) => {
        const tenantId = entry.tenant ?? entry.actor?.tenantId ?? 'local';
        const reasonCode = providerAuthority.state === 'hold'
          ? providerAuthority.reasonCode
          : 'candidate_authority_unavailable';
        return {
          decision: 'hold',
          hold: {
            schemaVersion: 1,
            executionId: entry.id,
            tenantId,
            projectId: providerAuthority.state === 'ready'
              ? providerAuthority.projectId
              : null,
            reasonCode,
            authorityEvidenceRefs: [providerAuthority.authorityEvidenceRef],
            heldAt: new Date().toISOString(),
          },
        };
      },
      runTask: (ctx) => runTaskMode({
        description: ctx.description,
        model: ctx.model as ModelType | undefined,
        provider: ctx.provider,
        scope: ctx.scope,
        projectRoot: ctx.projectRoot ?? projectRoot,
        autoApprove: true,
        providerAuthority,
        ...(approvalAuthority.state === 'ready'
          ? {
              attendedExecutionApprovalAuthority:
                approvalAuthority.runtime.attendedExecutionApprovalAuthority,
            }
          : {}),
      }, taskConfig),
      runSprint: (root) => runSprintLifecycle(root, sprintConfig, {
        providerAuthority,
        ...(approvalAuthority.state === 'ready'
          ? {
              attendedExecutionApprovalAuthority:
                approvalAuthority.runtime.attendedExecutionApprovalAuthority,
            }
          : {}),
      }),
      waitForResult: waitForRunResult,
      close: closeAuthorities,
    });
  } catch (error) {
    closeAuthorities();
    throw error;
  }
}
