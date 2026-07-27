import { describe, expect, it } from 'vitest';

import {
  createDependencyAbiProjection,
  evaluateDependencyAbiCompatibility,
  validateDependencyAbiProjection,
} from '../../scripts/hermeticity/dependency-projection.mjs';

const SHA_A = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SHA_C = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const SHA_D = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const SHA_E = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const SHA_F = 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

function linuxRealm() {
  return {
    platform: 'linux',
    arch: 'x64',
    nodeVersion: '24.4.1',
    nodeModulesAbi: 137,
    napiVersion: 10,
    libc: {
      family: 'glibc',
      version: '2.39',
    },
  };
}

function artifacts() {
  return [
    {
      path: 'node_modules/pkg/index.js',
      digestRef: SHA_A,
      kind: 'javascript',
      abi: { kind: 'none' },
    },
    {
      path: 'node_modules/pkg/native.node',
      digestRef: SHA_B,
      kind: 'native-addon',
      abi: {
        kind: 'napi',
        version: 10,
        platform: 'linux',
        arch: 'x64',
        libcFamily: 'glibc',
        libcVersion: '2.39',
      },
    },
  ];
}

function projectionInput() {
  return {
    packageRef: SHA_A,
    dependencyRef: SHA_B,
    lockRef: SHA_C,
    runtimeRef: SHA_D,
    dependencyLayerRef: SHA_E,
    buildRealmRef: SHA_F,
    packageManager: {
      name: 'npm',
      version: '11.4.2',
      managerRef: SHA_A,
    },
    inventory: {
      state: 'COMPLETE',
      nativeDiscovery: 'COMPLETE',
      inventoryRef: SHA_B,
      scannerRef: SHA_C,
      artifactCount: 2,
      nativeArtifactCount: 1,
      unknownAbiArtifactCount: 0,
    },
    ...linuxRealm(),
    targetRealm: linuxRealm(),
    artifacts: artifacts(),
  };
}

function compatibilityInput(projection: unknown) {
  return {
    projection,
    targetRealm: linuxRealm(),
    targetRuntimeRef: SHA_D,
    targetDependencyLayerRef: SHA_E,
    targetBuildRealmRef: SHA_F,
  };
}

describe('dependency ABI projection', () => {
  it('binds complete inventory, package manager, exact Node realm, and pinned layer', () => {
    const projection = createDependencyAbiProjection(projectionInput());

    expect(projection).toMatchObject({
      state: 'PROJECTED',
      proofEligible: false,
      reasonCode: 'NONE',
      packageManager: {
        name: 'npm',
        version: '11.4.2',
        managerRef: SHA_A,
      },
      inventory: {
        state: 'COMPLETE',
        nativeDiscovery: 'COMPLETE',
        artifactCount: 2,
        nativeArtifactCount: 1,
      },
      buildRealm: {
        nodeVersion: '24.4.1',
        nodeModulesAbi: 137,
      },
      dependencyLayerRef: SHA_E,
      buildRealmRef: SHA_F,
    });
    expect(validateDependencyAbiProjection(projection).ok).toBe(true);
    expect(evaluateDependencyAbiCompatibility(
      compatibilityInput(projection),
    )).toMatchObject({
      state: 'HOLD',
      compatible: false,
      proofEligible: false,
      reasonCode: 'E_DEPENDENCY_ABI_SCANNER_AUTHORITY_REQUIRED',
      details: { diagnosticState: 'UNVERIFIED_MATCH' },
    });
  });

  it('is deterministic across artifact discovery order', () => {
    const left = createDependencyAbiProjection(projectionInput());
    const reverseInput = projectionInput();
    reverseInput.artifacts.reverse();
    const right = createDependencyAbiProjection(reverseInput);

    expect(left.projectionRef).toBe(right.projectionRef);
    expect(left.artifacts).toEqual(right.artifacts);
  });

  it('uses locale-independent deterministic ordering for large inventories', () => {
    const largeInput = projectionInput();
    largeInput.artifacts = Array.from({ length: 10_001 }, (_, index) => ({
      path: `node_modules/pkg/file-${String(10_000 - index).padStart(5, '0')}.js`,
      digestRef: SHA_A,
      kind: 'javascript',
      abi: { kind: 'none' },
    }));
    largeInput.inventory = {
      ...largeInput.inventory,
      artifactCount: largeInput.artifacts.length,
      nativeArtifactCount: 0,
      unknownAbiArtifactCount: 0,
    };

    const projection = createDependencyAbiProjection(largeInput);
    expect(projection).toMatchObject({
      state: 'PROJECTED',
      nativeArtifactCount: 0,
      inventory: { artifactCount: 10_001 },
    });
    expect(projection.artifacts[0].path)
      .toBe('node_modules/pkg/file-00000.js');
    expect(projection.artifacts.at(-1).path)
      .toBe('node_modules/pkg/file-10000.js');
  });

  it('rejects missing, empty, or count-inconsistent completeness authority', () => {
    const missingInventory = projectionInput();
    delete (missingInventory as { inventory?: unknown }).inventory;
    expect(createDependencyAbiProjection(missingInventory)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_INVENTORY_INCOMPLETE',
    });

    const emptyInventory = projectionInput();
    emptyInventory.artifacts = [];
    emptyInventory.inventory = {
      ...emptyInventory.inventory,
      artifactCount: 0,
      nativeArtifactCount: 0,
    };
    expect(createDependencyAbiProjection(emptyInventory)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_ARTIFACT_LIST_INVALID',
    });

    const omittedNative = projectionInput();
    omittedNative.artifacts = [omittedNative.artifacts[0]];
    omittedNative.inventory = {
      ...omittedNative.inventory,
      artifactCount: 1,
      nativeArtifactCount: 1,
    };
    expect(createDependencyAbiProjection(omittedNative)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_INVENTORY_INCOMPLETE',
    });

    const incompleteDiscovery = projectionInput();
    incompleteDiscovery.inventory.nativeDiscovery = 'PARTIAL';
    expect(createDependencyAbiProjection(incompleteDiscovery)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_INVENTORY_INCOMPLETE',
    });

    const mislabeledNative = projectionInput();
    mislabeledNative.artifacts[0].path = 'node_modules/pkg/hidden.node';
    expect(createDependencyAbiProjection(mislabeledNative)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_ARTIFACT_INVALID',
    });

    for (const unsafePath of [
      'node_modules/pkg/file:stream',
      'node_modules/CON/file.js',
      'node_modules/pkg/file.',
      'node_modules/cafe\u0301/index.js',
      'node_modules/pkg/file\t.js',
    ]) {
      const unsafeInput = projectionInput();
      unsafeInput.artifacts[0].path = unsafePath;
      expect(createDependencyAbiProjection(unsafeInput)).toMatchObject({
        state: 'HOLD',
        reasonCode: 'E_DEPENDENCY_ABI_ARTIFACT_INVALID',
      });
    }

    const portableCollision = projectionInput();
    portableCollision.artifacts = [
      {
        path: 'node_modules/pkg/Index.js',
        digestRef: SHA_A,
        kind: 'javascript',
        abi: { kind: 'none' },
      },
      {
        path: 'node_modules/pkg/index.js',
        digestRef: SHA_B,
        kind: 'javascript',
        abi: { kind: 'none' },
      },
    ];
    portableCollision.inventory = {
      ...portableCollision.inventory,
      nativeArtifactCount: 0,
    };
    expect(createDependencyAbiProjection(portableCollision)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_ARTIFACT_DUPLICATE',
    });

    const capacityInput = projectionInput();
    const overCapacity: unknown[] = [];
    overCapacity.length = 1_000_001;
    capacityInput.artifacts = overCapacity as ReturnType<typeof artifacts>;
    expect(createDependencyAbiProjection(capacityInput)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_CAPACITY_EXCEEDED',
      details: {
        artifactCount: 1_000_001,
        maximumArtifactCount: 1_000_000,
      },
    });
  });

  it('rejects declared cross-realm reuse before compatibility evaluation', () => {
    const crossRealm = projectionInput();
    crossRealm.targetRealm = {
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: '24.4.1',
      nodeModulesAbi: 137,
      napiVersion: 10,
      libc: {
        family: 'none',
        version: null,
      },
    };

    expect(createDependencyAbiProjection(crossRealm)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_UNPINNED_CROSS_REALM',
    });
  });

  it('requires exact target runtime, layer, build realm, and Node version bindings', () => {
    const projection = createDependencyAbiProjection(projectionInput());

    expect(evaluateDependencyAbiCompatibility({
      ...compatibilityInput(projection),
      targetRuntimeRef: SHA_A,
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_TARGET_BINDING_MISMATCH',
    });
    expect(evaluateDependencyAbiCompatibility({
      ...compatibilityInput(projection),
      targetDependencyLayerRef: SHA_A,
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_TARGET_BINDING_MISMATCH',
    });
    expect(evaluateDependencyAbiCompatibility({
      ...compatibilityInput(projection),
      targetBuildRealmRef: SHA_A,
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_TARGET_BINDING_MISMATCH',
    });
    expect(evaluateDependencyAbiCompatibility({
      ...compatibilityInput(projection),
      targetRealm: {
        ...linuxRealm(),
        nodeVersion: '24.4.2',
      },
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_DEPENDENCY_ABI_TARGET_BINDING_MISMATCH',
    });
  });

  it('keeps unknown native ABI fail-closed and rejects projection tampering', () => {
    const unknownInput = projectionInput();
    unknownInput.artifacts[1].abi = { kind: 'unknown' };
    unknownInput.inventory.unknownAbiArtifactCount = 1;
    const unknownProjection = createDependencyAbiProjection(unknownInput);
    expect(evaluateDependencyAbiCompatibility(
      compatibilityInput(unknownProjection),
    )).toMatchObject({
      state: 'HOLD',
      compatible: false,
      reasonCode: 'E_DEPENDENCY_ABI_UNKNOWN',
      blockingArtifacts: [{
        path: 'node_modules/pkg/native.node',
        reasonCode: 'E_DEPENDENCY_ABI_UNKNOWN',
      }],
    });

    const tampered = structuredClone(
      createDependencyAbiProjection(projectionInput()),
    );
    tampered.inventory.inventoryRef = SHA_F;
    expect(validateDependencyAbiProjection(tampered)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_DEPENDENCY_ABI_PROJECTION_INVALID' },
    });
  });

  it('never treats a caller-declared native-free inventory as scanner authority', () => {
    const omittedTreeInput = projectionInput();
    omittedTreeInput.artifacts = [omittedTreeInput.artifacts[0]];
    omittedTreeInput.inventory = {
      ...omittedTreeInput.inventory,
      artifactCount: 1,
      nativeArtifactCount: 0,
      unknownAbiArtifactCount: 0,
    };
    const projection = createDependencyAbiProjection(omittedTreeInput);
    expect(projection).toMatchObject({ state: 'PROJECTED', nativeArtifactCount: 0 });
    expect(evaluateDependencyAbiCompatibility(
      compatibilityInput(projection),
    )).toMatchObject({
      state: 'HOLD',
      compatible: false,
      reasonCode: 'E_DEPENDENCY_ABI_SCANNER_AUTHORITY_REQUIRED',
      details: { diagnosticState: 'UNVERIFIED_MATCH' },
    });
  });
});
