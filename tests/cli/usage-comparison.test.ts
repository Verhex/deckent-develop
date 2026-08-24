import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/cli/helpers/output.js', () => ({ print: vi.fn(), printError: vi.fn(), formatTable: vi.fn() }));
vi.mock('../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: vi.fn(() => '/project') }));

import { print } from '../../src/cli/helpers/output.js';
import { runUsageCommand, type UsageDeps } from '../../src/cli/commands/usage.js';
import type { PromptCostCanaryArchiveReadResult, PromptCostCanaryCohortSample } from '../../src/core/prompt-cost-canary-archive.js';

function sample(
  sprintId: string,
  input: number,
  cacheRead: number,
  usd: number | null,
  featureDigest = 'a'.repeat(64),
): PromptCostCanaryCohortSample {
  return { sprintId, logicalLineageId: 'logical-a', taskId: `${sprintId}-task`, attemptId: `${sprintId}-attempt`, attempt: 1,
    verdict: 'DONE', quality: 1, featureSnapshot: {
      excludeDynamicSystemPromptSections: true, workerCoreSystemPrompt: true,
      codexCoreChannel: true, codexSuppressProjectDoc: true, catalogMountMask: false,
    }, featureDigest, workloadDigest: 'c'.repeat(64),
    tokenUsage: { inputTokens: input, outputTokens: 5, cacheReadTokens: cacheRead, cacheCreationTokens: 0, totalTokens: input + cacheRead + 5 },
    provider: 'provider', model: 'model', billingSource: { tokenSource: 'provider', pricingSource: 'provider', billingMode: 'api', terminalBillingAuthority: 'metered' },
    providerReportedUsd: { available: usd !== null, usd, source: usd === null ? null : 'provider-envelope' }, durationMs: 100 };
}

function deps(samples: readonly PromptCostCanaryCohortSample[]): UsageDeps {
  const result: PromptCostCanaryArchiveReadResult = { ok: true, sprintIds: ['sprint-639', 'sprint-641'], samples };
  return { configFn: async () => ({ language: 'en' }), canaryArchiveFn: vi.fn(() => result), nowFn: () => '2026-08-24T00:00:00.000Z' };
}
function output(): Record<string, unknown> { return JSON.parse(vi.mocked(print).mock.calls[0]![0]) as Record<string, unknown>; }

describe('usage baseline/candidate canary', () => {
  beforeEach(() => vi.clearAllMocks());
  it('emits stable dry-run JSON with exact denominators, USD and parity and no raw identities or paths', async () => {
    await runUsageCommand({ baselineSprint: 'sprint-639', candidateSprint: 'sprint-641', json: true }, deps([sample('sprint-639', 60, 40, 2), sample('sprint-641', 20, 80, 1)]));
    const value = output();
    expect(value).toMatchObject({ schema: 'deckent.usage-canary', version: 1, mode: 'dry-run', decision: { disposition: 'PROMOTE', reasonCodes: ['thresholds_satisfied'] },
      measuredHitRatio: { denominator: 'inputTokens+cacheReadTokens+cacheCreationTokens', baseline: 0.4, candidate: 0.8, delta: 0.4 },
      providerReportedUsd: { baseline: { available: true, exactUsd: 2 }, candidate: { available: true, exactUsd: 1 }, delta: -1 },
      qualityParity: { baselinePassRate: 1, candidatePassRate: 1, delta: 0 }, receipt: null });
    expect(value['decisionDigest']).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(JSON.stringify(value)).not.toMatch(/attemptId|taskId|projectRelative|environmentKey|tenantKey/u);
  });
  it('holds with a bounded reason when exact provider USD is unavailable', async () => {
    await runUsageCommand({ baselineSprint: 'sprint-639', candidateSprint: 'sprint-641', json: true }, deps([sample('sprint-639', 60, 40, null), sample('sprint-641', 20, 80, 1)]));
    expect(output()).toMatchObject({ decision: { disposition: 'HOLD', reasonCodes: ['provider_reported_usd_unavailable'] }, providerReportedUsd: { baseline: { available: false, exactUsd: null }, delta: null } });
  });
  it('does not represent an empty or rejected archive cohort as provider-reported zero USD', async () => {
    const rejected: PromptCostCanaryArchiveReadResult = {
      ok: false,
      sprintIds: ['sprint-639', 'sprint-641'],
      reasonCodes: ['archive_integrity_invalid'],
    };
    await runUsageCommand(
      { baselineSprint: 'sprint-639', candidateSprint: 'sprint-641', json: true },
      { configFn: async () => ({ language: 'en' }), canaryArchiveFn: vi.fn(() => rejected) },
    );
    expect(output()).toMatchObject({
      decision: { disposition: 'HOLD', reasonCodes: ['archive_evidence_rejected'] },
      providerReportedUsd: {
        baseline: { available: false, sampleCount: 0, availableSampleCount: 0, exactUsd: null },
        candidate: { available: false, sampleCount: 0, availableSampleCount: 0, exactUsd: null },
        delta: null,
      },
    });
  });
  it('binds an intentional baseline/candidate feature toggle without treating A/B as incomparable', async () => {
    await runUsageCommand({ baselineSprint: 'sprint-639', candidateSprint: 'sprint-641', json: true }, deps([
      sample('sprint-639', 60, 40, 2, 'a'.repeat(64)),
      sample('sprint-641', 20, 80, 1, 'b'.repeat(64)),
    ]));
    expect(output()).toMatchObject({
      decision: { disposition: 'PROMOTE', reasonCodes: ['thresholds_satisfied'] },
    });
  });
  it('requires the dry-run digest for apply and publishes only an opaque receipt projection', async () => {
    const injected = deps([sample('sprint-639', 60, 40, 2), sample('sprint-641', 20, 80, 1)]);
    await runUsageCommand({ baselineSprint: 'sprint-639', candidateSprint: 'sprint-641', json: true }, injected);
    const digest = (output() as Record<string, string>)['decisionDigest']!; vi.clearAllMocks();
    const publish = vi.fn(() => ({ state: 'created' as const, receipt: { receiptId: `sha256:${'a'.repeat(64)}`, decisionDigest: digest }, projectRelativeReceiptPath: '.deckent/secret.json' } as PublishResult));
    type PublishResult = ReturnType<NonNullable<UsageDeps['canaryPublishFn']>>;
    await runUsageCommand({ baselineSprint: 'sprint-639', candidateSprint: 'sprint-641', json: true, apply: true, decisionDigest: digest, environment: 'prod', tenant: 'tenant-a' }, { ...injected, canaryPublishFn: publish });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ environmentId: 'prod', tenantId: 'tenant-a' }));
    expect(output()).toMatchObject({ mode: 'applied', receipt: { state: 'created', receiptId: `sha256:${'a'.repeat(64)}`, decisionDigest: digest } });
    expect(JSON.stringify(output())).not.toContain('secret.json');
  });
  it('validates paired and mutually exclusive comparison options and rejects unbound apply', async () => {
    const injected = deps([]);
    await expect(runUsageCommand({ baselineSprint: 'sprint-639' }, injected)).rejects.toThrow(/Both/u);
    await expect(runUsageCommand({ baselineSprint: 'sprint-639', candidateSprint: 'sprint-641', sprint: '639' }, injected)).rejects.toThrow(/cannot be combined/u);
    await expect(runUsageCommand({ baselineSprint: 'sprint-639', candidateSprint: 'sprint-641', apply: true }, injected)).rejects.toThrow(/decision-digest/u);
  });
});
