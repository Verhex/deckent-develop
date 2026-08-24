import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

const output = vi.hoisted(() => ({ print: vi.fn(), printError: vi.fn() }));
vi.mock('../../src/cli/helpers/output.js', () => output);
vi.mock('../../src/cli/helpers/messages.js', () => ({
  getLanguage: () => 'en',
  getMessage: (key: string, _language: string, vars?: Readonly<Record<string, string>>) =>
    `${key}${vars ? `:${JSON.stringify(vars)}` : ''}`,
}));

import {
  providerObservationJson,
  registerProviderObservations,
  type ProviderObservationRuntimeAdoptionProjection,
} from '../../src/cli/commands/provider-observations.js';
import { createRuntimeAdoptionPlan } from '../../src/core/runtime-adoption.js';

const ROOT = '/tmp/private-runtime-owner';
const hex = (value: string): string => `sha256:${value.repeat(64).slice(0, 64)}`;

function projection(mode: ProviderObservationRuntimeAdoptionProjection['mode']): ProviderObservationRuntimeAdoptionProjection {
  const plan = createRuntimeAdoptionPlan({
    adoptionId: 'runtime-adoption-stable',
    providerObservationReceipt: {
      projectRelativePath: '.deckent/provider-observation-adoption/receipts/v1/a/b/c.json',
      receiptId: hex('a'), receiptDigest: hex('b'),
    },
    targetDatabase: {
      projectRelativePath: '.deckent/provider-execution-observations.db',
      databaseDigest: hex('c'), lineageDigest: hex('d'),
    },
    deckentBuild: { buildIdentityDigest: hex('e'), sourceTreeIdentityDigest: hex('f') },
    entrypoint: { projectRelativePath: 'dist/cli/entry.js', artifactDigest: hex('1') },
    liveRuntime: {
      runtimeId: 'runtime-stable', processId: 42, processStartIdentity: 's100',
      ownerIdentityDigest: hex('2'),
    },
    plannedAt: '1970-01-01T00:00:00.000Z',
  });
  return {
    operation: 'runtime-adoption', mode, plan,
    providerReceiptId: hex('a'),
    runtimeReceiptId: mode === 'dry-run' ? undefined : hex('3'),
    providerAdoption: {
      operation: 'adoption', mode: 'dry-run',
      inspection: {
        sourceSchemaVersion: 1, targetSchemaVersion: 2,
        sourceDatabaseDigest: '4'.repeat(64), targetDatabaseDigest: '5'.repeat(64),
        sourceRowLineageDigest: '6'.repeat(64), adoptedLegacyRowLineageDigest: '7'.repeat(64),
        sourceRowCount: 1, adoptedLegacyRowCount: 1, extraRunOwnedRows: [],
      },
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

describe('provider-observations adopt-runtime migration surface', () => {
  it('is dry-run by default and forwards explicit apply, preimage, digest, and stable JSON', async () => {
    const adoptRuntime = vi.fn(async (_root: string, options: { readonly apply?: boolean }) =>
      projection(options.apply ? 'persisted' : 'dry-run'));
    const program = new Command().exitOverride();
    registerProviderObservations(program, { resolveProjectRootFn: () => ROOT, adoptRuntime });

    await program.parseAsync([
      'node', 'deckent', 'provider-observations', 'adopt-runtime',
      '--preimage', '.deckent/preimage.db', '--json',
    ]);
    expect(adoptRuntime).toHaveBeenLastCalledWith(ROOT, expect.objectContaining({
      preimage: '.deckent/preimage.db', json: true,
    }));
    expect(adoptRuntime.mock.calls.at(-1)?.[1]).not.toHaveProperty('apply', true);
    const dryJson = output.print.mock.calls.at(-1)?.[0] as string;
    expect(dryJson).toBe(providerObservationJson(projection('dry-run'), ROOT));
    expect(JSON.parse(dryJson)).toEqual({
      mode: 'dry-run', operation: 'runtime-adoption',
      plan: { databaseMutation: 'none', planDigest: projection('dry-run').plan.planDigest.slice(7) },
      receipts: { providerReceiptId: hex('a'), runtimeReceiptId: null },
    });
    expect(dryJson).not.toContain(ROOT);
    expect(dryJson).not.toMatch(/processId|runtimeId|ownerIdentity|entrypoint|databasePath/u);

    await program.parseAsync([
      'node', 'deckent', 'provider-observations', 'adopt-runtime',
      '--preimage', '.deckent/preimage.db', '--apply', '--plan-digest', '9'.repeat(64), '--json',
    ]);
    expect(adoptRuntime).toHaveBeenLastCalledWith(ROOT, expect.objectContaining({
      apply: true, preimage: '.deckent/preimage.db', planDigest: '9'.repeat(64), json: true,
    }));
    expect(JSON.parse(output.print.mock.calls.at(-1)?.[0] as string)).toMatchObject({
      mode: 'persisted', operation: 'runtime-adoption',
      receipts: { providerReceiptId: hex('a'), runtimeReceiptId: hex('3') },
    });
  });

  it('renders only a bounded reason code when runtime adoption holds', async () => {
    const adoptRuntime = vi.fn(async () => {
      const error = new Error('/home/private-owner token-secret');
      Object.assign(error, { code: 'RUNTIME_OWNERSHIP_MISMATCH' });
      throw error;
    });
    const program = new Command().exitOverride();
    registerProviderObservations(program, { resolveProjectRootFn: () => ROOT, adoptRuntime });

    await program.parseAsync([
      'node', 'deckent', 'provider-observations', 'adopt-runtime',
      '--preimage', '.deckent/preimage.db', '--json',
    ]);
    expect(JSON.parse(output.print.mock.calls.at(-1)?.[0] as string)).toEqual({
      mode: 'hold', operation: 'runtime-adoption', reasonCode: 'RUNTIME_OWNERSHIP_MISMATCH',
    });
    expect(output.print.mock.calls.at(-1)?.[0]).not.toMatch(/private-owner|token-secret|\/home/u);
    expect(process.exitCode).toBe(1);
  });
});
