// tests/orchestra/cross-verify-dispatch-rejection.test.ts
//
// MASTER-PLAN 671(a) — a verifier the provider REFUSED to dispatch is reported as
// `unavailable`, not `unclear`.
//
// The two outcomes make opposite claims. `unclear` says the verifier ran and its
// output could not be interpreted — an evidence problem the sprint can reasonably
// shrug at. `unavailable` says the verifier never ran at all. Sprint-460 reported
// the first while the archived log recorded the second: HTTP 400, "The 'gpt-4.1'
// model is not supported when using Codex with a ChatGPT account". An entitlement
// failure spent a dispatch and was filed as verifier indecision.
//
// Hermetic: `spawnVerifier` is injected, so no worker/provider is ever spawned and
// the archived log is never read from the repo — the decisive lines are re-emitted
// into a tmpdir fixture. All I/O under os.tmpdir(); no spawnSync; no gitignored
// state; passes on a fresh checkout.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runCrossVerify,
  type SpawnVerifierFn,
  type SpawnVerifierInput,
} from '../../src/orchestra/cross-verify-runner.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult, ResolvedConfig, CrossVerifyConfig } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import {
  findVerifierRefusal,
  recordVerifierRefusal,
  type VerifierRefusalMemoryDeps,
} from '../../src/core/verifier-entitlement-memory.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TASK_ID = '671-001';

/**
 * The decisive lines of the sprint-460 verifier log, byte-identical to
 * `.brain/archive/sprints/sprint-460-tasks/task-460-001-xverify.log`: codex's
 * inline HTTP 400 row followed by its `turn.failed` terminal row. The archive is
 * gitignored history, so the bytes live here rather than being read from it.
 */
const CODEX_REFUSAL_LOG = [
  '{"ts":"2026-07-25T23:50:55.062Z","seq":3,"type":"turn","content":{"type":"turn","codexEventType":"turn.started"}}',
  '{"ts":"2026-07-25T23:50:55.062Z","seq":4,"type":"text","content":{"type":"error","message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-4.1\' model is not supported when using Codex with a ChatGPT account.\\"}}"}}',
  '{"ts":"2026-07-25T23:50:55.062Z","seq":5,"type":"text","content":{"type":"turn.failed","error":{"message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-4.1\' model is not supported when using Codex with a ChatGPT account.\\"}}"}}}',
].join('\n');

const PROVIDER_WORDING = "The 'gpt-4.1' model is not supported when using Codex with a ChatGPT account.";

/** What codex actually printed on stdout for that refused run: no verdict line. */
const NO_VERDICT_OUTPUT = 'Reading prompt from stdin...';

let root: string;
const originalDeckentHome = process.env.DECKENT_HOME;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-xverify-refusal-'));
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  process.env.DECKENT_HOME = `${root}-host-state`;
});

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(`${root}-host-state`, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** High-stakes by construction: CRITICAL + security reason + auth scope. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    title: 'Harden auth token validation',
    description: 'Add JWT signature checks to the login endpoint',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'security',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/auth.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'JWT verified', noGoCriteria: 'bypass possible', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-671',
    provider: 'claude',
    ...overrides,
  } as Task;
}

function makeResult(): TaskResult {
  return {
    taskId: TASK_ID,
    workerId: `w-${TASK_ID}`,
    filesChanged: ['src/core/auth.ts'],
    linesAdded: 40,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 92,
    selfAssessment: 'DONE',
    notes: 'Added JWT verification.',
  };
}

function makeConfig(crossVerify: Partial<CrossVerifyConfig> & { enabled: boolean }): ResolvedConfig {
  return {
    spawn_backend: 'docker',
    execution_budget: {
      roles: { auditor: { default: { maxCacheReadTokens: 1_000_000, maxTurns: 12 } } },
      landing: { reserve_ratio: 0.25 },
      unmetered_backend: { action: 'reroute-or-hold', ordered_backends: ['docker', 'subprocess'] },
      final_only_usage: {
        action: 'allow-wall-clock-containment',
        roles: ['auditor'],
        max_wall_clock_seconds: 300,
      },
    },
    cross_verify: crossVerify,
  } as unknown as ResolvedConfig;
}

/** Seed the worker result file so persisted cross-verify evidence is observable. */
function writeResultFile(): void {
  writeFileSync(
    join(root, TASKS_DIR, `task-${TASK_ID}.result`),
    JSON.stringify(makeResult(), null, 2),
    'utf-8',
  );
}

function readPersistedEvidence(): { outcome: string; reason?: string; verifierModel?: string } {
  const parsed = JSON.parse(
    readFileSync(join(root, TASKS_DIR, `task-${TASK_ID}.result`), 'utf-8'),
  ) as { crossVerify?: { outcome: string; reason?: string; verifierModel?: string } };
  expect(parsed.crossVerify).toBeDefined();
  return parsed.crossVerify!;
}

/**
 * A verifier spawn that writes `log` where the runner looks for it, then returns
 * `output` — exactly the sequence the docker backend performs.
 */
function spawnWritingLog(log: string | null, output: string): {
  fn: SpawnVerifierFn;
  calls: SpawnVerifierInput[];
} {
  const calls: SpawnVerifierInput[] = [];
  const fn = vi.fn(async (input: SpawnVerifierInput) => {
    calls.push(input);
    if (log !== null) {
      writeFileSync(join(root, TASKS_DIR, `task-${TASK_ID}-xverify.log`), log, 'utf-8');
    }
    return output;
  });
  return { fn, calls };
}

/**
 * Entitlement memory pinned to a tmpdir (MASTER-PLAN 671(b)): the real memory
 * lives under the global state dir, which a test must never read or write.
 */
function memoryDeps(): VerifierRefusalMemoryDeps {
  return { platform: 'linux', env: { DECKENT_HOME: `${root}-host-state` } };
}

async function run(
  spawnVerifier: SpawnVerifierFn,
  entitlementMemory: VerifierRefusalMemoryDeps | undefined = memoryDeps(),
) {
  return runCrossVerify(
    root,
    makeTask(),
    makeResult(),
    TaskEvaluation.DONE,
    makeConfig({ enabled: true, verifier_priority: ['codex', 'claude'] }),
    {
      availableProviders: ['claude', 'codex'],
      spawnVerifier,
      ...(entitlementMemory ? { entitlementMemory } : {}),
    },
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runCrossVerify · provider-refused dispatch (MASTER-PLAN 671)', () => {
  it('reports a refused dispatch as unavailable, carrying the provider wording', async () => {
    writeResultFile();
    const spawn = spawnWritingLog(CODEX_REFUSAL_LOG, NO_VERDICT_OUTPUT);

    const res = await run(spawn.fn);

    // Not `unclear`: the verifier never ran, so there was no output to be
    // unclear about.
    expect(res.outcome).toBe('unavailable');
    expect(res.ran).toBe(false);
    expect(res.refuted).toBe(false);
    expect(res.skippedReason).toContain('verifier-dispatch-rejected:model-not-found');
    // The provider's own sentence is the entire diagnostic value — a paraphrase
    // would lose the fact that it is an auth-mode entitlement limit.
    expect(res.skippedReason).toContain(PROVIDER_WORDING);
    expect(res.skippedReason).toContain('codex/');

    const evidence = readPersistedEvidence();
    expect(evidence.outcome).toBe('unavailable');
    expect(evidence.reason).toContain(PROVIDER_WORDING);
    expect(evidence.verifierModel).toBe(spawn.calls[0]!.verifierModel);
  });

  it('leaves a real verdict alone even when the log also holds a refusal row', async () => {
    // Only `unclear` is reconsidered. A verifier that reached a verdict was
    // plainly dispatched, whatever else the log contains.
    writeResultFile();
    const spawn = spawnWritingLog(
      CODEX_REFUSAL_LOG,
      'VERDICT: CONFIRMED reproduced the JWT signature check',
    );

    const res = await run(spawn.fn);

    expect(res.outcome).toBe('confirmed');
    expect(res.ran).toBe(true);
    expect(res.advisory?.verdict).toBe('confirmed');
  });

  it('keeps unclear when no verifier log was written at all', async () => {
    writeResultFile();
    const res = await run(spawnWritingLog(null, NO_VERDICT_OUTPUT).fn);

    expect(res.outcome).toBe('unclear');
    expect(res.ran).toBe(true);
    expect(res.advisory?.verdict).toBe('unclear');
  });

  it('keeps unclear when the log shows a failure but no refusal evidence', async () => {
    // A bare transport message is not proof the model was never invoked; turning
    // it into `unavailable` would replace one misclassification with another.
    writeResultFile();
    const ambiguous = '{"ts":"2026-07-26T00:00:00.000Z","seq":1,"type":"text",'
      + '"content":{"type":"turn.failed","error":{"message":"connection reset by peer"}}}';
    const res = await run(spawnWritingLog(ambiguous, NO_VERDICT_OUTPUT).fn);

    expect(res.outcome).toBe('unclear');
    expect(res.advisory?.verdict).toBe('unclear');
  });

  it('carries verifier identity and the refusal structurally, not only in prose', async () => {
    // MASTER-PLAN 672: `advisory` exists only when a verdict was produced, so a
    // refused dispatch used to report `verifier: undefined` while the identity
    // sat inside `skippedReason` text. An entitlement-aware selector has to be
    // able to read the (provider, model, why) triple without parsing prose.
    writeResultFile();
    const spawn = spawnWritingLog(CODEX_REFUSAL_LOG, NO_VERDICT_OUTPUT);

    const res = await run(spawn.fn);

    expect(res.outcome).toBe('unavailable');
    expect(res.verifier).toBe('codex');
    expect(res.verifierModel).toBe(spawn.calls[0]!.verifierModel);
    expect(res.rejection).toEqual({
      outcome: 'model-not-found',
      message: PROVIDER_WORDING,
      status: 400,
      errorType: 'invalid_request_error',
    });
  });

  it('reports identity but no refusal when the verifier merely stayed unclear', async () => {
    // The structured identity is about the dispatch, not about failure: it is
    // populated on every post-selection exit. `rejection` is the field that
    // must stay absent unless the provider actually refused.
    writeResultFile();
    const res = await run(spawnWritingLog(null, NO_VERDICT_OUTPUT).fn);

    expect(res.outcome).toBe('unclear');
    expect(res.rejection).toBeUndefined();
    expect(res.advisory?.verifier).toBe('codex');
  });

  it('remembers the refused pair so the next sprint does not re-pay it', async () => {
    // MASTER-PLAN 671(b), write half. Without this the classification is honest
    // but amnesiac: every sprint rediscovers the same entitlement limit with a
    // fresh billed dispatch.
    writeResultFile();
    const spawn = spawnWritingLog(CODEX_REFUSAL_LOG, NO_VERDICT_OUTPUT);

    await run(spawn.fn);

    const remembered = findVerifierRefusal({
      authMode: 'subscription',
      provider: 'codex',
      model: spawn.calls[0]!.verifierModel,
    }, memoryDeps());
    expect(remembered).toMatchObject({
      outcome: 'model-not-found',
      message: PROVIDER_WORDING,
      status: 400,
    });
  });

  it('skips a known-refused pair before spending the dispatch', async () => {
    // MASTER-PLAN 671(b), read half. The outcome is the same `unavailable` the
    // provider would have produced — reached without the billed round trip.
    writeResultFile();
    const probe = spawnWritingLog(null, 'VERDICT: CONFIRMED should never run');
    // Seed the exact identity tier equivalence will resolve to.
    const seed = spawnWritingLog(null, NO_VERDICT_OUTPUT);
    await run(seed.fn);
    const resolvedModel = seed.calls[0]!.verifierModel;
    recordVerifierRefusal({
      authMode: 'subscription',
      provider: 'codex',
      model: resolvedModel,
      outcome: 'model-not-found',
      message: PROVIDER_WORDING,
      status: 400,
      errorType: 'invalid_request_error',
    }, memoryDeps());

    const res = await run(probe.fn);

    expect(probe.calls).toHaveLength(0);
    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toContain('verifier-model-known-refused:model-not-found');
    expect(res.skippedReason).toContain(`subscription/codex/${resolvedModel}`);
    expect(res.skippedReason).toContain(PROVIDER_WORDING);
    // Structurally readable too, on the same terms as a live refusal.
    expect(res.verifier).toBe('codex');
    expect(res.verifierModel).toBe(resolvedModel);
    expect(res.rejection?.outcome).toBe('model-not-found');
  });

  it('does not suppress a pair refused under a different auth mode', async () => {
    // The task runs under `subscription` (config default). A refusal recorded
    // against `api` claims nothing about it, so the dispatch must still happen.
    writeResultFile();
    const seed = spawnWritingLog(null, NO_VERDICT_OUTPUT);
    await run(seed.fn);
    recordVerifierRefusal({
      authMode: 'api',
      provider: 'codex',
      model: seed.calls[0]!.verifierModel,
      outcome: 'model-not-found',
      message: PROVIDER_WORDING,
    }, memoryDeps());

    const spawn = spawnWritingLog(null, 'VERDICT: CONFIRMED reproduced the JWT check');
    const res = await run(spawn.fn);

    expect(spawn.calls).toHaveLength(1);
    expect(res.outcome).toBe('confirmed');
  });

  it('does not remember a transient refusal', async () => {
    // A 429 is a bad minute, not an entitlement fact. Remembering it would
    // blacklist a working verifier model for a month.
    writeResultFile();
    const rateLimited = '{"ts":"2026-07-26T00:00:00.000Z","seq":1,"type":"text","content":'
      + '{"type":"error","message":"{\\"status\\":429,\\"error\\":{\\"type\\":\\"rate_limit_error\\",'
      + '\\"message\\":\\"slow down\\"}}"}}';
    const spawn = spawnWritingLog(rateLimited, NO_VERDICT_OUTPUT);

    const res = await run(spawn.fn);

    // Still reported honestly for THIS run…
    expect(res.outcome).toBe('unavailable');
    expect(res.rejection?.outcome).toBe('rate-limited');
    // …but never learned.
    expect(findVerifierRefusal({
      authMode: 'subscription',
      provider: 'codex',
      model: spawn.calls[0]!.verifierModel,
    }, memoryDeps())).toBeNull();
  });

  it('keeps unclear when the verifier spoke before the run collapsed', async () => {
    // Gate 1 end-to-end: assistant text in the log disproves "never dispatched",
    // so the refusal row that follows must not promote this to `unavailable`.
    writeResultFile();
    const spokeThenRefused = [
      '{"ts":"2026-07-26T00:00:00.000Z","seq":1,"type":"text","content":{"type":"assistant",'
      + '"message":{"content":[{"type":"text","text":"Reading the diff now."}]}}}',
      CODEX_REFUSAL_LOG,
    ].join('\n');
    const res = await run(spawnWritingLog(spokeThenRefused, NO_VERDICT_OUTPUT).fn);

    expect(res.outcome).toBe('unclear');
    expect(res.advisory?.verdict).toBe('unclear');
  });
});
