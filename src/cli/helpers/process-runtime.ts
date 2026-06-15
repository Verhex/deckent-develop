// src/cli/helpers/process-runtime.ts
// ═══ Process Mode runtime wiring — builds a live ProcessController ════════════
// The heavy DI assembly (real runTaskMode / runSprint closures with style-scoped
// configs, waitForRunResult, an audited capability registry) shared by the REST
// endpoint (api/process-endpoint) and the MCP tool (mcp/tools/process), so neither
// duplicates it. Lives in cli/ (the layer allowed to import run.ts + the runners),
// mirroring how autonomous.ts handleStart wires buildEngineRuntime.

import { join } from 'node:path';
import { loadConfig } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import { createAuditedCapabilityRegistry } from '../../core/capability-runtime.js';
import { buildErpConnectorFromConfig } from '../../core/erp/index.js';
import { writeAuditEvent } from '../../core/audit-writer.js';
import { runTaskMode } from '../../orchestra/task-mode-runner.js';
import { runSprint as runSprintLifecycle } from '../../orchestra/sprint-controller.js';
import { makeProcessController, type ProcessController } from '../../orchestra/process-controller.js';
import { waitForRunResult } from '../commands/run.js';
import type { ModelType } from '../../core/types.js';

/**
 * Assemble a live ProcessController for `projectRoot`. Wires the same execution
 * primitives the autonomous engine uses:
 *   - kind=task     → runTaskMode (style-scoped 'task' config, autoApprove)
 *   - kind=sprint   → runSprint  (style-scoped 'sprint' config)
 *   - kind=capability → audited capability registry (ERP/db/mail handlers; every
 *     invocation lands on the ENT-3 audit hash-chain — the training-data trail)
 * Providers are bootstrapped (idempotent) so ollama/host adapters resolve.
 */
export async function buildProcessController(projectRoot: string): Promise<ProcessController> {
  const config = await loadConfig(projectRoot);
  await bootstrapProviders(config);

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

  return makeProcessController({
    projectRoot,
    config,
    backlogPath,
    capabilityRegistry,
    runTask: (ctx) => runTaskMode({
      description: ctx.description,
      model: ctx.model as ModelType | undefined,
      provider: ctx.provider,
      scope: ctx.scope,
      projectRoot: ctx.projectRoot ?? projectRoot,
      autoApprove: true,
    }, taskConfig),
    runSprint: (root) => runSprintLifecycle(root, sprintConfig),
    waitForResult: waitForRunResult,
  });
}
