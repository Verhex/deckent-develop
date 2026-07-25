import {
  CLAUDE_SUBPROCESS_CONFIG,
  SubprocessSpawnBackend as ProductionSubprocessSpawnBackend,
  type SubprocessProviderConfig,
} from '../../src/providers/subprocess.js';
import {
  SandboxSpawnBackend as ProductionSandboxSpawnBackend,
  type SandboxOptions,
} from '../../src/providers/sandbox.js';

type SubprocessConstructorOptions =
  NonNullable<ConstructorParameters<typeof ProductionSubprocessSpawnBackend>[1]>;

export function localSubprocessProviderConfig(
  providerConfig: SubprocessProviderConfig = CLAUDE_SUBPROCESS_CONFIG,
): SubprocessProviderConfig {
  return Object.freeze({
    ...providerConfig,
    executionCostClass: 'local',
  });
}

/**
 * Mechanics-only fake-child harness. It preserves the production subprocess
 * implementation while explicitly classifying the injected, provider-free
 * child as local. Remote/default admission remains covered separately by the
 * production class and must continue to fail before spawn without a budget.
 */
export class LocalSubprocessTestBackend extends ProductionSubprocessSpawnBackend {
  constructor(projectDir: string, options?: SubprocessConstructorOptions) {
    super(projectDir, {
      ...options,
      providerConfig: localSubprocessProviderConfig(options?.providerConfig),
    });
  }
}

export class LocalSandboxTestBackend extends ProductionSandboxSpawnBackend {
  constructor(projectDir: string, options?: SandboxOptions) {
    super(projectDir, {
      ...options,
      providerConfig: localSubprocessProviderConfig(options?.providerConfig),
    });
  }
}
