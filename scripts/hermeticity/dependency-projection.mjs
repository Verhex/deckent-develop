import { posix as posixPath } from 'node:path';

import { containmentDigestRef } from './containment-authority.mjs';

const ARTIFACT_KINDS = [
  'javascript',
  'native-addon',
  'native-executable',
  'wasm',
];

const ABI_KINDS = [
  'none',
  'napi',
  'node-module',
  'platform',
  'unknown',
];

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const DIGEST_REFERENCE_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
const NODE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/u;
const MAX_ARTIFACTS = 1_000_000;

export const DEPENDENCY_ABI_PROJECTION_SCHEMA_VERSION = 1;

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function freezeJson(value) {
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) freezeJson(value[key]);
    return Object.freeze(value);
  }
  return value;
}

function detailRecord(value) {
  return isRecord(value) ? { ...value } : {};
}

function projectionHold(reasonCode, details = {}) {
  return freezeJson({
    schemaVersion: DEPENDENCY_ABI_PROJECTION_SCHEMA_VERSION,
    kind: 'dependency-abi-projection',
    state: 'HOLD',
    proofEligible: false,
    reasonCode,
    projectionRef: null,
    details: detailRecord(details),
  });
}

function compatibilityHold(reasonCode, projectionRef, targetRealm, blockingArtifacts, details = {}) {
  return freezeJson({
    schemaVersion: DEPENDENCY_ABI_PROJECTION_SCHEMA_VERSION,
    kind: 'dependency-abi-compatibility',
    state: 'HOLD',
    compatible: false,
    proofEligible: false,
    reasonCode,
    projectionRef,
    targetRealm,
    blockingArtifacts,
    details: detailRecord(details),
  });
}

function isDigestReference(value) {
  return typeof value === 'string' && DIGEST_REFERENCE_PATTERN.test(value);
}

function isIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function normalizeLibc(value) {
  if (!isRecord(value)
    || !isIdentifier(value.family)
    || (value.version !== null
      && (typeof value.version !== 'string' || !VERSION_PATTERN.test(value.version)))
    || (value.family === 'none' && value.version !== null)
    || (value.family !== 'none' && value.version === null)) {
    return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_LIBC_INVALID' };
  }
  return {
    ok: true,
    value: {
      family: value.family,
      version: value.version,
    },
  };
}

function normalizeRealm(value) {
  if (!isRecord(value)
    || !isIdentifier(value.platform)
    || !isIdentifier(value.arch)
    || typeof value.nodeVersion !== 'string'
    || !NODE_VERSION_PATTERN.test(value.nodeVersion)
    || !Number.isSafeInteger(value.nodeModulesAbi)
    || value.nodeModulesAbi <= 0
    || (value.napiVersion !== null
      && (!Number.isSafeInteger(value.napiVersion) || value.napiVersion <= 0))) {
    return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_REALM_INVALID' };
  }
  const libc = normalizeLibc(value.libc);
  if (!libc.ok) return libc;
  return {
    ok: true,
    value: {
      platform: value.platform,
      arch: value.arch,
      nodeVersion: value.nodeVersion,
      nodeModulesAbi: value.nodeModulesAbi,
      napiVersion: value.napiVersion,
      libc: libc.value,
    },
  };
}

function sameRealm(left, right) {
  return left.platform === right.platform
    && left.arch === right.arch
    && left.nodeVersion === right.nodeVersion
    && left.nodeModulesAbi === right.nodeModulesAbi
    && left.napiVersion === right.napiVersion
    && left.libc.family === right.libc.family
    && left.libc.version === right.libc.version;
}

function normalizePackageManager(value) {
  if (!isRecord(value)
    || !isIdentifier(value.name)
    || typeof value.version !== 'string'
    || !VERSION_PATTERN.test(value.version)
    || !isDigestReference(value.managerRef)) {
    return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_PACKAGE_MANAGER_INVALID' };
  }
  return {
    ok: true,
    value: {
      name: value.name,
      version: value.version,
      managerRef: value.managerRef,
    },
  };
}

function validUnicode(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) return false;
  }
  return value.normalize('NFC') === value;
}

function reservedPortableComponent(value) {
  const baseName = value.split('.')[0];
  return /[ .]$/u.test(value)
    || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]|CONIN\$|CONOUT\$)$/iu.test(baseName);
}

function validArtifactPath(value) {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 4_096
    || /[\u0000-\u001F\u007F]/u.test(value)
    || value.includes('\\')
    || value.includes(':')
    || posixPath.isAbsolute(value)
    || !validUnicode(value)) {
    return false;
  }
  const normalized = posixPath.normalize(value);
  return normalized === value
    && normalized !== '.'
    && !normalized.split('/').includes('..')
    && !normalized.split('/').some(reservedPortableComponent);
}

function nativeLookingArtifactPath(value) {
  const lower = value.toLowerCase();
  return /\.(?:node|dll|dylib|exe)$/u.test(lower)
    || /\.so(?:\.[0-9]+)*$/u.test(lower);
}

function normalizeAbi(value, artifactKind) {
  if (!isRecord(value) || !ABI_KINDS.includes(value.kind)) {
    return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_ARTIFACT_ABI_INVALID' };
  }
  const version = value.version ?? null;
  const platform = value.platform ?? null;
  const arch = value.arch ?? null;
  const libcFamily = value.libcFamily ?? null;
  const libcVersion = value.libcVersion ?? null;
  const identifiersValid = [platform, arch, libcFamily].every(item => (
    item === null || isIdentifier(item)
  ));
  const libcVersionValid = libcVersion === null
    || (typeof libcVersion === 'string' && VERSION_PATTERN.test(libcVersion));
  if (!identifiersValid || !libcVersionValid) {
    return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_ARTIFACT_ABI_INVALID' };
  }

  if (['javascript', 'wasm'].includes(artifactKind)) {
    if (value.kind !== 'none'
      || version !== null
      || platform !== null
      || arch !== null
      || libcFamily !== null
      || libcVersion !== null) {
      return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_PORTABLE_ARTIFACT_INVALID' };
    }
  } else if (value.kind === 'napi' || value.kind === 'node-module') {
    if (!Number.isSafeInteger(version)
      || version <= 0
      || !isIdentifier(platform)
      || !isIdentifier(arch)
      || !isIdentifier(libcFamily)
      || (libcFamily === 'none' ? libcVersion !== null : libcVersion === null)) {
      return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_NATIVE_ARTIFACT_INVALID' };
    }
  } else if (value.kind === 'platform') {
    if (artifactKind !== 'native-executable'
      || version !== null
      || !isIdentifier(platform)
      || !isIdentifier(arch)
      || !isIdentifier(libcFamily)
      || (libcFamily === 'none' ? libcVersion !== null : libcVersion === null)) {
      return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_NATIVE_ARTIFACT_INVALID' };
    }
  } else if (value.kind === 'unknown') {
    if (version !== null
      || platform !== null
      || arch !== null
      || libcFamily !== null
      || libcVersion !== null) {
      return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_UNKNOWN_ARTIFACT_INVALID' };
    }
  } else {
    return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_NATIVE_ARTIFACT_INVALID' };
  }

  return {
    ok: true,
    value: {
      kind: value.kind,
      version,
      platform,
      arch,
      libcFamily,
      libcVersion,
    },
  };
}

function normalizeArtifact(value, index) {
  if (!isRecord(value)
    || !validArtifactPath(value.path)
    || !isDigestReference(value.digestRef)
    || !ARTIFACT_KINDS.includes(value.kind)
    || (nativeLookingArtifactPath(value.path)
      && !['native-addon', 'native-executable'].includes(value.kind))) {
    return {
      ok: false,
      reasonCode: 'E_DEPENDENCY_ABI_ARTIFACT_INVALID',
      details: { index },
    };
  }
  const abi = normalizeAbi(value.abi, value.kind);
  if (!abi.ok) {
    return {
      ok: false,
      reasonCode: abi.reasonCode,
      details: { index },
    };
  }
  return {
    ok: true,
    value: {
      path: value.path,
      digestRef: value.digestRef,
      kind: value.kind,
      abi: abi.value,
    },
  };
}

function normalizeInventory(value, counts) {
  if (!isRecord(value)
    || value.state !== 'COMPLETE'
    || value.nativeDiscovery !== 'COMPLETE'
    || !isDigestReference(value.inventoryRef)
    || !isDigestReference(value.scannerRef)
    || value.artifactCount !== counts.artifactCount
    || value.nativeArtifactCount !== counts.nativeArtifactCount
    || value.unknownAbiArtifactCount !== counts.unknownAbiArtifactCount) {
    return { ok: false, reasonCode: 'E_DEPENDENCY_ABI_INVENTORY_INCOMPLETE' };
  }
  return {
    ok: true,
    value: {
      state: 'COMPLETE',
      nativeDiscovery: 'COMPLETE',
      inventoryRef: value.inventoryRef,
      scannerRef: value.scannerRef,
      artifactCount: counts.artifactCount,
      nativeArtifactCount: counts.nativeArtifactCount,
      unknownAbiArtifactCount: counts.unknownAbiArtifactCount,
    },
  };
}

function artifactRealmConsistency(artifact, buildRealm) {
  if (artifact.kind !== 'native-addon' && artifact.kind !== 'native-executable') {
    return true;
  }
  if (artifact.abi.kind === 'unknown') return true;
  if (artifact.abi.platform !== buildRealm.platform
    || artifact.abi.arch !== buildRealm.arch
    || artifact.abi.libcFamily !== buildRealm.libc.family
    || artifact.abi.libcVersion !== buildRealm.libc.version) {
    return false;
  }
  if (artifact.abi.kind === 'napi') {
    return buildRealm.napiVersion !== null
      && buildRealm.napiVersion >= artifact.abi.version;
  }
  if (artifact.abi.kind === 'node-module') {
    return buildRealm.nodeModulesAbi === artifact.abi.version;
  }
  return true;
}

function codepointCompare(left, right) {
  const leftIterator = left[Symbol.iterator]();
  const rightIterator = right[Symbol.iterator]();
  while (true) {
    const leftNext = leftIterator.next();
    const rightNext = rightIterator.next();
    if (leftNext.done || rightNext.done) {
      if (leftNext.done && rightNext.done) return 0;
      return leftNext.done ? -1 : 1;
    }
    const leftCodePoint = leftNext.value.codePointAt(0);
    const rightCodePoint = rightNext.value.codePointAt(0);
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint < rightCodePoint ? -1 : 1;
    }
  }
}

function portableCollisionKey(value) {
  return value.toLowerCase();
}

function projectionPayload(value) {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    state: value.state,
    proofEligible: value.proofEligible,
    reasonCode: value.reasonCode,
    packageRef: value.packageRef,
    dependencyRef: value.dependencyRef,
    lockRef: value.lockRef,
    runtimeRef: value.runtimeRef,
    dependencyLayerRef: value.dependencyLayerRef,
    buildRealmRef: value.buildRealmRef,
    packageManager: value.packageManager,
    inventory: value.inventory,
    buildRealm: value.buildRealm,
    targetRealm: value.targetRealm,
    artifacts: value.artifacts,
    nativeArtifactCount: value.nativeArtifactCount,
    unknownAbiArtifactCount: value.unknownAbiArtifactCount,
    details: value.details,
  };
}

export function createDependencyAbiProjection(input) {
  if (!isRecord(input)) {
    return projectionHold('E_DEPENDENCY_ABI_INPUT_INVALID');
  }
  if (hasOwn(input, 'proofEligible') || hasOwn(input, 'projectionRef')) {
    return projectionHold('E_DEPENDENCY_ABI_RESERVED_FIELD');
  }
  const referenceFields = [
    'packageRef',
    'dependencyRef',
    'lockRef',
    'runtimeRef',
    'dependencyLayerRef',
    'buildRealmRef',
  ];
  const invalidReference = referenceFields.find(field => !isDigestReference(input[field]));
  if (invalidReference) {
    return projectionHold('E_DEPENDENCY_ABI_REFERENCE_INVALID', {
      field: invalidReference,
    });
  }
  const packageManager = normalizePackageManager(input.packageManager);
  if (!packageManager.ok) {
    return projectionHold(packageManager.reasonCode);
  }
  const buildRealm = normalizeRealm({
    platform: input.platform,
    arch: input.arch,
    nodeVersion: input.nodeVersion,
    nodeModulesAbi: input.nodeModulesAbi,
    napiVersion: input.napiVersion,
    libc: input.libc,
  });
  const targetRealm = normalizeRealm(input.targetRealm);
  if (!buildRealm.ok || !targetRealm.ok) {
    return projectionHold('E_DEPENDENCY_ABI_REALM_INVALID');
  }
  if (!sameRealm(buildRealm.value, targetRealm.value)) {
    return projectionHold('E_DEPENDENCY_ABI_UNPINNED_CROSS_REALM');
  }
  if (!Array.isArray(input.artifacts) || input.artifacts.length === 0) {
    return projectionHold('E_DEPENDENCY_ABI_ARTIFACT_LIST_INVALID');
  }
  if (input.artifacts.length > MAX_ARTIFACTS) {
    return projectionHold('E_DEPENDENCY_ABI_CAPACITY_EXCEEDED', {
      artifactCount: input.artifacts.length,
      maximumArtifactCount: MAX_ARTIFACTS,
    });
  }

  const artifacts = [];
  for (let index = 0; index < input.artifacts.length; index += 1) {
    const artifact = normalizeArtifact(input.artifacts[index], index);
    if (!artifact.ok) {
      return projectionHold(artifact.reasonCode, artifact.details);
    }
    if (!artifactRealmConsistency(artifact.value, buildRealm.value)) {
      return projectionHold('E_DEPENDENCY_ABI_BUILD_REALM_MISMATCH', { index });
    }
    artifacts.push(artifact.value);
  }
  artifacts.sort((left, right) => {
    const collisionOrder = codepointCompare(
      portableCollisionKey(left.path),
      portableCollisionKey(right.path),
    );
    return collisionOrder || codepointCompare(left.path, right.path);
  });
  for (let index = 1; index < artifacts.length; index += 1) {
    if (portableCollisionKey(artifacts[index - 1].path)
      === portableCollisionKey(artifacts[index].path)) {
      return projectionHold('E_DEPENDENCY_ABI_ARTIFACT_DUPLICATE', { index });
    }
  }

  const counts = {
    artifactCount: artifacts.length,
    nativeArtifactCount: artifacts.filter(artifact => (
      artifact.kind === 'native-addon' || artifact.kind === 'native-executable'
    )).length,
    unknownAbiArtifactCount: artifacts.filter(artifact => (
      artifact.abi.kind === 'unknown'
    )).length,
  };
  const inventory = normalizeInventory(input.inventory, counts);
  if (!inventory.ok) {
    return projectionHold(inventory.reasonCode);
  }

  const payload = {
    schemaVersion: DEPENDENCY_ABI_PROJECTION_SCHEMA_VERSION,
    kind: 'dependency-abi-projection',
    state: 'PROJECTED',
    proofEligible: false,
    reasonCode: 'NONE',
    packageRef: input.packageRef,
    dependencyRef: input.dependencyRef,
    lockRef: input.lockRef,
    runtimeRef: input.runtimeRef,
    dependencyLayerRef: input.dependencyLayerRef,
    buildRealmRef: input.buildRealmRef,
    packageManager: packageManager.value,
    inventory: inventory.value,
    buildRealm: buildRealm.value,
    targetRealm: targetRealm.value,
    artifacts,
    nativeArtifactCount: counts.nativeArtifactCount,
    unknownAbiArtifactCount: counts.unknownAbiArtifactCount,
    details: {},
  };
  const projectionRef = containmentDigestRef(payload);
  if (!projectionRef.ok) {
    return projectionHold('E_DEPENDENCY_ABI_DIGEST_FAILED');
  }
  return freezeJson({
    ...payload,
    projectionRef: projectionRef.value,
  });
}

export function validateDependencyAbiProjection(value) {
  if (!isRecord(value)
    || value.schemaVersion !== DEPENDENCY_ABI_PROJECTION_SCHEMA_VERSION
    || value.kind !== 'dependency-abi-projection'
    || value.state !== 'PROJECTED'
    || value.proofEligible !== false
    || value.reasonCode !== 'NONE'
    || !isDigestReference(value.projectionRef)
    || !isRecord(value.buildRealm)
    || !isRecord(value.targetRealm)
    || !Array.isArray(value.artifacts)
    || !isRecord(value.details)) {
    return {
      ok: false,
      hold: projectionHold('E_DEPENDENCY_ABI_PROJECTION_INVALID'),
    };
  }

  const reconstructed = createDependencyAbiProjection({
    packageRef: value.packageRef,
    dependencyRef: value.dependencyRef,
    lockRef: value.lockRef,
    runtimeRef: value.runtimeRef,
    dependencyLayerRef: value.dependencyLayerRef,
    buildRealmRef: value.buildRealmRef,
    packageManager: value.packageManager,
    inventory: value.inventory,
    platform: value.buildRealm.platform,
    arch: value.buildRealm.arch,
    nodeVersion: value.buildRealm.nodeVersion,
    nodeModulesAbi: value.buildRealm.nodeModulesAbi,
    napiVersion: value.buildRealm.napiVersion,
    libc: value.buildRealm.libc,
    targetRealm: value.targetRealm,
    artifacts: value.artifacts,
  });
  if (reconstructed.state !== 'PROJECTED'
    || JSON.stringify(reconstructed) !== JSON.stringify(value)) {
    return {
      ok: false,
      hold: projectionHold('E_DEPENDENCY_ABI_PROJECTION_INVALID'),
    };
  }
  return { ok: true, value: reconstructed };
}

function artifactCompatibility(artifact, targetRealm) {
  if (artifact.abi.kind === 'unknown') {
    return 'E_DEPENDENCY_ABI_UNKNOWN';
  }
  if (artifact.abi.platform !== targetRealm.platform) {
    return 'E_DEPENDENCY_ABI_PLATFORM_MISMATCH';
  }
  if (artifact.abi.arch !== targetRealm.arch) {
    return 'E_DEPENDENCY_ABI_ARCH_MISMATCH';
  }
  if (artifact.abi.libcFamily !== targetRealm.libc.family
    || artifact.abi.libcVersion !== targetRealm.libc.version) {
    return 'E_DEPENDENCY_ABI_LIBC_MISMATCH';
  }
  if (artifact.abi.kind === 'napi'
    && (targetRealm.napiVersion === null
      || targetRealm.napiVersion < artifact.abi.version)) {
    return 'E_DEPENDENCY_ABI_NAPI_MISMATCH';
  }
  if (artifact.abi.kind === 'node-module'
    && targetRealm.nodeModulesAbi !== artifact.abi.version) {
    return 'E_DEPENDENCY_ABI_NODE_MODULE_MISMATCH';
  }
  return null;
}

export function evaluateDependencyAbiCompatibility(input) {
  if (!isRecord(input)) {
    return compatibilityHold(
      'E_DEPENDENCY_ABI_COMPATIBILITY_INPUT_INVALID',
      null,
      null,
      [],
    );
  }
  const projectionValidation = validateDependencyAbiProjection(input.projection);
  if (!projectionValidation.ok) {
    return compatibilityHold(
      'E_DEPENDENCY_ABI_PROJECTION_INVALID',
      null,
      null,
      [],
    );
  }
  const targetRealm = normalizeRealm(input.targetRealm);
  if (!targetRealm.ok
    || !isDigestReference(input.targetRuntimeRef)
    || !isDigestReference(input.targetDependencyLayerRef)
    || !isDigestReference(input.targetBuildRealmRef)) {
    return compatibilityHold(
      'E_DEPENDENCY_ABI_TARGET_REALM_INVALID',
      projectionValidation.value.projectionRef,
      null,
      [],
    );
  }

  const projection = projectionValidation.value;
  if (!sameRealm(projection.targetRealm, targetRealm.value)
    || !sameRealm(projection.buildRealm, targetRealm.value)
    || input.targetRuntimeRef !== projection.runtimeRef
    || input.targetDependencyLayerRef !== projection.dependencyLayerRef
    || input.targetBuildRealmRef !== projection.buildRealmRef) {
    return compatibilityHold(
      'E_DEPENDENCY_ABI_TARGET_BINDING_MISMATCH',
      projection.projectionRef,
      targetRealm.value,
      [],
      {
        targetRuntimeRef: input.targetRuntimeRef,
        targetDependencyLayerRef: input.targetDependencyLayerRef,
        targetBuildRealmRef: input.targetBuildRealmRef,
      },
    );
  }

  const blockingArtifacts = [];
  for (const artifact of projection.artifacts) {
    if (artifact.kind !== 'native-addon' && artifact.kind !== 'native-executable') continue;
    const reasonCode = artifactCompatibility(artifact, targetRealm.value);
    if (reasonCode) {
      blockingArtifacts.push({
        path: artifact.path,
        reasonCode,
      });
    }
  }
  if (blockingArtifacts.length > 0) {
    return compatibilityHold(
      blockingArtifacts[0].reasonCode,
      projection.projectionRef,
      targetRealm.value,
      blockingArtifacts,
      { targetRuntimeRef: input.targetRuntimeRef },
    );
  }

  return compatibilityHold(
    'E_DEPENDENCY_ABI_SCANNER_AUTHORITY_REQUIRED',
    projection.projectionRef,
    targetRealm.value,
    [],
    {
      diagnosticState: 'UNVERIFIED_MATCH',
      targetRuntimeRef: input.targetRuntimeRef,
      targetDependencyLayerRef: input.targetDependencyLayerRef,
      targetBuildRealmRef: input.targetBuildRealmRef,
      nativeArtifactCount: projection.nativeArtifactCount,
    },
  );
}
