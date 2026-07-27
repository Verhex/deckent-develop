import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRODUCTION_INVENTORY_BASELINE,
  UNRESOLVED_BASELINE,
  productionInventoryFingerprint,
  scanConfiguredTestRoots,
  unresolvedRegistryFingerprint,
} from '../../scripts/lint-test-hermeticity.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const FOUNDATION_MODULES = [
  'scripts/hermeticity/adapters/darwin-seatbelt.mjs',
  'scripts/hermeticity/adapters/linux-namespace.mjs',
  'scripts/hermeticity/adapters/oci.mjs',
  'scripts/hermeticity/adapters/win32-appcontainer.mjs',
  'scripts/hermeticity/adapters/wsl.mjs',
  'scripts/hermeticity/containment-authority.mjs',
  'scripts/hermeticity/containment-contract.mjs',
  'scripts/hermeticity/containment-control-plane.mjs',
  'scripts/hermeticity/containment-supervisor.mjs',
  'scripts/hermeticity/dependency-projection.mjs',
  'scripts/hermeticity/node-permission-plan.mjs',
  'scripts/hermeticity/owned-execution.mjs',
  'scripts/hermeticity/process-bootstrap.mjs',
  'scripts/hermeticity/runtime-projection.mjs',
  'scripts/test-ci-sim-contained.mjs',
];
const ZERO_UNRESOLVED_SCOPE = [
  ...FOUNDATION_MODULES,
  'scripts/ci-sim-state.mjs',
  'scripts/ci-sim-workspace.mjs',
];

describe('containment production-inventory ratchet', () => {
  it('binds every foundation module without accepting new unresolved effects', {
    timeout: 60_000,
  }, () => {
    const result = scanConfiguredTestRoots(REPO_ROOT);
    const inventoryPaths = result.registry
      .filter(entry => entry.classification === 'inventory')
      .map(entry => entry.file);

    expect(result.violations).toEqual([]);
    expect(unresolvedRegistryFingerprint(result.registry)).toEqual(UNRESOLVED_BASELINE);
    expect(result.registry.filter(entry => (
      entry.classification === 'unresolved'
      && ZERO_UNRESOLVED_SCOPE.includes(entry.file)
    ))).toEqual([]);
    expect(productionInventoryFingerprint(result.registry))
      .toEqual(PRODUCTION_INVENTORY_BASELINE);
    for (const modulePath of FOUNDATION_MODULES) {
      expect(inventoryPaths).toContain(modulePath);
    }
  });
});
