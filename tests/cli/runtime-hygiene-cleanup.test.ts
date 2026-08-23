import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type {
  RuntimeHygieneApplyResult,
  RuntimeHygieneFamily,
  RuntimeHygienePlan,
} from '../../src/core/runtime-hygiene.js';

const families = ['recent-work', 'jobs', 'evaluations', 'run-flows', 'logs'] as const satisfies
  readonly RuntimeHygieneFamily[];

function counters() {
  return Object.fromEntries(families.map((family, index) => [family, {
    inventoryCount: index + 1,
    inventoryBytes: (index + 1) * 10,
    candidateCount: index === 4 ? 1 : 0,
    candidateBytes: index === 4 ? 50 : 0,
  }])) as RuntimeHygienePlan['counters'];
}

function plan(): RuntimeHygienePlan {
  return {
    version: 1,
    projectRoot: '/project/private',
    plannedAt: '2026-08-23T00:00:00.000Z',
    planDigest: 'a'.repeat(64),
    maxInventoryEntries: 10_000,
    maxApplyItems: 10_000,
    receiptRoot: '.deckent/archive/runtime-hygiene/receipts',
    counters: counters(),
    authority: [{ source: '.deckent/private.log', bytes: 50, sha256: 'b'.repeat(64) }],
    recentWork: [],
    evaluations: [],
    runFlows: { options: { now: new Date('2026-08-23T00:00:00.000Z') }, sources: [] },
    logs: {},
  } as unknown as RuntimeHygienePlan;
}

function applied(): RuntimeHygieneApplyResult {
  return {
    receiptPath: '.deckent/archive/runtime-hygiene/receipts/private.json',
    receiptState: 'published',
    receipt: {
      kind: 'deckent.runtime-hygiene-receipt',
      version: 1,
      planDigest: 'a'.repeat(64),
      status: 'complete',
      counters: counters(),
      outcomes: families.map(family => ({
        family, attempted: family === 'logs' ? 1 : 0,
        retired: family === 'logs' ? 1 : 0,
        retiredBytes: family === 'logs' ? 50 : 0,
        failures: [],
      })),
    },
  };
}

vi.mock('../../src/core/runtime-hygiene.js', () => ({
  planRuntimeHygiene: vi.fn(() => plan()),
  applyRuntimeHygiene: vi.fn(() => applied()),
  readRuntimeHygieneReceipt: vi.fn((_root: string, digest: string) => {
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error('RUNTIME_HYGIENE_PLAN_DIGEST_INVALID');
    return null;
  }),
}));
vi.mock('../../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: vi.fn(() => ({
    schemaVersion: 1, lifecycle: 'IDLE', active: false, resumable: false,
    coordinator: 'absent', sprintId: null, status: null, phase: null,
  })),
}));
vi.mock('../../src/core/sprint-terminal-publication-status.js', () => ({
  projectTerminalPublicationStatus: vi.fn(() => ({ state: 'not-terminal' })),
}));
vi.mock('../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: () => '/project/private' }));
vi.mock('../../src/cli/helpers/config-reader.js', () => ({ getLangFromConfig: () => 'en' }));
vi.mock('../../src/cli/helpers/messages.js', () => ({
  getLanguage: () => 'en',
  getMessage: (key: string, _lang: string, vars?: Readonly<Record<string, string>>) =>
    `${key}${vars ? ` ${JSON.stringify(vars)}` : ''}`,
}));
vi.mock('../../src/cli/helpers/output.js', () => ({ print: vi.fn(), printError: vi.fn() }));
vi.mock('../../src/orchestra/brain.js', () => ({ cleanup: vi.fn(), runDecay: vi.fn() }));
vi.mock('../../src/orchestra/spawn-backend-docker.js', () => ({
  archivePromptFiles: vi.fn(() => ({ archived: 0, cleaned: 0 })),
}));
vi.mock('../../src/orchestra/sprint-docs-updater.js', () => ({ cleanTasksArchive: vi.fn(() => 0) }));
vi.mock('../../src/core/sprint-file-retention.js', () => ({
  runRetention: vi.fn(() => ({ countersDeleted: [], forensicMoved: [], archived: [] })),
}));
vi.mock('../../src/orchestra/sprint-controller.js', () => ({ cleanupSprintMetadata: vi.fn() }));
vi.mock('../../src/core/run-status-read-model.js', () => ({ publishCanonicalRunStatusReadModel: vi.fn() }));
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn(() => ({ totalCount: () => 0, close: () => undefined })),
}));

import {
  applyRuntimeHygiene,
  planRuntimeHygiene,
  readRuntimeHygieneReceipt,
} from '../../src/core/runtime-hygiene.js';
import { readCanonicalRunStatus } from '../../src/core/run-status-authority.js';
import { cleanup } from '../../src/orchestra/brain.js';
import { registerCleanup } from '../../src/cli/commands/cleanup.js';

async function run(args: readonly string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerCleanup(program);
  await program.parseAsync(['node', 'test', ...args]);
}

describe('cleanup --history runtime-hygiene wiring', () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
    process.exitCode = undefined;
  });

  it('registers explicit preview, apply, CAS and JSON options', () => {
    const program = new Command();
    registerCleanup(program);
    const command = program.commands.find(item => item.name() === 'cleanup');
    expect(command?.options.map(option => option.long)).toEqual(expect.arrayContaining([
      '--history', '--dry-run', '--apply', '--plan-digest', '--json',
    ]));
  });

  it('defaults history cleanup to one path-free JSON plan and performs no mutation', async () => {
    await run(['cleanup', '--history', '--json']);

    expect(planRuntimeHygiene).toHaveBeenCalledTimes(1);
    expect(applyRuntimeHygiene).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledTimes(1);
    const projection = JSON.parse(String(stdout.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(projection).toMatchObject({
      version: 1, operation: 'runtime-hygiene', mode: 'plan',
      planDigest: 'a'.repeat(64),
      inventory: { families: 5, count: 15, bytes: 150 },
      candidates: { count: 1, bytes: 50 },
    });
    expect(JSON.stringify(projection)).not.toContain('/project/private');
    expect(JSON.stringify(projection)).not.toContain('.deckent/private.log');
  });

  it('requires an exact digest before calling the canonical apply service', async () => {
    await run(['cleanup', '--history', '--apply', '--json']);
    expect(readRuntimeHygieneReceipt).not.toHaveBeenCalled();
    expect(planRuntimeHygiene).not.toHaveBeenCalled();
    expect(applyRuntimeHygiene).not.toHaveBeenCalled();
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({
      mode: 'hold', reasonCode: 'PLAN_DIGEST_REQUIRED',
    });
    expect(process.exitCode).toBe(1);

    vi.clearAllMocks();
    process.exitCode = undefined;
    await run(['cleanup', '--history', '--apply', '--plan-digest', 'wrong', '--json']);
    expect(readRuntimeHygieneReceipt).toHaveBeenCalledWith('/project/private', 'wrong');
    expect(planRuntimeHygiene).not.toHaveBeenCalled();
    expect(applyRuntimeHygiene).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('never lets runtime-only switches fall through to destructive legacy cleanup', async () => {
    await run(['cleanup', '--apply', '--plan-digest', 'a'.repeat(64)]);
    expect(planRuntimeHygiene).not.toHaveBeenCalled();
    expect(applyRuntimeHygiene).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('applies only the freshly reproduced exact plan and emits one receipt projection', async () => {
    await run([
      'cleanup', '--history', '--apply', '--plan-digest', 'a'.repeat(64), '--json',
    ]);

    expect(applyRuntimeHygiene).toHaveBeenCalledTimes(1);
    expect(readRuntimeHygieneReceipt).toHaveBeenCalledWith('/project/private', 'a'.repeat(64));
    expect(applyRuntimeHygiene).toHaveBeenCalledWith(vi.mocked(planRuntimeHygiene).mock.results[0]?.value);
    expect(stdout).toHaveBeenCalledTimes(1);
    const projection = JSON.parse(String(stdout.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(projection).toMatchObject({ mode: 'apply', receipt: { state: 'published', status: 'complete' } });
    expect(JSON.stringify(projection)).not.toContain('receiptPath');
    expect(JSON.stringify(projection)).not.toContain('/project/private');
  });

  it('replays an existing immutable receipt without rebuilding the mutated live tree', async () => {
    vi.mocked(readRuntimeHygieneReceipt).mockReturnValueOnce({
      ...applied(), receiptState: 'existing',
    });

    await run([
      'cleanup', '--history', '--apply', '--plan-digest', 'a'.repeat(64), '--json',
    ]);

    expect(planRuntimeHygiene).not.toHaveBeenCalled();
    expect(applyRuntimeHygiene).not.toHaveBeenCalled();
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({
      mode: 'apply', planDigest: 'a'.repeat(64),
      receipt: { state: 'existing', status: 'complete' },
    });
  });

  it('refuses apply while terminal authority reports an active run', async () => {
    vi.mocked(readCanonicalRunStatus).mockReturnValueOnce({
      schemaVersion: 1, lifecycle: 'RUNNING', active: true, resumable: false,
      coordinator: 'alive', sprintId: 'sprint-625', status: 'RUNNING', phase: 'EXECUTING',
    });

    await run([
      'cleanup', '--history', '--apply', '--plan-digest', 'a'.repeat(64), '--json',
    ]);

    expect(planRuntimeHygiene).not.toHaveBeenCalled();
    expect(applyRuntimeHygiene).not.toHaveBeenCalled();
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({
      mode: 'hold', reasonCode: 'AUTHORITY_COORDINATOR_ACTIVE',
    });
    expect(process.exitCode).toBe(1);
  });
});
