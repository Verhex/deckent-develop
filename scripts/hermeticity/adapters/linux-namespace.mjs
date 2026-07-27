import { createHash } from 'node:crypto';

const ADAPTER_ID = 'linux-namespace-v1';
const LIVE_EVIDENCE_TIERS = Object.freeze(['E2', 'E3', 'E4', 'E5']);

export const LINUX_NAMESPACE_REQUIRED_FACETS = Object.freeze([
  'userNamespace',
  'mountNamespace',
  'pidNamespace',
  'networkNamespace',
  'ipcNamespace',
  'utsNamespace',
  'emptyRoot',
  'sourceReadonly',
  'hostRootHidden',
  'scratchWritable',
  'noNewPrivileges',
  'capabilitiesDropped',
  'seccomp',
  'processTreeFinality',
  'resourceBounds',
  'runtimeProjectionVerified',
  'dependencyProjectionVerified',
]);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function authorityEvidence(value) {
  return value?.verified === true
    && value.source === 'containment-authority'
    && LIVE_EVIDENCE_TIERS.includes(value.tier)
    && sha256(value.digest);
}

function missingFacets(facets) {
  return LINUX_NAMESPACE_REQUIRED_FACETS.filter(name => facets?.[name] !== true);
}

function capability(status, code, input, missing = []) {
  return Object.freeze({
    adapterId: ADAPTER_ID,
    status,
    code,
    evidenceTier: authorityEvidence(input?.authorityEvidence)
      ? input.authorityEvidence.tier
      : (input?.launcher ? 'E1' : 'E0'),
    proofEligible: false,
    facets: Object.freeze(record(input?.facets) ? { ...input.facets } : {}),
    missingFacets: Object.freeze([...missing]),
  });
}

function absolutePosixPath(value) {
  if (typeof value !== 'string'
    || !value.startsWith('/')
    || value.includes('\0')
    || /[\r\n]/u.test(value)) {
    return false;
  }
  if (value === '/') return true;
  return value.slice(1).split('/').every(segment => (
    segment.length > 0 && segment !== '.' && segment !== '..'
  ));
}

function rootPath(value) {
  return absolutePosixPath(value) && /^\/+$/u.test(value);
}

function unsafeHostPath(value) {
  if (!absolutePosixPath(value) || rootPath(value)) return true;
  const normalized = value.replace(/\/+$/u, '');
  return [
    '/bin',
    '/boot',
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
    '/srv',
    '/sys',
    '/usr',
    '/Users',
    '/Volumes',
    '/var',
  ].some(path => normalized === path || normalized.startsWith(`${path}/`));
}

function validLauncher(launcher) {
  if (!['bwrap', 'unshare'].includes(launcher?.kind)
    || !absolutePosixPath(launcher?.absolutePath)
    || !sha256(launcher?.digest)
    || launcher?.trustedOwner !== true
    || typeof launcher?.version !== 'string'
    || launcher.version.length === 0) {
    return false;
  }
  if (launcher.kind === 'unshare') {
    return absolutePosixPath(launcher.enterHelper?.absolutePath)
      && sha256(launcher.enterHelper?.digest)
      && launcher.enterHelper?.attested === true;
  }
  return true;
}

function validResources(resources) {
  return Number.isSafeInteger(resources?.maxPids) && resources.maxPids > 0
    && Number.isSafeInteger(resources?.memoryBytes) && resources.memoryBytes > 0
    && Number.isSafeInteger(resources?.cpuMillis) && resources.cpuMillis > 0
    && Number.isSafeInteger(resources?.wallClockMs) && resources.wallClockMs > 0;
}

function validReadonlyMount(mount) {
  return absolutePosixPath(mount?.source)
    && absolutePosixPath(mount?.target)
    && !rootPath(mount.source)
    && !rootPath(mount.target)
    && mount?.readonly === true
    && !unsafeHostPath(mount.source);
}

function validScratchMount(mount) {
  return absolutePosixPath(mount?.source)
    && absolutePosixPath(mount?.target)
    && !rootPath(mount.source)
    && !rootPath(mount.target)
    && !unsafeHostPath(mount.source)
    && mount?.readonly === false;
}

function validRuntimeProjection(projection) {
  return projection?.verified === true
    && sha256(projection?.digest)
    && Array.isArray(projection?.roots)
    && projection.roots.length > 0
    && projection.roots.every(validReadonlyMount)
    && !projection.roots.some(root => root.source === '/' || root.target === '/');
}

function validDependencyProjection(projection) {
  return projection?.verified === true
    && sha256(projection?.digest)
    && projection?.compatible === true;
}

function validWorkload(workload) {
  return absolutePosixPath(workload?.executable)
    && Array.isArray(workload?.args)
    && workload.args.every(value => typeof value === 'string' && !value.includes('\0'));
}

function pathsOverlap(left, right) {
  const normalized = value => value.replace(/\/+$/u, '');
  const leftPath = normalized(left);
  const rightPath = normalized(right);
  return leftPath === rightPath
    || leftPath.startsWith(`${rightPath}/`)
    || rightPath.startsWith(`${leftPath}/`);
}

function sameMount(left, right) {
  return record(left)
    && record(right)
    && left.source === right.source
    && left.target === right.target
    && left.readonly === right.readonly;
}

function mountAuthorityPayload(authority) {
  return {
    schemaVersion: authority.schemaVersion,
    kind: authority.kind,
    adapterId: authority.adapterId,
    source: authority.source,
    verified: authority.verified,
    evidenceDigest: authority.evidenceDigest,
    mounts: authority.mounts.map(mount => ({
      source: mount.source,
      target: mount.target,
      readonly: mount.readonly,
    })),
    controlPlanPath: authority.controlPlanPath,
  };
}

function digestRef(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function pathInside(parent, child) {
  const normalizedParent = parent.replace(/\/+$/u, '');
  const normalizedChild = child.replace(/\/+$/u, '');
  return normalizedChild === normalizedParent
    || normalizedChild.startsWith(`${normalizedParent}/`);
}

function validMountAuthority(input) {
  const authority = input.mountAuthority;
  const expectedMounts = [
    ...input.runtimeProjection.roots,
    input.sourceMount,
    input.scratchMount,
  ];
  return record(authority)
    && authority.schemaVersion === 1
    && authority.kind === 'linux-mount-authority'
    && authority.adapterId === ADAPTER_ID
    && authority.verified === true
    && authority.source === 'containment-authority'
    && authority.evidenceDigest === input.authorityEvidence.digest
    && sha256(authority.authorityRef)
    && authority.authorityRef === input.authorityEvidence.mountAuthorityRef
    && Array.isArray(authority.mounts)
    && authority.mounts.length === expectedMounts.length
    && expectedMounts.every((mount, index) => sameMount(mount, authority.mounts[index]))
    && authority.controlPlanPath === (
      input.launcher.kind === 'unshare' ? input.controlPlanPath : null
    )
    && digestRef(mountAuthorityPayload(authority)) === authority.authorityRef;
}

function validDedicatedTargets(input) {
  return input.sourceMount.target === '/workspace'
    && input.scratchMount.target === '/scratch'
    && input.runtimeProjection.roots.every(root => pathInside('/runtime', root.target))
    && typeof input.workload?.executable === 'string'
    && pathInside('/runtime', input.workload.executable);
}

function runtimeSourcesSeparated(input) {
  return input.runtimeProjection.roots.every(root => (
    !pathsOverlap(root.source, input.sourceMount.source)
    && !pathsOverlap(root.source, input.scratchMount.source)
  ));
}

function hold(code, facets = {}) {
  return Object.freeze({
    decision: 'HOLD',
    code,
    adapterId: ADAPTER_ID,
    proofEligible: false,
    facets: Object.freeze({ ...facets }),
  });
}

export function detectLinuxNamespaceCapabilities(input = {}) {
  if (!record(input)) input = {};
  if (input.platformClass !== 'linux') {
    return capability('UNSUPPORTED', 'E_CONTAINMENT_HOLD_LINUX_PLATFORM', input);
  }
  if (!input.launcher) {
    return capability('UNSUPPORTED', 'E_CONTAINMENT_HOLD_LINUX_LAUNCHER_MISSING', input);
  }
  if (!validLauncher(input.launcher)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_LINUX_LAUNCHER_ATTESTATION', input);
  }
  if (!authorityEvidence(input.authorityEvidence)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_LINUX_LIVE_EVIDENCE', input);
  }
  const missing = missingFacets(input.facets);
  if (missing.length > 0) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_LINUX_FACETS', input, missing);
  }
  return capability('SUPPORTED', 'E_CONTAINMENT_LINUX_CAPABILITY_SUPPORTED', input);
}

function bwrapArgs(input) {
  const args = [
    '--unshare-user',
    '--unshare-pid',
    '--unshare-net',
    '--unshare-ipc',
    '--unshare-uts',
    '--die-with-parent',
    '--new-session',
    '--cap-drop',
    'ALL',
    '--seccomp',
    String(input.seccomp.fdSlot),
    '--proc',
    '/proc',
    '--dev',
    '/dev',
  ];
  for (const root of input.runtimeProjection.roots) {
    args.push('--ro-bind', root.source, root.target);
  }
  args.push('--ro-bind', input.sourceMount.source, input.sourceMount.target);
  args.push('--bind', input.scratchMount.source, input.scratchMount.target);
  args.push('--chdir', input.sourceMount.target, '--', input.workload.executable, ...input.workload.args);
  return args;
}

function unshareArgs(input) {
  return [
    '--user',
    '--map-root-user',
    '--mount',
    '--pid',
    '--fork',
    '--net',
    '--ipc',
    '--uts',
    '--mount-proc',
    input.launcher.enterHelper.absolutePath,
    input.controlPlanPath,
  ];
}

export function planLinuxNamespace(input = {}) {
  if (!record(input)) input = {};
  const detected = detectLinuxNamespaceCapabilities(input);
  if (detected.status !== 'SUPPORTED') return hold(detected.code, detected.facets);
  if (!validRuntimeProjection(input.runtimeProjection)) {
    return hold('E_CONTAINMENT_HOLD_LINUX_RUNTIME_PROJECTION', detected.facets);
  }
  if (!validDependencyProjection(input.dependencyProjection)) {
    return hold('E_CONTAINMENT_HOLD_LINUX_DEPENDENCY_PROJECTION', detected.facets);
  }
  if (!validReadonlyMount(input.sourceMount)
    || !validScratchMount(input.scratchMount)
    || pathsOverlap(input.sourceMount.source, input.scratchMount.source)
    || pathsOverlap(input.sourceMount.target, input.scratchMount.target)
    || !runtimeSourcesSeparated(input)
    || !validDedicatedTargets(input)) {
    return hold('E_CONTAINMENT_HOLD_LINUX_UNSAFE_MOUNT', detected.facets);
  }
  if (!validMountAuthority(input)) {
    return hold('E_CONTAINMENT_HOLD_LINUX_MOUNT_AUTHORITY', detected.facets);
  }
  if (!validResources(input.resources)) {
    return hold('E_CONTAINMENT_HOLD_LINUX_RESOURCE_LIMITS', detected.facets);
  }
  if (!validWorkload(input.workload)
    || !sha256(input.seccomp?.digest)
    || !Number.isSafeInteger(input.seccomp?.fdSlot)
    || input.seccomp.fdSlot < 3) {
    return hold('E_CONTAINMENT_HOLD_LINUX_LAUNCH_PLAN', detected.facets);
  }
  if (input.launcher.kind === 'unshare' && !absolutePosixPath(input.controlPlanPath)) {
    return hold('E_CONTAINMENT_HOLD_LINUX_CONTROL_PLAN', detected.facets);
  }
  const args = input.launcher.kind === 'bwrap' ? bwrapArgs(input) : unshareArgs(input);
  const runtimeRoots = Object.freeze(
    input.runtimeProjection.roots.map(root => Object.freeze({ ...root })),
  );
  const sourceMount = Object.freeze({ ...input.sourceMount });
  const scratchMount = Object.freeze({ ...input.scratchMount });
  const workload = Object.freeze({
    executable: input.workload.executable,
    args: Object.freeze([...input.workload.args]),
  });
  return Object.freeze({
    decision: 'ADMITTED',
    code: 'E_CONTAINMENT_LINUX_PLAN_ADMITTED',
    adapterId: ADAPTER_ID,
    proofEligible: false,
    facets: detected.facets,
    plan: Object.freeze({
      engine: input.launcher.kind,
      command: input.launcher.absolutePath,
      args: Object.freeze(args),
      shell: false,
      sourceReadonly: true,
      hostRootMounted: false,
      runtimeRoots,
      sourceMount,
      scratchMount,
      workload,
      mounts: Object.freeze([
        ...runtimeRoots,
        sourceMount,
        scratchMount,
      ]),
      runtimeProjectionDigest: input.runtimeProjection.digest,
      dependencyProjectionDigest: input.dependencyProjection.digest,
      authorityEvidenceDigest: input.authorityEvidence.digest,
      mountAuthorityRef: input.mountAuthority.authorityRef,
      resources: Object.freeze({ ...input.resources }),
    }),
  });
}
