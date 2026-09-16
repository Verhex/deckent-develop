import { createHash } from 'node:crypto';

const ADAPTER_ID = 'oci-v1';
const LIVE_EVIDENCE_TIERS = Object.freeze(['E2', 'E3', 'E4', 'E5']);

export const OCI_REQUIRED_FACETS = Object.freeze([
  'runtimeAttested',
  'imageDigestPinned',
  'createBeforeStart',
  'identityPersistedBeforeStart',
  'readonlyRootfs',
  'sourceReadonly',
  'scratchWritable',
  'networkNone',
  'capabilitiesDropped',
  'noNewPrivileges',
  'seccomp',
  'nonRootWorkload',
  'processTreeFinality',
  'resourceBounds',
  'controlPlaneSeparated',
  'socketNotMounted',
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

function absoluteHostPath(value) {
  if (typeof value !== 'string'
    || value.includes('\0')
    || /[\r\n,]/u.test(value)) {
    return false;
  }
  if (value.startsWith('/')) {
    if (value.includes('\\') || value === '/') return value === '/';
    return value.slice(1).split('/').every(segment => (
      segment.length > 0 && segment !== '.' && segment !== '..'
    ));
  }
  if (!/^[A-Za-z]:\\/u.test(value)
    || value.includes('/')
    || value.slice(2).includes(':')) {
    return false;
  }
  if (/^[A-Za-z]:\\$/u.test(value)) return true;
  return value.slice(3).split('\\').every(segment => (
    segment.length > 0
    && segment !== '.'
    && segment !== '..'
    && !/[ .]$/u.test(segment)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(segment)
    && !/~\d/u.test(segment)
  ));
}

function hostRoot(value) {
  return /^\/+$/u.test(value) || /^[A-Za-z]:\\?$/u.test(value);
}

function absoluteContainerPath(value) {
  if (typeof value !== 'string'
    || !value.startsWith('/')
    || /^\/+$/u.test(value)
    || value.includes('\0')
    || /[\r\n,]/u.test(value)) {
    return false;
  }
  return value.slice(1).split('/').every(segment => (
    segment.length > 0 && segment !== '.' && segment !== '..'
  ));
}

function dockerSocket(value) {
  return typeof value === 'string'
    && (/docker\.sock(?:$|[\\/])/iu.test(value) || /docker_engine/iu.test(value));
}

function sensitiveHostMount(value) {
  if (value.startsWith('/')) {
    const normalized = value.replace(/\/+$/u, '');
    const protectedTrees = Object.freeze([
      '/Applications',
      '/Library',
      '/Network',
      '/System',
      '/bin',
      '/boot',
      '/dev',
      '/etc',
      '/home',
      '/lib',
      '/lib64',
      '/mnt',
      '/opt',
      '/private',
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
    ]);
    return protectedTrees.some(path => normalized === path || normalized.startsWith(`${path}/`));
  }
  const normalized = value.replace(/\\+$/u, '').toLocaleLowerCase('en-US');
  return /^[a-z]:\\(?:windows|program files(?: \(x86\))?|programdata|users|recovery|system volume information|\$recycle\.bin)(?:\\|$)/iu
    .test(normalized);
}

function attestedRuntime(value) {
  return ['docker', 'podman', 'nerdctl'].includes(value?.kind)
    && absoluteHostPath(value?.absolutePath)
    && !hostRoot(value.absolutePath)
    && sha256(value?.digest)
    && value?.trustedOwner === true
    && typeof value?.version === 'string'
    && value.version.length > 0;
}

function missingFacets(facets) {
  return OCI_REQUIRED_FACETS.filter(name => facets?.[name] !== true);
}

function capability(status, code, input, missing = []) {
  return Object.freeze({
    adapterId: ADAPTER_ID,
    status,
    code,
    evidenceTier: authorityEvidence(input?.authorityEvidence)
      ? input.authorityEvidence.tier
      : (input?.runtime ? 'E1' : 'E0'),
    proofEligible: false,
    facets: Object.freeze(record(input?.facets) ? { ...input.facets } : {}),
    missingFacets: Object.freeze([...missing]),
    executionRealm: input?.executionRealm,
  });
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

function digestImage(value) {
  return typeof value === 'string'
    && /^[a-z0-9]+(?:(?:[._-]|\/)[a-z0-9]+)*@sha256:[a-f0-9]{64}$/u.test(value);
}

function validMount(mount) {
  return absoluteHostPath(mount?.source)
    && !hostRoot(mount.source)
    && !dockerSocket(mount.source)
    && !sensitiveHostMount(mount.source)
    && absoluteContainerPath(mount?.target)
    && !dockerSocket(mount.target)
    && ['ro', 'rw'].includes(mount?.mode)
    && ['source', 'dependencies', 'scratch'].includes(mount?.kind);
}

function validMountSet(mounts) {
  if (!Array.isArray(mounts) || mounts.length !== 3 || !mounts.every(validMount)) return false;
  const targets = mounts.map(mount => mount.target);
  if (targets.some((target, index) => targets.indexOf(target) !== index)) return false;
  const exactlyOne = kind => mounts.filter(mount => mount.kind === kind).length === 1;
  if (!['source', 'dependencies', 'scratch'].every(exactlyOne)) return false;
  const byKind = Object.fromEntries(mounts.map(mount => [mount.kind, mount]));
  const normalize = value => value.replace(/[\\/]+$/u, '').toLocaleLowerCase('en-US');
  const overlaps = (left, right) => {
    const leftPath = normalize(left);
    const rightPath = normalize(right);
    const separator = leftPath.includes('\\') || rightPath.includes('\\') ? '\\' : '/';
    return leftPath === rightPath
      || leftPath.startsWith(`${rightPath}${separator}`)
      || rightPath.startsWith(`${leftPath}${separator}`);
  };
  const readSources = [byKind.source.source, byKind.dependencies.source];
  const writeSources = [byKind.scratch.source];
  const readTargets = [byKind.source.target, byKind.dependencies.target];
  const writeTargets = [byKind.scratch.target];
  return byKind.source.mode === 'ro'
    && byKind.dependencies.mode === 'ro'
    && byKind.scratch.mode === 'rw'
    && readSources.every(readPath => writeSources.every(writePath => !overlaps(readPath, writePath)))
    && readTargets.every(readPath => writeTargets.every(writePath => !overlaps(readPath, writePath)));
}

function sameMount(left, right) {
  return record(left)
    && record(right)
    && left.kind === right.kind
    && left.source === right.source
    && left.target === right.target
    && left.mode === right.mode;
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
      kind: mount.kind,
      source: mount.source,
      target: mount.target,
      mode: mount.mode,
    })),
  };
}

function digestRef(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function validMountAuthority(input) {
  const authority = input.mountAuthority;
  return record(authority)
    && authority.schemaVersion === 1
    && authority.kind === 'oci-mount-authority'
    && authority.adapterId === ADAPTER_ID
    && authority.verified === true
    && authority.source === 'containment-authority'
    && authority.evidenceDigest === input.authorityEvidence.digest
    && sha256(authority.authorityRef)
    && authority.authorityRef === input.authorityEvidence.mountAuthorityRef
    && Array.isArray(authority.mounts)
    && authority.mounts.length === input.mounts.length
    && input.mounts.every((mount, index) => sameMount(mount, authority.mounts[index]))
    && digestRef(mountAuthorityPayload(authority)) === authority.authorityRef;
}

function validDedicatedTargets(mounts) {
  const byKind = Object.fromEntries(mounts.map(mount => [mount.kind, mount]));
  return byKind.source?.target === '/workspace'
    && byKind.dependencies?.target === '/workspace/node_modules'
    && byKind.scratch?.target === '/scratch';
}

function validResources(resources) {
  return Number.isSafeInteger(resources?.maxPids) && resources.maxPids > 0
    && Number.isSafeInteger(resources?.memoryBytes) && resources.memoryBytes > 0
    && typeof resources?.cpus === 'number' && Number.isFinite(resources.cpus) && resources.cpus > 0
    && Number.isSafeInteger(resources?.wallClockMs) && resources.wallClockMs > 0;
}

function validDependencyProjection(projection, executionRealm) {
  return projection?.verified === true
    && projection?.compatible === true
    && sha256(projection?.digest)
    && projection?.targetRealm === executionRealm;
}

function validWorkload(workload) {
  const identityParts = typeof workload?.user === 'string'
    ? workload.user.split(':')
    : [];
  const positiveIdentity = identityParts.length >= 1
    && identityParts.length <= 2
    && identityParts.every(part => {
      if (!/^\d+$/u.test(part)) return false;
      const id = Number(part);
      return Number.isSafeInteger(id) && id > 0;
    });
  return absoluteContainerPath(workload?.entrypoint)
    && absoluteContainerPath(workload?.executable)
    && Array.isArray(workload?.args)
    && workload.args.every(value => typeof value === 'string' && !value.includes('\0'))
    && positiveIdentity;
}

function mountArgs(mount) {
  const options = [
    'type=bind',
    `src=${mount.source}`,
    `dst=${mount.target}`,
  ];
  if (mount.mode === 'ro') options.push('readonly');
  return options.join(',');
}

export function detectOciCapabilities(input = {}) {
  if (!record(input)) input = {};
  if (!input.runtime) {
    return capability('UNSUPPORTED', 'E_CONTAINMENT_HOLD_OCI_RUNTIME_MISSING', input);
  }
  if (!attestedRuntime(input.runtime)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_OCI_RUNTIME_ATTESTATION', input);
  }
  if (!authorityEvidence(input.authorityEvidence)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_OCI_LIVE_EVIDENCE', input);
  }
  const missing = missingFacets(input.facets);
  if (missing.length > 0) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_OCI_FACETS', input, missing);
  }
  return capability('SUPPORTED', 'E_CONTAINMENT_OCI_CAPABILITY_SUPPORTED', input);
}

export function planOciContainment(input = {}) {
  if (!record(input)) input = {};
  const detected = detectOciCapabilities(input);
  if (detected.status !== 'SUPPORTED') return hold(detected.code, detected.facets);
  if (!digestImage(input.image)) {
    return hold('E_CONTAINMENT_HOLD_OCI_IMAGE_DIGEST', detected.facets);
  }
  if (!validMountSet(input.mounts)
    || !validDedicatedTargets(input.mounts)
    || input.runtimeSocketMounted === true
    || input.hostNetwork === true
    || input.hostPid === true
    || input.hostIpc === true
    || input.privileged === true) {
    return hold('E_CONTAINMENT_HOLD_OCI_UNSAFE_MOUNT_OR_NAMESPACE', detected.facets);
  }
  if (!validMountAuthority(input)) {
    return hold('E_CONTAINMENT_HOLD_OCI_MOUNT_AUTHORITY', detected.facets);
  }
  if (!validDependencyProjection(input.dependencyProjection, input.executionRealm)) {
    return hold('E_CONTAINMENT_HOLD_OCI_DEPENDENCY_ABI', detected.facets);
  }
  if (!validResources(input.resources)) {
    return hold('E_CONTAINMENT_HOLD_OCI_RESOURCE_LIMITS', detected.facets);
  }
  if (!validWorkload(input.workload)
    || typeof input.executionRealm !== 'string'
    || input.executionRealm.length === 0
    || typeof input.containerName !== 'string'
    || !/^[a-z0-9][a-z0-9_.-]{7,127}$/u.test(input.containerName)
    || typeof input.runNonce !== 'string'
    || !/^[a-z0-9][a-z0-9_.-]{7,127}$/u.test(input.runNonce)) {
    return hold('E_CONTAINMENT_HOLD_OCI_LAUNCH_PLAN', detected.facets);
  }
  const createArgs = [
    'create',
    '--name',
    input.containerName,
    '--label',
    `deckent.run_nonce=${input.runNonce}`,
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    String(input.resources.maxPids),
    '--memory',
    String(input.resources.memoryBytes),
    '--cpus',
    String(input.resources.cpus),
    '--user',
    input.workload.user,
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev',
  ];
  for (const mount of input.mounts) createArgs.push('--mount', mountArgs(mount));
  createArgs.push(
    '--entrypoint',
    input.workload.entrypoint,
    input.image,
    input.workload.executable,
    ...input.workload.args,
  );
  return Object.freeze({
    decision: 'ADMITTED',
    code: 'E_CONTAINMENT_OCI_PLAN_ADMITTED',
    adapterId: ADAPTER_ID,
    proofEligible: false,
    facets: detected.facets,
    plan: Object.freeze({
      engine: input.runtime.kind,
      command: input.runtime.absolutePath,
      createArgs: Object.freeze(createArgs),
      shell: false,
      image: input.image,
      runtimeDigest: input.runtime.digest,
      authorityEvidenceDigest: input.authorityEvidence.digest,
      mountAuthorityRef: input.mountAuthority.authorityRef,
      dependencyProjectionDigest: input.dependencyProjection.digest,
      lifecycle: Object.freeze([
        Object.freeze({ operation: 'create', capture: 'containerId' }),
        Object.freeze({ operation: 'persistIdentity', requires: 'containerId' }),
        Object.freeze({ operation: 'start', identifierSource: 'persistedContainerId' }),
        Object.freeze({ operation: 'inspectFinality', identifierSource: 'persistedContainerId' }),
        Object.freeze({ operation: 'persistCompletion', owner: 'hostAuthority' }),
        Object.freeze({ operation: 'remove', identifierSource: 'persistedContainerId' }),
      ]),
      candidateControlMount: false,
      completionOwner: 'hostAuthority',
    }),
  });
}
