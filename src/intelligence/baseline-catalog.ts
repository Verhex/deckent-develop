import type { CapabilityEntry, CapabilityStatus, EvidenceRefs } from './types.js';

/**
 * Placeholder digest for an entry that has not been through `deriveBaseline`.
 * Consumers must treat it as "not yet measured", never as a content claim.
 * Declared before the catalog because the catalog initializes at module load.
 */
export const UNDERIVED_DIGEST = 'sha256:underived' as const;

/**
 * Canonical capability fields for the current-truth baseline.
 *
 * This module is deliberately inert: importing it performs no filesystem or
 * network I/O. Each entry declares the exact implementation paths that count as
 * its evidence — a brief or a plan document is never evidence for a capability,
 * because the question this catalog answers is "what does the code do today".
 *
 * Status discipline (honest by construction):
 * - `LIVE_PROVEN` is reserved for fields observed running end-to-end, and the
 *   note names the observation.
 * - `WIRED_UNPROVEN` means the implementation is present and reachable from a
 *   production entrypoint, but this catalog carries no live-run observation.
 * - A field whose evidence cannot be read at derivation time becomes `HOLD`
 *   through the deriver, never through an authored guess.
 */
export const BASELINE_CATALOG = [
  entry('lifecycle', 'Goal/Mission/Flow/Run/WorkItem/Attempt/Operation', 'LIVE_PROVEN',
    ['src/orchestra/sprint-controller.ts', 'src/core/run-flow-store.ts'],
    'Observed end-to-end: run-flow consumption through terminal settlement.'),
  entry('brain', 'Brain', 'WIRED_UNPROVEN', ['src/orchestra/brain.ts'],
    'Orchestrator entrypoint present; no live-run observation recorded here.'),
  entry('worker-self-assessment', 'worker self-assessment', 'LIVE_PROVEN',
    ['src/agents/worker.ts', 'src/core/task-result-schema.ts'],
    'Observed: workers emitted honest DONE and NO_GO self-assessments under the schema.'),
  entry('auditor', 'Auditor', 'WIRED_UNPROVEN', ['src/monitor/auditor.ts'],
    'Scan loop present; no live-run observation recorded here.'),
  entry('nervous', 'Nervous', 'WIRED_UNPROVEN',
    ['src/nervous/dispatcher.ts', 'src/nervous/decision-engine.ts'],
    'Proactive meta-orchestrator present; default enablement is config-resolved.'),
  entry('approval-broker-hitl', 'ApprovalBroker-HITL', 'WIRED_UNPROVEN',
    ['src/core/approval-broker.ts'],
    'Broker present; decisions are gated behind an interactive terminal surface.'),
  entry('normative-verdicts', 'normative verdicts', 'LIVE_PROVEN',
    ['src/orchestra/result-evaluator.ts'],
    'Observed: evaluation routed honest NO_GO into the repair pipeline.'),
  entry('dependency-dispatch', 'dependency dispatch', 'LIVE_PROVEN',
    ['src/orchestra/sprint-phases.ts', 'src/core/task-lineage.ts'],
    'Observed: dependency waves dispatched in declared order.'),
  entry('collision-control', 'collision control', 'WIRED_UNPROVEN',
    ['src/core/execution-write-scope-policy.ts'],
    'Write-scope policy present; enforcement mode is config-resolved.'),
  entry('fix-retry-recovery', 'FIX/retry/recovery', 'LIVE_PROVEN',
    ['src/orchestra/debt-manager.ts', 'src/orchestra/repair-queue-authority.ts'],
    'Observed: admitted repairs entered the durable queue and were dispatched.'),
  entry('checkpoints', 'checkpoints', 'WIRED_UNPROVEN',
    ['src/orchestra/sprint-checkpoint.ts'],
    'Structured checkpoint writer present.'),
  entry('settlement', 'settlement', 'LIVE_PROVEN', ['src/orchestra/sprint-finalizer.ts'],
    'Observed: terminal settlement published a receipt-backed outcome.'),
  entry('evidence-receipts', 'evidence/receipts', 'LIVE_PROVEN',
    ['src/orchestra/sprint-terminal-evidence.ts'],
    'Observed: terminal evidence and receipts written at settlement.'),
  entry('xverify-cross-provider', 'XVerify/cross-provider', 'LIVE_PROVEN',
    ['src/orchestra/cross-verify-invocation-coordinator.ts'],
    'Observed: a different-provider verification returned a terminally settled verdict.'),
  entry('routing-provider-authority', 'routing/provider authority', 'WIRED_UNPROVEN',
    ['src/orchestra/task-router.ts', 'src/core/model-registry.ts'],
    'Routing and registry present; owner activation policy governs the pool.'),
  entry('budgets-landing', 'budgets/landing', 'WIRED_UNPROVEN',
    ['src/core/provider-limit-admission.ts'],
    'Admission surface present; numeric threshold policy is owner-supplied.'),
  entry('backends-isolation', 'backends/isolation', 'LIVE_PROVEN',
    ['src/orchestra/spawn-backend.ts', 'src/orchestra/spawn-backend-docker.ts'],
    'Observed: container-isolated workers spawned and settled.'),
  entry('surfaces', 'MCP/API/CLI/Terminal/Desktop', 'LIVE_PARTIAL',
    ['src/cli/index.ts', 'src/mcp/server.ts', 'src/api/server.ts'],
    'CLI observed live; MCP and API surfaces present without an observation here.'),
  entry('connectors', 'connectors', 'WIRED_UNPROVEN', ['src/connectors/base-connector.ts'],
    'Adapter base present; individual channels are config-enabled.'),
  entry('process', 'process', 'WIRED_UNPROVEN', ['src/cli/commands/process.ts'],
    'Process surface present.'),
  entry('autonomous', 'autonomous', 'WIRED_UNPROVEN',
    ['src/orchestra/autonomous/mission-store/mission-scheduler.ts'],
    'Mission scheduling present; live admission is kind-scoped.'),
  entry('memory', 'memory', 'WIRED_UNPROVEN', ['src/core/memory-store.ts'],
    'Product memory store present. Deckent-dev dogfood authority is a separate surface.'),
  entry('agents', 'agents', 'WIRED_UNPROVEN', ['src/core/agent-pool.ts'],
    'Agent pool present.'),
  entry('skills', 'skills', 'WIRED_UNPROVEN', ['src/core/skill-pool.ts'],
    'Skill pool present.'),
  entry('capability-authority', 'capability authority', 'WIRED_UNPROVEN',
    ['src/core/capability-broker.ts'],
    'Capability broker present; handler admission is registry-gated.'),
  entry('reactive-notification', 'reactive/notification', 'WIRED_UNPROVEN',
    ['src/connectors/notification-delivery.ts'],
    'Delivery surface present; durable outbox wiring is tracked separately.'),
] as const satisfies readonly CapabilityEntry[];

function entry(
  capabilityId: string,
  domain: string,
  status: CapabilityStatus,
  evidenceRefs: EvidenceRefs,
  notes: string,
): CapabilityEntry {
  // The digest is a derivation-time property of the evidence contents, not an
  // authored constant: an authored digest would go stale the moment the code
  // moves. `deriveBaseline` computes it from the referenced files.
  return { capabilityId, domain, status, evidenceRefs, sourceDigest: UNDERIVED_DIGEST, notes };
}
