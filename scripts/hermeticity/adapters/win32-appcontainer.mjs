const ADAPTER_ID = 'win32-appcontainer-v1';
const LIVE_EVIDENCE_TIERS = Object.freeze(['E2', 'E3', 'E4', 'E5']);

export const WIN32_APPCONTAINER_REQUIRED_FACETS = Object.freeze([
  'appContainer',
  'restrictedToken',
  'jobObject',
  'killOnJobClose',
  'breakawayDisabled',
  'processTreeFinality',
  'sourceReadonlyAcl',
  'scratchWriteAcl',
  'networkDenied',
  'handleInheritanceRestricted',
  'resourceBounds',
  'helperOwned',
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

function absoluteWindowsPath(value) {
  if (typeof value !== 'string'
    || !/^[A-Za-z]:\\/u.test(value)
    || /^[A-Za-z]:\\?$/u.test(value)
    || value.includes('\0')
    || /[\r\n]/u.test(value)
    || value.includes('/')
    || /^\\\\/u.test(value)
    || /^\\\\[?.]\\|^\\\\\?\\GLOBALROOT/iu.test(value)) {
    return false;
  }
  if (value.slice(2).includes(':')) return false;
  return value.slice(3).split('\\').every(segment => (
    segment.length > 0
    && segment !== '.'
    && segment !== '..'
    && !/[ .]$/u.test(segment)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(segment)
    && !/~\d/u.test(segment)
  ));
}

function attestedHelper(value) {
  return absoluteWindowsPath(value?.absolutePath)
    && sha256(value?.digest)
    && sha256(value?.publisherDigest)
    && value?.authenticodeVerified === true
    && value?.publisherAllowed === true
    && value?.architectureVerified === true
    && value?.protocolVersion === 'deckent-containment-helper-v1'
    && value?.nonceHandshakeVerified === true;
}

function missingFacets(facets) {
  return WIN32_APPCONTAINER_REQUIRED_FACETS.filter(name => facets?.[name] !== true);
}

function capability(status, code, input, missing = []) {
  return Object.freeze({
    adapterId: ADAPTER_ID,
    status,
    code,
    evidenceTier: authorityEvidence(input?.authorityEvidence)
      ? input.authorityEvidence.tier
      : (input?.helper ? 'E1' : 'E0'),
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

function safeIdentity(identity) {
  const safeName = value => typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_.-]{7,127}$/u.test(value);
  return safeName(identity?.runNonce)
    && safeName(identity?.appContainerProfile)
    && typeof identity?.appContainerSid === 'string'
    && /^S-1-15-2-(?:\d+-)*\d+$/u.test(identity.appContainerSid)
    && safeName(identity?.jobName)
    && typeof identity?.tokenLuid === 'string'
    && /^[A-Fa-f0-9]{16}$/u.test(identity.tokenLuid);
}

function validResources(resources) {
  return Number.isSafeInteger(resources?.maxPids) && resources.maxPids > 0
    && Number.isSafeInteger(resources?.memoryBytes) && resources.memoryBytes > 0
    && Number.isSafeInteger(resources?.cpuMillis) && resources.cpuMillis > 0
    && Number.isSafeInteger(resources?.wallClockMs) && resources.wallClockMs > 0;
}

function validWorkload(workload) {
  return absoluteWindowsPath(workload?.executable)
    && Array.isArray(workload?.args)
    && workload.args.every(value => typeof value === 'string' && !value.includes('\0'));
}

function pathsOverlap(left, right) {
  const normalized = value => value.replace(/\\+$/u, '').toLocaleLowerCase('en-US');
  const leftPath = normalized(left);
  const rightPath = normalized(right);
  return leftPath === rightPath
    || leftPath.startsWith(`${rightPath}\\`)
    || rightPath.startsWith(`${leftPath}\\`);
}

function sensitiveScratchPath(value) {
  const normalized = value.replace(/\\+$/u, '').toLocaleLowerCase('en-US');
  return /^[a-z]:\\(?:windows|program files(?: \(x86\))?|programdata|recovery|system volume information|\$recycle\.bin)(?:\\|$)/iu
    .test(normalized)
    || /^[a-z]:\\users$/iu.test(normalized);
}

export function detectWin32AppContainerCapabilities(input = {}) {
  if (!record(input)) input = {};
  if (input.platformClass !== 'win32') {
    return capability('UNSUPPORTED', 'E_CONTAINMENT_HOLD_WIN32_PLATFORM', input);
  }
  if (!input.helper) {
    return capability('UNSUPPORTED', 'E_CONTAINMENT_HOLD_WIN32_HELPER_MISSING', input);
  }
  if (!attestedHelper(input.helper)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_WIN32_HELPER_ATTESTATION', input);
  }
  if (!authorityEvidence(input.authorityEvidence)) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_WIN32_LIVE_EVIDENCE', input);
  }
  const missing = missingFacets(input.facets);
  if (missing.length > 0) {
    return capability('DEGRADED', 'E_CONTAINMENT_HOLD_WIN32_FACETS', input, missing);
  }
  return capability('SUPPORTED', 'E_CONTAINMENT_WIN32_CAPABILITY_SUPPORTED', input);
}

export function planWin32AppContainer(input = {}) {
  if (!record(input)) input = {};
  const detected = detectWin32AppContainerCapabilities(input);
  if (detected.status !== 'SUPPORTED') return hold(detected.code, detected.facets);
  if (!absoluteWindowsPath(input.sourcePath)
    || !absoluteWindowsPath(input.scratchPath)
    || pathsOverlap(input.sourcePath, input.scratchPath)
    || sensitiveScratchPath(input.scratchPath)
    || /docker_engine/iu.test(input.sourcePath)
    || /docker_engine/iu.test(input.scratchPath)) {
    return hold('E_CONTAINMENT_HOLD_WIN32_UNSAFE_PATH', detected.facets);
  }
  if (!safeIdentity(input.identity)) {
    return hold('E_CONTAINMENT_HOLD_WIN32_RESOURCE_IDENTITY', detected.facets);
  }
  if (!validResources(input.resources)) {
    return hold('E_CONTAINMENT_HOLD_WIN32_RESOURCE_LIMITS', detected.facets);
  }
  if (!validWorkload(input.workload)
    || !absoluteWindowsPath(input.controlPlanPath)
    || !sha256(input.controlPlanDigest)
    || pathsOverlap(input.controlPlanPath, input.sourcePath)
    || pathsOverlap(input.controlPlanPath, input.scratchPath)
    || pathsOverlap(input.workload.executable, input.scratchPath)) {
    return hold('E_CONTAINMENT_HOLD_WIN32_LAUNCH_PLAN', detected.facets);
  }
  return Object.freeze({
    decision: 'ADMITTED',
    code: 'E_CONTAINMENT_WIN32_PLAN_ADMITTED',
    adapterId: ADAPTER_ID,
    proofEligible: false,
    facets: detected.facets,
    plan: Object.freeze({
      engine: 'appcontainer-restricted-token-job-object',
      command: input.helper.absolutePath,
      args: Object.freeze([
        '--protocol',
        input.helper.protocolVersion,
        '--plan',
        input.controlPlanPath,
        '--plan-digest',
        input.controlPlanDigest,
      ]),
      shell: false,
      helperDigest: input.helper.digest,
      publisherDigest: input.helper.publisherDigest,
      authorityEvidenceDigest: input.authorityEvidence.digest,
      sourceAcl: 'read-only',
      scratchAcl: 'read-write',
      networkCapabilities: Object.freeze([]),
      identity: Object.freeze({ ...input.identity }),
      workload: Object.freeze({
        executable: input.workload.executable,
        args: Object.freeze([...input.workload.args]),
      }),
      resources: Object.freeze({ ...input.resources }),
    }),
  });
}
