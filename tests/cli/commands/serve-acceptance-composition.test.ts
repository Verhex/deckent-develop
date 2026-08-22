import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

interface ReconcilerArgs {
  projectRoot: string;
  tenantId: string;
  projectId: string;
  lifecycle: { pending_ttl_ms: number };
  clock: () => Date;
  verifyAuthority: (candidate: {
    confirmationId: string;
    verdict: 'CONFIRMED' | 'FAILED';
    decidedAt: string;
    authorityReceipt: string;
  }) => boolean;
}

const fakes = vi.hoisted(() => ({
  apiClose: vi.fn().mockResolvedValue(undefined),
  authorityClose: vi.fn(),
  providerClose: vi.fn(),
  reconcilerClose: vi.fn(),
  reconcilerRun: vi.fn().mockResolvedValue({
    tenantId: 'resolved-tenant', cursor: null, exhausted: true, scanned: 0,
    reconciled: 0, held: 0, denied: 0, observations: [], outcomes: [],
  }),
  receiptClose: vi.fn(),
  createHttpServer: vi.fn(),
  openReconciler: vi.fn(),
  openProviderAuthority: vi.fn(),
  bootstrapApprovalAuthority: vi.fn(),
  writeAuditEvent: vi.fn().mockReturnValue(true),
  decisionAuthorityValidate: vi.fn().mockReturnValue({ ok: true }),
  brokerGetRequest: vi.fn(),
  brokerGetDecision: vi.fn(),
  shutdownHooks: [] as Array<() => Promise<void>>,
  oidcVerifier: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('node:fs', () => ({ existsSync: vi.fn().mockReturnValue(true), readdirSync: vi.fn().mockReturnValue(['index.html']) }));
vi.mock('../../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: () => '/project' }));
vi.mock('../../../src/cli/helpers/output.js', () => ({ print: vi.fn(), printError: vi.fn() }));
vi.mock('../../../src/cli/helpers/dashboard-dir.js', () => ({ getDashboardStaticDir: () => '/dashboard' }));
vi.mock('../../../src/cli/helpers/messages.js', () => ({ getLanguage: () => 'en', getMessage: (key: string) => key }));
vi.mock('../../../src/api/serve-daemon-meta.js', () => ({ writeServeDaemonMeta: vi.fn(), clearServeDaemonMeta: vi.fn() }));
vi.mock('../../../src/api/terminal/session-backend.js', () => ({ LocalPtyBackend: class {} }));
vi.mock('../../../src/cli/helpers/shutdown-hooks.js', () => ({
  registerShutdownHook: (hook: () => Promise<void>) => { fakes.shutdownHooks.push(hook); },
}));
vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    approval: { authority: { tenant_id: 'tenant-from-config' }, lifecycle: { pending_ttl_ms: 123 } },
  }),
}));
vi.mock('../../../src/core/provider.js', () => ({ bootstrapProviders: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../src/providers/provider-authority-runtime-bootstrap.js', () => ({
  openLocalProviderAuthorityRuntimeIfConfigured: (...args: unknown[]) => fakes.openProviderAuthority(...args),
}));
vi.mock('../../../src/core/approval-authority-bootstrap.js', () => ({
  bootstrapApprovalAuthority: (...args: unknown[]) => fakes.bootstrapApprovalAuthority(...args),
}));
vi.mock('../../../src/core/tenant-context.js', () => ({
  resolveTenant: vi.fn().mockReturnValue({ tenantId: 'resolved-tenant' }),
}));
vi.mock('../../../src/core/invocation-receipt-store.js', () => ({
  InvocationReceiptStore: class { projectId = 'canonical-project'; close = fakes.receiptClose; },
}));
vi.mock('../../../src/orchestra/acceptance-confirmation-reconciler.js', () => ({
  openAcceptanceConfirmationReconciler: (...args: unknown[]) => fakes.openReconciler(...args),
}));
vi.mock('../../../src/core/audit-writer.js', () => ({
  writeAuditEvent: (...args: unknown[]) => fakes.writeAuditEvent(...args),
}));
vi.mock('../../../src/core/acceptance-decision-authority.js', () => ({
  createAcceptanceDecisionAuthorityVerifier: (factory: {
    branch: 'human' | 'llm';
    verify?: (candidate: unknown) => boolean;
  }) => factory.branch === 'human'
    ? factory.verify
    : (candidate: { authorityReceipt: string }) => candidate.authorityReceipt.startsWith('cross-verify-verdict:'),
}));
vi.mock('../../../src/api/server.js', () => ({
  createHttpServer: (...args: unknown[]) => fakes.createHttpServer(...args),
}));

async function startServe(): Promise<void> {
  const { registerServe } = await import('../../../src/cli/commands/serve.js');
  const program = new Command();
  registerServe(program);
  await program.commands.find(command => command.name() === 'serve')!.parseAsync([], { from: 'user' });
}

describe('serve default acceptance-confirmation composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.shutdownHooks.length = 0;
    fakes.openProviderAuthority.mockReturnValue({ close: fakes.providerClose });
    fakes.bootstrapApprovalAuthority.mockReturnValue({
      state: 'ready',
      runtime: {
        close: fakes.authorityClose,
        broker: { getRequest: fakes.brokerGetRequest, getDecision: fakes.brokerGetDecision },
        decisionAuthority: { validate: fakes.decisionAuthorityValidate },
      },
      policy: {},
      verifier: fakes.oidcVerifier,
    });
    fakes.openReconciler.mockReturnValue({
      run: fakes.reconcilerRun,
      close: fakes.reconcilerClose,
    });
    fakes.createHttpServer.mockReturnValue({
      apiToken: 'api', terminalToken: 'terminal', close: fakes.apiClose,
    });
  });

  it('opens the production reconciler from resolved ownership and injects its runtime into the API', async () => {
    await startServe();

    expect(fakes.receiptClose).toHaveBeenCalledTimes(1);
    expect(fakes.openReconciler).toHaveBeenCalledWith({
      projectRoot: '/project',
      tenantId: 'resolved-tenant',
      projectId: 'canonical-project',
      lifecycle: { pending_ttl_ms: 123 },
      clock: expect.any(Function),
      verifyAuthority: expect.any(Function),
    });

    const reconcilerArgs = fakes.openReconciler.mock.calls[0]![0] as ReconcilerArgs;
    expect(reconcilerArgs.clock()).toBeInstanceOf(Date);

    const decidedAt = '2026-08-22T01:00:00.000Z';
    const authorization = { integrityKeyId: 'key-a', integrityMac: 'mac-a' };
    const request = { id: 'confirmation-a' };
    const decision = {
      requestId: 'confirmation-a', decision: 'allow', decidedAt, authorization,
    };
    fakes.brokerGetRequest.mockReturnValue(request);
    fakes.brokerGetDecision.mockReturnValue(decision);
    expect(reconcilerArgs.verifyAuthority({
      confirmationId: 'confirmation-a',
      verdict: 'CONFIRMED',
      decidedAt,
      authorityReceipt: 'approval-decision:key-a:mac-a',
    })).toBe(true);
    expect(reconcilerArgs.verifyAuthority({
      confirmationId: 'llm-a', verdict: 'CONFIRMED', decidedAt,
      authorityReceipt: 'cross-verify-verdict:sha256:evidence',
    })).toBe(true);
    expect(fakes.decisionAuthorityValidate).toHaveBeenCalledWith(request, decision, new Date(decidedAt));

    const apiOptions = fakes.createHttpServer.mock.calls[0]![1] as {
      acceptanceConfirmation: {
        authority: { tenantId: string; projectRoot: string };
        reconciler: { run: (...args: unknown[]) => Promise<unknown> };
        pageSize: number;
        clock: () => Date;
        writeAudit: (event: Record<string, unknown>) => void;
      };
    };
    expect(apiOptions.acceptanceConfirmation.authority).toEqual({
      tenantId: 'resolved-tenant', projectRoot: '/project',
    });
    expect(apiOptions.acceptanceConfirmation.reconciler).toBe(fakes.openReconciler.mock.results[0]!.value);
    expect(apiOptions.acceptanceConfirmation.pageSize).toBe(100);
    expect(apiOptions.acceptanceConfirmation.clock()).toBeInstanceOf(Date);
    apiOptions.acceptanceConfirmation.writeAudit({
      kind: 'acceptance-confirmation-reconciliation',
      status: 'failed',
      correlationId: 'correlation-a',
      tenantId: 'resolved-tenant',
      projectRoot: '/project',
      observedAt: decidedAt,
      error: 'fault',
    });
    expect(fakes.writeAuditEvent).toHaveBeenCalledWith(
      '/project',
      'runtime-acceptance-confirmation',
      expect.objectContaining({
        tenantId: 'resolved-tenant',
        actor: 'system:acceptance-reconciler',
        action: 'acceptance-confirmation.reconciliation.failed',
        correlationId: 'correlation-a',
      }),
    );
  });

  it('drains each restarted server and all of its owners exactly once', async () => {
    await startServe();
    await startServe();
    expect(fakes.shutdownHooks).toHaveLength(2);

    await fakes.shutdownHooks[0]!();
    await fakes.shutdownHooks[0]!();
    await fakes.shutdownHooks[1]!();
    await fakes.shutdownHooks[1]!();

    expect(fakes.apiClose).toHaveBeenCalledTimes(2);
    expect(fakes.reconcilerClose).toHaveBeenCalledTimes(2);
    expect(fakes.authorityClose).toHaveBeenCalledTimes(2);
    expect(fakes.providerClose).toHaveBeenCalledTimes(2);
  });

  it('keeps the default LLM drain on HOLD while the unavailable human branch fails closed', async () => {
    fakes.bootstrapApprovalAuthority.mockReturnValueOnce({
      state: 'hold',
      reasonCode: 'approval_authority_composition_failed',
      detailCode: 'APPROVAL_AUTHORITY_OIDC_NOT_CONFIGURED',
      authorityEvidenceRef: null,
    });

    await startServe();

    expect(fakes.openReconciler).toHaveBeenCalledTimes(1);
    expect(fakes.createHttpServer).toHaveBeenCalledTimes(1);
    const args = fakes.openReconciler.mock.calls[0]![0] as ReconcilerArgs;
    expect(args.verifyAuthority({
      confirmationId: 'llm-a', verdict: 'CONFIRMED',
      decidedAt: '2026-08-22T01:00:00.000Z',
      authorityReceipt: 'cross-verify-verdict:sha256:evidence',
    })).toBe(true);
    expect(args.verifyAuthority({
      confirmationId: 'human-a', verdict: 'CONFIRMED',
      decidedAt: '2026-08-22T01:00:00.000Z',
      authorityReceipt: 'approval-decision:key:mac',
    })).toBe(false);
    expect(fakes.oidcVerifier).not.toHaveBeenCalled();
  });

  it('closes every opened owner when API startup fails even if one close throws', async () => {
    fakes.reconcilerClose.mockImplementationOnce(() => { throw new Error('close failed'); });
    fakes.createHttpServer.mockImplementationOnce(() => { throw new Error('bind failed'); });

    await expect(startServe()).rejects.toThrow('bind failed');
    expect(fakes.reconcilerClose).toHaveBeenCalledTimes(1);
    expect(fakes.authorityClose).toHaveBeenCalledTimes(1);
    expect(fakes.providerClose).toHaveBeenCalledTimes(1);
  });

  it('fails startup and closes provider ownership when later composition bootstrap fails', async () => {
    fakes.bootstrapApprovalAuthority.mockImplementationOnce(() => {
      throw new Error('authority bootstrap failed');
    });

    await expect(startServe()).rejects.toThrow('authority bootstrap failed');
    expect(fakes.providerClose).toHaveBeenCalledTimes(1);
    expect(fakes.createHttpServer).not.toHaveBeenCalled();
  });

  it('never falls back to an injection-only server when default reconciliation cannot open', async () => {
    fakes.openProviderAuthority.mockReturnValueOnce(undefined);
    fakes.bootstrapApprovalAuthority.mockReturnValueOnce({ state: 'disabled' });
    fakes.openReconciler.mockImplementationOnce(() => { throw new Error('reconciler unavailable'); });

    await expect(startServe()).rejects.toThrow('reconciler unavailable');
    expect(fakes.createHttpServer).not.toHaveBeenCalled();
  });
});
