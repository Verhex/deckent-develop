import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

const output = vi.hoisted(() => ({ print: vi.fn(), printError: vi.fn() }));
const approvalRuntime = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../../src/cli/helpers/output.js', () => output);
vi.mock('../../src/cli/helpers/messages.js', () => ({
  getLanguage: () => 'en', getMessage: (key: string) => key,
}));
vi.mock('../../src/core/approval-authority-runtime.js', () => ({
  openApprovalAuthorityRuntime: approvalRuntime.open,
}));

import {
  openReconciliationApprovalRuntime,
  providerObservationJson,
  registerProviderObservations,
  type ProviderObservationMigrationProjection,
  type ProviderObservationReconciliationProjection,
} from '../../src/cli/commands/provider-observations.js';
import { ProviderExecutionObservationReconciliationApprovalError } from '../../src/core/provider-execution-observation-reconciliation-approval.js';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const ROOT = '/tmp/private-reconciliation-project';

function reconciliationProjection(mode: ProviderObservationReconciliationProjection['mode']): ProviderObservationReconciliationProjection {
  return {
    operation: 'reconcile', mode,
    inspection: {
      version: 1, projectRoot: ROOT, relativeDatabasePath: '.deckent/provider-execution-observations.db',
      activeOpenCount: 3, activeOpenIntervals: [],
      databaseLineage: {
        state: 'current', sourceSchemaVersion: 2, targetSchemaVersion: 2,
        schemaDigest: DIGEST_A, rowLineageDigest: DIGEST_B, rowCount: 3, databaseBytes: 512,
      },
    },
    plan: {
      version: 1, projectRoot: ROOT, relativeDatabasePath: '.deckent/provider-execution-observations.db',
      canonicalRunId: '', runFilter: null, runIds: ['run-one', 'run-two'], databaseSchemaDigest: DIGEST_A,
      databaseLineageDigest: DIGEST_B, activeOpenCount: 3, candidates: [], planDigest: DIGEST_C,
    },
  };
}

function migrationInspection(): ProviderObservationMigrationProjection {
  return {
    operation: 'migration', mode: 'inspect',
    inspection: {
      state: 'current', sourceSchemaVersion: 2, targetSchemaVersion: 2, schemaDigest: DIGEST_A,
      rowLineageDigest: DIGEST_B, rowCount: 0, databaseBytes: 0,
    },
  };
}

afterEach(() => { vi.clearAllMocks(); process.exitCode = undefined; });

describe('provider observations reconciliation CLI', () => {
  it('opens terminal approval authority without requiring API OIDC composition', () => {
    const opened = { state: 'hold', reasonCode: 'test-hold', detailCode: 'test', authorityEvidenceRef: null };
    approvalRuntime.open.mockReturnValue(opened);
    const config = {
      approval: {
        authority: {
          enabled: true,
          tenant_id: 'main',
          terminal: { max_auth_age_seconds: 300 },
          decision_window_seconds: 3600,
        },
      },
      // Deliberately no api_oidc: local-terminal is an independent live-auth channel.
      api_oidc: undefined,
    } as never;

    expect(openReconciliationApprovalRuntime(ROOT, config)).toBe(opened);
    expect(approvalRuntime.open).toHaveBeenCalledWith({
      projectRoot: ROOT,
      tenantId: 'main',
    });
  });

  it('keeps inspect explicit and defaults reconcile to an all-eligible dry-run batch without a manual run ID', async () => {
    const inspect = vi.fn(async () => migrationInspection());
    const reconcile = vi.fn(async () => reconciliationProjection('dry-run'));
    const program = new Command().exitOverride();
    registerProviderObservations(program, { resolveProjectRootFn: () => ROOT, inspect, reconcile });

    await program.parseAsync(['node', 'deckent', 'provider-observations', 'inspect', '--json']);
    expect(inspect).toHaveBeenCalledWith(ROOT, expect.not.objectContaining({ apply: true }));
    await program.parseAsync(['node', 'deckent', 'provider-observations', 'reconcile', '--json']);
    expect(reconcile).toHaveBeenLastCalledWith(ROOT, expect.not.objectContaining({ apply: true, runId: expect.anything() }));
    expect(JSON.parse(output.print.mock.calls.at(-1)?.[0] as string)).toMatchObject({
      mode: 'dry-run', operation: 'reconcile', plan: { runCount: 2, candidateCount: 0, holdCount: 3 },
    });
  });

  it('collects repeatable optional run filters and forwards one digest plus one approval ID for apply and replay', async () => {
    const reconcile = vi.fn(async (_root: string, options: { readonly apply?: boolean; readonly approvalId?: string }) =>
      reconciliationProjection(options.approvalId === 'apr-replay' ? 'replay' : options.apply ? 'applied' : 'dry-run'));
    const program = new Command().exitOverride();
    registerProviderObservations(program, { resolveProjectRootFn: () => ROOT, reconcile });

    await program.parseAsync([
      'node', 'deckent', 'provider-observations', 'reconcile', '--run-id', 'run-two', '--run-id', 'run-one',
      '--apply', '--plan-digest', DIGEST_C, '--approval-id', 'apr-apply', '--json',
    ]);
    expect(reconcile).toHaveBeenLastCalledWith(ROOT, expect.objectContaining({
      apply: true, approvalId: 'apr-apply', planDigest: DIGEST_C, runId: ['run-two', 'run-one'],
    }));

    await program.parseAsync([
      'node', 'deckent', 'provider-observations', 'reconcile', '--apply', '--plan-digest', DIGEST_C,
      '--approval-id', 'apr-replay', '--json',
    ]);
    expect(reconcile).toHaveBeenLastCalledWith(ROOT, expect.objectContaining({
      apply: true, approvalId: 'apr-replay', planDigest: DIGEST_C,
    }));
    expect(JSON.parse(output.print.mock.calls.at(-1)?.[0] as string)).toMatchObject({ mode: 'replay', operation: 'reconcile' });
  });

  it('renders stable redacted JSON with only run, candidate, and HOLD aggregates', () => {
    const first = providerObservationJson(reconciliationProjection('dry-run'), ROOT);
    expect(first).toBe(providerObservationJson(reconciliationProjection('dry-run'), ROOT));
    expect(JSON.parse(first)).toEqual(expect.objectContaining({
      mode: 'dry-run', operation: 'reconcile',
      inspection: { activeOpenCount: 3, databaseLineageDigest: DIGEST_B, databaseSchemaDigest: DIGEST_A },
      plan: { runCount: 2, candidateCount: 0, holdCount: 3, planDigest: DIGEST_C },
    }));
    expect(first).not.toContain(ROOT);
    expect(first).not.toContain('run-one');
    expect(first).not.toContain('provider-execution-observations.db');
  });

  it('turns typed reconciliation failures into a redacted, non-mutating HOLD', async () => {
    const reconcile = vi.fn(async () => {
      throw new ProviderExecutionObservationReconciliationApprovalError('REQUEST_NOT_FOUND', 'private identity must not render');
    });
    const program = new Command().exitOverride();
    registerProviderObservations(program, { resolveProjectRootFn: () => ROOT, reconcile });

    await program.parseAsync(['node', 'deckent', 'provider-observations', 'reconcile', '--json']);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output.print.mock.calls.at(-1)?.[0] as string)).toEqual({
      mode: 'hold', operation: 'reconcile', reasonCode: 'REQUEST_NOT_FOUND',
    });
    expect(output.print.mock.calls.at(-1)?.[0]).not.toContain('private identity');
    expect(process.exitCode).toBe(1);
  });
});
