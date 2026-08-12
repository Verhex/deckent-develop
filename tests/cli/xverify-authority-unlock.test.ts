// tests/cli/xverify-authority-unlock.test.ts
//
// The live unlock proof (524-003) — every manual `deckent xverify` since
// 2026-08-11 returned the `xverify_provider_authority_unavailable` hold
// because no `provider_limits` parent block had ever been authored. This
// file drives the FULL composition — Task 2's authoring flow
// (`runLimitsInit`, a fixture source, a real tmpdir global config) feeding
// the REAL `loadConfig()` → `openLocalProviderAuthorityRuntimeIfConfigured()`
// → `CrossVerifyProductionIngressAuthority.compose()` chain, alongside Task
// 4's capability-tier floor — and pins four things:
//   1. the verifier SCOPE resolves against the authored policy (no more
//      `xverify_provider_authority_unavailable`);
//   2. the configured verifier model still wins the selection, agreeing with
//      the Task 4 floor (never refused as below-tier);
//   3. an ABSENT policy still holds typed, at both the selector and the
//      full-composition layer;
//   4. an explicit below-floor verifier request still refuses typed, even
//      inside the same "full composition" call shape.
//
// Hermetic: DECKENT_HOME + the project root are both fresh tmpdirs; the
// provider-limit source is a fixture (no live provider CLI, no network, no
// Docker). No live provider call is made anywhere in this file.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  runLimitsInit,
  type ProviderAuthorityLimitsDeps,
  type ProviderAuthorityLimitsInitOptions,
} from '../../src/cli/commands/provider-authority.js';
import { resolveGlobalConfigPaths, loadConfig } from '../../src/core/config.js';
import { ProviderAuthorityKeyring } from '../../src/core/provider-authority-keyring.js';
import {
  deriveProviderAccountBackendScopeRefHash,
  type ProviderAccountIdentityRequest,
  type ProviderAccountIdentityResult,
  type ProviderEvidenceSourceResolver,
  type ProviderLimitSourceObservation,
} from '../../src/core/provider-evidence-producer.js';
import { projectExactProviderLimitAuthoritySelector } from '../../src/core/provider-limit-policy.js';
import { modelRegistry } from '../../src/core/model-registry.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult, ResolvedConfig } from '../../src/core/types.js';
import {
  hasAuthoredProviderLimitAuthority,
  openLocalProviderAuthorityRuntimeIfConfigured,
} from '../../src/providers/provider-authority-runtime-bootstrap.js';
import {
  runCrossVerify,
  resolveVerifierTierFloorRefusal,
  VERIFIER_TIER_BELOW_AUTHOR,
} from '../../src/orchestra/cross-verify-runner.js';
import { createCrossVerifyProductionIngressAuthority } from '../../src/orchestra/cross-verify-production-ingress-authority.js';

// ─── Fixture scope + registry-sourced identities (read, never assumed) ──────

const PROVIDER = 'codex';
const AUTH_MODE = 'subscription';
const TRANSPORT = 'cli';
const EXECUTION_BACKEND = 'host-subprocess';
const PROFILE_REF = 'execution_profile.codex.subscription-cli';
const TENANT = 'local';

const PREMIUM_AUTHOR = 'claude-opus-5';
const PREMIUM_VERIFIER = 'gpt-5.6-sol';
const ECONOMY_VERIFIER = 'gpt-5.6-luna';

const dirs: string[] = [];
const closers: Array<() => void> = [];
const priorExitCode = process.exitCode;
const priorDeckentHome = process.env['DECKENT_HOME'];

function tmpDir(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), `xverify-unlock-${prefix}-`));
  dirs.push(value);
  return value;
}

/**
 * Pins the global config read/write path to a fresh tmpdir regardless of the
 * host's real HOME — the dual-read resolver falls back to the LEGACY path
 * (the real host's `~/.deckent/config.json`) whenever the platform-path file
 * does not exist yet, so an empty file is seeded here before anything reads
 * or writes through it.
 */
function seedDeckentHome(): string {
  const home = tmpDir('home');
  process.env['DECKENT_HOME'] = home;
  const { platformPath } = resolveGlobalConfigPaths();
  mkdirSync(dirname(platformPath), { recursive: true });
  writeFileSync(platformPath, '{}\n', 'utf-8');
  return home;
}

function readyIdentity(request: ProviderAccountIdentityRequest): ProviderAccountIdentityResult {
  return {
    state: 'ready',
    provider: request.provider,
    authMode: request.authMode,
    identityKind: 'provider-account',
    assurance: 'provider-verified',
    issuer: 'provider-account-service',
    stableSubject: 'acct-xverify-unlock',
    evidenceRef: 'provider-account:evidence-xverify-unlock',
    credentialGenerationRef: 'provider-credential:generation-xverify-unlock',
    backendScopeRefHash: deriveProviderAccountBackendScopeRefHash(request),
    fetchedAt: new Date(Date.now() - 1_000).toISOString(),
    expiresAt: new Date(Date.now() + 5_000).toISOString(),
  };
}

function observation(): ProviderLimitSourceObservation {
  return {
    state: 'known',
    requiredWindowIds: ['five-hour', 'weekly'],
    windows: [],
    source: {
      operatorApprovalRef: null,
      evidenceRef: 'provider-limit:observation-xverify-unlock',
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      incorporatedReservationEventRefs: [],
    },
  };
}

/** Fixture live-source bundle — no provider CLI, no network, no Docker. */
function fixtureSourceResolver(): ProviderEvidenceSourceResolver {
  return {
    authorityRef: 'provider-evidence-source:registry-xverify-unlock',
    resolve: scope => (scope.provider !== PROVIDER ? null : {
      ...scope,
      authorityEvidenceRef: 'provider-evidence-source:selection-xverify-unlock',
      sources: {
        account: {
          authorityRef: 'provider-evidence-source:account-xverify-unlock',
          resolve: async request => readyIdentity(request),
        },
        limit: {
          authorityRef: 'provider-evidence-source:limit-xverify-unlock',
          kind: 'provider-cli',
          authority: 'authoritative',
          observe: async () => observation(),
        },
        reachability: {
          authorityRef: 'provider-evidence-source:reach-xverify-unlock',
          probe: async () => {
            throw new Error('reachability must not be probed while authoring a policy');
          },
        },
      },
    }),
  };
}

/** Task 2's own flow — `runLimitsInit` — writing into the tmpdir global config. */
async function authorProviderLimitsPolicy(projectRoot: string, dataDir: string): Promise<void> {
  ProviderAuthorityKeyring.create({ dataDir, projectRoot, platform: process.platform });
  const opts: ProviderAuthorityLimitsInitOptions = {
    provider: PROVIDER,
    model: 'gpt-5-codex',
    authMode: AUTH_MODE,
    transport: TRANSPORT,
    executionBackend: EXECUTION_BACKEND,
    executionProfileRef: PROFILE_REF,
    tenant: TENANT,
    warnAtRatio: '0.7',
    blockAtRatio: '0.9',
  };
  const deps: ProviderAuthorityLimitsDeps = {
    resolveProjectRootFn: () => projectRoot,
    sourceResolver: fixtureSourceResolver(),
    confirmFn: async () => true,
  };
  await runLimitsInit(opts, deps);
}

function scopeQuery(): {
  tenantId: string;
  provider: string;
  authMode: typeof AUTH_MODE;
  transport: typeof TRANSPORT;
  executionBackend: typeof EXECUTION_BACKEND;
  endpointRefHash: null;
} {
  return {
    tenantId: TENANT,
    provider: PROVIDER,
    authMode: AUTH_MODE,
    transport: TRANSPORT,
    executionBackend: EXECUTION_BACKEND,
    endpointRefHash: null,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '524-003-unlock',
    title: 'Harden auth token validation',
    description: 'Add JWT signature checks to the login endpoint',
    model: PREMIUM_AUTHOR,
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'security',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/auth.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'JWT verified', noGoCriteria: 'bypass possible', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE,
    provider: 'claude',
    ...overrides,
  } as Task;
}

function makeResult(): TaskResult {
  return {
    taskId: '524-003-unlock',
    workerId: 'w-524-003-unlock',
    filesChanged: ['src/core/auth.ts'],
    linesAdded: 40,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 92,
    selfAssessment: 'DONE',
    notes: 'Added JWT verification.',
  };
}

afterEach(() => {
  for (const close of closers.splice(0)) {
    try { close(); } catch { /* best-effort teardown */ }
  }
  process.exitCode = priorExitCode;
  if (priorDeckentHome === undefined) delete process.env['DECKENT_HOME'];
  else process.env['DECKENT_HOME'] = priorDeckentHome;
  for (const value of dirs.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('the live unlock — authored policy replaces the authority-unavailable hold', () => {
  it('resolves the verifier scope and selects the configured verifier model, with authority no longer unavailable', async () => {
    const dataDir = seedDeckentHome();
    const projectRoot = tmpDir('root-ready');
    mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });

    await authorProviderLimitsPolicy(projectRoot, dataDir);
    expect(process.exitCode).not.toBe(1);

    const config = await loadConfig(projectRoot, { force: true });
    expect(hasAuthoredProviderLimitAuthority(config)).toBe(true);

    // The exact selector the production ingress consumes — the literal
    // "verifier scope resolves" claim, proven against the REAL loaded config.
    const projection = projectExactProviderLimitAuthoritySelector(
      config.provider_limit_authority,
      scopeQuery(),
    );
    expect(projection.state).toBe('ready');

    const providerAuthority = openLocalProviderAuthorityRuntimeIfConfigured(projectRoot, config);
    if (providerAuthority) closers.push(() => providerAuthority.close());
    expect(providerAuthority?.state).toBe('ready');

    // The Task 4 floor agrees: an equal-tier verifier is never refused.
    expect(resolveVerifierTierFloorRefusal(PREMIUM_AUTHOR, PREMIUM_VERIFIER)).toBeNull();
    expect(modelRegistry.getTier(PREMIUM_AUTHOR)).toBe(modelRegistry.getTier(PREMIUM_VERIFIER));

    const effectiveConfig: ResolvedConfig = {
      ...config,
      cross_verify: {
        enabled: true,
        high_stakes_only: false,
        verifier_priority: ['codex', 'claude'],
        verifier_model: { codex: PREMIUM_VERIFIER },
        enforce_refuted: false,
      },
    };
    const mandatoryInvocationFactory = createCrossVerifyProductionIngressAuthority({ providerAuthority });

    const res = await runCrossVerify(
      projectRoot,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      effectiveConfig,
      {
        mandatoryInvocationFactory,
        authorModel: PREMIUM_AUTHOR,
        operationClass: 'adjudicate-claim',
        timeoutMs: 5_000,
      },
    );

    expect(res.outcome).toBe('unavailable');
    // The old blocker is gone — the hold moves past the authority gate.
    expect(res.skippedReason).not.toContain('xverify_provider_authority_unavailable');
    // Composition now holds strictly later, on production execution-profile
    // authority (Docker/live-runtime concerns out of scope for this worker).
    expect(res.skippedReason).toContain('xverify_execution_profile_unavailable');
    // Verifier scope + tier-equivalent model selection both resolved correctly
    // before that later hold — the configured model won the selection.
    expect(res.verifier).toBe('codex');
    expect(res.verifierModel).toBe(PREMIUM_VERIFIER);
  });

  it('still holds typed when no policy has been authored — selector and full composition agree', async () => {
    seedDeckentHome();
    const projectRoot = tmpDir('root-absent');
    mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });

    const config = await loadConfig(projectRoot, { force: true });
    expect(hasAuthoredProviderLimitAuthority(config)).toBe(false);

    const projection = projectExactProviderLimitAuthoritySelector(
      config.provider_limit_authority,
      scopeQuery(),
    );
    expect(projection.state).toBe('hold');
    if (projection.state === 'hold') {
      expect(projection.reasonCode).toBe('xverify_provider_scope_unavailable');
    }

    const providerAuthority = openLocalProviderAuthorityRuntimeIfConfigured(projectRoot, config);
    expect(providerAuthority).toBeUndefined();

    const effectiveConfig: ResolvedConfig = {
      ...config,
      cross_verify: {
        enabled: true,
        high_stakes_only: false,
        verifier_priority: ['codex', 'claude'],
        verifier_model: { codex: PREMIUM_VERIFIER },
        enforce_refuted: false,
      },
    };
    const mandatoryInvocationFactory = createCrossVerifyProductionIngressAuthority({ providerAuthority });

    const res = await runCrossVerify(
      projectRoot,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      effectiveConfig,
      {
        mandatoryInvocationFactory,
        authorModel: PREMIUM_AUTHOR,
        operationClass: 'adjudicate-claim',
        timeoutMs: 5_000,
      },
    );

    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toContain('xverify_provider_authority_unavailable');
  });

  it('refuses a below-floor verifier request typed, even inside the full-composition call shape', async () => {
    const projectRoot = tmpDir('root-floor');
    mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });

    // Registry-sourced, not assumed: the floor between these two identities.
    const typedRefusal = resolveVerifierTierFloorRefusal(PREMIUM_AUTHOR, ECONOMY_VERIFIER);
    expect(typedRefusal).not.toBeNull();

    const config = {
      cross_verify: {
        enabled: true,
        high_stakes_only: false,
        verifier_priority: ['codex', 'claude'],
        enforce_refuted: false,
      },
    } as unknown as ResolvedConfig;

    const res = await runCrossVerify(
      projectRoot,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      config,
      {
        availableProviders: ['claude', 'codex'],
        verifierModel: ECONOMY_VERIFIER,
        authorModel: PREMIUM_AUTHOR,
        operationClass: 'adjudicate-claim',
      },
    );

    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toContain(VERIFIER_TIER_BELOW_AUTHOR);
    expect(res.skippedReason).toContain(ECONOMY_VERIFIER);
    expect(res.skippedReason).toContain(PREMIUM_AUTHOR);
  });
});
