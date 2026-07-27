// Candidate birth gate. The durable claim and release functions are host
// authorities; the candidate receives neither object nor any control channel.

import { createHash } from 'node:crypto';
import { readdir, readlink } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRISTINE_ARRAY_IS_ARRAY = Array.isArray;
const PRISTINE_REFLECT_APPLY = Reflect.apply;
const PRISTINE_STRINGIFY = JSON.stringify;

function errorCode(error, fallback) {
  const value = error instanceof Error ? error.message : String(error ?? '');
  return /^E_[A-Z0-9_:.-]+$/u.test(value) ? value : fallback;
}

function hold(code, candidateBirth = 'NOT_BORN') {
  return {
    state: 'HOLD',
    code,
    candidateBirth,
    retain: true,
    nonIpcGo: true,
  };
}

function validDurableClaim(value) {
  return value?.schemaVersion === 1
    && typeof value.runNonce === 'string'
    && value.runNonce.length > 0
    && typeof value.identityDigest === 'string'
    && /^[a-f0-9]{64}$/u.test(value.identityDigest)
    && typeof value.identity?.adapterId === 'string'
    && value.identity.adapterId.length > 0;
}

function authorizationMatches(value, claim) {
  return value?.schemaVersion === 3
    && value.state === 'gate-released'
    && value.containment?.mode === 'enforce'
    && value.containment.candidateBirthAuthorized === true
    && value.containment.resourceClaimDigest === claim.identityDigest
    && value.containment.adapterId === claim.identity.adapterId
    && value.containment.finality?.status === 'UNPROVEN';
}

const CANDIDATE_BOOTSTRAP_CHECKS = [
  'descriptor-allowlist-verified',
  'node-permission-active',
  'startup-sanitized',
];

function validEvidenceRef(value) {
  return typeof value === 'string'
    && /^[a-z][a-z0-9._-]*:[A-Za-z0-9._~:/=+-]+$/u.test(value);
}

/**
 * Capture only the pristine operations needed to validate bootstrap checks and
 * call a deferred candidate loader. No candidate module is imported here.
 */
export function createCandidateBootstrapAuthority() {
  let consumed = false;
  return {
    run(input = {}) {
      if (consumed) return hold('E_CONTAINMENT_HOLD_BOOTSTRAP_REPLAY');
      consumed = true;
      if (!PRISTINE_ARRAY_IS_ARRAY(input.checks)
        || typeof input.loadCandidate !== 'function') {
        return hold('E_CONTAINMENT_HOLD_BOOTSTRAP_INPUT_INVALID');
      }
      const evidence = [];
      for (const requiredId of CANDIDATE_BOOTSTRAP_CHECKS) {
        const matches = input.checks.filter(check => check?.id === requiredId);
        if (matches.length !== 1 || typeof matches[0].evaluate !== 'function') {
          return hold('E_CONTAINMENT_HOLD_BOOTSTRAP_CHECK_MISSING');
        }
        let result;
        try {
          result = PRISTINE_REFLECT_APPLY(matches[0].evaluate, undefined, []);
        } catch {
          return hold('E_CONTAINMENT_HOLD_BOOTSTRAP_CHECK_FAILED');
        }
        if (result?.state !== 'PROVEN' || !validEvidenceRef(result.evidenceRef)) {
          return hold('E_CONTAINMENT_HOLD_BOOTSTRAP_CHECK_UNPROVEN');
        }
        evidence.push({ id: requiredId, evidenceRef: result.evidenceRef });
      }
      let candidate;
      try {
        candidate = PRISTINE_REFLECT_APPLY(input.loadCandidate, undefined, []);
      } catch {
        return hold('E_CONTAINMENT_HOLD_CANDIDATE_LOAD_FAILED', 'UNKNOWN');
      }
      return {
        state: 'STARTED',
        code: 'CONTAINMENT_BOOTSTRAP_STARTED',
        candidateBirth: 'BORN',
        retain: true,
        evidence,
        candidate,
      };
    },
  };
}

const STARTUP_INJECTION_KEYS = [
  'BASH_ENV',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'ELECTRON_RUN_AS_NODE',
  'ENV',
  'GCONV_PATH',
  'LD_AUDIT',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_CHANNEL_FD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_REPL_EXTERNAL_MODULE',
  'NODE_V8_COVERAGE',
  'OPENSSL_CONF',
];

function evidenceRef(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function provenEvidence(id, value) {
  return {
    state: 'PROVEN',
    evidenceRef: evidenceRef(`${id}:${value}`),
  };
}

function unprovenEvidence(code) {
  return { state: 'UNPROVEN', code };
}

function startupSanitizationEvidence(environment) {
  if (!environment || typeof environment !== 'object'
    || PRISTINE_ARRAY_IS_ARRAY(environment)) {
    return unprovenEvidence('E_CONTAINMENT_HOLD_STARTUP_ENVIRONMENT_INVALID');
  }
  let normalizedKeys;
  try {
    normalizedKeys = new Set(Object.keys(environment).map(key => key.toUpperCase()));
  } catch {
    return unprovenEvidence('E_CONTAINMENT_HOLD_STARTUP_ENVIRONMENT_INVALID');
  }
  const present = STARTUP_INJECTION_KEYS.filter(key => normalizedKeys.has(key));
  return present.length === 0
    ? provenEvidence('startup-sanitized', 'dangerous-environment-absent')
    : unprovenEvidence('E_CONTAINMENT_HOLD_STARTUP_ENVIRONMENT_UNSAFE');
}

function nodePermissionEvidence(permission, entryPath, cwd) {
  if (!permission || typeof permission.has !== 'function') {
    return unprovenEvidence('E_CONTAINMENT_HOLD_NODE_PERMISSION_INACTIVE');
  }
  let entryReadable;
  let cwdWritable;
  let rootWritable;
  try {
    entryReadable = permission.has('fs.read', entryPath);
    cwdWritable = permission.has('fs.write', cwd);
    rootWritable = permission.has('fs.write', resolve(cwd, '..'));
  } catch {
    return unprovenEvidence('E_CONTAINMENT_HOLD_NODE_PERMISSION_QUERY_FAILED');
  }
  return entryReadable === true
    && cwdWritable === false
    && rootWritable === false
    ? provenEvidence('node-permission-active', `${entryPath}:${cwd}`)
    : unprovenEvidence('E_CONTAINMENT_HOLD_NODE_PERMISSION_SCOPE_INVALID');
}

async function descriptorAllowlistEvidence(platform) {
  const directory = platform === 'linux'
    ? '/proc/self/fd'
    : platform === 'darwin'
      ? '/dev/fd'
      : null;
  if (!directory) {
    return unprovenEvidence('E_CONTAINMENT_HOLD_DESCRIPTOR_PROBE_UNSUPPORTED');
  }
  let names;
  try {
    names = await readdir(directory);
  } catch {
    return unprovenEvidence('E_CONTAINMENT_HOLD_DESCRIPTOR_PROBE_FAILED');
  }
  const unexpected = [];
  for (const name of names) {
    if (!/^[0-9]+$/u.test(name) || Number(name) <= 2) continue;
    try {
      const target = await readlink(resolve(directory, name));
      unexpected.push(`${name}:${target}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        return unprovenEvidence('E_CONTAINMENT_HOLD_DESCRIPTOR_PROBE_FAILED');
      }
    }
  }
  return unexpected.length === 0
    ? provenEvidence('descriptor-allowlist-verified', 'stdio-only')
    : unprovenEvidence('E_CONTAINMENT_HOLD_DESCRIPTOR_ALLOWLIST');
}

export function parseCandidateBootstrapArgs(argv) {
  if (!PRISTINE_ARRAY_IS_ARRAY(argv)) {
    throw new Error('E_CONTAINMENT_HOLD_BOOTSTRAP_ARGV_INVALID');
  }
  const separator = argv.indexOf('--');
  if (separator < 0 || separator < 4
    || argv[2] !== '--entry'
    || separator !== 4
    || typeof argv[3] !== 'string'
    || !isAbsolute(argv[3])
    || argv.slice(5).some(argument => (
      typeof argument !== 'string' || argument.includes('\0')
    ))) {
    throw new Error('E_CONTAINMENT_HOLD_BOOTSTRAP_ARGV_INVALID');
  }
  return {
    entryPath: resolve(argv[3]),
    candidateArgs: argv.slice(5),
  };
}

/**
 * This module is the first external JavaScript. It checks inherited process
 * state using pristine references before dynamically importing the candidate.
 */
export async function runExternalCandidateBootstrap(input = {}) {
  const argv = input.argv ?? process.argv;
  const environment = input.environment ?? process.env;
  let parsed;
  try {
    parsed = parseCandidateBootstrapArgs(argv);
  } catch (error) {
    return hold(errorCode(error, 'E_CONTAINMENT_HOLD_BOOTSTRAP_ARGV_INVALID'));
  }
  const descriptorEvidence = input.descriptorEvidence
    ?? await descriptorAllowlistEvidence(input.platform ?? process.platform);
  const permissionEvidence = input.permissionEvidence
    ?? nodePermissionEvidence(
      input.permission ?? process.permission,
      parsed.entryPath,
      input.cwd ?? process.cwd(),
    );
  const startupEvidence = input.startupEvidence
    ?? startupSanitizationEvidence(environment);
  const loadCandidate = input.loadCandidate ?? (async () => {
    process.argv = [process.execPath, parsed.entryPath, ...parsed.candidateArgs];
    return import(pathToFileURL(parsed.entryPath).href);
  });
  const authority = createCandidateBootstrapAuthority();
  const result = authority.run({
    checks: [
      {
        id: 'descriptor-allowlist-verified',
        evaluate: () => descriptorEvidence,
      },
      {
        id: 'node-permission-active',
        evaluate: () => permissionEvidence,
      },
      {
        id: 'startup-sanitized',
        evaluate: () => startupEvidence,
      },
    ],
    loadCandidate,
  });
  if (result.state !== 'STARTED') return result;
  try {
    return {
      ...result,
      candidate: await result.candidate,
    };
  } catch {
    return hold('E_CONTAINMENT_HOLD_CANDIDATE_LOAD_FAILED', 'UNKNOWN');
  }
}

/**
 * Release a one-shot, in-process birth gate after the durable claim exists.
 * `spawnCandidate` is invoked at most once and receives only non-secret binding
 * metadata. There is no Node IPC GO message and no pre-claim candidate process.
 */
export async function bootstrapClaimedProcess(input = {}) {
  const {
    durableClaim,
    authorizeCandidateBirth,
    spawnCandidate,
  } = input;
  if (!validDurableClaim(durableClaim)) {
    return hold('E_CONTAINMENT_HOLD_DURABLE_CLAIM_REQUIRED');
  }
  if (typeof authorizeCandidateBirth !== 'function') {
    return hold('E_CONTAINMENT_HOLD_BIRTH_AUTHORITY_REQUIRED');
  }
  if (typeof spawnCandidate !== 'function') {
    return hold('E_CONTAINMENT_HOLD_EXECUTION_ADAPTER_REQUIRED');
  }

  let authorization;
  try {
    authorization = await authorizeCandidateBirth(durableClaim.identityDigest);
  } catch (error) {
    return hold(errorCode(error, 'E_CONTAINMENT_HOLD_BIRTH_AUTHORIZATION'));
  }
  if (!authorizationMatches(authorization, durableClaim)) {
    return hold('E_CONTAINMENT_HOLD_BIRTH_AUTHORIZATION_INVALID');
  }

  const binding = {
    runNonce: durableClaim.runNonce,
    identityDigest: durableClaim.identityDigest,
    adapterId: durableClaim.identity.adapterId,
    resourceType: durableClaim.identity.resourceType,
    resourceId: durableClaim.identity.resourceId,
  };
  try {
    const execution = await spawnCandidate(binding);
    if (!execution || typeof execution !== 'object') {
      return hold('E_CONTAINMENT_HOLD_EXECUTION_RESULT_MISSING', 'UNKNOWN');
    }
    return {
      state: 'STARTED',
      code: 'CONTAINMENT_CANDIDATE_STARTED',
      candidateBirth: 'BORN',
      retain: true,
      nonIpcGo: true,
      binding,
      execution,
    };
  } catch (error) {
    return hold(
      errorCode(error, 'E_CONTAINMENT_HOLD_EXECUTION_START_UNKNOWN'),
      'UNKNOWN',
    );
  }
}

if (import.meta.main) {
  const result = await runExternalCandidateBootstrap();
  if (result.state !== 'STARTED') {
    process.stdout.write(`${PRISTINE_STRINGIFY({
      state: 'HOLD',
      code: result.code,
      candidateBirth: result.candidateBirth,
    })}\n`);
    process.exitCode = 2;
  }
}
