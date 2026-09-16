const DEFAULT_STDOUT_LIMIT_BYTES = 64 * 1024;
const DEFAULT_STDERR_LIMIT_BYTES = 64 * 1024;
const DEFAULT_WALL_LIMIT_MS = 30_000;
const DEFAULT_TERMINATION_GRACE_MS = 1_000;

function positiveBoundedInteger(value, fallback, maximum) {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum
    ? value
    : fallback;
}

function boundedCollector(limitBytes) {
  const chunks = [];
  let capturedBytes = 0;
  let observedBytes = 0;
  let truncated = false;
  return {
    append(chunk) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      observedBytes += value.byteLength;
      const remaining = limitBytes - capturedBytes;
      if (remaining > 0) {
        const selected = value.byteLength <= remaining
          ? value
          : value.subarray(0, remaining);
        chunks.push(Buffer.from(selected));
        capturedBytes += selected.byteLength;
      }
      if (observedBytes > limitBytes) truncated = true;
      return truncated;
    },
    result() {
      return {
        text: Buffer.concat(chunks, capturedBytes).toString('utf8'),
        capturedBytes,
        observedBytes,
        limitBytes,
        truncated,
      };
    },
  };
}

function sanitizedCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  if (typeof candidate.command !== 'string' || candidate.command.length === 0) return null;
  if (!Array.isArray(candidate.args)
    || candidate.args.some(argument => typeof argument !== 'string')) return null;
  if (typeof candidate.cwd !== 'string' || candidate.cwd.length === 0) return null;
  if (!candidate.env || typeof candidate.env !== 'object' || Array.isArray(candidate.env)) {
    return null;
  }
  return {
    command: candidate.command,
    args: [...candidate.args],
    cwd: candidate.cwd,
    env: { ...candidate.env },
  };
}

function hold(code, output, finality = 'UNKNOWN', candidateBirth = 'UNKNOWN') {
  const finalityEvidence = finality && typeof finality === 'object'
    ? finality
    : {
        status: finality,
        terminationVerified: false,
        adapterIdentityVerified: false,
      };
  return {
    state: 'HOLD',
    code,
    retain: true,
    candidateBirth,
    finality: {
      status: finalityEvidence.status,
      authenticated: false,
      terminationVerified: finalityEvidence.terminationVerified === true,
      adapterIdentityVerified: finalityEvidence.adapterIdentityVerified === true,
    },
    output,
  };
}

/**
 * Raw process groups are intentionally never strong adapters. A leader PID can
 * exit and be reused before a host kill/probe, so PID-only finality is not an
 * ownership proof on any platform.
 */
export function createHostProcessGroupAdapter(options = {}) {
  const platform = options.platform ?? process.platform;
  return {
    adapterId: platform === 'win32'
      ? 'win32-job-unavailable'
      : `${platform}-process-group-unavailable`,
    resourceType: platform === 'win32' ? 'win32-job' : 'process-group',
    supported: false,
    code: platform === 'win32'
      ? 'E_CONTAINMENT_HOLD_WIN32_JOB_ADAPTER_REQUIRED'
      : 'E_CONTAINMENT_HOLD_TRUSTED_PROCESS_OWNER_REQUIRED',
  };
}

/**
 * Execute one already-authorized candidate with bounded output and wall time.
 * The adapter is responsible for owning the process tree. Finality is never
 * inferred from the leader exit alone.
 */
export async function executeOwnedCandidate(input = {}) {
  const candidate = sanitizedCandidate(input.candidate);
  const preparedResource = input.preparedResource;
  const stdoutLimitBytes = positiveBoundedInteger(
    input.limits?.stdoutBytes,
    DEFAULT_STDOUT_LIMIT_BYTES,
    16 * 1024 * 1024,
  );
  const stderrLimitBytes = positiveBoundedInteger(
    input.limits?.stderrBytes,
    DEFAULT_STDERR_LIMIT_BYTES,
    16 * 1024 * 1024,
  );
  const wallLimitMs = positiveBoundedInteger(
    input.limits?.wallMs,
    DEFAULT_WALL_LIMIT_MS,
    24 * 60 * 60 * 1000,
  );
  const terminationGraceMs = positiveBoundedInteger(
    input.limits?.terminationGraceMs,
    DEFAULT_TERMINATION_GRACE_MS,
    60_000,
  );
  const stdout = boundedCollector(stdoutLimitBytes);
  const stderr = boundedCollector(stderrLimitBytes);
  const output = () => ({ stdout: stdout.result(), stderr: stderr.result() });

  if (!candidate) return hold('E_CONTAINMENT_HOLD_CANDIDATE_INVALID', output(), 'UNPROVEN', 'NOT_BORN');
  if ((input.onCandidateBirth !== undefined
      && typeof input.onCandidateBirth !== 'function')
    || (input.onCompletion !== undefined
      && typeof input.onCompletion !== 'function')) {
    return hold(
      'E_CONTAINMENT_HOLD_LIFECYCLE_CALLBACK_INVALID',
      output(),
      'UNPROVEN',
      'NOT_BORN',
    );
  }
  if (preparedResource?.state !== 'PREPARED'
    || preparedResource.verified !== true
    || typeof preparedResource.spawn !== 'function'
    || typeof preparedResource.terminateAndVerify !== 'function') {
    return hold(
      preparedResource?.code ?? 'E_CONTAINMENT_HOLD_PREPARED_RESOURCE_REQUIRED',
      output(),
      'UNPROVEN',
      'NOT_BORN',
    );
  }
  if (typeof input.binding?.identityDigest !== 'string'
    || !/^[a-f0-9]{64}$/u.test(input.binding.identityDigest)
    || input.binding.identityDigest !== preparedResource.identityDigest
    || input.binding.adapterId !== preparedResource.adapterId
    || input.binding.resourceType !== preparedResource.resourceType
    || input.binding.resourceId !== preparedResource.resourceId) {
    return hold(
      'E_CONTAINMENT_HOLD_EXECUTION_BINDING_INVALID',
      output(),
      'UNPROVEN',
      'NOT_BORN',
    );
  }

  let child;
  let timedOut = false;
  let outputExceeded = false;
  let settle;
  const terminate = async () => {
    if (!settle) {
      settle = preparedResource.terminateAndVerify(child, terminationGraceMs);
    }
    return settle;
  };
  try {
    child = preparedResource.spawn(candidate);
    if (!child?.pid || typeof child.once !== 'function') {
      const finality = child
        ? await terminate().catch(() => null)
        : null;
      return hold(
        'E_CONTAINMENT_HOLD_CANDIDATE_BIRTH_UNKNOWN',
        output(),
        finality?.status === 'PROVEN'
          && finality.terminationVerified === true
          && finality.adapterIdentityVerified === true
          ? finality
          : 'UNKNOWN',
      );
    }
    let resolveOutputLimit;
    const outputLimit = new Promise(resolveLimit => {
      resolveOutputLimit = resolveLimit;
    });
    const onOutput = collector => chunk => {
      if (collector.append(chunk) && !outputExceeded) {
        outputExceeded = true;
        resolveOutputLimit({
          code: null,
          signal: 'CONTAINMENT_OUTPUT_LIMIT',
        });
      }
    };
    child.stdout?.on('data', onOutput(stdout));
    child.stderr?.on('data', onOutput(stderr));

    const exit = new Promise(resolveExit => {
      child.once('error', error => resolveExit({ error }));
      child.once('close', (code, signal) => resolveExit({ code, signal }));
    });
    await input.onCandidateBirth?.({ pid: child.pid });
    let wallTimer;
    const wall = new Promise(resolveWall => {
      wallTimer = setTimeout(() => {
        timedOut = true;
        resolveWall({ code: null, signal: 'CONTAINMENT_TIMEOUT' });
      }, wallLimitMs);
    });
    let outcome;
    try {
      outcome = await Promise.race([exit, wall, outputLimit]);
    } finally {
      clearTimeout(wallTimer);
    }
    if (outcome.error) throw outcome.error;
    const normalizedOutcome = {
      code: Number.isInteger(outcome.code) ? outcome.code : null,
      signal: typeof outcome.signal === 'string' ? outcome.signal : null,
    };
    await input.onCompletion?.(normalizedOutcome);
    const finality = await terminate();
    if (finality?.status !== 'PROVEN'
      || finality.terminationVerified !== true
      || finality.adapterIdentityVerified !== true) {
      return hold(
        'E_CONTAINMENT_HOLD_FINALITY_UNKNOWN',
        output(),
        'UNKNOWN',
      );
    }
    if (timedOut) {
      return hold(
        'E_CONTAINMENT_HOLD_WALL_LIMIT',
        output(),
        finality,
        'BORN',
      );
    }
    if (outputExceeded) {
      return hold(
        'E_CONTAINMENT_HOLD_OUTPUT_LIMIT',
        output(),
        finality,
        'BORN',
      );
    }
    return {
      state: 'SETTLED',
      code: 'CONTAINMENT_EXECUTION_SETTLED',
      retain: false,
      candidateBirth: 'BORN',
      outcome: normalizedOutcome,
      finality: {
        status: 'PROVEN',
        authenticated: false,
        terminationVerified: true,
        adapterIdentityVerified: true,
      },
      output: output(),
    };
  } catch (error) {
    const finality = child ? await terminate().catch(() => null) : null;
    return hold(
      /^E_[A-Z0-9_:.-]+$/u.test(error instanceof Error ? error.message : '')
        ? error.message
        : 'E_CONTAINMENT_HOLD_EXECUTION_UNKNOWN',
      output(),
      finality?.status === 'PROVEN'
        && finality.terminationVerified === true
        && finality.adapterIdentityVerified === true
        ? finality
        : 'UNKNOWN',
      child?.pid ? 'BORN' : 'UNKNOWN',
    );
  }
}
