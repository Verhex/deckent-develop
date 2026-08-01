import { describe, expect, it } from 'vitest';

import {
  aggregateLineageUsageAuthority,
  type LineageUsageAttempt,
} from '../../src/core/lineage-usage-authority.js';

function attempt(
  id: string,
  taskId: string,
  overrides: Partial<LineageUsageAttempt> = {},
): LineageUsageAttempt {
  return {
    id,
    taskId,
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 2,
    cacheCreationTokens: 1,
    referenceCostUsd: 0.25,
    ...overrides,
  };
}

describe('aggregateLineageUsageAuthority', () => {
  it('resolves dynamic FIX attempts through the original logical root and retains all usage', () => {
    const aggregates = aggregateLineageUsageAuthority({
      tasks: [{ id: 'root', billingAuthority: 'subscription' }],
      attempts: [
        attempt('attempt-root', 'root'),
        attempt('attempt-fix', 'root-fix', { fixForTaskId: 'root', referenceCostUsd: 0.5 }),
        attempt('attempt-fix-fix', 'root-fix-fix', {
          fixForTaskId: 'root-fix',
          inputTokens: 20,
          referenceCostUsd: 0.75,
        }),
      ],
    });

    expect(aggregates).toEqual([{
      logicalRootTaskId: 'root',
      billingAuthority: 'subscription',
      attempts: expect.arrayContaining([
        expect.objectContaining({ id: 'attempt-root' }),
        expect.objectContaining({ id: 'attempt-fix' }),
        expect.objectContaining({ id: 'attempt-fix-fix' }),
      ]),
      tokenUsage: {
        inputTokens: 40,
        outputTokens: 15,
        cacheReadTokens: 6,
        cacheCreationTokens: 3,
      },
      referenceCostUsd: 1.5,
      billedUsd: { state: 'known', usd: 0 },
    }]);
  });

  it.each(['local', 'free-tier'] as const)(
    'keeps %s executions at zero billed USD without discarding their reference cost',
    billingAuthority => {
      const [aggregate] = aggregateLineageUsageAuthority({
        tasks: [{ id: 'root', billingAuthority }],
        attempts: [attempt('attempt', 'root', {
          referenceCostUsd: 2.5,
          invoicedCostUsd: 9.5,
        })],
      });

      expect(aggregate).toMatchObject({
        referenceCostUsd: 2.5,
        billedUsd: { state: 'known', usd: 0 },
      });
    },
  );

  it('uses the metered invoice, never reference cost, and fails closed when it is absent', () => {
    const [invoiced] = aggregateLineageUsageAuthority({
      tasks: [{ id: 'root', billingAuthority: 'metered' }],
      attempts: [attempt('attempt', 'root', { referenceCostUsd: 99, invoicedCostUsd: 1.25 })],
    });
    const [missingInvoice] = aggregateLineageUsageAuthority({
      tasks: [{ id: 'root', billingAuthority: 'metered' }],
      attempts: [attempt('attempt', 'root', { referenceCostUsd: 99 })],
    });

    expect(invoiced).toMatchObject({
      referenceCostUsd: 99,
      billedUsd: { state: 'known', usd: 1.25 },
    });
    expect(missingInvoice.billedUsd).toEqual({ state: 'unknown', reason: 'missing-metered-invoice' });
  });

  it.each([
    ['unknown', 'unknown-billing-authority'],
    ['hybrid', 'hybrid-billing-authority'],
  ] as const)('keeps %s billing typed unknown', (billingAuthority, reason) => {
    const [aggregate] = aggregateLineageUsageAuthority({
      tasks: [{ id: 'root', billingAuthority }],
      attempts: [attempt('attempt', 'root')],
    });

    expect(aggregate.billedUsd).toEqual({ state: 'unknown', reason });
  });

  it('does not infer metered billing when the logical root is absent', () => {
    const [aggregate] = aggregateLineageUsageAuthority({
      tasks: [],
      attempts: [attempt('attempt-fix', 'dynamic-fix', { fixForTaskId: 'missing-root' })],
    });

    expect(aggregate).toMatchObject({
      logicalRootTaskId: 'missing-root',
      billingAuthority: null,
      billedUsd: { state: 'unknown', reason: 'missing-logical-root' },
    });
  });
});
