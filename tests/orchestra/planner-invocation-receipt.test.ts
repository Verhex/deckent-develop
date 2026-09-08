import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrainContext, ModelType, SprintSizeRecommendation } from '../../src/core/types.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import type {
  InvocationReceiptLedger,
  InvocationReceiptRef,
} from '../../src/core/invocation-receipt.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import {
  callBrainPlannerWithReason,
  callZeroConfigPlanner,
  callZeroConfigPlannerWithReason,
  type PlannerReceiptContext,
  type PlannerSpawnFn,
  type PlannerSpawnOutcome,
} from '../../src/orchestra/planner.js';
import { providerRegistry } from '../../src/core/provider.js';
import {
  ensureOpenRouterModelRegistered,
  modelRegistry,
} from '../../src/core/model-registry.js';
import { ModelActivationStore, resolveActiveModelPolicy } from '../../src/core/model-activation-store.js';
import { canonicalJson } from '../../src/core/audit-writer.js';

const roots: string[] = [];
const OPENROUTER_MODEL = 'deckent/api-identity-proof:free';
const validPlannerJSON = JSON.stringify({
  tasks: [{
    title: 'Receipt task',
    description: 'Prove receipt linkage',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'receipt proof',
    scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/receipt.md'] },
    dependencies: [],
    goNogo: { goCriteria: 'green', noGoCriteria: 'red', techDebtAcceptable: 'none' },
  }],
  reasoning: 'super-secret-response-marker',
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-planner-receipt-'));
  roots.push(root);
  return root;
}

function makeContext(): BrainContext {
  return {
    directives: 'super-secret-prompt-marker',
    memory: '', retro: '', debt: [], patterns: '', decisions: '', existingTasks: [],
    projectState: { gitStatus: '', fileTree: [] },
  };
}

const recommendation: SprintSizeRecommendation = {
  size: 'small', maxWorkers: 1, modelConstraint: null, reason: 'bounded',
};

function adapter(): ProviderAdapter {
  return {
    name: 'codex',
    supportedModels: ['gpt-5.5'] as readonly ModelType[],
    spawn: vi.fn(), kill: vi.fn(), listWorkers: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
    buildCommand: vi.fn(() => 'codex exec --model gpt-5.5'),
    buildPlannerCommand: (prompt) => ({
      command: 'codex',
      args: ['exec', prompt, '--model', 'gpt-5.5'],
      calledProvider: 'codex',
      calledModel: 'gpt-5.5',
      transport: 'cli',
      executionBackend: 'host-subprocess',
    }),
  };
}

function namedAdapter(name: string, model: ModelType, command: string): ProviderAdapter {
  return {
    name,
    supportedModels: [model],
    spawn: vi.fn(), kill: vi.fn(), listWorkers: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
    buildCommand: vi.fn(() => `${command} --model ${model}`),
    buildPlannerCommand: vi.fn((_prompt, requestedModel) => ({
      command,
      args: ['--model', requestedModel],
      calledProvider: name,
      calledModel: requestedModel,
      transport: 'cli',
      executionBackend: 'host-subprocess',
    })),
  };
}

function receiptContext(
  root: string,
  store: InvocationReceiptLedger,
  suffix = '1',
): PlannerReceiptContext {
  return {
    tenantId: 'tenant-a', projectRoot: root, runId: `sprint-${suffix}`,
    configuredProvider: 'codex', requestedProvider: 'codex',
    configuredModel: 'gpt-5.5', requestedModel: 'gpt-5.5',
    authMode: 'subscription', store,
  };
}

async function invoke(
  root: string,
  store: InvocationReceiptLedger,
  outcome: PlannerSpawnOutcome | (() => Promise<PlannerSpawnOutcome>),
  suffix = '1',
) {
  const spawn: PlannerSpawnFn = vi.fn(async () => (
    typeof outcome === 'function' ? outcome() : outcome
  ));
  const result = await callBrainPlannerWithReason(
    makeContext(), recommendation, 'gpt-5.5', 'receipt-project', adapter(), 1_000,
    undefined, spawn, receiptContext(root, store, suffix), {
      defaultModel: 'claude-sonnet-5',
      allowedModels: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    },
  );
  return { result, spawn };
}

afterEach(() => {
  providerRegistry.clear();
  modelRegistry.setActivationPolicy(undefined);
  modelRegistry.unregister(OPENROUTER_MODEL);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Brain planner InvocationReceipt boundary', () => {
  it('refuses a model-owner mismatch under the exact requested provider', async () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root);
    const modelOwner = namedAdapter('claude', 'claude-sonnet-5', 'claude-planner');
    const requested = namedAdapter('codex', 'gpt-5.5', 'codex-planner');
    providerRegistry.registerProvider(modelOwner, true);
    providerRegistry.registerProvider(requested);
    const spawn: PlannerSpawnFn = vi.fn(async () => ({
      status: 0, signal: null, stdout: validPlannerJSON, stderr: '',
    }));
    const context: PlannerReceiptContext = {
      tenantId: 'tenant-a', projectRoot: root, runId: 'zero-provider-authority',
      invocationId: 'inv-zero-provider-authority',
      configuredProvider: 'codex', requestedProvider: 'codex',
      configuredModel: 'claude-sonnet-5', requestedModel: 'claude-sonnet-5',
      authMode: 'subscription', store,
    };

    const result = await callZeroConfigPlanner(
      'plan with exact provider', 'claude-sonnet-5', 'receipt-project', [], undefined, 1_000, spawn, context,
    );

    expect(result).toBeNull();
    expect(requested.buildPlannerCommand).toHaveBeenCalled();
    expect(modelOwner.buildPlannerCommand).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    const scope = { tenantId: 'tenant-a', projectId: store.projectId };
    const view = store.get(scope, 'inv-zero-provider-authority');
    expect(view?.transportOutcome).toBe('not_dispatched');
    expect(view?.consumerOutcome).toBe('rejected');
    store.close();
  });

  it('preserves explicit adapter precedence over receipt provider authority', async () => {
    const explicit = namedAdapter('claude', 'claude-sonnet-5', 'explicit-planner');
    providerRegistry.registerProvider(namedAdapter('codex', 'gpt-5.5', 'codex-planner'), true);
    const failureObserver = vi.fn();
    const spawn: PlannerSpawnFn = vi.fn(async () => ({
      status: 0, signal: null, stdout: validPlannerJSON, stderr: '',
    }));

    const result = await callZeroConfigPlanner(
      'plan explicitly', 'claude-sonnet-5', 'receipt-project', [], explicit, 1_000, spawn, {
        tenantId: 'tenant-a', projectRoot: makeRoot(), runId: 'explicit-adapter',
        requestedProvider: 'codex', requestedModel: 'claude-sonnet-5',
      },
      undefined, undefined, failureObserver,
    );

    expect(failureObserver.mock.calls, `spawn calls: ${vi.mocked(spawn).mock.calls.length}`).toEqual([]);
    expect(result).not.toBeNull();
    expect(spawn).toHaveBeenCalledWith('explicit-planner', expect.any(Array), expect.any(Object));
  });

  it('does not fall back to the registry default when the requested provider is absent', async () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root);
    providerRegistry.registerProvider(namedAdapter('claude', 'claude-sonnet-5', 'default-planner'), true);
    const spawn: PlannerSpawnFn = vi.fn();

    const typed = await callZeroConfigPlannerWithReason(
      'plan without provider',
      'claude-sonnet-5',
      'receipt-project',
      [],
      undefined,
      1_000,
      spawn,
      {
        tenantId: 'tenant-a',
        projectRoot: root,
        runId: 'missing-provider-typed',
        invocationId: 'inv-missing-provider-typed',
        requestedProvider: 'codex',
        requestedModel: 'claude-sonnet-5',
        store,
      },
    );
    expect(typed).toMatchObject({
      ok: false,
      reason: 'no_providers',
      receiptRef: { invocationId: 'inv-missing-provider-typed' },
    });
    expect(store.get(typed.receiptRef!, 'inv-missing-provider-typed')).toMatchObject({
      transportOutcome: 'not_dispatched',
      consumerOutcome: 'rejected',
    });

    await expect(callZeroConfigPlanner(
      'plan without provider', 'claude-sonnet-5', 'receipt-project', [], undefined, 1_000, spawn, {
        tenantId: 'tenant-a', projectRoot: root, runId: 'missing-provider',
        requestedProvider: 'codex', requestedModel: 'claude-sonnet-5',
      },
    )).rejects.toThrow(/Provider not found: "codex"/);
    expect(spawn).not.toHaveBeenCalled();
    store.close();
  });

  it('keeps model-owner resolution for legacy zero-config callers without receipt context', async () => {
    providerRegistry.registerProvider(namedAdapter('codex', 'gpt-5.5', 'default-planner'), true);
    providerRegistry.registerProvider(namedAdapter('claude', 'claude-sonnet-5', 'model-owner-planner'));
    const spawn: PlannerSpawnFn = vi.fn(async () => ({
      status: 0, signal: null, stdout: validPlannerJSON, stderr: '',
    }));

    const result = await callZeroConfigPlanner(
      'legacy plan', 'claude-sonnet-5', 'receipt-project', [], undefined, 1_000, spawn,
    );

    expect(result).not.toBeNull();
    expect(spawn).toHaveBeenCalledWith('model-owner-planner', expect.any(Array), expect.any(Object));
  });

  it('persists zero-config planner calls and their schema retry as separate invocations', async () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root);
    const context: PlannerReceiptContext = {
      ...receiptContext(root, store, 'zero'),
      invocationId: 'inv-zero-config',
      idempotencyKey: 'zero-config-plan',
      callId: 'inv-zero-config:call-1',
    };
    const codexPlannerJSON = validPlannerJSON.replace('claude-sonnet-5', 'gpt-5.5');
    const spawn: PlannerSpawnFn = vi.fn()
      .mockResolvedValueOnce({ status: 0, signal: null, stdout: 'invalid-json', stderr: '' })
      .mockResolvedValueOnce({ status: 0, signal: null, stdout: codexPlannerJSON, stderr: '' });

    const result = await callZeroConfigPlannerWithReason(
      'plan a bounded change', 'gpt-5.5', 'receipt-project', [], adapter(), 1_000, spawn, context,
    );

    expect(result).toMatchObject({ ok:true, data:{ tasks:[{ model:'gpt-5.5' }] } });
    expect(spawn).toHaveBeenCalledTimes(2);
    const scope = { tenantId: 'tenant-a', projectId: store.projectId };
    expect(store.get(scope, 'inv-zero-config')?.consumerOutcome).toBe('rejected');
    const acceptedRetry = store.get(scope, 'inv-zero-config:schema-retry-2');
    expect(acceptedRetry?.consumerOutcome).toBe('accepted');
    if (!result.ok) throw new Error('expected accepted retry');
    expect(result.receiptRef?.invocationId).toBe('inv-zero-config:schema-retry-2');
    const expectedEvidence=`planner-result:sha256:${createHash('sha256').update(canonicalJson(result.data),'utf8').digest('hex')}`;
    expect(acceptedRetry?.events.find(event=>event.type==='consumer_settled')?.payload.evidenceRefs).toEqual([expectedEvidence]);
    store.close();
  });

  it('rejects an owner-inactive planner target before Brain or zero-config dispatch', async () => {
    const root=makeRoot();
    const activation=new ModelActivationStore(root,{now:()=> '2026-09-08T00:00:00.000Z'});
    activation.setProviderPolicy('codex','explicit-active');
    activation.close();
    modelRegistry.setActivationPolicy(resolveActiveModelPolicy(root));
    const store=new InvocationReceiptStore(root),spawn:PlannerSpawnFn=vi.fn();
    const zero=await callZeroConfigPlannerWithReason('inactive','gpt-5.5','receipt-project',[],adapter(),1_000,spawn,{...receiptContext(root,store,'inactive-zero'),invocationId:'inv-inactive-zero'});
    const brain=await callBrainPlannerWithReason(makeContext(),recommendation,'gpt-5.5','receipt-project',adapter(),1_000,undefined,spawn,{...receiptContext(root,store,'inactive-brain'),invocationId:'inv-inactive-brain'});
    expect(zero).toMatchObject({ok:false,reason:'validation_failed',message:expect.stringContaining('MODEL_INACTIVE')});
    expect(brain).toMatchObject({ok:false,reason:'validation_failed',message:expect.stringContaining('MODEL_INACTIVE')});
    expect(spawn).not.toHaveBeenCalled();
    const scope={tenantId:'tenant-a',projectId:store.projectId};
    expect(store.get(scope,'inv-inactive-zero')?.consumerOutcome).toBe('rejected');
    expect(store.get(scope,'inv-inactive-brain')?.consumerOutcome).toBe('rejected');
    store.close();
  });

  it('blocks a duplicate zero-config invocation before a second provider call', async () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root);
    const context: PlannerReceiptContext = {
      ...receiptContext(root, store, 'zero-duplicate'),
      invocationId: 'inv-zero-duplicate',
      idempotencyKey: 'zero-duplicate-plan',
      callId: 'inv-zero-duplicate:call-1',
    };
    const codexPlannerJSON = validPlannerJSON.replace('claude-sonnet-5', 'gpt-5.5');
    const firstSpawn: PlannerSpawnFn = vi.fn(async () => ({
      status: 0, signal: null, stdout: codexPlannerJSON, stderr: '',
    }));
    const first = await callZeroConfigPlanner(
      'plan once', 'gpt-5.5', 'receipt-project', [], adapter(), 1_000, firstSpawn, context,
    );
    expect(first?.tasks[0]?.model).toBe('gpt-5.5');
    expect(firstSpawn).toHaveBeenCalledOnce();

    const duplicateSpawn: PlannerSpawnFn = vi.fn();
    const duplicate = await callZeroConfigPlannerWithReason(
      'plan once', 'gpt-5.5', 'receipt-project', [], adapter(), 1_000, duplicateSpawn, context,
    );
    expect(duplicate).toMatchObject({
      ok: false,
      reason: 'receipt_replay_blocked',
      receiptRef: { invocationId: 'inv-zero-duplicate' },
    });
    expect(duplicateSpawn).not.toHaveBeenCalled();
    store.close();
  });

  it('keeps zero-config declaration, dispatch, and settlement failures typed and pre-dispatch safe', async () => {
    const root = makeRoot();
    const ref: InvocationReceiptRef = {
      schemaVersion: 1,
      invocationId: 'inv-zero-ledger-failure',
      tenantId: 'tenant-a',
      projectId: 'project-a',
    };
    const context = {
      ...receiptContext(root, {} as InvocationReceiptLedger, 'zero-ledger-failure'),
      invocationId: ref.invocationId,
    };
    const spawn: PlannerSpawnFn = vi.fn(async () => ({
      status: 0,
      signal: null,
      stdout: validPlannerJSON.replace('claude-sonnet-5', 'gpt-5.5'),
      stderr: '',
    }));
    const declarationClose = vi.fn();
    const declarationFailure: InvocationReceiptLedger = {
      projectId: ref.projectId,
      declare: () => { throw new Error('declare failed'); },
      append: vi.fn(),
      get: vi.fn(() => null),
      close: declarationClose,
    };
    const declared = await callZeroConfigPlannerWithReason(
      'plan', 'gpt-5.5', 'receipt-project', [], adapter(), 1_000, spawn,
      { ...context, store: declarationFailure },
    );
    expect(declared).toMatchObject({ ok: false, reason: 'receipt_failed' });
    expect(spawn).not.toHaveBeenCalled();

    const dispatchClose = vi.fn();
    const dispatchFailure: InvocationReceiptLedger = {
      projectId: ref.projectId,
      declare: () => ({ ref, created: true }),
      append: () => { throw new Error('dispatch failed'); },
      get: vi.fn(() => null),
      close: dispatchClose,
    };
    const dispatched = await callZeroConfigPlannerWithReason(
      'plan', 'gpt-5.5', 'receipt-project', [], adapter(), 1_000, spawn,
      { ...context, store: dispatchFailure },
    );
    expect(dispatched).toMatchObject({ ok: false, reason: 'receipt_failed', receiptRef: ref });
    expect(spawn).not.toHaveBeenCalled();

    const settlementClose = vi.fn();
    const settlementFailure: InvocationReceiptLedger = {
      projectId: ref.projectId,
      declare: () => ({ ref, created: true }),
      append: (_receiptRef, _invocationId, event) => {
        if (event.type === 'transport_settled') throw new Error('settlement failed');
      },
      get: vi.fn(() => null),
      close: settlementClose,
    };
    const settled = await callZeroConfigPlannerWithReason(
      'plan', 'gpt-5.5', 'receipt-project', [], adapter(), 1_000, spawn,
      { ...context, store: settlementFailure },
    );
    expect(settled).toMatchObject({ ok: false, reason: 'receipt_failed', receiptRef: ref });
    expect(spawn).toHaveBeenCalledOnce();
    expect(dispatchClose).not.toHaveBeenCalled();
    expect(settlementClose).not.toHaveBeenCalled();
  });

  it('returns a typed retry dispatch-write failure without a second provider dispatch', async () => {
    const root = makeRoot();
    let declarations = 0;
    const append = vi.fn();
    const store: InvocationReceiptLedger = {
      projectId: 'project-a',
      declare: (receipt) => {
        declarations += 1;
        const ref: InvocationReceiptRef = {
          schemaVersion: 1,
          invocationId: receipt.invocationId,
          tenantId: receipt.tenantId,
          projectId: receipt.projectId,
        };
        return { ref, created: true };
      },
      append: (...args) => {
        const event = args[2];
        append(...args);
        if (declarations === 2 && event.type === 'dispatch_started') {
          throw new Error('retry dispatch write failed');
        }
      },
      get: vi.fn(() => null),
      close: vi.fn(),
    };
    const spawn: PlannerSpawnFn = vi.fn(async () => ({
      status: 0, signal: null, stdout: 'invalid-json', stderr: '',
    }));
    const result = await callZeroConfigPlannerWithReason(
      'plan', 'gpt-5.5', 'receipt-project', [], adapter(), 1_000, spawn,
      {
        ...receiptContext(root, store, 'retry-replay'),
        invocationId: 'inv-retry-replay',
      },
    );
    expect(result).toMatchObject({
      ok: false,
      reason: 'receipt_failed',
      receiptRef: { invocationId: 'inv-retry-replay:schema-retry-2' },
    });
    expect(spawn).toHaveBeenCalledOnce();
  });

  it('records command-build rejection without dispatching or persisting thrown detail', async () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    const store = new InvocationReceiptStore(root);
    const broken = {
      ...adapter(),
      buildPlannerCommand: () => { throw new Error('sk-secret-command-build'); },
    };
    const spawn: PlannerSpawnFn = vi.fn();
    const result = await callZeroConfigPlannerWithReason(
      'plan', 'gpt-5.5', 'receipt-project', [], broken, 1_000, spawn,
      {
        ...receiptContext(root, store, 'command-build'),
        invocationId: 'inv-command-build',
      },
    );
    expect(result).toMatchObject({
      ok: false,
      reason: 'spawn_failed',
      receiptRef: { invocationId: 'inv-command-build' },
    });
    expect(result.message).not.toContain('sk-secret');
    expect(spawn).not.toHaveBeenCalled();
    store.close();
    expect(readFileSync(dbPath, 'utf8')).not.toContain('sk-secret');
  });

  it('persists exact wire model, separate outcomes, and no prompt/response/argv', async () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    const store = new InvocationReceiptStore(root);
    const { result, spawn } = await invoke(root, store, {
      status: 0, signal: null, stdout: validPlannerJSON, stderr: '',
    });
    expect(result.ok).toBe(true);
    expect(spawn).toHaveBeenCalledOnce();
    const ref = result.receiptRef!;
    const view = store.get(ref, ref.invocationId);
    expect(view?.receipt.configured.model).toBe('gpt-5.5');
    expect(view?.receipt.called).toMatchObject({ provider: 'codex', model: 'gpt-5.5', source: 'wire' });
    expect(view?.receipt.reachability).toEqual({ state: 'unknown', evidenceRef: null });
    expect(view?.receipt.limits).toEqual({ state: 'unknown', evidenceRefs: [] });
    expect(view?.transportOutcome).toBe('succeeded');
    expect(view?.consumerOutcome).toBe('accepted');
    expect(view?.events.find((event) => event.type === 'consumer_settled')?.payload)
      .toMatchObject({ outcome: 'accepted', reasonCode: 'none', evidenceRefs: [`planner-result:sha256:${createHash('sha256').update(canonicalJson(result.ok?result.data:null),'utf8').digest('hex')}`] });
    store.close();
    const bytes = readFileSync(dbPath).toString('utf8');
    expect(bytes).not.toContain('super-secret-prompt-marker');
    expect(bytes).not.toContain('super-secret-response-marker');
    expect(bytes).not.toContain('--model');
  });

  it('persists exact OpenRouter api/api identity before a provider-native call', async () => {
    ensureOpenRouterModelRegistered(OPENROUTER_MODEL, {
      costPerMillion: { input: 0, output: 0 },
      pricingEvidenceRef: 'openrouter-model-pricing:api-identity-0001',
    });
    const root = makeRoot();
    const store = new InvocationReceiptStore(root);
    const execute = vi.fn(async () => ({
      status: 0,
      signal: null,
      stdout: validPlannerJSON.replace('claude-sonnet-5', OPENROUTER_MODEL),
      stderr: '',
    }));
    const openrouterAdapter: ProviderAdapter = {
      name: 'openrouter',
      supportedModels: [OPENROUTER_MODEL] as readonly ModelType[],
      spawn: vi.fn(),
      kill: vi.fn(),
      listWorkers: vi.fn(() => []),
      isAvailable: vi.fn(async () => true),
      buildCommand: vi.fn(() => 'must-not-run'),
      buildPlannerInvocation: () => ({
        calledProvider: 'openrouter',
        calledModel: OPENROUTER_MODEL,
        transport: 'api',
        executionBackend: 'api',
        execute,
      }),
    };
    const context: PlannerReceiptContext = {
      tenantId: 'tenant-a',
      projectRoot: root,
      runId: 'sprint-openrouter-api-identity',
      configuredProvider: 'openrouter',
      requestedProvider: 'openrouter',
      configuredModel: OPENROUTER_MODEL,
      requestedModel: OPENROUTER_MODEL,
      authMode: 'api',
      store,
    };
    const spawn: PlannerSpawnFn = vi.fn();

    const result = await callBrainPlannerWithReason(
      makeContext(),
      recommendation,
      OPENROUTER_MODEL,
      'receipt-project',
      openrouterAdapter,
      1_000,
      undefined,
      spawn,
      context,
      {
        defaultModel: OPENROUTER_MODEL,
        allowedModels: [OPENROUTER_MODEL],
      },
    );

    expect(result.ok).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
    expect(spawn).not.toHaveBeenCalled();
    const ref = result.receiptRef!;
    expect(store.get(ref, ref.invocationId)?.receipt).toMatchObject({
      called: {
        provider: 'openrouter',
        model: OPENROUTER_MODEL,
      },
      backend: {
        transport: 'api',
        executionBackend: 'api',
      },
    });
    store.close();
  });

  it.each([
    ['non-zero', { status: 9, signal: null, stdout: '', stderr: 'sk-secret-stderr' }, 'failed', 'rejected'],
    ['timeout', { status: null, signal: 'SIGTERM', stdout: '', stderr: '' }, 'timeout', 'rejected'],
    ['parse', { status: 0, signal: null, stdout: 'not-json sk-secret-output', stderr: '' }, 'succeeded', 'rejected'],
  ] as const)('settles %s without storing raw output', async (_label, outcome, transport, consumer) => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    const store = new InvocationReceiptStore(root);
    const { result } = await invoke(root, store, outcome);
    expect(result.ok).toBe(false);
    const ref = result.receiptRef!;
    const view = store.get(ref, ref.invocationId);
    expect(view?.transportOutcome).toBe(transport);
    expect(view?.consumerOutcome).toBe(consumer);
    store.close();
    expect(readFileSync(dbPath).toString('utf8')).not.toContain('sk-secret');
  });

  it('settles a rejected spawn promise as a transport failure', async () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root);
    const { result } = await invoke(root, store, async () => { throw new Error('spawn secret'); });
    expect(result).toMatchObject({ ok: false, reason: 'spawn_failed' });
    const ref = result.receiptRef!;
    const view = store.get(ref, ref.invocationId);
    expect(view?.transportOutcome).toBe('failed');
    expect(view?.consumerOutcome).toBe('rejected');
    store.close();
  });

  it('fails closed with zero spawn calls when declaration or dispatch-intent persistence fails', async () => {
    const root = makeRoot();
    const ref: InvocationReceiptRef = {
      schemaVersion: 1, invocationId: 'inv-fail', tenantId: 'tenant-a', projectId: 'project-a',
    };
    const declarationFailure: InvocationReceiptLedger = {
      projectId: 'project-a',
      declare: () => { throw new Error('disk unavailable'); },
      append: vi.fn(), get: vi.fn(() => null), close: vi.fn(),
    };
    const first = await invoke(root, declarationFailure, {
      status: 0, signal: null, stdout: validPlannerJSON, stderr: '',
    });
    expect(first.result).toMatchObject({ ok: false, reason: 'receipt_failed' });
    expect(first.spawn).not.toHaveBeenCalled();

    const dispatchFailure: InvocationReceiptLedger = {
      projectId: 'project-a',
      declare: () => ({ ref, created: true }),
      append: () => { throw new Error('fsync failed'); },
      get: vi.fn(() => null), close: vi.fn(),
    };
    const second = await invoke(root, dispatchFailure, {
      status: 0, signal: null, stdout: validPlannerJSON, stderr: '',
    }, '2');
    expect(second.result).toMatchObject({ ok: false, reason: 'receipt_failed', receiptRef: ref });
    expect(second.spawn).not.toHaveBeenCalled();
  });

  it('blocks a duplicate invocation instead of replaying after restart', async () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root);
    const first = await invoke(root, store, {
      status: 0, signal: null, stdout: validPlannerJSON, stderr: '',
    });
    expect(first.spawn).toHaveBeenCalledOnce();
    const firstRef = first.result.receiptRef!;
    expect(store.get(firstRef, firstRef.invocationId)?.consumerOutcome).toBe('accepted');
    const second = await invoke(root, store, {
      status: 0, signal: null, stdout: 'must-not-be-called', stderr: '',
    });
    expect(second.result).toMatchObject({ ok: false, reason: 'receipt_replay_blocked' });
    expect(second.spawn).not.toHaveBeenCalled();
    store.close();
  });

  it('records no-provider as not-dispatched with a queryable receipt', async () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root);
    providerRegistry.clear();
    const spawn: PlannerSpawnFn = vi.fn();
    const result = await callBrainPlannerWithReason(
      makeContext(), recommendation, 'gpt-5.5', 'receipt-project', undefined, 1_000,
      undefined, spawn, receiptContext(root, store),
    );
    expect(result).toMatchObject({ ok: false, reason: 'no_providers' });
    expect(spawn).not.toHaveBeenCalled();
    const ref = result.receiptRef!;
    const view = store.get(ref, ref.invocationId);
    expect(view?.transportOutcome).toBe('not_dispatched');
    expect(view?.consumerOutcome).toBe('rejected');
    store.close();
  });

  it('records requested-to-resolved provider fallback instead of rewriting requested truth', async () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root);
    const fallbackAdapter: ProviderAdapter = {
      ...adapter(),
      name: 'claude-tmux',
      buildPlannerCommand: (prompt) => ({
        command: 'claude',
        args: ['-p', prompt, '--model', 'claude-opus-4-8'],
        calledProvider: 'claude',
        calledModel: 'claude-opus-4-8',
        transport: 'cli',
        executionBackend: 'host-subprocess',
      }),
    };
    const spawn: PlannerSpawnFn = vi.fn(async () => ({
      status: 0, signal: null, stdout: validPlannerJSON, stderr: '',
    }));
    const context: PlannerReceiptContext = {
      ...receiptContext(root, store),
      resolution: {
        configured: {
          provider: 'codex', model: 'gpt-5.5', source: 'config', reasonCode: 'none',
        },
        resolved: {
          provider: 'claude', model: 'claude-opus-4-8', source: 'fallback',
          reasonCode: 'provider_resolution_fallback',
        },
        fallbackChain: [{
          sequence: 1,
          fromProvider: 'codex', fromModel: 'gpt-5.5',
          toProvider: 'claude', toModel: 'claude-opus-4-8',
          reasonCode: 'provider_resolution_fallback',
          reachabilityRef: 'reachability:claude-opus-4-8',
          limitEvidenceRefs: ['provider-limit:claude-account'],
        }],
        reachability: { state: 'known', evidenceRef: 'reachability:claude-opus-4-8' },
        limits: { state: 'known', evidenceRefs: ['provider-limit:claude-account'] },
      },
    };
    const result = await callBrainPlannerWithReason(
      makeContext(), recommendation, 'claude-opus-4-8', 'receipt-project', fallbackAdapter, 1_000,
      undefined, spawn, context,
    );
    expect(result.ok).toBe(true);
    const ref = result.receiptRef!;
    const view = store.get(ref, ref.invocationId);
    expect(view?.receipt.requested).toMatchObject({ provider: 'codex', model: 'gpt-5.5' });
    expect(view?.receipt.resolved).toMatchObject({
      provider: 'claude', model: 'claude-opus-4-8', source: 'fallback',
      reasonCode: 'provider_resolution_fallback',
    });
    expect(view?.receipt.fallbackChain).toEqual([expect.objectContaining({
      sequence: 1,
      fromProvider: 'codex', fromModel: 'gpt-5.5',
      toProvider: 'claude', toModel: 'claude-opus-4-8',
      reasonCode: 'provider_resolution_fallback',
      reachabilityRef: 'reachability:claude-opus-4-8',
      limitEvidenceRefs: ['provider-limit:claude-account'],
    })]);
    expect(view?.receipt.reachability).toEqual({
      state: 'known', evidenceRef: 'reachability:claude-opus-4-8',
    });
    expect(view?.receipt.limits).toEqual({
      state: 'known', evidenceRefs: ['provider-limit:claude-account'],
    });
    store.close();
  });
});
