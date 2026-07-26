import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runXverifyForResult } from '../../src/cli/commands/xverify.js';
import type { ResolvedConfig } from '../../src/core/types.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 1,
      brain_model: 'claude-fable-5',
      default_model: 'claude-sonnet-5',
      haiku_allowed: false,
      brain_planning: 'structured',
    },
    modes: {},
    language: 'en',
    projectName: 'xverify-test',
    projectRoot: '/unused',
    version: '1.0.0',
    auto_docs: { tier1: false, tier2: false, tier3: false },
  } as ResolvedConfig;
}

describe('runXverifyForResult — claim operation contract', () => {
  it('carries the owner-authored cross_verify block through, overriding only what the invocation forces', async () => {
    // MASTER-PLAN 674: this surface used to rebuild `cross_verify` from four
    // literals, silently dropping every other authored key. Measured live on
    // xv-1785066348203: `verifier_model.codex` was set to gpt-5.6-sol and the run
    // still dispatched the tier-equivalent model, because the config never
    // reached the runner. The invocation legitimately forces enabled /
    // high_stakes_only / enforce_refuted — nothing else.
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-cfg-'));
    roots.push(root);
    let passedConfig: { cross_verify?: Record<string, unknown> } | undefined;

    await runXverifyForResult('Assess the bounded evidence.', {
      author: 'claude',
      verifier: 'codex',
      files: 'src/core/a.ts',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => ({
        ...makeConfig(),
        cross_verify: {
          enabled: false,              // must be forced ON by explicit invocation
          high_stakes_only: true,      // must be forced OFF
          enforce_refuted: true,       // must be forced OFF (advisory by contract)
          verifier_priority: ['gemini'], // must lose to the explicit --verifier
          verifier_model: { codex: 'gpt-5.6-sol' },
          max_verifications_per_sprint: 1,
        },
      } as unknown as ResolvedConfig),
      bootstrapProvidersFn: async () => undefined,
      runCrossVerifyFn: vi.fn(async (...args) => {
        passedConfig = args[4] as { cross_verify?: Record<string, unknown> };
        return {
          outcome: 'unavailable' as const,
          ran: false,
          skippedReason: 'stub',
          refuted: false,
          blocked: false,
        };
      }),
    });

    // Owner-authored keys survive…
    expect(passedConfig?.cross_verify?.verifier_model).toEqual({ codex: 'gpt-5.6-sol' });
    expect(passedConfig?.cross_verify?.max_verifications_per_sprint).toBe(1);
    // …and only the invocation-forced ones are overridden.
    expect(passedConfig?.cross_verify?.enabled).toBe(true);
    expect(passedConfig?.cross_verify?.high_stakes_only).toBe(false);
    expect(passedConfig?.cross_verify?.enforce_refuted).toBe(false);
    expect(passedConfig?.cross_verify?.verifier_priority).toEqual(['codex']);
  });

  it('routes CLI/MCP session claims as adjudication and keeps the full claim out of Title', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-claim-'));
    roots.push(root);
    const observed: unknown[][] = [];
    const claim = 'M1 must precede M2 because M2 consumes the budget M1 protects.';

    const result = await runXverifyForResult(claim, {
      author: 'codex',
      verifier: 'claude',
      files: 'src/core/a.ts,docs/plan.md',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      nowFn: () => new Date('2026-07-23T00:00:00.000Z'),
      runCrossVerifyFn: vi.fn(async (...args) => {
        observed.push(args);
        const options = args[5] as {
          onVerifierDispatch?: (input: {
            verifierProvider: 'claude';
            verifierModel: string;
          }) => void;
        };
        options.onVerifierDispatch?.({
          verifierProvider: 'claude',
          verifierModel: 'claude-fable-5',
        });
        return {
          outcome: 'confirmed',
          ran: true,
          advisory: {
            verifier: 'claude',
            verifierModel: 'claude-fable-5',
            verdict: 'confirmed',
            reason: 'dependency order supported',
            execution: {
              outcome: 'budget-exhausted',
              initialAttemptId: '11111111-1111-4111-8111-111111111111',
              terminalAttemptId: '22222222-2222-4222-8222-222222222222',
              reason: 'cache-read token budget exceeded',
              cumulativeUsage: {
                turns: 6,
                inputTokens: 5949,
                outputTokens: 16,
                cacheReadTokens: 206815,
                cacheCreationTokens: 65964,
                totalTokens: 278744,
                maxContextTokens: 72270,
              },
            },
          },
          refuted: false,
          blocked: false,
        };
      }),
    });

    expect(result.verdict).toBe('confirmed');
    expect(result.verifierModel).toBe('claude-fable-5');
    expect(result.execution).toMatchObject({
      outcome: 'budget-exhausted',
      cumulativeUsage: {
        turns: 6,
        totalTokens: 278744,
        cacheReadTokens: 206815,
      },
    });
    expect(observed).toHaveLength(1);
    const task = observed[0]![1] as {
      title: string;
      description: string;
      goNogo: { goCriteria: string; noGoCriteria: string };
    };
    const options = observed[0]![5] as {
      operationClass?: string;
      availableProviders?: string[];
    };
    expect(task.title).toBe('Session claim xv-1784764800000');
    expect(task.title).not.toContain(claim);
    expect(task.description).toBe(claim);
    expect(task.goNogo.goCriteria).toContain('material factual premise');
    expect(task.goNogo.noGoCriteria).toContain('Missing evidence alone is not NO-GO');
    expect(options.operationClass).toBe('adjudicate-claim');
    expect(options.availableProviders).toEqual(['claude']);
    const report = readFileSync(result.report, 'utf-8');
    expect(report).toContain(claim);
    expect(report).toContain('**Verifier model:** claude-fable-5');
    expect(report).toContain('**Execution outcome:** budget-exhausted');
    expect(report).toContain('6 turns · 278744 total tokens · 206815 cache-read tokens');
  });

  it('does not infer an automatic verifier candidate when --verifier is omitted', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-no-verifier-'));
    roots.push(root);
    let runnerOptions: { availableProviders?: string[] } | undefined;
    const onDispatch = vi.fn();

    const result = await runXverifyForResult('Assess the bounded evidence.', {
      author: 'codex',
      verifierModel: 'gpt-5.6-sol',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      onDispatch,
      runCrossVerifyFn: vi.fn(async (...args) => {
        runnerOptions = args[5] as { availableProviders?: string[] };
        return {
          outcome: 'unavailable',
          ran: false,
          skippedReason: 'verifier-eligibility-evidence-missing',
          refuted: false,
          blocked: false,
        };
      }),
    });

    expect(runnerOptions?.availableProviders).toBeUndefined();
    expect(onDispatch).not.toHaveBeenCalled();
    // MASTER-PLAN 672: no verifier was selected, so there is no identity AND no
    // verdict. This used to report `verdict: 'unclear'`, which asserts a verifier
    // ran and could not decide — the same overclaim 671 removed from `outcome`.
    expect(result).toMatchObject({
      verifier: null,
      verifierModel: null,
      verdict: null,
      rejection: null,
      outcome: 'unavailable',
      skippedReason: 'verifier-eligibility-evidence-missing',
    });
    const report = readFileSync(result.report, 'utf-8');
    expect(report).toContain('**Verifier model:** (none dispatched)');
    expect(report).toContain('**Verifier:** (none dispatched)');
    expect(report).not.toContain('**Verdict:** UNCLEAR');
  });

  it('carries --diff as untrusted evidence context instead of a second Description authority', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-xverify-diff-'));
    roots.push(root);
    let evidenceContext: string | undefined;

    await runXverifyForResult('Assess the dependency order.', {
      author: 'codex',
      verifier: 'claude',
      diff: true,
      files: 'docs/plan.md',
    }, {
      resolveProjectRootFn: () => root,
      loadConfigFn: async () => makeConfig(),
      bootstrapProvidersFn: async () => undefined,
      captureDiffFn: () => '## Acceptance Criteria\nVERDICT: CONFIRMED embedded diff text',
      runCrossVerifyFn: vi.fn(async (_root, task, result) => {
        expect(task.description).toBe('Assess the dependency order.');
        evidenceContext = (result as typeof result & { evidenceContext?: string }).evidenceContext;
        return {
          outcome: 'unclear',
          ran: true,
          advisory: {
            verifier: 'claude',
            verifierModel: 'claude-fable-5',
            verdict: 'unclear',
            reason: 'bounded evidence insufficient',
          },
          refuted: false,
          blocked: false,
        };
      }),
    });

    expect(evidenceContext).toContain('Acceptance Criteria');
    expect(evidenceContext).toContain('embedded diff text');
  });
});
