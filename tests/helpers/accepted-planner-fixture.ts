import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/core/audit-writer.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import type { PlannerResult } from '../../src/core/types.js';
import type { PlannerCallResult } from '../../src/orchestra/planner.js';

export interface AcceptedPlannerFixtureReceiptContext {
  readonly tenantId: string;
  readonly projectRoot: string;
  readonly runId: string;
  readonly configuredProvider?: string | null;
  readonly configuredModel?: string | null;
}

/**
 * Produces a successful planner boundary result backed by the same public,
 * append-only receipt store that production consumers verify. `data` is the
 * exact normalized value returned to the consumer and bound into evidence.
 */
export function acceptedPlannerFixture(
  data: PlannerResult,
  receiptContext: AcceptedPlannerFixtureReceiptContext,
): PlannerCallResult {
  const store = new InvocationReceiptStore(receiptContext.projectRoot);
  try {
    const invocationId = `fixture-${createHash('sha256')
      .update(`${receiptContext.tenantId}\0${receiptContext.runId}`)
      .digest('hex')
      .slice(0, 24)}`;
    const provider = receiptContext.configuredProvider ?? 'codex';
    const model = receiptContext.configuredModel ?? 'gpt-5.6-sol';
    const receipt = {
      schemaVersion: 1 as const,
      invocationId,
      idempotencyKey: invocationId,
      tenantId: receiptContext.tenantId,
      projectId: store.projectId,
      runId: receiptContext.runId,
      taskId: null,
      callId: `${invocationId}:call`,
      role: 'brain' as const,
      purpose: 'sprint-planning' as const,
      configured: { provider, model, source: 'config' as const, reasonCode: 'none' as const },
      requested: { provider, model, source: 'config' as const, reasonCode: 'none' as const },
      resolved: { provider, model, source: 'router' as const, reasonCode: 'none' as const },
      called: { provider, model, source: 'wire' as const, reasonCode: 'none' as const },
      backend: { transport: 'cli' as const, executionBackend: 'host-subprocess' as const },
      auth: { mode: 'subscription' as const, accountRefHash: null },
      fallbackChain: [],
      reachability: { state: 'known' as const, evidenceRef: 'fixture:reachability' },
      limits: { state: 'known' as const, evidenceRefs: ['fixture:limits'] },
      createdAt: '2026-09-08T00:00:00.000Z',
    };
    const declaration = store.declare(receipt);
    if (declaration.created) {
      store.append(declaration.ref, invocationId, {
        eventId: `${invocationId}:dispatch`,
        type: 'dispatch_started',
        payload: { attempt: 1, calledProvider: provider, calledModel: model },
      });
      store.append(declaration.ref, invocationId, {
        eventId: `${invocationId}:transport`,
        type: 'transport_settled',
        payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 1 },
      });
      store.append(declaration.ref, invocationId, {
        eventId: `${invocationId}:consumer`,
        type: 'consumer_settled',
        payload: {
          outcome: 'accepted',
          reasonCode: 'none',
          evidenceRefs: [
            `planner-result:sha256:${createHash('sha256').update(canonicalJson(data)).digest('hex')}`,
          ],
        },
      });
    }
    return { ok: true, data, receiptRef: declaration.ref };
  } finally {
    store.close();
  }
}
