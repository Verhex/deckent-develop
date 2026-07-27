const ADAPTER_ID = 'wsl-v1';
const LIVE_EVIDENCE_TIERS = Object.freeze(['E2', 'E3', 'E4', 'E5']);
const LINUX_FILESYSTEMS = Object.freeze(['ext2/ext3', 'ext4', 'xfs', 'btrfs']);

export const WSL_REQUIRED_FACETS = Object.freeze([
  'wsl2Kernel',
  'linuxFilesystem',
  'interopDisabled',
  'drvfsHidden',
  'windowsMountsHidden',
  'binfmtInteropDisabled',
  'wslInitHidden',
  'nestedBoundarySupported',
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
  return WSL_REQUIRED_FACETS.filter(name => facets?.[name] !== true);
}

function capability(status, code, input, missing = []) {
  return Object.freeze({
    adapterId: ADAPTER_ID,
    status,
    code,
    evidenceTier: authorityEvidence(input?.authorityEvidence)
      ? input.authorityEvidence.tier
      : (input?.platformClass ? 'E1' : 'E0'),
    proofEligible: false,
    facets: Object.freeze(record(input?.facets) ? { ...input.facets } : {}),
    missingFacets: Object.freeze([...missing]),
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

function safeLinuxPath(value) {
  if (typeof value !== 'string'
    || !value.startsWith('/')
    || /^\/+$/u.test(value)
    || value.includes('\0')
    || /[\r\n]/u.test(value)
    || wslEscapePath(value)) {
    return false;
  }
  return value.slice(1).split('/').every(segment => (
    segment.length > 0 && segment !== '.' && segment !== '..'
  ));
}

function environmentHasInterop(environment) {
  if (!environment || typeof environment !== 'object') return false;
  if (environment.WSL_INTEROP !== undefined || environment.WSLENV !== undefined) return true;
  return typeof environment.PATH === 'string'
    && environment.PATH.split(':').some(path => path.startsWith('/mnt/'));
}

function wslEscapePath(value) {
  return typeof value === 'string'
    && (value === '/init'
      || value === '/mnt'
      || value.startsWith('/mnt/')
      || value === '/run/WSL'
      || value.startsWith('/run/WSL/')
      || value === '/proc/sys/fs/binfmt_misc'
      || value.startsWith('/proc/sys/fs/binfmt_misc/')
      || value.includes('docker.sock')
      || /(?:^|\/)[^/]+\.exe$/iu.test(value));
}

function sameMount(left, right) {
  return record(left)
    && record(right)
    && left.source === right.source
    && left.target === right.target
    && left.readonly === right.readonly;
}

function validNestedMount(mount) {
  return record(mount)
    && safeLinuxPath(mount.source)
    && safeLinuxPath(mount.target)
    && typeof mount.readonly === 'boolean';
}

function pathsOverlap(left, right) {
  return left === right
    || left.startsWith(`${right}/`)
    || right.startsWith(`${left}/`);
}

function pathInside(parent, child) {
  return child === parent || child.startsWith(`${parent}/`);
}

function unsafeLinuxHostPath(value) {
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
  ].some(path => value === path || value.startsWith(`${path}/`));
}

function validNestedResources(resources) {
  return Number.isSafeInteger(resources?.maxPids) && resources.maxPids > 0
    && Number.isSafeInteger(resources?.memoryBytes) && resources.memoryBytes > 0
    && Number.isSafeInteger(resources?.cpuMillis) && resources.cpuMillis > 0
    && Number.isSafeInteger(resources?.wallClockMs) && resources.wallClockMs > 0;
}

function validNestedPlanStructure(plan, sourcePath, authorityEvidenceDigest) {
  if (!record(plan)
    || !['bwrap', 'unshare'].includes(plan.engine)
    || !safeLinuxPath(plan.command)
    || !Array.isArray(plan.args)
    || !plan.args.every(
      value => typeof value === 'string' && !value.includes('\0') && !/[\r\n]/u.test(value),
    )
    || plan.shell !== false
    || plan.hostRootMounted !== false
    || plan.sourceReadonly !== true
    || !Array.isArray(plan.runtimeRoots)
    || plan.runtimeRoots.length === 0
    || !plan.runtimeRoots.every(validNestedMount)
    || !plan.runtimeRoots.every(root => root.readonly === true)
    || !record(plan.sourceMount)
    || !validNestedMount(plan.sourceMount)
    || plan.sourceMount.readonly !== true
    || !record(plan.scratchMount)
    || !validNestedMount(plan.scratchMount)
    || plan.scratchMount.readonly !== false
    || !record(plan.workload)
    || !safeLinuxPath(plan.workload.executable)
    || !Array.isArray(plan.workload.args)
    || !plan.workload.args.every(
      value => typeof value === 'string' && !value.includes('\0') && !/[\r\n]/u.test(value),
    )
    || !Array.isArray(plan.mounts)
    || !plan.mounts.every(validNestedMount)
    || plan.mounts.length !== plan.runtimeRoots.length + 2
    || !validNestedResources(plan.resources)
    || !sha256(plan.runtimeProjectionDigest)
    || !sha256(plan.dependencyProjectionDigest)
    || !sha256(plan.authorityEvidenceDigest)
    || plan.authorityEvidenceDigest !== authorityEvidenceDigest
    || !sha256(plan.mountAuthorityRef)
    || plan.sourceMount.source !== sourcePath
    || plan.sourceMount.target !== '/workspace'
    || plan.scratchMount.target !== '/scratch'
    || unsafeLinuxHostPath(plan.sourceMount.source)
    || unsafeLinuxHostPath(plan.scratchMount.source)
    || pathsOverlap(plan.sourceMount.source, plan.scratchMount.source)
    || !plan.runtimeRoots.every(root => (
      pathInside('/runtime', root.target)
      && !unsafeLinuxHostPath(root.source)
      && !pathsOverlap(root.source, plan.sourceMount.source)
      && !pathsOverlap(root.source, plan.scratchMount.source)
    ))
    || !pathInside('/runtime', plan.workload.executable)) {
    return false;
  }
  return plan.runtimeRoots.every((root, index) => sameMount(root, plan.mounts[index]))
    && sameMount(plan.sourceMount, plan.mounts[plan.runtimeRoots.length])
    && sameMount(plan.scratchMount, plan.mounts[plan.runtimeRoots.length + 1]);
}

function freezeNestedPlan(plan) {
  const runtimeRoots = Object.freeze(
    plan.runtimeRoots.map(root => Object.freeze({ ...root })),
  );
  const sourceMount = Object.freeze({ ...plan.sourceMount });
  const scratchMount = Object.freeze({ ...plan.scratchMount });
  return Object.freeze({
    engine: plan.engine,
    command: plan.command,
    args: Object.freeze([...plan.args]),
    shell: false,
    sourceReadonly: true,
    hostRootMounted: false,
    runtimeRoots,
    sourceMount,
    scratchMount,
    workload: Object.freeze({
      executable: plan.workload.executable,
      args: Object.freeze([...plan.workload.args]),
    }),
    mounts: Object.freeze([
      ...runtimeRoots,
      sourceMount,
      scratchMount,
    ]),
    runtimeProjectionDigest: plan.runtimeProjectionDigest,
    dependencyProjectionDigest: plan.dependencyProjectionDigest,
    authorityEvidenceDigest: plan.authorityEvidenceDigest,
    mountAuthorityRef: plan.mountAuthorityRef,
    resources: Object.freeze({ ...plan.resources }),
  });
}

function nestedPlanHasEscape(plan) {
  const mounts = [
    ...(plan?.runtimeRoots ?? []),
    plan?.sourceMount,
    plan?.scratchMount,
    ...(plan?.mounts ?? []),
  ].filter(record);
  const mountEscape = mounts.some(mount => {
    const paths = [mount?.source, mount?.target].filter(value => typeof value === 'string');
    return paths.some(wslEscapePath);
  });
  const workloadEscape = wslEscapePath(plan?.workload?.executable)
    || plan?.workload?.args?.some(value => wslEscapePath(value)) === true;
  return mountEscape || workloadEscape;
}

export function detectWslCapabilities(input = {}) {
  if (!record(input)) input = {};
  if (!['wsl1', 'wsl2'].includes(input.platformClass)) {
    return capability('UNSUPPORTED', 'E_CONTAINMENT_HOLD_WSL_PLATFORM', input);
  }
  if (input.platformClass !== 'wsl2') {
    return capability('UNSUPPORTED', 'E_CONTAINMENT_HOLD_WSL1_REALM', input);
  }
  if (!safeLinuxPath(input.sourcePath)
    || !LINUX_FILESYSTEMS.includes(input.sourceFilesystem)
    || input.drvfsVisible === true
    || input.windowsMountsVisible === true
    || input.binfmtInteropEnabled === true
    || input.wslInitVisible === true
    || environmentHasInterop(input.environment)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_WSL_INTEROP_OR_FILESYSTEM', input);
  }
  if (!authorityEvidence(input.authorityEvidence)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_WSL_LIVE_EVIDENCE', input);
  }
  const missing = missingFacets(input.facets);
  if (missing.length > 0) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_WSL_FACETS', input, missing);
  }
  return capability('SUPPORTED', 'E_CONTAINMENT_WSL_CAPABILITY_SUPPORTED', input);
}

export function planWslContainment(input = {}) {
  if (!record(input)) input = {};
  const detected = detectWslCapabilities(input);
  if (detected.status !== 'SUPPORTED') return hold(detected.code, detected.facets);
  if (input.linuxPlan?.adapterId !== 'linux-namespace-v1'
    || input.linuxPlan?.decision !== 'ADMITTED'
    || input.linuxPlan?.proofEligible !== false
    || input.linuxPlan?.plan?.hostRootMounted !== false
    || !validNestedPlanStructure(
      input.linuxPlan?.plan,
      input.sourcePath,
      input.authorityEvidence.digest,
    )
    || nestedPlanHasEscape(input.linuxPlan.plan)) {
    return hold('E_CONTAINMENT_HOLD_WSL_NESTED_BOUNDARY', detected.facets);
  }
  return Object.freeze({
    decision: 'ADMITTED',
    code: 'E_CONTAINMENT_WSL_PLAN_ADMITTED',
    adapterId: ADAPTER_ID,
    proofEligible: false,
    facets: detected.facets,
    plan: Object.freeze({
      realm: 'wsl2',
      sourceFilesystem: input.sourceFilesystem,
      interop: 'disabled',
      authorityEvidenceDigest: input.authorityEvidence.digest,
      nestedAdapterId: input.linuxPlan.adapterId,
      nestedPlan: freezeNestedPlan(input.linuxPlan.plan),
    }),
  });
}
