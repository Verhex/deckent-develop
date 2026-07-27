import {
  posix as posixPath,
  win32 as win32Path,
} from 'node:path';

import { containmentDigestRef } from './containment-authority.mjs';

const PATH_STYLES = [
  'posix',
  'win32',
];

const BOUNDARY_CLASSES = [
  'kernel',
  'virtualized-kernel',
];

const MOUNT_KINDS = [
  'runtime',
  'source',
  'dependency',
  'control',
  'gate',
  'scratch',
  'output',
];

const READ_ONLY_MOUNT_KINDS = [
  'runtime',
  'source',
  'dependency',
  'control',
  'gate',
  'output',
];

const WRITABLE_MOUNT_KINDS = [
  'scratch',
];

const REQUIRED_MOUNT_KINDS = [
  'runtime',
  'source',
  'dependency',
  'control',
  'gate',
  'scratch',
  'output',
];

const BROAD_POSIX_SOURCES = [
  '/',
  '/bin',
  '/dev',
  '/etc',
  '/home',
  '/lib',
  '/lib64',
  '/mnt',
  '/opt',
  '/proc',
  '/root',
  '/run',
  '/sbin',
  '/sys',
  '/tmp',
  '/usr',
  '/Users',
  '/var',
];

const BROAD_WIN32_SOURCES = [
  'C:\\',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\Users',
  'C:\\Windows',
];

const SENSITIVE_POSIX_SOURCE_TREES = [
  '/boot',
  '/dev',
  '/etc',
  '/home',
  '/media',
  '/mnt',
  '/private',
  '/proc',
  '/root',
  '/run',
  '/sys',
  '/Users',
  '/var',
  '/Volumes',
];

const SENSITIVE_WIN32_ROOT_NAMES = [
  'program files',
  'program files (x86)',
  'programdata',
  'users',
  'windows',
];

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const DIGEST_REFERENCE_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const NODE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/u;

export const RUNTIME_PROJECTION_SCHEMA_VERSION = 1;

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

function isIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function isDigestReference(value) {
  return typeof value === 'string' && DIGEST_REFERENCE_PATTERN.test(value);
}

function projectionHold(reasonCode, details = {}) {
  return freezeJson({
    schemaVersion: RUNTIME_PROJECTION_SCHEMA_VERSION,
    kind: 'runtime-projection',
    state: 'HOLD',
    proofEligible: false,
    reasonCode,
    projectionRef: null,
    details: detailRecord(details),
  });
}

function evaluationHold(reasonCode, projectionRef, details = {}) {
  return freezeJson({
    schemaVersion: RUNTIME_PROJECTION_SCHEMA_VERSION,
    kind: 'runtime-projection-evaluation',
    state: 'HOLD',
    proofEligible: false,
    reasonCode,
    projectionRef,
    details: detailRecord(details),
  });
}

function pathApi(pathStyle) {
  return pathStyle === 'win32' ? win32Path : posixPath;
}

function comparisonPath(value, pathStyle) {
  return pathStyle === 'win32' ? value.toLowerCase() : value;
}

function validUnicode(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) return false;
  }
  return value.normalize('NFC') === value;
}

function unsafeWin32Path(value) {
  if (value.startsWith('\\\\') || value.slice(2).includes(':')) return true;
  const components = value.slice(3).split('\\');
  return components.some(component => {
    const baseName = component.split('.')[0];
    return /[ .]$/u.test(component)
      || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]|CONIN\$|CONOUT\$)$/iu.test(baseName);
  });
}

function canonicalAbsolutePath(value, pathStyle) {
  if (!PATH_STYLES.includes(pathStyle)
    || typeof value !== 'string'
    || value.length === 0
    || value.length > 32_768
    || /[\u0000-\u001F\u007F]/u.test(value)
    || value.includes(',')
    || !validUnicode(value)) {
    return { ok: false, reasonCode: 'E_RUNTIME_PROJECTION_PATH_INVALID' };
  }
  const api = pathApi(pathStyle);
  if (!api.isAbsolute(value)) {
    return { ok: false, reasonCode: 'E_RUNTIME_PROJECTION_PATH_NOT_ABSOLUTE' };
  }
  const normalized = api.normalize(value);
  if (normalized !== value
    || value.split(pathStyle === 'win32' ? /[\\/]/u : '/').includes('..')) {
    return { ok: false, reasonCode: 'E_RUNTIME_PROJECTION_PATH_NOT_CANONICAL' };
  }
  if (pathStyle === 'win32' && unsafeWin32Path(value)) {
    return { ok: false, reasonCode: 'E_RUNTIME_PROJECTION_DEVICE_PATH_DENIED' };
  }
  return { ok: true, value: normalized };
}

function rootPath(value, pathStyle) {
  const parsed = pathApi(pathStyle).parse(value);
  return comparisonPath(parsed.root, pathStyle) === comparisonPath(value, pathStyle);
}

function broadSourcePath(value, pathStyle) {
  if (rootPath(value, pathStyle)) return true;
  const sources = pathStyle === 'win32'
    ? BROAD_WIN32_SOURCES
    : BROAD_POSIX_SOURCES;
  const compared = comparisonPath(value, pathStyle);
  return sources.some(source => comparisonPath(source, pathStyle) === compared);
}

function pathContains(parent, child, pathStyle) {
  const api = pathApi(pathStyle);
  const relative = comparisonPath(api.relative(parent, child), pathStyle);
  return relative === ''
    || (!relative.startsWith(`..${api.sep}`)
      && relative !== '..'
      && !api.isAbsolute(relative));
}

function pathsOverlap(left, right, pathStyle) {
  return pathContains(left, right, pathStyle)
    || pathContains(right, left, pathStyle);
}

function sensitiveSourcePath(value, pathStyle) {
  if (pathStyle === 'win32') {
    const parsed = win32Path.parse(value);
    const firstComponent = value
      .slice(parsed.root.length)
      .split('\\')[0]
      .toLowerCase();
    return SENSITIVE_WIN32_ROOT_NAMES.includes(firstComponent);
  }
  return SENSITIVE_POSIX_SOURCE_TREES.some(tree => (
    pathContains(tree, value, pathStyle)
  ));
}

function hostAuthorityPath(value, pathStyle) {
  const compared = comparisonPath(value, pathStyle);
  if (pathStyle === 'win32') {
    return compared.includes('\\pipe\\docker_engine')
      || compared.includes('\\pipe\\containerd-containerd')
      || compared.includes('\\globalroot\\device\\');
  }
  const forbiddenTrees = [
    '/dev',
    '/proc',
    '/run/user',
    '/sys',
  ];
  if (forbiddenTrees.some(path => (
    compared === path || compared.startsWith(`${path}/`)
  ))) {
    return true;
  }
  return [
    '/run/containerd/containerd.sock',
    '/run/docker.sock',
    '/var/run/docker.sock',
  ].some(path => compared === path || compared.startsWith(`${path}/`));
}

function mountModeForKind(kind) {
  return READ_ONLY_MOUNT_KINDS.includes(kind) ? 'ro' : 'rw';
}

function normalizeMount(input, options) {
  if (!isRecord(input)
    || !MOUNT_KINDS.includes(input.kind)
    || !['ro', 'rw'].includes(input.mode)
    || typeof input.workloadWritable !== 'boolean') {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_MOUNT_INVALID',
    };
  }
  const source = canonicalAbsolutePath(input.source, options.hostPathStyle);
  const target = canonicalAbsolutePath(input.target, options.targetPathStyle);
  if (!source.ok || !target.ok) {
    return {
      ok: false,
      reasonCode: source.ok ? target.reasonCode : source.reasonCode,
    };
  }
  if (broadSourcePath(source.value, options.hostPathStyle)) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_BROAD_SOURCE_DENIED',
    };
  }
  if (sensitiveSourcePath(source.value, options.hostPathStyle)) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_SENSITIVE_SOURCE_DENIED',
    };
  }
  if (rootPath(target.value, options.targetPathStyle)) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_ROOT_TARGET_DENIED',
    };
  }
  if (hostAuthorityPath(source.value, options.hostPathStyle)
    || hostAuthorityPath(target.value, options.targetPathStyle)) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_HOST_AUTHORITY_DENIED',
    };
  }
  const expectedMode = mountModeForKind(input.kind);
  if (input.mode !== expectedMode
    || input.workloadWritable !== WRITABLE_MOUNT_KINDS.includes(input.kind)) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_MOUNT_AUTHORITY_INVALID',
    };
  }
  return {
    ok: true,
    value: {
      kind: input.kind,
      source: source.value,
      target: target.value,
      mode: input.mode,
      workloadWritable: input.workloadWritable,
    },
  };
}

export function classifyRuntimeMount(input) {
  if (!isRecord(input)
    || !PATH_STYLES.includes(input.hostPathStyle)
    || !PATH_STYLES.includes(input.targetPathStyle)) {
    return freezeJson({
      state: 'HOLD',
      proofEligible: false,
      reasonCode: 'E_RUNTIME_PROJECTION_MOUNT_INPUT_INVALID',
      mount: null,
    });
  }
  const normalized = normalizeMount(input.mount, input);
  if (!normalized.ok) {
    return freezeJson({
      state: 'HOLD',
      proofEligible: false,
      reasonCode: normalized.reasonCode,
      mount: null,
    });
  }
  return freezeJson({
    state: 'ACCEPTED',
    proofEligible: false,
    reasonCode: 'NONE',
    mount: normalized.value,
  });
}

function mountKey(mount, hostPathStyle, targetPathStyle) {
  return [
    mount.kind,
    comparisonPath(mount.source, hostPathStyle),
    comparisonPath(mount.target, targetPathStyle),
    mount.mode,
    String(mount.workloadWritable),
  ].join('\u0001');
}

function normalizeMountSet(value, field, pathStyles) {
  if (!Array.isArray(value)
    || value.length !== REQUIRED_MOUNT_KINDS.length) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_MOUNT_SET_INVALID',
      details: { field },
    };
  }
  const mounts = [];
  const keys = [];
  for (let index = 0; index < value.length; index += 1) {
    const mount = normalizeMount(value[index], pathStyles);
    if (!mount.ok) {
      return {
        ok: false,
        reasonCode: mount.reasonCode,
        details: { field, index },
      };
    }
    const key = mountKey(
      mount.value,
      pathStyles.hostPathStyle,
      pathStyles.targetPathStyle,
    );
    if (keys.includes(key)) {
      return {
        ok: false,
        reasonCode: 'E_RUNTIME_PROJECTION_MOUNT_DUPLICATE',
        details: { field, index },
      };
    }
    keys.push(key);
    mounts.push(mount.value);
  }
  const kinds = mounts.map(mount => mount.kind);
  if (!REQUIRED_MOUNT_KINDS.every(kind => (
    kinds.filter(candidate => candidate === kind).length === 1
  ))) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_MOUNT_KIND_SET_INVALID',
      details: { field },
    };
  }
  mounts.sort((left, right) => (
    REQUIRED_MOUNT_KINDS.indexOf(left.kind) - REQUIRED_MOUNT_KINDS.indexOf(right.kind)
  ));
  return { ok: true, value: mounts };
}

function normalizeRootAuthority(value, pathStyles) {
  if (!isRecord(value)
    || !isDigestReference(value.authorityRef)
    || !Array.isArray(value.roots)
    || value.roots.length !== REQUIRED_MOUNT_KINDS.length) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_ROOT_AUTHORITY_INVALID',
    };
  }

  const roots = [];
  const seenKinds = [];
  const seenPaths = [];
  const seenRefs = [];
  for (let index = 0; index < value.roots.length; index += 1) {
    const root = value.roots[index];
    if (!isRecord(root)
      || !MOUNT_KINDS.includes(root.kind)
      || !isDigestReference(root.rootRef)) {
      return {
        ok: false,
        reasonCode: 'E_RUNTIME_PROJECTION_ROOT_AUTHORITY_INVALID',
        details: { index },
      };
    }
    const path = canonicalAbsolutePath(root.path, pathStyles.hostPathStyle);
    if (!path.ok
      || broadSourcePath(path.value ?? '', pathStyles.hostPathStyle)
      || sensitiveSourcePath(path.value ?? '', pathStyles.hostPathStyle)
      || hostAuthorityPath(path.value ?? '', pathStyles.hostPathStyle)) {
      return {
        ok: false,
        reasonCode: path.ok
          ? 'E_RUNTIME_PROJECTION_ROOT_AUTHORITY_PATH_DENIED'
          : path.reasonCode,
        details: { index },
      };
    }
    const comparedPath = comparisonPath(path.value, pathStyles.hostPathStyle);
    if (seenKinds.includes(root.kind)
      || seenPaths.includes(comparedPath)
      || seenRefs.includes(root.rootRef)) {
      return {
        ok: false,
        reasonCode: 'E_RUNTIME_PROJECTION_ROOT_AUTHORITY_DUPLICATE',
        details: { index },
      };
    }
    seenKinds.push(root.kind);
    seenPaths.push(comparedPath);
    seenRefs.push(root.rootRef);
    roots.push({
      kind: root.kind,
      path: path.value,
      rootRef: root.rootRef,
    });
  }
  if (!REQUIRED_MOUNT_KINDS.every(kind => seenKinds.includes(kind))) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_ROOT_AUTHORITY_INVALID',
    };
  }
  roots.sort((left, right) => (
    REQUIRED_MOUNT_KINDS.indexOf(left.kind) - REQUIRED_MOUNT_KINDS.indexOf(right.kind)
  ));
  return {
    ok: true,
    value: {
      authorityRef: value.authorityRef,
      roots,
    },
  };
}

function rootsAuthorizeMounts(rootAuthority, mounts, hostPathStyle) {
  return mounts.every(mount => {
    const root = rootAuthority.roots.find(candidate => candidate.kind === mount.kind);
    return root
      && comparisonPath(root.path, hostPathStyle)
        === comparisonPath(mount.source, hostPathStyle);
  });
}

function normalizeNativeAttestationRefs(value, mode) {
  if (!Array.isArray(value) || value.length > 4_096) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_NATIVE_ATTESTATION_INVALID',
    };
  }
  const refs = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!isDigestReference(value[index]) || refs.includes(value[index])) {
      return {
        ok: false,
        reasonCode: 'E_RUNTIME_PROJECTION_NATIVE_ATTESTATION_INVALID',
        details: { index },
      };
    }
    refs.push(value[index]);
  }
  refs.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  if ((mode === 'ATTESTED_ONLY' && refs.length === 0)
    || (mode === 'DENY' && refs.length !== 0)) {
    return {
      ok: false,
      reasonCode: 'E_RUNTIME_PROJECTION_NATIVE_ATTESTATION_INVALID',
    };
  }
  return { ok: true, value: refs };
}

function unsafeMountOverlap(mounts, pathStyles) {
  for (let leftIndex = 0; leftIndex < mounts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < mounts.length; rightIndex += 1) {
      const left = mounts[leftIndex];
      const right = mounts[rightIndex];
      if (pathsOverlap(left.source, right.source, pathStyles.hostPathStyle)
        && (left.mode === 'rw' || right.mode === 'rw')) {
        return {
          field: 'source',
          leftKind: left.kind,
          rightKind: right.kind,
        };
      }
      if (pathsOverlap(left.target, right.target, pathStyles.targetPathStyle)
        && (left.mode === 'rw' || right.mode === 'rw')) {
        return {
          field: 'target',
          leftKind: left.kind,
          rightKind: right.kind,
        };
      }
      if (comparisonPath(left.target, pathStyles.targetPathStyle)
        === comparisonPath(right.target, pathStyles.targetPathStyle)) {
        return {
          field: 'target',
          leftKind: left.kind,
          rightKind: right.kind,
        };
      }
    }
  }
  return null;
}

function exactMountAuthority(mounts, allowedMounts, pathStyles) {
  const allowedKeys = allowedMounts.map(mount => (
    mountKey(mount, pathStyles.hostPathStyle, pathStyles.targetPathStyle)
  ));
  return mounts.every(mount => allowedKeys.includes(
    mountKey(mount, pathStyles.hostPathStyle, pathStyles.targetPathStyle),
  ));
}

function normalizeStdio(value) {
  if (!Array.isArray(value) || value.length !== 3) {
    return { ok: false, reasonCode: 'E_RUNTIME_PROJECTION_STDIO_INVALID' };
  }
  const expected = [
    { fd: 0, role: 'stdin', mode: 'read' },
    { fd: 1, role: 'stdout', mode: 'write' },
    { fd: 2, role: 'stderr', mode: 'write' },
  ];
  for (let index = 0; index < expected.length; index += 1) {
    const descriptor = value[index];
    if (!isRecord(descriptor)
      || descriptor.fd !== expected[index].fd
      || descriptor.role !== expected[index].role
      || descriptor.mode !== expected[index].mode
      || hasOwn(descriptor, 'sourceFd')
      || hasOwn(descriptor, 'path')) {
      return { ok: false, reasonCode: 'E_RUNTIME_PROJECTION_STDIO_INVALID' };
    }
  }
  return { ok: true, value: expected };
}

function normalizeProcessTree(value) {
  if (!isRecord(value)
    || value.ownership !== 'SUPERVISOR'
    || value.killOnSupervisorExit !== true
    || value.descendantTracking !== true
    || value.settlementRequired !== true) {
    return { ok: false, reasonCode: 'E_RUNTIME_PROJECTION_PROCESS_TREE_INVALID' };
  }
  return {
    ok: true,
    value: {
      ownership: 'SUPERVISOR',
      killOnSupervisorExit: true,
      descendantTracking: true,
      settlementRequired: true,
    },
  };
}

function runtimeProjectionPayload(value) {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    state: value.state,
    proofEligible: value.proofEligible,
    reasonCode: value.reasonCode,
    platform: value.platform,
    variant: value.variant,
    arch: value.arch,
    nodeVersion: value.nodeVersion,
    nodeMajor: value.nodeMajor,
    runtimeRef: value.runtimeRef,
    dependencyProjectionRef: value.dependencyProjectionRef,
    adapterId: value.adapterId,
    boundaryClass: value.boundaryClass,
    hostPathStyle: value.hostPathStyle,
    targetPathStyle: value.targetPathStyle,
    networkMode: value.networkMode,
    nativeCodeMode: value.nativeCodeMode,
    nativeCodeAttestationRefs: value.nativeCodeAttestationRefs,
    startupMode: value.startupMode,
    processTree: value.processTree,
    stdio: value.stdio,
    rootAuthority: value.rootAuthority,
    allowedMounts: value.allowedMounts,
    mounts: value.mounts,
    details: value.details,
  };
}

export function createRuntimeProjection(input) {
  if (!isRecord(input)) {
    return projectionHold('E_RUNTIME_PROJECTION_INPUT_INVALID');
  }
  if (hasOwn(input, 'proofEligible') || hasOwn(input, 'projectionRef')) {
    return projectionHold('E_RUNTIME_PROJECTION_RESERVED_FIELD');
  }
  if (!isIdentifier(input.platform)
    || !isIdentifier(input.variant)
    || !isIdentifier(input.arch)
    || typeof input.nodeVersion !== 'string'
    || !NODE_VERSION_PATTERN.test(input.nodeVersion)
    || !Number.isSafeInteger(input.nodeMajor)
    || !isDigestReference(input.runtimeRef)
    || !isDigestReference(input.dependencyProjectionRef)
    || !isIdentifier(input.adapterId)
    || !BOUNDARY_CLASSES.includes(input.boundaryClass)
    || !PATH_STYLES.includes(input.hostPathStyle)
    || !PATH_STYLES.includes(input.targetPathStyle)) {
    return projectionHold('E_RUNTIME_PROJECTION_IDENTITY_INVALID');
  }
  if (input.nodeMajor < 24
    || Number.parseInt(input.nodeVersion.split('.')[0], 10) !== input.nodeMajor) {
    return projectionHold('E_RUNTIME_PROJECTION_RUNTIME_UNSUPPORTED');
  }
  if (input.networkMode !== 'DENY') {
    return projectionHold('E_RUNTIME_PROJECTION_NETWORK_NOT_DENIED');
  }
  if (!['DENY', 'ATTESTED_ONLY'].includes(input.nativeCodeMode)) {
    return projectionHold('E_RUNTIME_PROJECTION_NATIVE_CODE_INVALID');
  }
  const nativeCodeAttestationRefs = normalizeNativeAttestationRefs(
    input.nativeCodeAttestationRefs,
    input.nativeCodeMode,
  );
  if (!nativeCodeAttestationRefs.ok) {
    return projectionHold(
      nativeCodeAttestationRefs.reasonCode,
      nativeCodeAttestationRefs.details,
    );
  }
  if (input.startupMode !== 'SANITIZED') {
    return projectionHold('E_RUNTIME_PROJECTION_STARTUP_UNSANITIZED');
  }
  const processTree = normalizeProcessTree(input.processTree);
  if (!processTree.ok) {
    return projectionHold(processTree.reasonCode);
  }
  const stdio = normalizeStdio(input.stdio);
  if (!stdio.ok) {
    return projectionHold(stdio.reasonCode);
  }

  const pathStyles = {
    hostPathStyle: input.hostPathStyle,
    targetPathStyle: input.targetPathStyle,
  };
  const rootAuthority = normalizeRootAuthority(input.rootAuthority, pathStyles);
  if (!rootAuthority.ok) {
    return projectionHold(rootAuthority.reasonCode, rootAuthority.details);
  }
  const allowedMounts = normalizeMountSet(
    input.allowedMounts,
    'allowedMounts',
    pathStyles,
  );
  if (!allowedMounts.ok) {
    return projectionHold(allowedMounts.reasonCode, allowedMounts.details);
  }
  const mounts = normalizeMountSet(input.mounts, 'mounts', pathStyles);
  if (!mounts.ok) {
    return projectionHold(mounts.reasonCode, mounts.details);
  }
  if (!exactMountAuthority(mounts.value, allowedMounts.value, pathStyles)
    || !exactMountAuthority(allowedMounts.value, mounts.value, pathStyles)) {
    return projectionHold('E_RUNTIME_PROJECTION_MOUNT_NOT_EXACTLY_ALLOWED');
  }
  if (!rootsAuthorizeMounts(
    rootAuthority.value,
    mounts.value,
    pathStyles.hostPathStyle,
  )) {
    return projectionHold('E_RUNTIME_PROJECTION_ROOT_AUTHORITY_MISMATCH');
  }
  const overlap = unsafeMountOverlap(mounts.value, pathStyles);
  if (overlap) {
    return projectionHold('E_RUNTIME_PROJECTION_WRITABLE_OVERLAP', overlap);
  }

  const payload = {
    schemaVersion: RUNTIME_PROJECTION_SCHEMA_VERSION,
    kind: 'runtime-projection',
    state: 'PROJECTED',
    proofEligible: false,
    reasonCode: 'NONE',
    platform: input.platform,
    variant: input.variant,
    arch: input.arch,
    nodeVersion: input.nodeVersion,
    nodeMajor: input.nodeMajor,
    runtimeRef: input.runtimeRef,
    dependencyProjectionRef: input.dependencyProjectionRef,
    adapterId: input.adapterId,
    boundaryClass: input.boundaryClass,
    hostPathStyle: input.hostPathStyle,
    targetPathStyle: input.targetPathStyle,
    networkMode: 'DENY',
    nativeCodeMode: input.nativeCodeMode,
    nativeCodeAttestationRefs: nativeCodeAttestationRefs.value,
    startupMode: 'SANITIZED',
    processTree: processTree.value,
    stdio: stdio.value,
    rootAuthority: rootAuthority.value,
    allowedMounts: allowedMounts.value,
    mounts: mounts.value,
    details: {},
  };
  const projectionRef = containmentDigestRef(payload);
  if (!projectionRef.ok) {
    return projectionHold('E_RUNTIME_PROJECTION_DIGEST_FAILED');
  }
  return freezeJson({
    ...payload,
    projectionRef: projectionRef.value,
  });
}

export function validateRuntimeProjection(value) {
  if (!isRecord(value)
    || value.schemaVersion !== RUNTIME_PROJECTION_SCHEMA_VERSION
    || value.kind !== 'runtime-projection'
    || value.state !== 'PROJECTED'
    || value.proofEligible !== false
    || value.reasonCode !== 'NONE'
    || !isDigestReference(value.projectionRef)
    || !isRecord(value.details)) {
    return {
      ok: false,
      hold: projectionHold('E_RUNTIME_PROJECTION_INVALID'),
    };
  }
  const reconstructed = createRuntimeProjection({
    platform: value.platform,
    variant: value.variant,
    arch: value.arch,
    nodeVersion: value.nodeVersion,
    nodeMajor: value.nodeMajor,
    runtimeRef: value.runtimeRef,
    dependencyProjectionRef: value.dependencyProjectionRef,
    adapterId: value.adapterId,
    boundaryClass: value.boundaryClass,
    hostPathStyle: value.hostPathStyle,
    targetPathStyle: value.targetPathStyle,
    networkMode: value.networkMode,
    nativeCodeMode: value.nativeCodeMode,
    nativeCodeAttestationRefs: value.nativeCodeAttestationRefs,
    startupMode: value.startupMode,
    processTree: value.processTree,
    stdio: value.stdio,
    rootAuthority: value.rootAuthority,
    allowedMounts: value.allowedMounts,
    mounts: value.mounts,
  });
  if (reconstructed.state !== 'PROJECTED'
    || JSON.stringify(reconstructed) !== JSON.stringify(value)) {
    return {
      ok: false,
      hold: projectionHold('E_RUNTIME_PROJECTION_INVALID'),
    };
  }
  return { ok: true, value: reconstructed };
}

export function evaluateRuntimeProjection(input) {
  if (!isRecord(input)) {
    return evaluationHold('E_RUNTIME_PROJECTION_EVALUATION_INPUT_INVALID', null);
  }
  const validation = validateRuntimeProjection(input.projection);
  if (!validation.ok) {
    return evaluationHold('E_RUNTIME_PROJECTION_INVALID', null);
  }
  const projection = validation.value;
  const bindings = [
    ['runtimeRef', input.expectedRuntimeRef],
    ['adapterId', input.expectedAdapterId],
    ['boundaryClass', input.expectedBoundaryClass],
  ];
  const mismatch = bindings.find(([field, expected]) => projection[field] !== expected);
  if (mismatch) {
    return evaluationHold(
      'E_RUNTIME_PROJECTION_BINDING_MISMATCH',
      projection.projectionRef,
      { field: mismatch[0] },
    );
  }
  return evaluationHold(
    'E_RUNTIME_PROJECTION_HOST_AUTHORITY_REQUIRED',
    projection.projectionRef,
    {
      diagnosticState: 'UNVERIFIED_MATCH',
      runtimeRef: projection.runtimeRef,
      adapterId: projection.adapterId,
      boundaryClass: projection.boundaryClass,
    },
  );
}
