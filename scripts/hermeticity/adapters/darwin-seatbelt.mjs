const ADAPTER_ID = 'darwin-seatbelt-v1';
const LIVE_EVIDENCE_TIERS = Object.freeze(['E2', 'E3', 'E4', 'E5']);

export const DARWIN_SEATBELT_REQUIRED_FACETS = Object.freeze([
  'denyDefaultProfile',
  'sourceReadonly',
  'hostRootHidden',
  'scratchWritable',
  'networkDenied',
  'descendantBoundaryInherited',
  'processTreeFinality',
  'resourceBounds',
  'supervisorOwned',
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

function absoluteDarwinPath(value) {
  if (typeof value !== 'string'
    || !value.startsWith('/')
    || /^\/+$/u.test(value)
    || value.includes('\0')
    || /[\r\n]/u.test(value)) {
    return false;
  }
  return value.slice(1).split('/').every(segment => (
    segment.length > 0 && segment !== '.' && segment !== '..'
  ));
}

function attestedBinary(value) {
  return absoluteDarwinPath(value?.absolutePath)
    && sha256(value?.digest)
    && value?.trustedOwner === true
    && typeof value?.version === 'string'
    && value.version.length > 0;
}

function attestedSupervisor(value) {
  return absoluteDarwinPath(value?.absolutePath)
    && sha256(value?.digest)
    && sha256(value?.publisherDigest)
    && value?.codeSignatureVerified === true
    && value?.protocolVersion === 'deckent-containment-supervisor-v1'
    && value?.nonceHandshakeVerified === true;
}

function missingFacets(facets) {
  return DARWIN_SEATBELT_REQUIRED_FACETS.filter(name => facets?.[name] !== true);
}

function capability(status, code, input, missing = []) {
  return Object.freeze({
    adapterId: ADAPTER_ID,
    status,
    code,
    evidenceTier: authorityEvidence(input?.authorityEvidence)
      ? input.authorityEvidence.tier
      : (input?.seatbelt ? 'E1' : 'E0'),
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

function pathsOverlap(left, right) {
  const normalized = value => value.replace(/\/+$/u, '');
  const leftPath = normalized(left);
  const rightPath = normalized(right);
  return leftPath === rightPath
    || leftPath.startsWith(`${rightPath}/`)
    || rightPath.startsWith(`${leftPath}/`);
}

function unsafeDarwinWritePath(value) {
  const normalized = value.replace(/\/+$/u, '');
  const protectedTrees = Object.freeze([
    '/Applications',
    '/Library',
    '/System',
    '/bin',
    '/etc',
    '/private/etc',
    '/sbin',
    '/usr',
  ]);
  const broadRoots = Object.freeze([
    '/Network',
    '/Users',
    '/Volumes',
    '/home',
    '/private',
    '/private/var',
    '/root',
    '/var',
  ]);
  return protectedTrees.some(path => normalized === path || normalized.startsWith(`${path}/`))
    || broadRoots.includes(normalized);
}

function validProfile(profile) {
  if (profile?.denyDefault !== true
    || profile?.network !== 'deny'
    || !sha256(profile?.digest)
    || typeof profile?.rawProfile === 'string'
    || !Array.isArray(profile?.readPaths)
    || !Array.isArray(profile?.writePaths)
    || profile.writePaths.length === 0) {
    return false;
  }
  const paths = [...profile.readPaths, ...profile.writePaths];
  return paths.every(absoluteDarwinPath)
    && !paths.includes('/')
    && !profile.writePaths.some(unsafeDarwinWritePath)
    && !profile.readPaths.some(
      readPath => profile.writePaths.some(writePath => pathsOverlap(readPath, writePath)),
    );
}

function validResources(resources) {
  return Number.isSafeInteger(resources?.maxPids) && resources.maxPids > 0
    && Number.isSafeInteger(resources?.memoryBytes) && resources.memoryBytes > 0
    && Number.isSafeInteger(resources?.cpuMillis) && resources.cpuMillis > 0
    && Number.isSafeInteger(resources?.wallClockMs) && resources.wallClockMs > 0;
}

function validWorkload(workload) {
  return absoluteDarwinPath(workload?.executable)
    && Array.isArray(workload?.args)
    && workload.args.every(value => typeof value === 'string' && !value.includes('\0'));
}

export function detectDarwinSeatbeltCapabilities(input = {}) {
  if (!record(input)) input = {};
  if (input.platformClass !== 'darwin') {
    return capability('UNSUPPORTED', 'E_CONTAINMENT_HOLD_DARWIN_PLATFORM', input);
  }
  if (!input.seatbelt) {
    return capability('UNSUPPORTED', 'E_CONTAINMENT_HOLD_DARWIN_SEATBELT_MISSING', input);
  }
  if (!attestedBinary(input.seatbelt)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_DARWIN_SEATBELT_ATTESTATION', input);
  }
  if (!attestedSupervisor(input.supervisor)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_DARWIN_SUPERVISOR_ATTESTATION', input);
  }
  if (!authorityEvidence(input.authorityEvidence)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_DARWIN_LIVE_EVIDENCE', input);
  }
  const missing = missingFacets(input.facets);
  if (missing.length > 0) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_DARWIN_FACETS', input, missing);
  }
  return capability('SUPPORTED', 'E_CONTAINMENT_DARWIN_CAPABILITY_SUPPORTED', input);
}

export function planDarwinSeatbelt(input = {}) {
  if (!record(input)) input = {};
  const detected = detectDarwinSeatbeltCapabilities(input);
  if (detected.status !== 'SUPPORTED') return hold(detected.code, detected.facets);
  if (!validProfile(input.profile)) {
    return hold('E_CONTAINMENT_HOLD_DARWIN_PROFILE', detected.facets);
  }
  if (!validResources(input.resources)) {
    return hold('E_CONTAINMENT_HOLD_DARWIN_RESOURCE_LIMITS', detected.facets);
  }
  if (!validWorkload(input.workload)
    || !absoluteDarwinPath(input.controlPlanPath)
    || input.controlPlanDigest !== input.profile.controlPlanDigest
    || !sha256(input.controlPlanDigest)) {
    return hold('E_CONTAINMENT_HOLD_DARWIN_LAUNCH_PLAN', detected.facets);
  }
  return Object.freeze({
    decision: 'ADMITTED',
    code: 'E_CONTAINMENT_DARWIN_PLAN_ADMITTED',
    adapterId: ADAPTER_ID,
    proofEligible: false,
    facets: detected.facets,
    plan: Object.freeze({
      engine: 'seatbelt-supervisor',
      command: input.supervisor.absolutePath,
      args: Object.freeze([
        '--protocol',
        input.supervisor.protocolVersion,
        '--plan',
        input.controlPlanPath,
        '--plan-digest',
        input.controlPlanDigest,
      ]),
      shell: false,
      seatbeltPath: input.seatbelt.absolutePath,
      seatbeltDigest: input.seatbelt.digest,
      supervisorDigest: input.supervisor.digest,
      profileDigest: input.profile.digest,
      authorityEvidenceDigest: input.authorityEvidence.digest,
      workload: Object.freeze({
        executable: input.workload.executable,
        args: Object.freeze([...input.workload.args]),
      }),
      resources: Object.freeze({ ...input.resources }),
    }),
  });
}
