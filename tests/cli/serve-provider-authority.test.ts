import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const {
  approvalBootstrap,
  approvalClose,
  bootstrapProviders,
  clearMeta,
  createHttpServer,
  loadConfig,
  openProviderAuthority,
  providerClose,
  registerShutdownHook,
  shutdownHooks,
  writeMeta,
} = vi.hoisted(() => {
  const hooks: Array<() => Promise<void>> = [];
  return {
    approvalBootstrap: vi.fn(),
    approvalClose: vi.fn(),
    bootstrapProviders: vi.fn().mockResolvedValue(undefined),
    clearMeta: vi.fn(),
    createHttpServer: vi.fn(),
    loadConfig: vi.fn(),
    openProviderAuthority: vi.fn(),
    providerClose: vi.fn(),
    registerShutdownHook: vi.fn((hook: () => Promise<void>) => {
      hooks.push(hook);
      return () => {};
    }),
    shutdownHooks: hooks,
    writeMeta: vi.fn(),
  };
});

vi.mock('../../src/api/server.js', () => ({
  createHttpServer,
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig,
}));

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders,
}));

vi.mock('../../src/core/approval-authority-bootstrap.js', () => ({
  bootstrapApprovalAuthority: approvalBootstrap,
}));

vi.mock('../../src/providers/provider-authority-runtime-bootstrap.js', () => ({
  openLocalProviderAuthorityRuntimeIfConfigured: openProviderAuthority,
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => '/tmp/provider-authority-serve'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/api/serve-daemon-meta.js', () => ({
  writeServeDaemonMeta: writeMeta,
  clearServeDaemonMeta: clearMeta,
}));

vi.mock('../../src/cli/helpers/shutdown-hooks.js', () => ({
  registerShutdownHook,
}));

import { registerServe } from '../../src/cli/commands/serve.js';

describe('serve provider-authority process composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shutdownHooks.length = 0;
    loadConfig.mockResolvedValue({
      provider_limit_authority: {
        parent: { scope: 'global', config: {} },
        project: null,
      },
    });
    openProviderAuthority.mockReturnValue({
      state: 'hold',
      reasonCode: 'keyring_unavailable',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      retryable: false,
      close: providerClose,
    });
    approvalBootstrap.mockReturnValue({
      state: 'hold',
      reasonCode: 'approval_authority_custody_unavailable',
      authorityEvidenceRef: `approval-authority:${'b'.repeat(64)}`,
      retryable: false,
    });
    createHttpServer.mockReturnValue({
      server: { address: vi.fn(() => ({ port: 3100 })) },
      close: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('opens before provider bootstrap, injects the exact authority, and closes it at shutdown', async () => {
    const program = new Command();
    program.exitOverride();
    registerServe(program);

    await program.parseAsync([
      'node',
      'test',
      'serve',
      '--dev',
      '--no-terminal',
    ]);

    expect(openProviderAuthority).toHaveBeenCalledWith(
      '/tmp/provider-authority-serve',
      expect.any(Object),
    );
    expect(openProviderAuthority.mock.invocationCallOrder[0]!)
      .toBeLessThan(bootstrapProviders.mock.invocationCallOrder[0]!);
    const exactAuthority = openProviderAuthority.mock.results[0]!.value;
    expect(createHttpServer).toHaveBeenCalledWith(
      '/tmp/provider-authority-serve',
      expect.objectContaining({ providerAuthority: exactAuthority }),
    );

    expect(shutdownHooks).toHaveLength(1);
    await shutdownHooks[0]!();
    expect(providerClose).toHaveBeenCalledOnce();
    expect(approvalClose).not.toHaveBeenCalled();
  });

  it('closes the opened authority when HTTP server construction fails', async () => {
    createHttpServer.mockImplementationOnce(() => {
      throw new Error('bind failed');
    });
    const program = new Command();
    program.exitOverride();
    registerServe(program);

    await expect(program.parseAsync([
      'node',
      'test',
      'serve',
      '--dev',
      '--no-terminal',
    ])).rejects.toThrow('bind failed');

    expect(providerClose).toHaveBeenCalledOnce();
    expect(shutdownHooks).toHaveLength(0);
  });
});
