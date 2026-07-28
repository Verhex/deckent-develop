// scripts/clean.mjs — clean dist/ EXCEPT the vite-built dashboard bundle.
//
// Footgun this closes: the old `clean` was `rm -rf dist`, so a plain
// `npm run build` (tsc + copy-assets, NO dashboard) WIPED dist/dashboard and
// left `deckent serve` with no static files ("Bundled dashboard not found").
// Only `build:dashboard`/`build:all` regenerate it, so every TS-only build broke
// the served dashboard until the next full build.
//
// Fix: a TS-only `npm run build` now preserves dist/dashboard (kept from the last
// `build:all`), so serve keeps working. `build:all` runs this clean too, then
// rebuilds the dashboard on top — so the full build is byte-identical to before.
//
// Portable (node fs, no shell) to match copy-assets.mjs / build-dashboard.mjs.

import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  readlinkSync,
  readSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
  constants as fsConstants,
} from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_FILE = realpathSync.native(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(dirname(SOURCE_FILE), '..');
const SOURCE_ROOT_IDENTITY = lstatSync(SOURCE_ROOT, { bigint: true });
const PRESERVE = new Set(['dashboard']);
const loadModule = createRequire(SOURCE_FILE);

const ACTIVE_TASK_STATUSES = new Set([
  'CLAIMED',
  'EXECUTING',
  'TESTING',
  'DOCUMENTING',
  'PAUSED',
  'MANUAL_REVIEW_REQUIRED',
]);
const KNOWN_TASK_STATUSES = new Set([
  'DRAFT',
  'PENDING',
  ...ACTIVE_TASK_STATUSES,
  'DONE',
  'NO_GO',
]);
const ACTIVE_HEARTBEAT_STATUSES = new Set([
  'PLANNING',
  'EXECUTING',
  'EVALUATING',
  'SCANNING',
  'CODING',
  'VERIFYING',
  'TESTING',
  'DOCUMENTING',
  'PAUSED',
]);
const TERMINAL_HEARTBEAT_STATUSES = new Set([
  'DONE',
  'ERROR',
  'ABORTED',
  'NO_GO',
  'TIMEOUT',
  'TIMEOUT_WITH_WORK',
]);
const ACTIVE_SPRINT_STATUSES = new Set([
  'PLANNING',
  'ACTIVE',
  'EVALUATING',
  'FIXING',
  'RETROSPECTIVE',
  'PAUSED',
]);
const TERMINAL_SPRINT_STATUSES = new Set(['COMPLETE', 'ABORTED']);
const SPRINT_PHASES = new Set([
  'DIRECTIVE',
  'PLAN',
  'SPAWN',
  'EXECUTE',
  'EVALUATE',
  'FIX',
  'RETRO',
  'DECAY',
  'TRANSITION',
  'COMPLETE',
]);
const BACKLOG_KINDS = new Set(['task', 'sprint', 'capability', 'process']);
const BACKLOG_STATUSES = new Set(['pending', 'running', 'parked', 'done', 'failed']);
const RUN_JOB_ACTIVE_STATUSES = new Set(['RUNNING', 'STARTING', 'CLAIMED']);
const RUN_JOB_NON_ACTIVE_STATUSES = new Set([
  'PENDING',
  'PARKED',
  'COMPLETE',
  'FAILED',
]);
// JobState is a polling/notification projection, not a process handle. Writers
// persist RUNNING before/after adjacent authorities (task/IPC/sprint/RunFlow)
// become visible, and historical writers did not always settle the row. Keep a
// bounded launch-race window fail-closed; after it, an uncorroborated RUNNING
// row is diagnostic STALE evidence while the adjacent durable authority decides.
const RUN_JOB_LAUNCH_RACE_MS = 15 * 60 * 1_000;
const RUN_FLOW_EVENT_TYPES = new Set([
  'PROPOSAL_SUBMITTED',
  'PREVIEW_STARTED',
  'PREVIEW_READY',
  'APPROVAL_GRANTED',
  'APPROVAL_REJECTED',
  'START_REQUESTED',
  'RUN_STARTED',
  'RUN_COMPLETED',
  'RUN_FAILED',
  'FLOW_ABORTED',
]);
const RUN_FLOW_TERMINAL_STATES = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'BLOCKED',
]);
const RUN_FLOW_REQUEST_ORIGINS = new Set([
  'cli',
  'mcp',
  'chat',
  'autonomous',
  'webhook',
  'scheduled',
  'api',
  'ide',
]);
const RUN_FLOW_POLICY_DECISIONS = new Set(['allow', 'deny', 'needs-approval']);
const RUN_FLOW_GATE_RESULTS = new Set(['pass', 'fail', 'skipped']);
const MISSION_STATUSES = new Set(['pending', 'active', 'completed', 'failed', 'cancelled']);
const MISSION_ITEM_STATUSES = new Set([
  'pending',
  'running',
  'done',
  'failed',
  'blocked',
  'parked',
]);
const INVOCATION_ROLES = new Set(['brain', 'worker', 'auditor']);
const INVOCATION_PURPOSES = new Set([
  'sprint-planning',
  'goal-authoring',
  'goal-acceptance',
  'reachability-probe',
  'worker-execution',
  'audit-evaluation',
]);
const INVOCATION_SELECTION_SOURCES = new Set([
  'config',
  'directive',
  'router',
  'fallback',
  'wire',
  'none',
]);
const INVOCATION_AUTH_MODES = new Set([
  'subscription',
  'api',
  'hybrid',
  'local',
  'unknown',
]);
const INVOCATION_TRANSPORTS = new Set(['cli', 'api', 'http', 'local-runtime']);
const INVOCATION_BACKENDS = new Set([
  'host-subprocess',
  'docker',
  'tmux',
  'api',
  'in-process',
  'unknown',
]);
const INVOCATION_EVIDENCE_STATES = new Set([
  'known',
  'unknown',
  'stale',
  'unavailable',
]);
const INVOCATION_EVENT_TYPES = new Set([
  'dispatch_started',
  'dispatch_rejected',
  'transport_settled',
  'consumer_settled',
]);
const INVOCATION_REASON_CODES = new Set([
  'none',
  'no_provider',
  'budget_capability_unsupported',
  'provider_authority_rejected',
  'execution_admission_rejected',
  'legacy_operator_attestation',
  'not_dispatched_settled',
  'command_build_failed',
  'spawn_error',
  'nonzero_exit',
  'timeout',
  'empty_output',
  'parse_failed',
  'validation_failed',
  'fallback_unreachable',
  'fallback_limit_hold',
  'fallback_exhausted',
  'provider_resolution_fallback',
  'coordinator_restart_orphan',
  'duplicate_invocation',
]);
const INVOCATION_PRE_DISPATCH_REASON_CODES = new Set([
  'no_provider',
  'budget_capability_unsupported',
  'provider_authority_rejected',
  'execution_admission_rejected',
  'legacy_operator_attestation',
  'command_build_failed',
  'fallback_unreachable',
  'fallback_limit_hold',
  'fallback_exhausted',
]);
const INVOCATION_TRANSPORT_OUTCOMES = new Set([
  'succeeded',
  'failed',
  'timeout',
  'unknown',
]);
const INVOCATION_CONSUMER_OUTCOMES = new Set([
  'accepted',
  'rejected',
  'unknown',
]);
const INVOCATION_TASK_DISPOSITIONS = new Set([
  'not_dispatched',
  'done',
  'no_go',
  'manual_review_required',
]);
const SHA256_RE = /^[a-f0-9]{64}$/u;
const INVOCATION_MAX_TIMESTAMP_LENGTH = 64;
const INVOCATION_MAX_EVENT_ID_LENGTH = 512;
const INVOCATION_MAX_SIGNAL_LENGTH = 128;
const TASK_EXECUTION_FENCE_PREFIX = 'deckent-task-execution://';
const TASK_EXECUTION_FENCE_STALE_MS = 5 * 60 * 1_000;
const TASK_EXECUTION_FENCE_OWNER_RE =
  /^(dispatch|settlement):([1-9]\d*):([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u;
const EXECUTION_LOCK_SCHEMA_VERSION = 3;
const EXECUTION_LOCK_DB_META_VERSION = 3;
const EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION = 1;
const EXECUTION_LOCK_BOUNDARY_COMPLETION_SCHEMA_VERSION = 1;
const EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION = 1;
const EXECUTION_LOCK_QUARANTINE_AUDIT_SCHEMA_VERSION = 1;
const EXECUTION_LOCK_AUTHORITY_SENTINEL_SCHEMA_VERSION = 1;
const EXECUTION_LOCK_COORDINATION_DB_FILENAME =
  'execution-lock-authority.sqlite3';
const EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME =
  'execution-lock-authority.sentinel.json';
const EXECUTION_LOCK_AUTHORITY_ANCHOR_FILENAME =
  '.deckent-execution-lock-authority.anchor.json';
const PROJECT_MAINTENANCE_LOCK_TASK_ID =
  '__deckent_project_maintenance__';
const EXECUTION_LOCK_ACTORS =
  new Set(['dispatch', 'settlement', 'maintenance']);
const EXECUTION_LOCK_OWNER_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EXECUTION_LOCK_FENCING_NONCE_RE = /^[0-9a-f]{32}$/u;
const EXECUTION_LOCK_IDENTITY_RE = /^[A-Za-z0-9._:-]{1,128}$/u;
const EXECUTION_LOCK_FILE_RE = /^[0-9a-f]{64}\.executionlock$/u;
const EXECUTION_LOCK_MAX_TASK_ID_BYTES = 512;
const EXECUTION_LOCK_MAX_LEASE_MS = 86_400_000;
const EXECUTION_LOCK_MAX_IDENTITY_BYTES = 128;
const EXECUTION_LOCK_MAX_PROJECTION_BYTES = 16_384;
const EXECUTION_LOCK_MAX_SENTINEL_BYTES = 1_024;
const EXECUTION_LOCK_MAX_ANCHOR_BYTES = 2_048;
const EXECUTION_LOCK_MAX_DB_BYTES = 1_073_741_824;
const EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS = 250;
const EXECUTION_LOCK_QUERY_PAGE_SIZE = 256;
const EXECUTION_LOCK_QUARANTINE_REASONS = new Set([
  'irreversible-boundary',
  'partial-mutation',
  'heartbeat-fault',
  'release-fault',
  'authority-uncertain',
  'legacy-v2-active',
]);
const EXECUTION_LOCK_MAX_EVIDENCE_REFS = 16;
const EXECUTION_LOCK_MAX_EVIDENCE_REF_BYTES = 1_024;
const EXECUTION_LOCK_MAX_EVIDENCE_TOTAL_BYTES = 8_192;
const EXECUTION_LOCK_MAX_RECOVERY_OPERATOR_BYTES = 128;
const EXECUTION_LOCK_MAX_RECOVERY_JUSTIFICATION_BYTES = 2_048;
const EXECUTION_LOCK_MAX_RECOVERY_ATTESTATION_AGE_MS = 15 * 60 * 1_000;
const EXECUTION_LOCK_MAX_RECOVERY_FUTURE_SKEW_MS = 60 * 1_000;
const CLEAN_EXECUTION_LOCK_PROCESS_SESSION_ID = randomUUID();
const CLEAN_EXECUTION_LOCK_RUNTIME_IDENTITY =
  Object.freeze(detectCleanExecutionLockRuntimeIdentity());
const SAFE_TASK_ID_RE = /^[\w-]{1,100}$/u;
const EVIDENCE_LIMITS = Object.freeze({
  directoryEntries: 10_000,
  taskFiles: 2_000,
  heartbeatFiles: 2_000,
  pidFiles: 2_000,
  receiptRows: 10_000,
  eventRows: 8,
  spawnLockFiles: 2_000,
  executionLockFiles: 2_000,
  processEntries: 10_000,
  runFlowFiles: 2_000,
  jobFiles: 2_000,
  missionRows: 10_000,
  jsonLines: 10_000,
  jsonBytes: 1024 * 1024,
  configBytes: 2 * 1024 * 1024,
  outputReasons: 256,
  outputProjections: 512,
});

class EvidenceReadError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value) {
  const normalize = current => {
    if (Array.isArray(current)) return current.map(normalize);
    if (current && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return current;
  };
  return JSON.stringify(normalize(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function evidencePath(projectRoot, path) {
  const rel = relative(projectRoot, path);
  return rel.split(sep).join('/');
}

function lstatEvidence(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error && typeof error === 'object'
      && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return null;
    }
    throw new EvidenceReadError('READ_FAILED');
  }
}

function evidenceExists(path) {
  return lstatEvidence(path) !== null;
}

function readBoundedText(path, maxBytes) {
  const stats = lstatEvidence(path);
  if (stats === null) throw new EvidenceReadError('MISSING');
  if (stats.isSymbolicLink()) throw new EvidenceReadError('SYMLINK');
  if (!stats.isFile()) throw new EvidenceReadError('NOT_FILE');
  if (stats.size > maxBytes) throw new EvidenceReadError('SIZE_LIMIT');
  try {
    const raw = readFileSync(path, 'utf-8');
    if (Buffer.byteLength(raw, 'utf-8') > maxBytes) {
      throw new EvidenceReadError('SIZE_LIMIT');
    }
    return raw;
  } catch (error) {
    if (error instanceof EvidenceReadError) throw error;
    throw new EvidenceReadError('READ_FAILED');
  }
}

function readBoundedBytes(path, maxBytes) {
  const stats = lstatEvidence(path);
  if (stats === null) throw new EvidenceReadError('MISSING');
  if (stats.isSymbolicLink()) throw new EvidenceReadError('SYMLINK');
  if (!stats.isFile()) throw new EvidenceReadError('NOT_FILE');
  if (stats.size > maxBytes) throw new EvidenceReadError('SIZE_LIMIT');
  try {
    const bytes = readFileSync(path);
    if (bytes.byteLength > maxBytes) throw new EvidenceReadError('SIZE_LIMIT');
    return bytes;
  } catch (error) {
    if (error instanceof EvidenceReadError) throw error;
    throw new EvidenceReadError('READ_FAILED');
  }
}

function readBoundedJson(path, maxBytes = EVIDENCE_LIMITS.jsonBytes) {
  const raw = readBoundedText(path, maxBytes);
  try {
    return JSON.parse(raw);
  } catch {
    throw new EvidenceReadError('INVALID_JSON');
  }
}

function readBoundedJsonLines(path) {
  const raw = readBoundedText(path, EVIDENCE_LIMITS.configBytes);
  const lines = raw.split(/\r?\n/u).filter(line => line.trim().length > 0);
  if (lines.length > EVIDENCE_LIMITS.jsonLines) {
    throw new EvidenceReadError('LINE_LIMIT');
  }
  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      throw new EvidenceReadError('INVALID_JSONL');
    }
  });
}

function listBoundedDirectory(path) {
  const stats = lstatEvidence(path);
  if (stats === null) return [];
  if (stats.isSymbolicLink()) throw new EvidenceReadError('SYMLINK');
  if (!stats.isDirectory()) throw new EvidenceReadError('NOT_DIRECTORY');
  try {
    const entries = readdirSync(path, { withFileTypes: true });
    if (entries.length > EVIDENCE_LIMITS.directoryEntries) {
      throw new EvidenceReadError('ENTRY_LIMIT');
    }
    return entries.sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    if (error instanceof EvidenceReadError) throw error;
    throw new EvidenceReadError('READ_FAILED');
  }
}

function evidenceErrorKind(error) {
  return error instanceof EvidenceReadError ? error.kind : 'READ_FAILED';
}

function createAdmissionReport(rootDigest) {
  return {
    schemaVersion: 1,
    authority: 'deckent.clean.active-execution.v1',
    decision: 'ALLOW',
    code: 'CLEAN_ACTIVE_EXECUTION_CLEAR',
    projectRootDigest: rootDigest,
    reasons: [],
    projections: [],
    inspected: {
      taskFiles: 0,
      heartbeatFiles: 0,
      workerPidFiles: 0,
      sprintPidFiles: 0,
      processEntries: 0,
      receiptRows: 0,
      spawnLockFiles: 0,
      executionLockFiles: 0,
      jobFiles: 0,
      runFlowFiles: 0,
      missionRows: 0,
    },
  };
}

function addReason(report, {
  code,
  surface,
  subject,
  observedStatus,
  detailCode,
  evidenceRefs = [],
}) {
  report.reasons.push({
    code,
    surface,
    subject,
    ...(observedStatus === undefined ? {} : { observedStatus }),
    ...(detailCode === undefined ? {} : { detailCode }),
    evidenceRefs: [...evidenceRefs].sort(),
  });
}

function finalizeAdmissionReport(report) {
  const projectionOverflow = report.projections.length > EVIDENCE_LIMITS.outputProjections;
  if (projectionOverflow) {
    report.reasons.push({
      code: 'E_CLEAN_EVIDENCE_PROJECTION_LIMIT',
      surface: 'project',
      subject: 'admission',
      detailCode: 'PROJECTION_LIMIT_EXCEEDED',
      evidenceRefs: [],
    });
  }
  const uniqueReasons = new Map();
  for (const reason of report.reasons) {
    uniqueReasons.set(JSON.stringify(reason), reason);
  }
  report.reasons = [...uniqueReasons.values()].sort((left, right) =>
    `${left.surface}:${left.subject}:${left.code}`
      .localeCompare(`${right.surface}:${right.subject}:${right.code}`));
  report.projections.sort((left, right) =>
    `${left.surface}:${left.id}`.localeCompare(`${right.surface}:${right.id}`));
  if (report.reasons.length > EVIDENCE_LIMITS.outputReasons) {
    report.reasons = [
      ...report.reasons.slice(0, EVIDENCE_LIMITS.outputReasons - 1),
      {
        code: 'E_CLEAN_EVIDENCE_REASON_LIMIT',
        surface: 'project',
        subject: 'admission',
        detailCode: 'REASON_LIMIT_EXCEEDED',
        evidenceRefs: [],
      },
    ];
  }
  if (projectionOverflow) {
    report.projections = report.projections.slice(0, EVIDENCE_LIMITS.outputProjections);
  }
  if (report.reasons.length > 0) {
    report.decision = 'HOLD';
    report.code = 'E_CLEAN_ACTIVE_EXECUTION_HOLD';
  }
  return report;
}

function defaultProcessProbe(pid) {
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ESRCH') return 'dead';
    if (error && typeof error === 'object' && error.code === 'EPERM') return 'alive';
    return 'unknown';
  }
}

function parsePid(raw) {
  const value = raw.trim();
  if (!/^[1-9]\d*$/.test(value)) return null;
  const pid = Number(value);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

function inspectPlainPidFile(report, projectRoot, path, surface, subject, processProbe) {
  let pid;
  try {
    pid = parsePid(readBoundedText(path, 128));
  } catch (error) {
    addReason(report, {
      code: `E_CLEAN_${surface.toUpperCase()}_STATE_INVALID`,
      surface,
      subject,
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, path)],
    });
    return;
  }
  if (pid === null) {
    addReason(report, {
      code: `E_CLEAN_${surface.toUpperCase()}_STATE_INVALID`,
      surface,
      subject,
      detailCode: 'INVALID_PID',
      evidenceRefs: [evidencePath(projectRoot, path)],
    });
    return;
  }
  const state = processProbe(pid);
  if (state === 'alive') {
    addReason(report, {
      code: `E_CLEAN_${surface.toUpperCase()}_ACTIVE`,
      surface,
      subject,
      observedStatus: 'ALIVE',
      evidenceRefs: [evidencePath(projectRoot, path)],
    });
  } else if (state !== 'dead') {
    addReason(report, {
      code: `E_CLEAN_${surface.toUpperCase()}_STATE_UNKNOWN`,
      surface,
      subject,
      observedStatus: 'UNKNOWN',
      evidenceRefs: [evidencePath(projectRoot, path)],
    });
  }
}

function inspectSprintState(report, projectRoot, processProbe) {
  const activePath = join(projectRoot, '.deckent', 'sprint-active.json');
  let activeMarker = null;
  try {
    if (evidenceExists(activePath)) {
      const active = readBoundedJson(activePath);
      if (!isRecord(active) || typeof active.sprintId !== 'string' || !active.sprintId.trim()) {
        throw new EvidenceReadError('INVALID_SHAPE');
      }
      activeMarker = active;
    }
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_SPRINT_STATE_INVALID',
      surface: 'sprint',
      subject: 'active-marker',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, activePath)],
    });
  }

  const statePath = join(projectRoot, '.deckent', 'sprint-state.json');
  let stateRecord = null;
  try {
    if (evidenceExists(statePath)) {
      const state = readBoundedJson(statePath);
      if (!isRecord(state)
        || typeof state.sprintId !== 'string'
        || !state.sprintId.trim()
        || typeof state.status !== 'string'
        || typeof state.phase !== 'string'
        || !SPRINT_PHASES.has(state.phase)) {
        throw new EvidenceReadError('INVALID_SHAPE');
      }
      stateRecord = state;
      if (ACTIVE_SPRINT_STATUSES.has(state.status)) {
        addReason(report, {
          code: 'E_CLEAN_SPRINT_ACTIVE',
          surface: 'sprint',
          subject: state.sprintId,
          observedStatus: `${state.status}:${state.phase}`,
          evidenceRefs: [evidencePath(projectRoot, statePath)],
        });
      } else if (!TERMINAL_SPRINT_STATUSES.has(state.status)
        || (state.status === 'COMPLETE' && state.phase !== 'COMPLETE')) {
        addReason(report, {
          code: 'E_CLEAN_SPRINT_STATE_INVALID',
          surface: 'sprint',
          subject: state.sprintId,
          observedStatus: `${state.status}:${state.phase}`,
          detailCode: 'UNSUPPORTED_TRANSITION',
          evidenceRefs: [evidencePath(projectRoot, statePath)],
        });
      }
    }
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_SPRINT_STATE_INVALID',
      surface: 'sprint',
      subject: 'state',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, statePath)],
    });
  }

  const launchAnchorPath = join(projectRoot, '.deckent', 'state', 'active-sprint.json');
  try {
    if (evidenceExists(launchAnchorPath)) {
      const anchor = readBoundedJson(launchAnchorPath);
      const childPid = isRecord(anchor)
        ? (anchor.childPid ?? anchor.pid)
        : undefined;
      const ipcDir = isRecord(anchor) && typeof anchor.ipcDir === 'string'
        ? (isAbsolute(anchor.ipcDir)
            ? resolve(anchor.ipcDir)
            : resolve(projectRoot, anchor.ipcDir))
        : null;
      if (!isRecord(anchor)
        || typeof anchor.jobId !== 'string'
        || !anchor.jobId.trim()
        || typeof anchor.source !== 'string'
        || !anchor.source.trim()
        || !Number.isSafeInteger(childPid)
        || childPid <= 0
        || ipcDir === null
        || !isWithin(ipcDir, projectRoot)
        || typeof anchor.startedAt !== 'string'
        || !Number.isFinite(Date.parse(anchor.startedAt))
        || (anchor.childPid !== undefined
          && anchor.pid !== undefined
          && anchor.childPid !== anchor.pid)) {
        throw new EvidenceReadError('INVALID_SHAPE');
      }
      const launchState = processProbe(childPid);
      addReason(report, {
        code: launchState === 'alive'
          ? 'E_CLEAN_SPRINT_COORDINATOR_ACTIVE'
          : launchState === 'dead'
            ? 'E_CLEAN_SPRINT_ANCHOR_STALE'
            : 'E_CLEAN_SPRINT_STATE_UNKNOWN',
        surface: 'sprint',
        subject: anchor.jobId,
        observedStatus: launchState.toUpperCase(),
        evidenceRefs: [evidencePath(projectRoot, launchAnchorPath)],
      });
    }
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_SPRINT_STATE_INVALID',
      surface: 'sprint',
      subject: 'mcp-launch-anchor',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, launchAnchorPath)],
    });
  }

  const pidDir = join(projectRoot, '.deckent', 'pids');
  const pidStates = new Map();
  let entries;
  try {
    entries = listBoundedDirectory(pidDir).filter(entry => entry.name.endsWith('.pid'));
    if (entries.length > EVIDENCE_LIMITS.pidFiles) throw new EvidenceReadError('ENTRY_LIMIT');
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_SPRINT_STATE_INVALID',
      surface: 'sprint',
      subject: 'coordinator-pids',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, pidDir)],
    });
    entries = [];
  }
  report.inspected.sprintPidFiles = entries.length;
  for (const entry of entries) {
    const path = join(pidDir, entry.name);
    const fileSprintId = entry.name.slice(0, -4);
    try {
      const record = readBoundedJson(path, 4_096);
      if (!isRecord(record)
        || !Number.isSafeInteger(record.pid)
        || record.pid <= 0
        || typeof record.sprintId !== 'string'
        || record.sprintId !== fileSprintId) {
        throw new EvidenceReadError('INVALID_SHAPE');
      }
      const state = processProbe(record.pid);
      pidStates.set(fileSprintId, state);
      if (state === 'alive') {
        addReason(report, {
          code: 'E_CLEAN_SPRINT_COORDINATOR_ACTIVE',
          surface: 'sprint',
          subject: fileSprintId,
          observedStatus: 'ALIVE',
          evidenceRefs: [evidencePath(projectRoot, path)],
        });
      } else if (state !== 'dead') {
        addReason(report, {
          code: 'E_CLEAN_SPRINT_STATE_UNKNOWN',
          surface: 'sprint',
          subject: fileSprintId,
          observedStatus: 'UNKNOWN',
          evidenceRefs: [evidencePath(projectRoot, path)],
        });
      }
    } catch (error) {
      addReason(report, {
        code: 'E_CLEAN_SPRINT_STATE_INVALID',
        surface: 'sprint',
        subject: fileSprintId || 'coordinator',
        detailCode: evidenceErrorKind(error),
        evidenceRefs: [evidencePath(projectRoot, path)],
      });
    }
  }

  if (activeMarker !== null) {
    const markerId = activeMarker.sprintId;
    const correlatedActiveState = stateRecord !== null
      && stateRecord.sprintId === markerId
      && ACTIVE_SPRINT_STATUSES.has(stateRecord.status);
    const coordinatorState = pidStates.get(markerId);
    addReason(report, {
      code: correlatedActiveState || coordinatorState === 'alive'
        ? 'E_CLEAN_SPRINT_ACTIVE'
        : coordinatorState === 'unknown'
          ? 'E_CLEAN_SPRINT_STATE_UNKNOWN'
          : 'E_CLEAN_SPRINT_MARKER_STALE',
      surface: 'sprint',
      subject: markerId,
      observedStatus: correlatedActiveState
        ? `${stateRecord.status}:${stateRecord.phase}`
        : coordinatorState === 'alive'
          ? 'COORDINATOR_ALIVE'
          : coordinatorState === 'unknown'
            ? 'COORDINATOR_UNKNOWN'
            : 'UNBOUND_OR_TERMINAL',
      evidenceRefs: [
        evidencePath(projectRoot, activePath),
        ...(stateRecord !== null && stateRecord.sprintId === markerId
          ? [evidencePath(projectRoot, statePath)]
          : []),
      ],
    });
  }
}

function verifyReceiptSchema(db) {
  const required = {
    invocation_project_bindings: ['root_digest', 'project_id'],
    invocations: [
      'invocation_id',
      'tenant_id',
      'project_id',
      'idempotency_key',
      'schema_version',
      'payload_json',
      'payload_hash',
      'created_at',
    ],
    invocation_events: [
      'event_id',
      'invocation_id',
      'tenant_id',
      'project_id',
      'sequence',
      'event_type',
      'occurred_at',
      'payload_json',
      'payload_hash',
      'prev_hash',
      'event_hash',
    ],
  };
  for (const [table, columns] of Object.entries(required)) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    const actual = new Set(rows.map(row => row.name));
    if (columns.some(column => !actual.has(column))) return false;
  }
  return true;
}

function boundedIdentity(value, maxLength = 512) {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= maxLength;
}

function boundedStringOrNull(value, maxLength = 512) {
  return value === null || boundedIdentity(value, maxLength);
}

function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function hasOneExactKeySet(value, keySets) {
  return keySets.some(keys => exactKeys(value, keys));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validInvocationTimestamp(value) {
  return boundedIdentity(value, INVOCATION_MAX_TIMESTAMP_LENGTH)
    && Number.isFinite(Date.parse(value));
}

function boundedEvidenceRefs(value, allowEmpty = true) {
  if (!Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.length > 32
    || value.some(ref => !boundedIdentity(ref, 512))) {
    return false;
  }
  return new Set(value).size === value.length;
}

function boundedCanonicalEvidenceRefs(value) {
  if (!boundedEvidenceRefs(value, false)) return false;
  const canonical = [...new Set(value)].sort();
  return canonical.length === value.length
    && canonical.every((ref, index) => ref === value[index]);
}

function validSelection(selection) {
  return isRecord(selection)
    && exactKeys(selection, ['provider', 'model', 'source', 'reasonCode'])
    && boundedStringOrNull(selection.provider, 128)
    && boundedStringOrNull(selection.model, 256)
    && ((selection.provider === null) === (selection.model === null))
    && INVOCATION_SELECTION_SOURCES.has(selection.source)
    && INVOCATION_REASON_CODES.has(selection.reasonCode);
}

function validFallbackChain(chain) {
  if (!Array.isArray(chain) || chain.length > 16) return false;
  return chain.every((transition, index) =>
    isRecord(transition)
    && exactKeys(transition, [
      'sequence',
      'fromProvider',
      'fromModel',
      'toProvider',
      'toModel',
      'reasonCode',
      'reachabilityRef',
      'limitEvidenceRefs',
    ])
    && transition.sequence === index + 1
    && boundedStringOrNull(transition.fromProvider, 128)
    && boundedStringOrNull(transition.fromModel, 256)
    && boundedIdentity(transition.toProvider, 128)
    && boundedIdentity(transition.toModel, 256)
    && INVOCATION_REASON_CODES.has(transition.reasonCode)
    && boundedStringOrNull(transition.reachabilityRef, 512)
    && boundedEvidenceRefs(transition.limitEvidenceRefs));
}

function validReceiptShape(receipt, row, projectId) {
  return isRecord(receipt)
    && exactKeys(receipt, [
      'schemaVersion',
      'invocationId',
      'idempotencyKey',
      'tenantId',
      'projectId',
      'runId',
      'taskId',
      'callId',
      'role',
      'purpose',
      'configured',
      'requested',
      'resolved',
      'called',
      'backend',
      'auth',
      'fallbackChain',
      'reachability',
      'limits',
      'createdAt',
    ])
    && receipt.schemaVersion === 1
    && receipt.invocationId === row.invocation_id
    && receipt.tenantId === row.tenant_id
    && receipt.projectId === row.project_id
    && receipt.projectId === projectId
    && receipt.idempotencyKey === row.idempotency_key
    && receipt.createdAt === row.created_at
    && boundedIdentity(receipt.invocationId)
    && boundedIdentity(receipt.idempotencyKey)
    && boundedIdentity(receipt.tenantId)
    && boundedIdentity(receipt.projectId)
    && boundedIdentity(receipt.runId)
    && boundedIdentity(receipt.callId)
    && (receipt.taskId === null || boundedIdentity(receipt.taskId))
    && INVOCATION_ROLES.has(receipt.role)
    && INVOCATION_PURPOSES.has(receipt.purpose)
    && (receipt.purpose !== 'worker-execution' || receipt.taskId !== null)
    && validSelection(receipt.configured)
    && validSelection(receipt.requested)
    && validSelection(receipt.resolved)
    && validSelection(receipt.called)
    && isRecord(receipt.backend)
    && hasOneExactKeySet(receipt.backend, [
      ['transport', 'executionBackend'],
      ['transport', 'executionBackend', 'endpointRefHash'],
    ])
    && INVOCATION_TRANSPORTS.has(receipt.backend.transport)
    && INVOCATION_BACKENDS.has(receipt.backend.executionBackend)
    && (!hasOwn(receipt.backend, 'endpointRefHash')
      || receipt.backend.endpointRefHash === null
      || (typeof receipt.backend.endpointRefHash === 'string'
        && SHA256_RE.test(receipt.backend.endpointRefHash)))
    && isRecord(receipt.auth)
    && exactKeys(receipt.auth, ['mode', 'accountRefHash'])
    && INVOCATION_AUTH_MODES.has(receipt.auth.mode)
    && (receipt.auth.accountRefHash === null
      || (typeof receipt.auth.accountRefHash === 'string'
        && SHA256_RE.test(receipt.auth.accountRefHash)))
    && validFallbackChain(receipt.fallbackChain)
    && isRecord(receipt.reachability)
    && exactKeys(receipt.reachability, ['state', 'evidenceRef'])
    && INVOCATION_EVIDENCE_STATES.has(receipt.reachability.state)
    && boundedStringOrNull(receipt.reachability.evidenceRef, 512)
    && isRecord(receipt.limits)
    && exactKeys(receipt.limits, ['state', 'evidenceRefs'])
    && INVOCATION_EVIDENCE_STATES.has(receipt.limits.state)
    && boundedEvidenceRefs(receipt.limits.evidenceRefs)
    && validInvocationTimestamp(receipt.createdAt);
}

function verifyReceiptRow(row, projectId) {
  if (row.schema_version !== 1
    || typeof row.payload_json !== 'string'
    || Buffer.byteLength(row.payload_json, 'utf-8') > EVIDENCE_LIMITS.jsonBytes
    || typeof row.payload_hash !== 'string'
    || !SHA256_RE.test(row.payload_hash)
    || sha256(row.payload_json) !== row.payload_hash) {
    throw new EvidenceReadError('RECEIPT_HASH_OR_SCHEMA');
  }
  let receipt;
  try {
    receipt = JSON.parse(row.payload_json);
  } catch {
    throw new EvidenceReadError('RECEIPT_JSON');
  }
  if (canonicalJson(receipt) !== row.payload_json
    || !validReceiptShape(receipt, row, projectId)) {
    throw new EvidenceReadError('RECEIPT_ENVELOPE');
  }
  return receipt;
}

function assertEventTransition(previous, next) {
  return previous === null
    ? next === 'dispatch_started' || next === 'dispatch_rejected'
    : previous === 'dispatch_started'
      ? next === 'transport_settled'
      : previous === 'dispatch_rejected' || previous === 'transport_settled'
        ? next === 'consumer_settled'
        : false;
}

function validInvocationEvent(receipt, event) {
  if (!isRecord(event)
    || !exactKeys(event, ['eventId', 'type', 'occurredAt', 'payload'])
    || !boundedIdentity(event.eventId, INVOCATION_MAX_EVENT_ID_LENGTH)
    || !INVOCATION_EVENT_TYPES.has(event.type)
    || !validInvocationTimestamp(event.occurredAt)
    || !isRecord(event.payload)) {
    return false;
  }
  const payload = event.payload;
  if (event.type === 'dispatch_started') {
    if (!hasOneExactKeySet(payload, [
      ['attempt'],
      ['attempt', 'executionEvidenceRef'],
      ['attempt', 'calledProvider', 'calledModel'],
      ['attempt', 'executionEvidenceRef', 'calledProvider', 'calledModel'],
    ])) {
      return false;
    }
    if (!Number.isSafeInteger(payload.attempt)
      || payload.attempt < 1
      || (hasOwn(payload, 'executionEvidenceRef')
        && !boundedIdentity(payload.executionEvidenceRef, 512))) {
      return false;
    }
    if (!hasOwn(payload, 'calledProvider')) return true;
    const expectedProvider = receipt.called.provider ?? receipt.resolved.provider;
    const expectedModel = receipt.called.model ?? receipt.resolved.model;
    return boundedIdentity(payload.calledProvider, 128)
      && boundedIdentity(payload.calledModel, 256)
      && expectedProvider !== null
      && expectedModel !== null
      && payload.calledProvider === expectedProvider
      && payload.calledModel === expectedModel;
  }

  if (event.type === 'dispatch_rejected') {
    if (!hasOneExactKeySet(payload, [
      ['reasonCode'],
      ['reasonCode', 'evidenceRefs'],
      ['reasonCode', 'attestation'],
      ['reasonCode', 'evidenceRefs', 'attestation'],
    ])
      || !INVOCATION_PRE_DISPATCH_REASON_CODES.has(payload.reasonCode)
      || (hasOwn(payload, 'evidenceRefs')
        && !boundedCanonicalEvidenceRefs(payload.evidenceRefs))) {
      return false;
    }
    if (!hasOwn(payload, 'attestation')) {
      return payload.reasonCode !== 'legacy_operator_attestation';
    }
    const attestation = payload.attestation;
    return isRecord(attestation)
      && exactKeys(attestation, [
        'attestationKind',
        'operatorRefHash',
        'attestedAt',
        'reasonCode',
        'statementDigest',
        'taskContentDigest',
        'taskCreatedAt',
        'observedAbsenceEvidenceRefs',
      ])
      && attestation.attestationKind === 'legacy-reconciliation'
      && typeof attestation.operatorRefHash === 'string'
      && SHA256_RE.test(attestation.operatorRefHash)
      && typeof attestation.statementDigest === 'string'
      && SHA256_RE.test(attestation.statementDigest)
      && typeof attestation.taskContentDigest === 'string'
      && SHA256_RE.test(attestation.taskContentDigest)
      && validInvocationTimestamp(attestation.attestedAt)
      && validInvocationTimestamp(attestation.taskCreatedAt)
      && INVOCATION_PRE_DISPATCH_REASON_CODES.has(attestation.reasonCode)
      && attestation.reasonCode === payload.reasonCode
      && boundedCanonicalEvidenceRefs(attestation.observedAbsenceEvidenceRefs)
      && boundedCanonicalEvidenceRefs(payload.evidenceRefs)
      && canonicalJson(attestation.observedAbsenceEvidenceRefs)
        === canonicalJson(payload.evidenceRefs)
      && Date.parse(attestation.taskCreatedAt) <= Date.parse(attestation.attestedAt)
      && Date.parse(attestation.attestedAt) === Date.parse(event.occurredAt)
      && receipt.purpose === 'worker-execution'
      && receipt.taskId !== null;
  }

  if (event.type === 'transport_settled') {
    if (!hasOneExactKeySet(payload, [
      ['outcome', 'exitCode', 'signal', 'reasonCode', 'durationMs'],
      ['outcome', 'exitCode', 'signal', 'reasonCode', 'durationMs', 'reconciliation'],
    ])) {
      return false;
    }
    if (hasOwn(payload, 'reconciliation')) {
      if (!isRecord(payload.reconciliation)
        || !exactKeys(payload.reconciliation, ['evidenceRef', 'dispatchEventHash'])
        || !boundedIdentity(payload.reconciliation.evidenceRef, 512)
        || typeof payload.reconciliation.dispatchEventHash !== 'string'
        || !SHA256_RE.test(payload.reconciliation.dispatchEventHash)
        || payload.reasonCode !== 'coordinator_restart_orphan') {
        return false;
      }
    }
    return INVOCATION_TRANSPORT_OUTCOMES.has(payload.outcome)
      && (payload.exitCode === null || Number.isSafeInteger(payload.exitCode))
      && (payload.signal === null
        || boundedIdentity(payload.signal, INVOCATION_MAX_SIGNAL_LENGTH))
      && INVOCATION_REASON_CODES.has(payload.reasonCode)
      && payload.reasonCode !== 'legacy_operator_attestation'
      && Number.isSafeInteger(payload.durationMs)
      && payload.durationMs >= 0
      && (payload.reasonCode !== 'coordinator_restart_orphan'
        || hasOwn(payload, 'reconciliation'));
  }

  if (!hasOneExactKeySet(payload, [
    ['outcome', 'reasonCode'],
    ['outcome', 'reasonCode', 'evidenceRefs'],
    ['outcome', 'reasonCode', 'taskDisposition'],
    ['outcome', 'reasonCode', 'taskDisposition', 'evidenceRefs'],
  ])
    || !INVOCATION_CONSUMER_OUTCOMES.has(payload.outcome)
    || !INVOCATION_REASON_CODES.has(payload.reasonCode)
    || (hasOwn(payload, 'evidenceRefs')
      && !boundedCanonicalEvidenceRefs(payload.evidenceRefs))
    || (hasOwn(payload, 'taskDisposition')
      && !INVOCATION_TASK_DISPOSITIONS.has(payload.taskDisposition))
    || (hasOwn(payload, 'taskDisposition')
      && (receipt.purpose !== 'worker-execution'
        || receipt.taskId === null
        || !hasOwn(payload, 'evidenceRefs')))
    || (payload.taskDisposition === 'not_dispatched' && payload.outcome !== 'accepted')
    || (payload.taskDisposition === 'done' && payload.outcome !== 'accepted')
    || (payload.taskDisposition === 'no_go' && payload.outcome !== 'rejected')
    || (payload.taskDisposition === 'manual_review_required' && payload.outcome !== 'unknown')
    || (payload.taskDisposition !== undefined
      && payload.taskDisposition !== 'done'
      && payload.reasonCode === 'none')) {
    return false;
  }
  return true;
}

function validEventAuthorityTransition(previous, event) {
  if (!assertEventTransition(previous?.type ?? null, event.type)) return false;
  if (event.type === 'consumer_settled') {
    if (event.payload.taskDisposition === 'not_dispatched'
      && previous?.type !== 'dispatch_rejected') {
      return false;
    }
    if (event.payload.taskDisposition === 'not_dispatched'
      && previous?.type === 'dispatch_rejected') {
      return event.occurredAt === previous.occurredAt
        && event.payload.reasonCode === previous.payload.reasonCode
        && boundedCanonicalEvidenceRefs(previous.payload.evidenceRefs)
        && boundedCanonicalEvidenceRefs(event.payload.evidenceRefs)
        && canonicalJson(event.payload.evidenceRefs)
          === canonicalJson(previous.payload.evidenceRefs);
    }
    if (event.payload.taskDisposition !== undefined
      && event.payload.taskDisposition !== 'not_dispatched'
      && previous?.type !== 'transport_settled') {
      return false;
    }
  }
  if (event.type === 'transport_settled'
    && event.payload.reconciliation !== undefined
    && (previous?.type !== 'dispatch_started'
      || event.payload.reconciliation.dispatchEventHash !== previous.hash)) {
    return false;
  }
  return true;
}

function verifyEventRows(rows, receipt) {
  if (rows.length > EVIDENCE_LIMITS.eventRows) {
    throw new EvidenceReadError('EVENT_LIMIT');
  }
  const events = [];
  let previousHash = null;
  for (const [index, row] of rows.entries()) {
    if (row.invocation_id !== receipt.invocationId
      || row.tenant_id !== receipt.tenantId
      || row.project_id !== receipt.projectId
      || !boundedIdentity(row.event_id, INVOCATION_MAX_EVENT_ID_LENGTH)
      || !Number.isSafeInteger(row.sequence)
      || row.sequence !== index + 1
      || !validInvocationTimestamp(row.occurred_at)
      || (row.prev_hash !== null
        && (typeof row.prev_hash !== 'string' || !SHA256_RE.test(row.prev_hash)))
      || row.prev_hash !== previousHash
      || typeof row.payload_json !== 'string'
      || Buffer.byteLength(row.payload_json, 'utf-8') > EVIDENCE_LIMITS.jsonBytes
      || typeof row.payload_hash !== 'string'
      || !SHA256_RE.test(row.payload_hash)
      || typeof row.event_hash !== 'string'
      || !SHA256_RE.test(row.event_hash)
      || !INVOCATION_EVENT_TYPES.has(row.event_type)) {
      throw new EvidenceReadError('EVENT_ENVELOPE');
    }
    let payload;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      throw new EvidenceReadError('EVENT_JSON');
    }
    const event = {
      eventId: row.event_id,
      type: row.event_type,
      occurredAt: row.occurred_at,
      payload,
    };
    if (canonicalJson(payload) !== row.payload_json
      || !validInvocationEvent(receipt, event)
      || !validEventAuthorityTransition(events.at(-1), event)
      || Date.parse(event.occurredAt) < Date.parse(receipt.createdAt)
      || (events.length > 0
        && Date.parse(event.occurredAt) < Date.parse(events.at(-1).occurredAt))) {
      throw new EvidenceReadError('EVENT_SEMANTICS');
    }
    const payloadHash = sha256(canonicalJson({ type: row.event_type, payload }));
    const eventHash = sha256(canonicalJson({
      invocationId: receipt.invocationId,
      sequence: row.sequence,
      eventId: row.event_id,
      eventType: row.event_type,
      occurredAt: row.occurred_at,
      payloadHash,
      previousHash,
    }));
    if (payloadHash !== row.payload_hash || eventHash !== row.event_hash) {
      throw new EvidenceReadError('EVENT_HASH');
    }
    events.push({
      eventId: row.event_id,
      type: row.event_type,
      payload,
      occurredAt: row.occurred_at,
      hash: row.event_hash,
    });
    previousHash = row.event_hash;
  }
  return events;
}

function legacyAttestationTaskBinding(events, task) {
  const attestation = events[0]?.type === 'dispatch_rejected'
    ? events[0].payload.attestation
    : undefined;
  if (attestation === undefined) return 'not-applicable';
  if (attestation.taskContentDigest !== task.contentDigest) return 'digest-mismatch';
  if (attestation.taskCreatedAt !== task.createdAt) return 'created-at-mismatch';
  return 'valid';
}

function exactNotDispatchedSettlement(events) {
  const dispatchRejected = events[0];
  const consumerSettled = events[1];
  return events.length === 2
    && dispatchRejected?.type === 'dispatch_rejected'
    && consumerSettled?.type === 'consumer_settled'
    && consumerSettled.occurredAt === dispatchRejected.occurredAt
    && consumerSettled.payload.outcome === 'accepted'
    && consumerSettled.payload.taskDisposition === 'not_dispatched';
}

function inspectTaskExecutionFences(
  report,
  projectRoot,
  taskStatuses,
  processProbe,
  nowMs,
) {
  const lockDirectories = [
    join(projectRoot, '.locks'),
    join(projectRoot, '.deckent', 'locks'),
  ];
  const lockEntries = [];
  for (const directory of lockDirectories) {
    try {
      const entries = listBoundedDirectory(directory)
        .filter(entry => entry.name.endsWith('.spawnlock'));
      lockEntries.push(...entries.map(entry => ({
        directory,
        entry,
      })));
    } catch (error) {
      addReason(report, {
        code: 'E_CLEAN_SPAWNLOCK_STATE_INVALID',
        surface: 'execution-fence',
        subject: evidencePath(projectRoot, directory),
        detailCode: evidenceErrorKind(error),
        evidenceRefs: [evidencePath(projectRoot, directory)],
      });
    }
  }
  report.inspected.spawnLockFiles = lockEntries.length;
  if (lockEntries.length > EVIDENCE_LIMITS.spawnLockFiles) {
    addReason(report, {
      code: 'E_CLEAN_SPAWNLOCK_EVIDENCE_LIMIT',
      surface: 'execution-fence',
      subject: 'spawnlock-directories',
      detailCode: 'ENTRY_LIMIT',
      evidenceRefs: lockDirectories.map(directory => evidencePath(projectRoot, directory)),
    });
    return;
  }

  for (const { directory, entry } of lockEntries) {
    const path = join(directory, entry.name);
    const ref = evidencePath(projectRoot, path);
    let lock;
    try {
      lock = readBoundedJson(path, 16_384);
      if (!isRecord(lock)
        || !exactKeys(lock, ['filePath', 'taskId', 'acquiredAt'])
        || !boundedIdentity(lock.filePath, 4_096)
        || !boundedIdentity(lock.taskId, 512)
        || !validInvocationTimestamp(lock.acquiredAt)
        || entry.name !== `${sha256(lock.filePath).slice(0, 32)}.spawnlock`) {
        throw new EvidenceReadError('INVALID_SPAWNLOCK');
      }
    } catch (error) {
      addReason(report, {
        code: 'E_CLEAN_SPAWNLOCK_STATE_INVALID',
        surface: 'execution-fence',
        subject: entry.name,
        detailCode: evidenceErrorKind(error),
        evidenceRefs: [ref],
      });
      continue;
    }

    const owner = TASK_EXECUTION_FENCE_OWNER_RE.exec(lock.taskId);
    if (!lock.filePath.startsWith(TASK_EXECUTION_FENCE_PREFIX)) {
      if (lock.filePath.startsWith('deckent-task-execution:')
        || owner !== null) {
        addReason(report, {
          code: 'E_CLEAN_TASK_EXECUTION_FENCE_INVALID',
          surface: 'execution-fence',
          subject: entry.name,
          detailCode: 'INVALID_LOGICAL_KEY',
          evidenceRefs: [ref],
        });
      } else if (!SAFE_TASK_ID_RE.test(lock.taskId)) {
        addReason(report, {
          code: 'E_CLEAN_SPAWNLOCK_STATE_INVALID',
          surface: 'execution-fence',
          subject: entry.name,
          detailCode: 'INVALID_OWNER_ID',
          evidenceRefs: [ref],
        });
      }
      continue;
    }
    const taskId = lock.filePath.slice(TASK_EXECUTION_FENCE_PREFIX.length);
    if (!SAFE_TASK_ID_RE.test(taskId) || owner === null) {
      addReason(report, {
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_INVALID',
        surface: 'execution-fence',
        subject: taskId || entry.name,
        detailCode: owner === null ? 'INVALID_OWNER' : 'INVALID_TASK_ID',
        evidenceRefs: [ref],
      });
      continue;
    }
    const pid = Number(owner[2]);
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      addReason(report, {
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_INVALID',
        surface: 'execution-fence',
        subject: taskId,
        detailCode: 'INVALID_OWNER_PID',
        evidenceRefs: [ref],
      });
      continue;
    }
    let processState;
    try {
      processState = processProbe(pid);
    } catch {
      processState = 'unknown';
    }
    if (!new Set(['alive', 'dead', 'unknown']).has(processState)) {
      processState = 'unknown';
    }
    const acquiredAtMs = Date.parse(lock.acquiredAt);
    const ageMs = nowMs - acquiredAtMs;
    if (!Number.isFinite(ageMs) || ageMs < 0) {
      addReason(report, {
        code: 'E_CLEAN_TASK_EXECUTION_FENCE_INVALID',
        surface: 'execution-fence',
        subject: taskId,
        observedStatus: `${owner[1].toUpperCase()}:${processState.toUpperCase()}`,
        detailCode: 'FUTURE_ACQUIRED_AT',
        evidenceRefs: [ref],
      });
      continue;
    }
    const orphan = !taskStatuses.has(taskId);
    const stale = processState === 'dead' || ageMs > TASK_EXECUTION_FENCE_STALE_MS;
    addReason(report, {
      code: orphan
        ? 'E_CLEAN_TASK_EXECUTION_FENCE_ORPHAN'
        : stale
          ? 'E_CLEAN_TASK_EXECUTION_FENCE_STALE'
          : processState === 'alive'
            ? 'E_CLEAN_TASK_EXECUTION_FENCE_ACTIVE'
            : 'E_CLEAN_TASK_EXECUTION_FENCE_STATE_UNKNOWN',
      surface: 'execution-fence',
      subject: taskId,
      observedStatus: `${owner[1].toUpperCase()}:${processState.toUpperCase()}`,
      ...(ageMs > TASK_EXECUTION_FENCE_STALE_MS
        ? { detailCode: 'AGE_EXCEEDED' }
        : {}),
      evidenceRefs: [ref],
    });
  }
}

function validExecutionLockIdentity(value) {
  return typeof value === 'string'
    && Buffer.byteLength(value, 'utf8') <= EXECUTION_LOCK_MAX_IDENTITY_BYTES
    && EXECUTION_LOCK_IDENTITY_RE.test(value);
}

function parseExecutionLockFencingToken(value) {
  if (!isRecord(value)
    || !exactKeys(value, ['epoch', 'counter', 'nonce'])
    || typeof value.epoch !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(value.epoch)
    || !Number.isSafeInteger(value.counter)
    || value.counter <= 0
    || typeof value.nonce !== 'string'
    || !EXECUTION_LOCK_FENCING_NONCE_RE.test(value.nonce)) {
    return null;
  }
  return {
    epoch: value.epoch,
    counter: value.counter,
    nonce: value.nonce,
  };
}

function executionLockFencingTokenEquals(left, right) {
  return left.epoch === right.epoch
    && left.counter === right.counter
    && left.nonce === right.nonce;
}

function parseExecutionLockAuthoritySentinel(value) {
  if (!isRecord(value)
    || !exactKeys(value, ['schemaVersion', 'authorityEpoch', 'createdAt'])
    || value.schemaVersion
      !== EXECUTION_LOCK_AUTHORITY_SENTINEL_SCHEMA_VERSION
    || typeof value.authorityEpoch !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(value.authorityEpoch)
    || !validInvocationTimestamp(value.createdAt)
    || new Date(Date.parse(value.createdAt)).toISOString()
      !== value.createdAt) {
    return null;
  }
  return value;
}

function parseCleanExecutionAuthorityAnchor(value) {
  const parseDirectory = candidate => {
    if (!isRecord(candidate)
      || !exactKeys(candidate, ['dev', 'ino', 'mountId'])
      || typeof candidate.dev !== 'string'
      || !/^[1-9]\d*$/u.test(candidate.dev)
      || typeof candidate.ino !== 'string'
      || !/^[1-9]\d*$/u.test(candidate.ino)
      || typeof candidate.mountId !== 'string'
      || !/^[1-9]\d*$/u.test(candidate.mountId)) {
      return null;
    }
    return {
      dev: candidate.dev,
      ino: candidate.ino,
      mountId: candidate.mountId,
    };
  };
  if (!isRecord(value)
    || !exactKeys(value, [
      'schemaVersion',
      'authorityEpoch',
      'project',
      'locks',
      'createdAt',
    ])
    || value.schemaVersion !== 1
    || typeof value.authorityEpoch !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(value.authorityEpoch)
    || !validInvocationTimestamp(value.createdAt)
    || new Date(Date.parse(value.createdAt)).toISOString() !== value.createdAt) {
    return null;
  }
  const project = parseDirectory(value.project);
  const locks = parseDirectory(value.locks);
  if (project === null
    || locks === null
    || project.dev !== locks.dev
    || project.mountId !== locks.mountId) {
    return null;
  }
  return {
    schemaVersion: 1,
    authorityEpoch: value.authorityEpoch,
    project,
    locks,
    createdAt: value.createdAt,
  };
}

function parseExecutionLockProjection(value, expectedTaskId) {
  const fencingToken = isRecord(value)
    ? parseExecutionLockFencingToken(value.fencingToken)
    : null;
  if (!isRecord(value)
    || !exactKeys(value, [
      'schemaVersion',
      'taskId',
      'actor',
      'ownerId',
      'pid',
      'hostInstanceId',
      'bootSessionId',
      'processSessionId',
      'fencingToken',
      'acquiredAt',
      'renewedAt',
      'leaseDurationMs',
    ])
    || value.schemaVersion !== EXECUTION_LOCK_SCHEMA_VERSION
    || typeof value.taskId !== 'string'
    || Buffer.byteLength(value.taskId, 'utf8') === 0
    || Buffer.byteLength(value.taskId, 'utf8') > EXECUTION_LOCK_MAX_TASK_ID_BYTES
    || (expectedTaskId !== undefined && value.taskId !== expectedTaskId)
    || !EXECUTION_LOCK_ACTORS.has(value.actor)
    || ((value.taskId === PROJECT_MAINTENANCE_LOCK_TASK_ID)
      !== (value.actor === 'maintenance'))
    || typeof value.ownerId !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(value.ownerId)
    || !Number.isSafeInteger(value.pid)
    || value.pid <= 0
    || !validExecutionLockIdentity(value.hostInstanceId)
    || !validExecutionLockIdentity(value.bootSessionId)
    || !validExecutionLockIdentity(value.processSessionId)
    || fencingToken === null
    || !validInvocationTimestamp(value.acquiredAt)
    || !validInvocationTimestamp(value.renewedAt)
    || new Date(Date.parse(value.acquiredAt)).toISOString() !== value.acquiredAt
    || new Date(Date.parse(value.renewedAt)).toISOString() !== value.renewedAt
    || Date.parse(value.renewedAt) < Date.parse(value.acquiredAt)
    || !Number.isSafeInteger(value.leaseDurationMs)
    || value.leaseDurationMs <= 0
    || value.leaseDurationMs > EXECUTION_LOCK_MAX_LEASE_MS
    || !Number.isSafeInteger(Date.parse(value.renewedAt) + value.leaseDurationMs)
    || !Number.isFinite(
      new Date(Date.parse(value.renewedAt) + value.leaseDurationMs).getTime(),
    )) {
    return null;
  }
  return {
    ...value,
    fencingToken,
  };
}

function parseLegacyV2ExecutionLockProjection(value, expectedTaskId) {
  if (!isRecord(value)
    || (value.schemaVersion !== 2
      && value.schemaVersion !== EXECUTION_LOCK_SCHEMA_VERSION)) {
    return null;
  }
  return parseExecutionLockProjection(
    {
      ...value,
      schemaVersion: EXECUTION_LOCK_SCHEMA_VERSION,
    },
    expectedTaskId,
  );
}

function canonicalExecutionLockTimestamp(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(Date.parse(value)).toISOString() === value;
}

function parseCleanExecutionEvidenceRefs(value) {
  if (!Array.isArray(value)
    || value.length > EXECUTION_LOCK_MAX_EVIDENCE_REFS) {
    return null;
  }
  let totalBytes = 0;
  const refs = [];
  for (const candidate of value) {
    if (typeof candidate !== 'string'
      || candidate.length === 0
      || candidate !== candidate.trim()
      || /[\u0000-\u001f\u007f]/u.test(candidate)
      || Buffer.byteLength(candidate, 'utf8')
        > EXECUTION_LOCK_MAX_EVIDENCE_REF_BYTES
      || (refs.length > 0 && refs[refs.length - 1] >= candidate)) {
      return null;
    }
    totalBytes += Buffer.byteLength(candidate, 'utf8');
    if (totalBytes > EXECUTION_LOCK_MAX_EVIDENCE_TOTAL_BYTES) return null;
    refs.push(candidate);
  }
  return refs;
}

function normalizeCleanExecutionEvidenceRefs(value, target) {
  const refs = parseCleanExecutionEvidenceRefs(value ?? []);
  if (refs === null) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', target);
  }
  return refs;
}

function parseCleanExecutionQuarantine(value, expectedTaskId) {
  if (!isRecord(value)
    || !exactKeys(value, [
      'schemaVersion',
      'quarantineId',
      'lock',
      'state',
      'reason',
      'evidenceRefs',
      'enteredAt',
      'quarantinedAt',
    ])
    || value.schemaVersion !== EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION
    || typeof value.quarantineId !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(value.quarantineId)
    || (value.state !== 'in-flight' && value.state !== 'quarantined')
    || !EXECUTION_LOCK_QUARANTINE_REASONS.has(value.reason)
    || !canonicalExecutionLockTimestamp(value.enteredAt)) {
    return null;
  }
  const lock = parseExecutionLockProjection(value.lock, expectedTaskId);
  const evidenceRefs = parseCleanExecutionEvidenceRefs(value.evidenceRefs);
  if (lock === null || evidenceRefs === null) return null;
  if (value.state === 'in-flight') {
    if (value.reason !== 'irreversible-boundary'
      || value.quarantinedAt !== null) {
      return null;
    }
  } else if (value.reason === 'irreversible-boundary'
    || !canonicalExecutionLockTimestamp(value.quarantinedAt)) {
    return null;
  }
  if (Date.parse(value.enteredAt) < Date.parse(lock.acquiredAt)
    || (value.quarantinedAt !== null
      && Date.parse(value.quarantinedAt) < Date.parse(value.enteredAt))) {
    return null;
  }
  return {
    schemaVersion: EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION,
    quarantineId: value.quarantineId,
    lock,
    state: value.state,
    reason: value.reason,
    evidenceRefs,
    enteredAt: value.enteredAt,
    quarantinedAt: value.quarantinedAt,
  };
}

function validBoundedCleanExecutionText(value, maxBytes) {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && Buffer.byteLength(value, 'utf8') <= maxBytes;
}

function parseCleanExecutionCompletion(value) {
  if (!isRecord(value)
    || !exactKeys(value, [
      'schemaVersion',
      'quarantineId',
      'fencingToken',
      'evidenceRefs',
      'completedAt',
    ])
    || value.schemaVersion
      !== EXECUTION_LOCK_BOUNDARY_COMPLETION_SCHEMA_VERSION
    || typeof value.quarantineId !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(value.quarantineId)
    || !canonicalExecutionLockTimestamp(value.completedAt)) {
    return null;
  }
  const fencingToken = parseExecutionLockFencingToken(value.fencingToken);
  const evidenceRefs = parseCleanExecutionEvidenceRefs(value.evidenceRefs);
  if (fencingToken === null
    || evidenceRefs === null
    || evidenceRefs.length === 0) {
    return null;
  }
  return {
    schemaVersion: EXECUTION_LOCK_BOUNDARY_COMPLETION_SCHEMA_VERSION,
    quarantineId: value.quarantineId,
    fencingToken,
    evidenceRefs,
    completedAt: value.completedAt,
  };
}

function parseCleanExecutionRecoveryAttestation(value) {
  if (!isRecord(value)
    || !exactKeys(value, [
      'schemaVersion',
      'quarantineId',
      'fencingToken',
      'operatorId',
      'justification',
      'evidenceRefs',
      'attestedAt',
    ])
    || value.schemaVersion
      !== EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION
    || typeof value.quarantineId !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(value.quarantineId)
    || !validBoundedCleanExecutionText(
      value.operatorId,
      EXECUTION_LOCK_MAX_RECOVERY_OPERATOR_BYTES,
    )
    || !EXECUTION_LOCK_IDENTITY_RE.test(value.operatorId)
    || !validBoundedCleanExecutionText(
      value.justification,
      EXECUTION_LOCK_MAX_RECOVERY_JUSTIFICATION_BYTES,
    )
    || !canonicalExecutionLockTimestamp(value.attestedAt)) {
    return null;
  }
  const fencingToken = parseExecutionLockFencingToken(value.fencingToken);
  const evidenceRefs = parseCleanExecutionEvidenceRefs(value.evidenceRefs);
  if (fencingToken === null
    || evidenceRefs === null
    || evidenceRefs.length === 0) {
    return null;
  }
  return {
    schemaVersion: EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION,
    quarantineId: value.quarantineId,
    fencingToken,
    operatorId: value.operatorId,
    justification: value.justification,
    evidenceRefs,
    attestedAt: value.attestedAt,
  };
}

function normalizeCleanExecutionRecoveryAttestation(
  value,
  quarantine,
  nowMs,
) {
  const attestation = parseCleanExecutionRecoveryAttestation(value);
  const attestedAtMs = attestation === null
    ? Number.NaN
    : Date.parse(attestation.attestedAt);
  const recoveryBoundaryMs = Date.parse(
    quarantine.quarantinedAt ?? quarantine.enteredAt,
  );
  if (attestation === null
    || attestation.quarantineId !== quarantine.quarantineId
    || !executionLockFencingTokenEquals(
      attestation.fencingToken,
      quarantine.lock.fencingToken,
    )
    || attestedAtMs < recoveryBoundaryMs
    || attestedAtMs
      < nowMs - EXECUTION_LOCK_MAX_RECOVERY_ATTESTATION_AGE_MS
    || attestedAtMs
      > nowMs + EXECUTION_LOCK_MAX_RECOVERY_FUTURE_SKEW_MS) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_RECOVERY_ATTESTATION_INVALID',
      quarantine.lock.taskId,
    );
  }
  return attestation;
}

function parseCleanExecutionQuarantineAudit(value) {
  if (!isRecord(value)
    || !exactKeys(value, [
      'schemaVersion',
      'eventId',
      'action',
      'quarantineId',
      'taskId',
      'ownerId',
      'fencingToken',
      'occurredAt',
      'payload',
    ])
    || value.schemaVersion !== EXECUTION_LOCK_QUARANTINE_AUDIT_SCHEMA_VERSION
    || typeof value.eventId !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(value.eventId)
    || !new Set([
      'boundary-entered',
      'quarantined',
      'completed',
      'recovered',
    ]).has(value.action)
    || typeof value.quarantineId !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(value.quarantineId)
    || typeof value.taskId !== 'string'
    || Buffer.byteLength(value.taskId, 'utf8') === 0
    || Buffer.byteLength(value.taskId, 'utf8')
      > EXECUTION_LOCK_MAX_TASK_ID_BYTES
    || typeof value.ownerId !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(value.ownerId)
    || !canonicalExecutionLockTimestamp(value.occurredAt)) {
    return null;
  }
  const fencingToken = parseExecutionLockFencingToken(value.fencingToken);
  if (fencingToken === null) return null;
  let payload;
  if (value.action === 'boundary-entered'
    || value.action === 'quarantined') {
    payload = parseCleanExecutionQuarantine(value.payload, value.taskId);
    if (payload === null
      || payload.quarantineId !== value.quarantineId
      || payload.lock.ownerId !== value.ownerId
      || !executionLockFencingTokenEquals(
        payload.lock.fencingToken,
        fencingToken,
      )
      || (value.action === 'boundary-entered'
        ? payload.state !== 'in-flight'
        : payload.state !== 'quarantined')) {
      return null;
    }
  } else if (value.action === 'completed') {
    payload = parseCleanExecutionCompletion(value.payload);
    if (payload === null
      || payload.quarantineId !== value.quarantineId
      || !executionLockFencingTokenEquals(
        payload.fencingToken,
        fencingToken,
      )) {
      return null;
    }
  } else {
    payload = parseCleanExecutionRecoveryAttestation(value.payload);
    if (payload === null
      || payload.quarantineId !== value.quarantineId
      || !executionLockFencingTokenEquals(
        payload.fencingToken,
        fencingToken,
      )) {
      return null;
    }
  }
  return {
    schemaVersion: EXECUTION_LOCK_QUARANTINE_AUDIT_SCHEMA_VERSION,
    eventId: value.eventId,
    action: value.action,
    quarantineId: value.quarantineId,
    taskId: value.taskId,
    ownerId: value.ownerId,
    fencingToken,
    occurredAt: value.occurredAt,
    payload,
  };
}

/**
 * Inspect the canonical leased execution-lock namespace. Legacy
 * `deckent-task-execution://…` spawn locks remain covered above for safe
 * rolling upgrades. Every authority sidecar is fail-closed; only exact,
 * canonical final projections are accepted.
 */
function inspectTaskExecutionLocks(
  report,
  projectRoot,
  taskStatuses,
  processProbe,
  nowMs,
  ownMaintenance,
  processProbeIsAuthoritative,
) {
  const directory = join(projectRoot, '.locks');
  let entries;
  try {
    entries = listBoundedDirectory(directory)
      .filter(entry => entry.name.includes('.executionlock'));
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
      surface: 'execution-fence',
      subject: evidencePath(projectRoot, directory),
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, directory)],
    });
    return;
  }

  report.inspected.executionLockFiles = entries.length;

  const projectionByTask = new Map();
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const ref = evidencePath(projectRoot, path);
    let lock;
    let raw;
    try {
      if (!entry.isFile()
        || entry.isSymbolicLink()
        || !EXECUTION_LOCK_FILE_RE.test(entry.name)) {
        throw new EvidenceReadError('UNSAFE_AUTHORITY_ARTIFACT');
      }
      try {
        raw = readCleanAuthorityFile(
          path,
          EXECUTION_LOCK_MAX_PROJECTION_BYTES,
        );
      } catch {
        throw new EvidenceReadError('UNSAFE_AUTHORITY_ARTIFACT');
      }
      if (raw === null) throw new EvidenceReadError('MISSING');
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new EvidenceReadError('INVALID_JSON');
      }
      lock = parseExecutionLockProjection(
        value,
      );
      if (lock === null
        || entry.name !== `${sha256(lock.taskId)}.executionlock`) {
        throw new EvidenceReadError('INVALID_EXECUTIONLOCK');
      }
    } catch (error) {
      addReason(report, {
        code: 'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
        surface: 'execution-fence',
        subject: entry.name,
        detailCode: evidenceErrorKind(error),
        evidenceRefs: [ref],
      });
      continue;
    }
    if (projectionByTask.has(lock.taskId)) {
      addReason(report, {
        code: 'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
        surface: 'execution-fence',
        subject: lock.taskId,
        detailCode: 'DUPLICATE_PROJECTION',
        evidenceRefs: [
          projectionByTask.get(lock.taskId).ref,
          ref,
        ],
      });
      continue;
    }
    projectionByTask.set(lock.taskId, {
      lock,
      raw,
      ref,
    });
  }

  const dbPath =
    join(directory, EXECUTION_LOCK_COORDINATION_DB_FILENAME);
  const sentinelPath =
    join(directory, EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME);
  const anchorPath =
    join(projectRoot, EXECUTION_LOCK_AUTHORITY_ANCHOR_FILENAME);
  let authorityLocks = [];
  let authorityQuarantines = [];
  let anchor;
  let db;
  try {
    const dbStats = lstatEvidence(dbPath);
    const sentinelStats = lstatEvidence(sentinelPath);
    const anchorStats = lstatEvidence(anchorPath);
    if (dbStats === null
      && sentinelStats === null
      && entries.length === 0
      && anchorStats === null) {
      return;
    }
    if (anchorStats !== null) {
      let anchorRaw;
      try {
        anchorRaw = readCleanAuthorityFile(
          anchorPath,
          EXECUTION_LOCK_MAX_ANCHOR_BYTES,
        );
      } catch {
        throw new EvidenceReadError('ANCHOR_UNSAFE');
      }
      let anchorValue;
      try {
        anchorValue = anchorRaw === null ? null : JSON.parse(anchorRaw);
      } catch {
        throw new EvidenceReadError('ANCHOR_INVALID');
      }
      anchor = parseCleanExecutionAuthorityAnchor(anchorValue);
      if (anchor === null || JSON.stringify(anchor) !== anchorRaw) {
        throw new EvidenceReadError('ANCHOR_INVALID');
      }
      let rootFd;
      let locksFd;
      try {
        rootFd = openSync(
          projectRoot,
          fsConstants.O_RDONLY
            | fsConstants.O_DIRECTORY
            | fsConstants.O_NOFOLLOW,
        );
        locksFd = openSync(
          directory,
          fsConstants.O_RDONLY
            | fsConstants.O_DIRECTORY
            | fsConstants.O_NOFOLLOW,
        );
        const projectIdentity = cleanExecutionDirectoryIdentity(rootFd);
        const locksIdentity = cleanExecutionDirectoryIdentity(locksFd);
        // Linux mount ids are local to a mount namespace. Persistent authority
        // binds the stable directory generation (dev+ino); pinned validation
        // retains exact mount-id checks inside this process.
        if (!cleanExecutionStableDirectoryIdentityEquals(
          projectIdentity,
          anchor.project,
        )
          || !cleanExecutionStableDirectoryIdentityEquals(
            locksIdentity,
            anchor.locks,
          )) {
          throw new EvidenceReadError('AUTHORITY_EPOCH_MISMATCH');
        }
      } finally {
        if (locksFd !== undefined) {
          try {
            closeSync(locksFd);
          } catch {
            // The inspection below remains fail-closed.
          }
        }
        if (rootFd !== undefined) {
          try {
            closeSync(rootFd);
          } catch {
            // The inspection below remains fail-closed.
          }
        }
      }
    }
    if (dbStats === null || sentinelStats === null) {
      throw new EvidenceReadError('AUTHORITY_STATE_MISSING');
    }
    if (!dbStats.isFile()
      || dbStats.isSymbolicLink()
      || dbStats.nlink !== 1
      || dbStats.size > EXECUTION_LOCK_MAX_DB_BYTES
      || !canonicalPathEquals(realpathSync.native(dbPath), dbPath)) {
      throw new EvidenceReadError('DB_UNSAFE');
    }
    let sentinelRaw;
    try {
      sentinelRaw = readCleanAuthorityFile(
        sentinelPath,
        EXECUTION_LOCK_MAX_SENTINEL_BYTES,
      );
    } catch {
      throw new EvidenceReadError('SENTINEL_UNSAFE');
    }
    let sentinelValue;
    try {
      sentinelValue = sentinelRaw === null ? null : JSON.parse(sentinelRaw);
    } catch {
      throw new EvidenceReadError('SENTINEL_INVALID');
    }
    const sentinel = parseExecutionLockAuthoritySentinel(sentinelValue);
    if (sentinel === null || JSON.stringify(sentinel) !== sentinelRaw) {
      throw new EvidenceReadError('SENTINEL_INVALID');
    }
    for (const suffix of ['-wal', '-shm']) {
      if (lstatEvidence(`${dbPath}${suffix}`) !== null) {
        throw new EvidenceReadError('UNSUPPORTED_DB_SIDECAR');
      }
    }
    const journalStats = lstatEvidence(`${dbPath}-journal`);
    if (journalStats !== null
      && (!journalStats.isFile()
        || journalStats.isSymbolicLink()
        || journalStats.nlink !== 1
        || journalStats.size > EXECUTION_LOCK_MAX_DB_BYTES)) {
      throw new EvidenceReadError('DB_JOURNAL_UNSAFE');
    }
    let Database;
    try {
      const module = loadModule('better-sqlite3');
      Database = module.default ?? module;
    } catch {
      throw new EvidenceReadError('MODULE_UNAVAILABLE');
    }
    try {
      db = new Database(dbPath, {
        readonly: true,
        fileMustExist: true,
        timeout: EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS,
      });
      db.pragma(`busy_timeout = ${EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS}`);
      db.pragma('query_only = ON');
      db.pragma('trusted_schema = OFF');
    } catch {
      throw new EvidenceReadError('OPEN_FAILED');
    }
    const userVersion = db.pragma('user_version', { simple: true });
    const metaRows = db.prepare(`
      SELECT singleton, meta_version, authority_epoch, fencing_counter
        FROM execution_lock_meta
    `).all();
    const activeRows = [];
    let activeCursor = '';
    while (true) {
      const page = db.prepare(`
        SELECT task_id, owner_id, fencing_epoch, fencing_counter,
               fencing_nonce, payload_json
          FROM execution_lock_active
         WHERE task_id > ?
         ORDER BY task_id
         LIMIT ?
      `).all(activeCursor, EXECUTION_LOCK_QUERY_PAGE_SIZE);
      activeRows.push(...page);
      if (page.length < EXECUTION_LOCK_QUERY_PAGE_SIZE) break;
      activeCursor = page.at(-1).task_id;
    }
    if (userVersion !== EXECUTION_LOCK_DB_META_VERSION
      || metaRows.length !== 1
      || metaRows[0]?.singleton !== 1
      || metaRows[0]?.meta_version !== EXECUTION_LOCK_DB_META_VERSION
      || typeof metaRows[0]?.authority_epoch !== 'string'
      || !EXECUTION_LOCK_OWNER_RE.test(metaRows[0].authority_epoch)
      || !Number.isSafeInteger(metaRows[0]?.fencing_counter)
      || metaRows[0].fencing_counter < 0) {
      throw new EvidenceReadError('SCHEMA_MISMATCH');
    }
    if (metaRows[0].authority_epoch !== sentinel.authorityEpoch) {
      throw new EvidenceReadError('AUTHORITY_EPOCH_MISMATCH');
    }
    if (anchor !== undefined
      && anchor.authorityEpoch !== sentinel.authorityEpoch) {
      throw new EvidenceReadError('AUTHORITY_EPOCH_MISMATCH');
    }
    try {
      validateCleanExecutionDatabaseSchema(db);
    } catch {
      throw new EvidenceReadError('SCHEMA_MISMATCH');
    }
    authorityLocks = activeRows.map(row => {
      let value;
      try {
        value = JSON.parse(row.payload_json);
      } catch {
        throw new EvidenceReadError('ACTIVE_ROW_INVALID');
      }
      const lock = parseExecutionLockProjection(value, row.task_id);
      if (lock === null
        || lock.ownerId !== row.owner_id
        || lock.fencingToken.epoch !== row.fencing_epoch
        || lock.fencingToken.counter !== row.fencing_counter
        || lock.fencingToken.nonce !== row.fencing_nonce
        || JSON.stringify(lock) !== row.payload_json
        || lock.fencingToken.epoch !== metaRows[0].authority_epoch
        || lock.fencingToken.counter > metaRows[0].fencing_counter) {
        throw new EvidenceReadError('ACTIVE_ROW_INVALID');
      }
      return lock;
    });
    try {
      authorityQuarantines =
        loadCleanExecutionQuarantineRows(db, authorityLocks);
    } catch {
      throw new EvidenceReadError('QUARANTINE_ROW_INVALID');
    }
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
      surface: 'execution-fence',
      subject: 'execution-lock-authority',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [
        evidencePath(projectRoot, dbPath),
        evidencePath(projectRoot, sentinelPath),
        evidencePath(projectRoot, anchorPath),
      ],
    });
    return;
  } finally {
    try {
      db?.close();
    } catch {
      addReason(report, {
        code: 'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
        surface: 'execution-fence',
        subject: 'execution-lock-authority',
        detailCode: 'CLOSE_FAILED',
        evidenceRefs: [evidencePath(projectRoot, dbPath)],
      });
    }
  }

  const authorityByTask =
    new Map(authorityLocks.map(lock => [lock.taskId, lock]));
  const quarantineByTask = new Map(
    authorityQuarantines.map(quarantine => [
      quarantine.lock.taskId,
      quarantine,
    ]),
  );
  for (const [taskId, projection] of projectionByTask) {
    if (!authorityByTask.has(taskId)) {
      addReason(report, {
        code: 'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
        surface: 'execution-fence',
        subject: taskId,
        detailCode: 'PROJECTION_ORPHAN',
        evidenceRefs: [projection.ref, evidencePath(projectRoot, dbPath)],
      });
    }
  }

  for (const lock of authorityLocks) {
    const projection = projectionByTask.get(lock.taskId);
    const quarantine = quarantineByTask.get(lock.taskId);
    const dbRef = evidencePath(projectRoot, dbPath);
    if (projection === undefined) {
      addReason(report, {
        code: 'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
        surface: 'execution-fence',
        subject: lock.taskId,
        detailCode: 'PROJECTION_MISSING',
        evidenceRefs: [dbRef],
      });
      continue;
    }
    if (projection.raw !== JSON.stringify(lock)) {
      addReason(report, {
        code: 'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
        surface: 'execution-fence',
        subject: lock.taskId,
        detailCode: 'PROJECTION_CONFLICT',
        evidenceRefs: [projection.ref, dbRef],
      });
      continue;
    }
    const ownExactMaintenance =
      lock.taskId === PROJECT_MAINTENANCE_LOCK_TASK_ID
      && ownMaintenance?.ownerId === lock.ownerId
      && ownMaintenance?.fencingToken
      && executionLockFencingTokenEquals(
        ownMaintenance.fencingToken,
        lock.fencingToken,
      );
    if (quarantine !== undefined) {
      if (ownExactMaintenance && quarantine.state === 'in-flight') {
        continue;
      }
      addReason(report, {
        code: 'E_CLEAN_EXECUTIONLOCK_QUARANTINED',
        surface: 'execution-fence',
        subject: lock.taskId,
        observedStatus: quarantine.state.toUpperCase(),
        detailCode: quarantine.reason.toUpperCase().replaceAll('-', '_'),
        evidenceRefs: [projection.ref, dbRef],
      });
      continue;
    }
    if (ownExactMaintenance) {
      continue;
    }
    const acquiredAtMs = Date.parse(lock.acquiredAt);
    const renewedAtMs = Date.parse(lock.renewedAt);
    if (acquiredAtMs > nowMs || renewedAtMs > nowMs) {
      addReason(report, {
        code: 'E_CLEAN_EXECUTIONLOCK_STATE_INVALID',
        surface: 'execution-fence',
        subject: lock.taskId,
        observedStatus: `${lock.actor.toUpperCase()}:UNKNOWN`,
        detailCode: 'FUTURE_TIMESTAMP',
        evidenceRefs: [projection.ref, dbRef],
      });
      continue;
    }
    const localIdentity = CLEAN_EXECUTION_LOCK_RUNTIME_IDENTITY;
    let processState = 'unknown';
    if (processProbeIsAuthoritative
      || (lock.hostInstanceId === localIdentity.hostInstanceId
      && lock.bootSessionId === localIdentity.bootSessionId
      && (!localIdentity.hostInstanceId.startsWith('process-local:')
        || lock.processSessionId === localIdentity.processSessionId))) {
      try {
        processState = processProbe(lock.pid);
      } catch {
        processState = 'unknown';
      }
    }
    if (!new Set(['alive', 'dead', 'unknown']).has(processState)) {
      processState = 'unknown';
    }
    const leaseExpired = nowMs >= renewedAtMs + lock.leaseDurationMs;
    const orphan = !taskStatuses.has(lock.taskId);
    addReason(report, {
      code: lock.taskId === PROJECT_MAINTENANCE_LOCK_TASK_ID
        ? 'E_CLEAN_PROJECT_MAINTENANCE_ACTIVE'
        : orphan
          ? 'E_CLEAN_TASK_EXECUTION_FENCE_ORPHAN'
          : processState === 'dead'
            ? 'E_CLEAN_TASK_EXECUTION_FENCE_STALE'
            : processState === 'alive'
              ? 'E_CLEAN_TASK_EXECUTION_FENCE_ACTIVE'
              : 'E_CLEAN_TASK_EXECUTION_FENCE_STATE_UNKNOWN',
      surface: 'execution-fence',
      subject: lock.taskId,
      observedStatus: `${lock.actor.toUpperCase()}:${processState.toUpperCase()}`,
      ...(processState === 'dead'
        ? { detailCode: leaseExpired ? 'LEASE_EXPIRED_OWNER_DEAD' : 'OWNER_DEAD' }
        : leaseExpired
          ? { detailCode: 'LEASE_EXPIRED' }
          : {}),
      evidenceRefs: [projection.ref, dbRef],
    });
  }
}

function reconcilePendingTasks(report, projectRoot, rootDigest, pendingTasks) {
  if (pendingTasks.length === 0) return;
  const dbPath = join(projectRoot, '.deckent', 'runtime', 'invocations.db');
  const receiptRef = evidencePath(projectRoot, dbPath);
  const holdAll = (code, detailCode) => {
    for (const task of pendingTasks) {
      addReason(report, {
        code,
        surface: 'task',
        subject: task.id,
        observedStatus: 'PENDING',
        ...(detailCode ? { detailCode } : {}),
        evidenceRefs: [task.ref, receiptRef],
      });
    }
  };
  try {
    if (!evidenceExists(dbPath)) {
      holdAll('E_CLEAN_TASK_RECEIPT_MISSING', 'DB_MISSING');
      return;
    }
  } catch (error) {
    holdAll('E_CLEAN_RECEIPT_DB_INVALID', evidenceErrorKind(error));
    return;
  }
  try {
    const stats = lstatSync(dbPath);
    if (stats.isSymbolicLink()) {
      holdAll('E_CLEAN_RECEIPT_DB_INVALID', 'SYMLINK');
      return;
    }
    if (!stats.isFile()) {
      holdAll('E_CLEAN_RECEIPT_DB_INVALID', 'NOT_FILE');
      return;
    }
  } catch {
    holdAll('E_CLEAN_RECEIPT_DB_INVALID', 'READ_FAILED');
    return;
  }

  let Database;
  try {
    const module = loadModule('better-sqlite3');
    Database = module.default ?? module;
  } catch {
    holdAll('E_CLEAN_RECEIPT_READER_UNAVAILABLE', 'MODULE_UNAVAILABLE');
    return;
  }

  let db;
  try {
    db = new Database(dbPath, {
      readonly: true,
      fileMustExist: true,
      timeout: 250,
    });
  } catch {
    holdAll('E_CLEAN_RECEIPT_DB_INVALID', 'OPEN_FAILED');
    return;
  }

  try {
    if (!verifyReceiptSchema(db)) {
      holdAll('E_CLEAN_RECEIPT_SCHEMA_UNSUPPORTED', 'SCHEMA_MISMATCH');
      return;
    }
    const bindings = db.prepare(`
      SELECT root_digest, project_id
      FROM invocation_project_bindings
      WHERE root_digest = ?
      LIMIT 2
    `).all(rootDigest);
    if (bindings.length !== 1
      || typeof bindings[0].project_id !== 'string'
      || !bindings[0].project_id.trim()) {
      holdAll(
        bindings.length === 0
          ? 'E_CLEAN_RECEIPT_PROJECT_BINDING_MISSING'
          : 'E_CLEAN_RECEIPT_PROJECT_BINDING_AMBIGUOUS',
        bindings.length === 0 ? 'NO_ROOT_BINDING' : 'MULTIPLE_ROOT_BINDINGS',
      );
      return;
    }
    const projectId = bindings[0].project_id;
    const reverseBindings = db.prepare(`
      SELECT root_digest, project_id
      FROM invocation_project_bindings
      WHERE project_id = ?
      LIMIT 2
    `).all(projectId);
    if (reverseBindings.length !== 1 || reverseBindings[0].root_digest !== rootDigest) {
      holdAll('E_CLEAN_RECEIPT_PROJECT_BINDING_AMBIGUOUS', 'REVERSE_BINDING_MISMATCH');
      return;
    }

    const rows = db.prepare(`
      SELECT invocation_id, tenant_id, project_id, idempotency_key, schema_version,
             payload_json, payload_hash, created_at
      FROM invocations
      WHERE project_id = ?
      ORDER BY julianday(created_at) DESC, invocation_id DESC
      LIMIT ?
    `).all(projectId, EVIDENCE_LIMITS.receiptRows + 1);
    if (rows.length > EVIDENCE_LIMITS.receiptRows) {
      holdAll('E_CLEAN_RECEIPT_EVIDENCE_LIMIT', 'RECEIPT_ROW_LIMIT');
      return;
    }
    report.inspected.receiptRows = rows.length;

    const receipts = [];
    try {
      for (const row of rows) receipts.push(verifyReceiptRow(row, projectId));
    } catch (error) {
      holdAll('E_CLEAN_RECEIPT_INTEGRITY', evidenceErrorKind(error));
      return;
    }

    for (const task of pendingTasks) {
      // Mirrors TaskSettlementAuthority.resolveViews(): only worker-execution
      // receipts participate. Build admission is intentionally stricter than
      // projection: any second matching authority makes the destructive build
      // decision ambiguous, even when one receipt is already terminal.
      const matches = receipts
        .filter(receipt =>
          receipt.taskId === task.id && receipt.purpose === 'worker-execution');
      if (matches.length === 0) {
        addReason(report, {
          code: 'E_CLEAN_TASK_RECEIPT_MISSING',
          surface: 'task',
          subject: task.id,
          observedStatus: 'PENDING',
          detailCode: 'NO_TASK_RECEIPT',
          evidenceRefs: [task.ref, receiptRef],
        });
        continue;
      }
      if (matches.length > 1) {
        addReason(report, {
          code: 'E_CLEAN_TASK_RECEIPT_AMBIGUOUS',
          surface: 'task',
          subject: task.id,
          observedStatus: 'PENDING',
          detailCode: 'MULTIPLE_TASK_RECEIPTS',
          evidenceRefs: [
            task.ref,
            receiptRef,
            ...matches.slice(0, 32)
              .map(receipt => `invocation:${receipt.invocationId}`),
          ],
        });
        continue;
      }
      const views = [];
      let viewFailure = false;
      for (const receipt of matches) {
        let eventRows;
        try {
          eventRows = db.prepare(`
            SELECT event_id, invocation_id, tenant_id, project_id, sequence, event_type,
                   occurred_at, payload_json, payload_hash, prev_hash, event_hash
            FROM invocation_events
            WHERE tenant_id = ? AND project_id = ? AND invocation_id = ?
            ORDER BY sequence ASC
            LIMIT ?
          `).all(
            receipt.tenantId,
            receipt.projectId,
            receipt.invocationId,
            EVIDENCE_LIMITS.eventRows + 1,
          );
        } catch {
          addReason(report, {
            code: 'E_CLEAN_RECEIPT_SCHEMA_UNSUPPORTED',
            surface: 'task',
            subject: task.id,
            observedStatus: 'PENDING',
            detailCode: 'EVENT_QUERY_FAILED',
            evidenceRefs: [task.ref, receiptRef, `invocation:${receipt.invocationId}`],
          });
          viewFailure = true;
          break;
        }

        try {
          views.push({ receipt, events: verifyEventRows(eventRows, receipt) });
        } catch (error) {
          addReason(report, {
            code: 'E_CLEAN_RECEIPT_INTEGRITY',
            surface: 'task',
            subject: task.id,
            observedStatus: 'PENDING',
            detailCode: evidenceErrorKind(error),
            evidenceRefs: [task.ref, receiptRef, `invocation:${receipt.invocationId}`],
          });
          viewFailure = true;
          break;
        }
      }
      if (viewFailure) continue;

      const soleView = views[0];
      const attestationBinding = soleView
        ? legacyAttestationTaskBinding(soleView.events, task)
        : 'not-applicable';
      if (attestationBinding === 'digest-mismatch'
        || attestationBinding === 'created-at-mismatch') {
        addReason(report, {
          code: 'E_CLEAN_TASK_RECEIPT_DISK_CONFLICT',
          surface: 'task',
          subject: task.id,
          observedStatus: 'PENDING',
          detailCode: attestationBinding === 'digest-mismatch'
            ? 'LEGACY_ATTESTATION_TASK_DIGEST_MISMATCH'
            : 'LEGACY_ATTESTATION_TASK_CREATED_AT_MISMATCH',
          evidenceRefs: [
            task.ref,
            receiptRef,
            `invocation:${soleView.receipt.invocationId}`,
          ],
        });
        continue;
      }
      if (!soleView || !exactNotDispatchedSettlement(soleView.events)) {
        const detailCode = soleView?.events.some(event => event.type === 'dispatch_started')
          ? 'DISPATCH_STARTED'
          : soleView?.events.some(event => event.type === 'transport_settled')
            ? 'TERMINAL_CONFLICT'
            : 'NOT_DISPATCHED_CHAIN_ABSENT';
        addReason(report, {
          code: 'E_CLEAN_TASK_RECEIPT_NONTERMINAL',
          surface: 'task',
          subject: task.id,
          observedStatus: 'PENDING',
          detailCode,
          evidenceRefs: [
            task.ref,
            receiptRef,
            ...(soleView ? [`invocation:${soleView.receipt.invocationId}`] : []),
          ],
        });
        continue;
      }
      const consumerSettled = soleView.events[1];
      report.projections.push({
        surface: 'task',
        id: task.id,
        rawStatus: 'PENDING',
        effectiveStatus: 'NOT_DISPATCHED',
        authority: 'invocation-receipt',
        evidenceRefs: [
          task.ref,
          receiptRef,
          `invocation:${soleView.receipt.invocationId}`,
          `event-head:sha256:${consumerSettled.hash}`,
        ],
      });
    }
  } catch {
    holdAll('E_CLEAN_RECEIPT_SCHEMA_UNSUPPORTED', 'QUERY_FAILED');
  } finally {
    try {
      db.close();
    } catch {
      holdAll('E_CLEAN_RECEIPT_DB_INVALID', 'CLOSE_FAILED');
    }
  }
}

function inspectTasksAndWorkers(
  report,
  projectRoot,
  rootDigest,
  processProbe,
  nowMs,
  ownMaintenance,
  processProbeIsAuthoritative,
) {
  const tasksDir = join(projectRoot, '.tasks');
  let entries;
  try {
    entries = listBoundedDirectory(tasksDir);
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_TASK_STATE_INVALID',
      surface: 'task',
      subject: 'task-directory',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, tasksDir)],
    });
    return;
  }

  // Only canonical task projections participate in execution admission.
  // Attempt-private sidecars such as `task-<id>.landing-proposal.json` are
  // evidence artefacts, not task state, even though they share the prefix.
  const taskEntries = entries.filter(entry =>
    /^task-[\w-]+\.json$/u.test(entry.name));
  const heartbeatEntries = entries.filter(entry =>
    entry.name.startsWith('task-') && entry.name.endsWith('.hb'));
  const pidEntries = entries.filter(entry => /^_.*\.pid$/.test(entry.name));
  report.inspected.taskFiles = taskEntries.length;
  report.inspected.heartbeatFiles = heartbeatEntries.length;
  report.inspected.workerPidFiles += pidEntries.length;
  if (taskEntries.length > EVIDENCE_LIMITS.taskFiles
    || heartbeatEntries.length > EVIDENCE_LIMITS.heartbeatFiles
    || pidEntries.length > EVIDENCE_LIMITS.pidFiles) {
    addReason(report, {
      code: 'E_CLEAN_TASK_EVIDENCE_LIMIT',
      surface: 'task',
      subject: 'task-directory',
      detailCode: 'RELEVANT_ENTRY_LIMIT',
      evidenceRefs: [evidencePath(projectRoot, tasksDir)],
    });
    return;
  }

  const pendingTasks = [];
  const taskStatuses = new Map();
  for (const entry of taskEntries) {
    const path = join(tasksDir, entry.name);
    const fileTaskId = entry.name.slice('task-'.length, -'.json'.length);
    try {
      const taskBytes = readBoundedBytes(path, EVIDENCE_LIMITS.jsonBytes);
      let task;
      try {
        task = JSON.parse(taskBytes.toString('utf8'));
      } catch {
        throw new EvidenceReadError('INVALID_JSON');
      }
      if (!isRecord(task)
        || !boundedIdentity(task.id)
        || task.id !== fileTaskId
        || typeof task.status !== 'string'
        || !KNOWN_TASK_STATUSES.has(task.status)
        || !validInvocationTimestamp(task.createdAt)) {
        throw new EvidenceReadError('INVALID_SHAPE');
      }
      taskStatuses.set(task.id, task.status);
      if (task.status === 'PENDING') {
        pendingTasks.push({
          id: task.id,
          ref: evidencePath(projectRoot, path),
          contentDigest: sha256(taskBytes),
          createdAt: task.createdAt,
        });
      } else if (ACTIVE_TASK_STATUSES.has(task.status)) {
        addReason(report, {
          code: 'E_CLEAN_TASK_ACTIVE',
          surface: 'task',
          subject: task.id,
          observedStatus: task.status,
          evidenceRefs: [evidencePath(projectRoot, path)],
        });
      }
    } catch (error) {
      addReason(report, {
        code: 'E_CLEAN_TASK_STATE_INVALID',
        surface: 'task',
        subject: fileTaskId || 'task',
        detailCode: evidenceErrorKind(error),
        evidenceRefs: [evidencePath(projectRoot, path)],
      });
    }
  }

  inspectTaskExecutionFences(
    report,
    projectRoot,
    taskStatuses,
    processProbe,
    nowMs,
  );
  inspectTaskExecutionLocks(
    report,
    projectRoot,
    taskStatuses,
    processProbe,
    nowMs,
    ownMaintenance,
    processProbeIsAuthoritative,
  );

  const heartbeatTaskIds = new Set();
  for (const entry of heartbeatEntries) {
    const path = join(tasksDir, entry.name);
    const fileTaskId = entry.name.slice('task-'.length, -'.hb'.length);
    heartbeatTaskIds.add(fileTaskId);
    try {
      const heartbeat = readBoundedJson(path);
      if (!isRecord(heartbeat)
        || heartbeat.taskId !== fileTaskId
        || typeof heartbeat.status !== 'string') {
        throw new EvidenceReadError('INVALID_SHAPE');
      }
      if (heartbeat.pid !== undefined) {
        if (!Number.isSafeInteger(heartbeat.pid) || heartbeat.pid <= 0) {
          throw new EvidenceReadError('INVALID_PID');
        }
        const processState = processProbe(heartbeat.pid);
        if (processState === 'alive') {
          addReason(report, {
            code: 'E_CLEAN_WORKER_ACTIVE',
            surface: 'worker',
            subject: fileTaskId,
            observedStatus: `${heartbeat.status}:ALIVE`,
            evidenceRefs: [evidencePath(projectRoot, path)],
          });
        } else if (processState !== 'dead') {
          addReason(report, {
            code: 'E_CLEAN_WORKER_STATE_UNKNOWN',
            surface: 'worker',
            subject: fileTaskId,
            observedStatus: `${heartbeat.status}:UNKNOWN`,
            evidenceRefs: [evidencePath(projectRoot, path)],
          });
        }
      }
      if (ACTIVE_HEARTBEAT_STATUSES.has(heartbeat.status)) {
        addReason(report, {
          code: 'E_CLEAN_WORKER_ACTIVE',
          surface: 'worker',
          subject: fileTaskId,
          observedStatus: heartbeat.status,
          evidenceRefs: [evidencePath(projectRoot, path)],
        });
      } else if (!TERMINAL_HEARTBEAT_STATUSES.has(heartbeat.status)) {
        addReason(report, {
          code: 'E_CLEAN_WORKER_STATE_INVALID',
          surface: 'worker',
          subject: fileTaskId,
          observedStatus: heartbeat.status,
          detailCode: 'UNSUPPORTED_STATUS',
          evidenceRefs: [evidencePath(projectRoot, path)],
        });
      } else if (taskStatuses.has(fileTaskId)
        && !new Set(['DONE', 'NO_GO']).has(taskStatuses.get(fileTaskId))) {
        addReason(report, {
          code: 'E_CLEAN_WORKER_TASK_CONFLICT',
          surface: 'worker',
          subject: fileTaskId,
          observedStatus: `${heartbeat.status}:${taskStatuses.get(fileTaskId)}`,
          evidenceRefs: [
            evidencePath(projectRoot, path),
            evidencePath(projectRoot, join(tasksDir, `task-${fileTaskId}.json`)),
          ],
        });
      }
    } catch (error) {
      addReason(report, {
        code: 'E_CLEAN_WORKER_STATE_INVALID',
        surface: 'worker',
        subject: fileTaskId || 'heartbeat',
        detailCode: evidenceErrorKind(error),
        evidenceRefs: [evidencePath(projectRoot, path)],
      });
    }
  }

  for (const entry of pidEntries) {
    inspectPlainPidFile(
      report,
      projectRoot,
      join(tasksDir, entry.name),
      'worker',
      entry.name.slice(0, -4),
      processProbe,
    );
  }

  const workerPidDir = join(projectRoot, '.deckent', 'workers');
  let workerPidEntries;
  try {
    workerPidEntries = listBoundedDirectory(workerPidDir)
      .filter(entry => entry.name.endsWith('.pid'));
    if (workerPidEntries.length > EVIDENCE_LIMITS.pidFiles) {
      throw new EvidenceReadError('ENTRY_LIMIT');
    }
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_WORKER_STATE_INVALID',
      surface: 'worker',
      subject: 'worker-pid-directory',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, workerPidDir)],
    });
    workerPidEntries = [];
  }
  report.inspected.workerPidFiles += workerPidEntries.length;
  for (const entry of workerPidEntries) {
    inspectPlainPidFile(
      report,
      projectRoot,
      join(workerPidDir, entry.name),
      'worker',
      entry.name.slice(0, -4),
      processProbe,
    );
  }

  reconcilePendingTasks(report, projectRoot, rootDigest, pendingTasks);
  const notDispatchedIds = new Set(
    report.projections
      .filter(projection => projection.effectiveStatus === 'NOT_DISPATCHED')
      .map(projection => projection.id),
  );
  for (const taskId of notDispatchedIds) {
    if (heartbeatTaskIds.has(taskId)) {
      addReason(report, {
        code: 'E_CLEAN_TASK_RECEIPT_DISK_CONFLICT',
        surface: 'task',
        subject: taskId,
        observedStatus: 'PENDING:NOT_DISPATCHED',
        detailCode: 'HEARTBEAT_EXISTS',
        evidenceRefs: [
          evidencePath(projectRoot, join(tasksDir, `task-${taskId}.json`)),
          evidencePath(projectRoot, join(tasksDir, `task-${taskId}.hb`)),
        ],
      });
    }
  }
}

function inspectProcessState(report, projectRoot) {
  const configPath = join(projectRoot, '.deckent', 'config.json');
  let backlogSetting = '.deckent/autonomous/backlog.json';
  try {
    if (evidenceExists(configPath)) {
      const config = readBoundedJson(configPath, EVIDENCE_LIMITS.configBytes);
      if (!isRecord(config)) throw new EvidenceReadError('INVALID_SHAPE');
      if (config.autonomous !== undefined) {
        if (!isRecord(config.autonomous)) throw new EvidenceReadError('INVALID_AUTONOMOUS');
        if (config.autonomous.backlog_path !== undefined) {
          if (typeof config.autonomous.backlog_path !== 'string'
            || !config.autonomous.backlog_path.trim()
            || isAbsolute(config.autonomous.backlog_path)) {
            throw new EvidenceReadError('INVALID_BACKLOG_PATH');
          }
          backlogSetting = config.autonomous.backlog_path;
        }
      }
    }
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_PROCESS_CONFIG_INVALID',
      surface: 'process',
      subject: 'autonomous-backlog',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, configPath)],
    });
    return;
  }

  const backlogPath = resolve(projectRoot, backlogSetting);
  if (!isWithin(backlogPath, projectRoot)) {
    addReason(report, {
      code: 'E_CLEAN_PROCESS_CONFIG_INVALID',
      surface: 'process',
      subject: 'autonomous-backlog',
      detailCode: 'BACKLOG_PATH_BOUNDARY',
      evidenceRefs: [evidencePath(projectRoot, configPath)],
    });
    return;
  }
  try {
    if (!evidenceExists(backlogPath)) return;
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_PROCESS_STATE_INVALID',
      surface: 'process',
      subject: 'autonomous-backlog',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, backlogPath)],
    });
    return;
  }

  try {
    const backlog = readBoundedJson(backlogPath, EVIDENCE_LIMITS.configBytes);
    if (!isRecord(backlog)
      || backlog._version !== '1.0'
      || !Array.isArray(backlog.entries)
      || backlog.entries.length > EVIDENCE_LIMITS.processEntries) {
      throw new EvidenceReadError(
        Array.isArray(backlog?.entries)
          && backlog.entries.length > EVIDENCE_LIMITS.processEntries
          ? 'ENTRY_LIMIT'
          : 'INVALID_SHAPE',
      );
    }
    report.inspected.processEntries = backlog.entries.length;
    const ids = new Set();
    for (const entry of backlog.entries) {
      if (!isRecord(entry)
        || typeof entry.id !== 'string'
        || !entry.id.trim()
        || ids.has(entry.id)
        || !BACKLOG_KINDS.has(entry.kind)
        || !BACKLOG_STATUSES.has(entry.status)) {
        throw new EvidenceReadError('INVALID_ENTRY');
      }
      ids.add(entry.id);
      if (entry.status === 'running') {
        addReason(report, {
          code: 'E_CLEAN_PROCESS_ACTIVE',
          surface: 'process',
          subject: entry.id,
          observedStatus: `${entry.kind}:running`,
          evidenceRefs: [evidencePath(projectRoot, backlogPath)],
        });
      }
    }
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_PROCESS_STATE_INVALID',
      surface: 'process',
      subject: 'autonomous-backlog',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, backlogPath)],
    });
  }
}

function validRunFlowActor(value) {
  return isRecord(value)
    && boundedIdentity(value.id)
    && (value.role === undefined || boundedIdentity(value.role))
    && (value.tenantId === undefined || boundedIdentity(value.tenantId));
}

function validRunFlowProposal(value, flowId) {
  return isRecord(value)
    && value.flowId === flowId
    && boundedIdentity(value.tenant)
    && boundedIdentity(value.project)
    && validRunFlowActor(value.actor)
    && RUN_FLOW_REQUEST_ORIGINS.has(value.origin)
    && Number.isSafeInteger(value.revision)
    && value.revision >= 1
    && boundedIdentity(value.intentSummary, 100_000);
}

function validRunFlowPreview(value, flowId) {
  return isRecord(value)
    && value.flowId === flowId
    && Number.isSafeInteger(value.revision)
    && value.revision >= 1
    && boundedIdentity(value.planDigest)
    && Array.isArray(value.taskSummaries)
    && value.taskSummaries.length <= EVIDENCE_LIMITS.taskFiles
    && value.taskSummaries.every(summary =>
      isRecord(summary)
      && typeof summary.title === 'string'
      && typeof summary.summary === 'string')
    && RUN_FLOW_POLICY_DECISIONS.has(value.policyDecision)
    && RUN_FLOW_GATE_RESULTS.has(value.gateResult)
    && (value.estimatedCostUsd === undefined
      || (Number.isFinite(value.estimatedCostUsd) && value.estimatedCostUsd >= 0))
    && (value.gateFindings === undefined
      || (Array.isArray(value.gateFindings)
        && value.gateFindings.every(finding => typeof finding === 'string')))
    && (value.topologyGateResult === undefined
      || RUN_FLOW_GATE_RESULTS.has(value.topologyGateResult))
    && (value.scopeGateResult === undefined
      || RUN_FLOW_GATE_RESULTS.has(value.scopeGateResult))
    && (value.scopeGateMessage === undefined || typeof value.scopeGateMessage === 'string')
    && (value.scopeGateOverridden === undefined
      || typeof value.scopeGateOverridden === 'boolean');
}

function validRunFlowHandle(value, flowId) {
  return isRecord(value)
    && value.flowId === flowId
    && boundedIdentity(value.jobId)
    && boundedIdentity(value.logRef, 4_096);
}

function validRunFlowEvent(event, flowId, index) {
  if (!isRecord(event)
    || event.schemaVersion !== 1
    || event.flowId !== flowId
    || event.sequence !== index + 1
    || typeof event.timestamp !== 'string'
    || !Number.isFinite(Date.parse(event.timestamp))
    || !RUN_FLOW_EVENT_TYPES.has(event.type)
    || (event.commandId !== undefined && !boundedIdentity(event.commandId))) {
    return false;
  }
  if (event.type === 'PROPOSAL_SUBMITTED') {
    return validRunFlowProposal(event.proposal, flowId);
  }
  if (event.type === 'PREVIEW_STARTED') {
    return Number.isSafeInteger(event.revision) && event.revision >= 1;
  }
  if (event.type === 'PREVIEW_READY') {
    return validRunFlowPreview(event.preview, flowId);
  }
  if (event.type === 'APPROVAL_GRANTED') {
    return Number.isSafeInteger(event.revision)
      && event.revision >= 1
      && boundedIdentity(event.planDigest)
      && validRunFlowActor(event.approvedBy);
  }
  if (event.type === 'APPROVAL_REJECTED') {
    return Number.isSafeInteger(event.revision)
      && event.revision >= 1
      && (event.reason === undefined || typeof event.reason === 'string');
  }
  if (event.type === 'START_REQUESTED') {
    return Number.isSafeInteger(event.revision)
      && event.revision >= 1
      && boundedIdentity(event.planDigest);
  }
  if (event.type === 'RUN_STARTED') {
    return validRunFlowHandle(event.handle, flowId);
  }
  if (event.type === 'RUN_COMPLETED') {
    return event.summary === undefined || typeof event.summary === 'string';
  }
  if (event.type === 'RUN_FAILED') return boundedIdentity(event.error, 4_096);
  return event.reason === undefined || typeof event.reason === 'string';
}

function sameRunFlowCas(event, value) {
  return value !== undefined
    && event.revision === value.revision
    && event.planDigest === value.planDigest;
}

// Deliberately mirrors src/orchestra/run-flow-reducer.ts. clean.mjs cannot
// import dist/ (the directory it is about to mutate), so this compact pure fold
// is the build-boundary twin of the canonical reducer.
function foldRunFlowEvents(events, flowId) {
  let context = { state: 'COLLECTING' };
  let priorTimestamp = -Infinity;
  for (const [index, event] of events.entries()) {
    if (!validRunFlowEvent(event, flowId, index)) {
      throw new EvidenceReadError('INVALID_EVENT_ENVELOPE');
    }
    const eventTimestamp = Date.parse(event.timestamp);
    if (eventTimestamp < priorTimestamp) {
      throw new EvidenceReadError('NON_MONOTONIC_EVENT_TIME');
    }
    priorTimestamp = eventTimestamp;
    if (RUN_FLOW_TERMINAL_STATES.has(context.state)) {
      throw new EvidenceReadError('EVENT_AFTER_TERMINAL');
    }
    if (event.type === 'PROPOSAL_SUBMITTED') {
      if (context.state !== 'COLLECTING') {
        throw new EvidenceReadError('INVALID_EVENT_TRANSITION');
      }
      context = {
        state: 'PROPOSAL_READY',
        proposal: event.proposal,
      };
      continue;
    }
    if (event.type === 'PREVIEW_STARTED') {
      if (context.state !== 'PROPOSAL_READY'
        || context.proposal.revision !== event.revision) {
        throw new EvidenceReadError('INVALID_EVENT_TRANSITION');
      }
      context = { ...context, state: 'PREVIEWING' };
      continue;
    }
    if (event.type === 'PREVIEW_READY') {
      if (context.state !== 'PREVIEWING') {
        throw new EvidenceReadError('INVALID_EVENT_TRANSITION');
      }
      context = { ...context, state: 'AWAITING_APPROVAL', preview: event.preview };
      continue;
    }
    if (event.type === 'APPROVAL_GRANTED') {
      if (context.state === 'AWAITING_APPROVAL') {
        context = sameRunFlowCas(event, context.preview)
          ? {
              ...context,
              state: 'APPROVED',
              approvedSnapshot: {
                revision: event.revision,
                planDigest: event.planDigest,
              },
            }
          : { ...context, state: 'BLOCKED' };
        continue;
      }
      if (context.state === 'APPROVED'
        && sameRunFlowCas(event, context.approvedSnapshot)) {
        continue;
      }
      throw new EvidenceReadError('INVALID_EVENT_TRANSITION');
    }
    if (event.type === 'APPROVAL_REJECTED') {
      if (context.state !== 'AWAITING_APPROVAL') {
        throw new EvidenceReadError('INVALID_EVENT_TRANSITION');
      }
      context = { ...context, state: 'CANCELLED' };
      continue;
    }
    if (event.type === 'START_REQUESTED') {
      if (context.state === 'APPROVED') {
        context = sameRunFlowCas(event, context.approvedSnapshot)
          ? { ...context, state: 'STARTING' }
          : { ...context, state: 'BLOCKED' };
        continue;
      }
      if ((context.state === 'STARTING' || context.state === 'DETACHED_RUNNING')
        && sameRunFlowCas(event, context.approvedSnapshot)) {
        continue;
      }
      throw new EvidenceReadError('INVALID_EVENT_TRANSITION');
    }
    if (event.type === 'RUN_STARTED') {
      if (context.state === 'STARTING') {
        context = { ...context, state: 'DETACHED_RUNNING', handle: event.handle };
        continue;
      }
      if (context.state === 'DETACHED_RUNNING'
        && context.handle?.jobId === event.handle.jobId) {
        continue;
      }
      throw new EvidenceReadError('INVALID_EVENT_TRANSITION');
    }
    if (event.type === 'RUN_COMPLETED') {
      if (context.state !== 'DETACHED_RUNNING') {
        throw new EvidenceReadError('INVALID_EVENT_TRANSITION');
      }
      context = { ...context, state: 'COMPLETED' };
      continue;
    }
    if (event.type === 'RUN_FAILED') {
      if (context.state !== 'STARTING' && context.state !== 'DETACHED_RUNNING') {
        throw new EvidenceReadError('INVALID_EVENT_TRANSITION');
      }
      context = { ...context, state: 'FAILED' };
      continue;
    }
    context = { ...context, state: 'CANCELLED' };
  }
  return context;
}

function validRunHandleRecord(record, flowId) {
  return isRecord(record)
    && record.flowId === flowId
    && Number.isSafeInteger(record.revision)
    && record.revision >= 1
    && boundedIdentity(record.planDigest)
    && validRunFlowHandle(record.handle, flowId)
    && typeof record.startedAt === 'string'
    && Number.isFinite(Date.parse(record.startedAt))
    && (record.pid === undefined
      || (Number.isSafeInteger(record.pid) && record.pid > 0));
}

function parseJobTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  if (/^[1-9]\d{12}$/u.test(value)) {
    const epochMs = Number(value);
    return Number.isSafeInteger(epochMs) ? epochMs : NaN;
  }
  return Date.parse(value);
}

function registerTerminalFlow(report, terminalFlows, flowId, status, ref) {
  if (flowId === undefined) return;
  if (!boundedIdentity(flowId)) {
    throw new EvidenceReadError('INVALID_COMPLETION_FLOW');
  }
  const prior = terminalFlows.get(flowId);
  if (prior !== undefined && prior.status !== status) {
    addReason(report, {
      code: 'E_CLEAN_RUN_JOB_STATE_INVALID',
      surface: 'run-job',
      subject: flowId,
      observedStatus: `${prior.status}:${status}`,
      detailCode: 'CONFLICTING_TERMINAL_CLOSURES',
      evidenceRefs: [prior.ref, ref],
    });
    return;
  }
  terminalFlows.set(flowId, { status, ref });
}

function inspectRunJobsAndFlows(report, projectRoot, processProbe, nowMs) {
  const jobsDir = join(projectRoot, '.deckent', 'runtime', 'jobs');
  const terminalFlows = new Map();
  let jobEntries;
  try {
    jobEntries = listBoundedDirectory(jobsDir)
      .filter(entry => entry.name.endsWith('.json'));
    if (jobEntries.length > EVIDENCE_LIMITS.jobFiles) {
      throw new EvidenceReadError('ENTRY_LIMIT');
    }
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_RUN_JOB_STATE_INVALID',
      surface: 'run-job',
      subject: 'job-directory',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, jobsDir)],
    });
    jobEntries = [];
  }
  report.inspected.jobFiles = jobEntries.length;
  for (const entry of jobEntries) {
    const path = join(jobsDir, entry.name);
    const ref = evidencePath(projectRoot, path);
    const fileJobId = entry.name.slice(0, -'.json'.length);
    try {
      const job = readBoundedJson(path);
      if (!isRecord(job) || !boundedIdentity(fileJobId)) {
        throw new EvidenceReadError('INVALID_SHAPE');
      }

      // sprint-finalizer owns <sprintId>.json completion summaries. They share
      // the directory with MCP JobState records but intentionally have no
      // jobId/startedAt; sprint-state is their lifecycle authority.
      const sprintCompletionSummary = job.jobId === undefined
        && job.sprintId === fileJobId;
      if (sprintCompletionSummary) {
        if ((job.status !== 'COMPLETE' && job.status !== 'FAILED')
          || typeof job.completedAt !== 'string'
          || !Number.isFinite(Date.parse(job.completedAt))) {
          throw new EvidenceReadError('INVALID_SPRINT_COMPLETION');
        }
        if (job.completionRecord !== undefined
          && !isRecord(job.completionRecord)) {
          throw new EvidenceReadError('INVALID_COMPLETION_RECORD');
        }
        registerTerminalFlow(
          report,
          terminalFlows,
          job.completionRecord?.flowId,
          job.status,
          ref,
        );
        continue;
      }

      if (job.jobId !== fileJobId
        || !boundedIdentity(job.jobId)
        || typeof job.status !== 'string'
        || (!RUN_JOB_ACTIVE_STATUSES.has(job.status)
          && !RUN_JOB_NON_ACTIVE_STATUSES.has(job.status))
        || typeof job.startedAt !== 'string'
        || !Number.isFinite(parseJobTimestamp(job.startedAt))) {
        throw new EvidenceReadError('INVALID_JOB_STATE');
      }
      if (job.completionRecord !== undefined
        && !isRecord(job.completionRecord)) {
        throw new EvidenceReadError('INVALID_COMPLETION_RECORD');
      }
      if (job.status === 'COMPLETE' || job.status === 'FAILED') {
        registerTerminalFlow(
          report,
          terminalFlows,
          job.completionRecord?.flowId,
          job.status,
          ref,
        );
      }
      if (RUN_JOB_ACTIVE_STATUSES.has(job.status)) {
        const ageMs = nowMs - parseJobTimestamp(job.startedAt);
        if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs <= RUN_JOB_LAUNCH_RACE_MS) {
          addReason(report, {
            code: 'E_CLEAN_RUN_JOB_STATE_UNKNOWN',
            surface: 'run-job',
            subject: job.jobId,
            observedStatus: `${job.status}:LAUNCH_WINDOW`,
            detailCode: ageMs < 0 ? 'FUTURE_STARTED_AT' : 'ADJACENT_AUTHORITY_PENDING',
            evidenceRefs: [ref],
          });
        } else {
          report.projections.push({
            surface: 'run-job',
            id: job.jobId,
            rawStatus: job.status,
            effectiveStatus: 'STALE',
            authority: 'adjacent-execution-authority',
            evidenceRefs: [ref],
          });
        }
      }
    } catch (error) {
      addReason(report, {
        code: 'E_CLEAN_RUN_JOB_STATE_INVALID',
        surface: 'run-job',
        subject: fileJobId || 'job',
        detailCode: evidenceErrorKind(error),
        evidenceRefs: [ref],
      });
    }
  }

  const flowDir = join(projectRoot, '.deckent', 'runtime', 'run-flow-store');
  let flowEntries;
  try {
    flowEntries = listBoundedDirectory(flowDir).filter(entry =>
      entry.name.endsWith('.events.jsonl') || entry.name.endsWith('.handle.jsonl'));
    if (flowEntries.length > EVIDENCE_LIMITS.runFlowFiles) {
      throw new EvidenceReadError('ENTRY_LIMIT');
    }
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_RUN_FLOW_STATE_INVALID',
      surface: 'run-flow',
      subject: 'flow-directory',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, flowDir)],
    });
    return;
  }
  report.inspected.runFlowFiles = flowEntries.length;
  const flowFiles = new Map();
  for (const entry of flowEntries) {
    const suffix = entry.name.endsWith('.events.jsonl')
      ? '.events.jsonl'
      : '.handle.jsonl';
    const flowId = entry.name.slice(0, -suffix.length);
    if (!boundedIdentity(flowId)) {
      addReason(report, {
        code: 'E_CLEAN_RUN_FLOW_STATE_INVALID',
        surface: 'run-flow',
        subject: 'flow-file',
        detailCode: 'INVALID_FLOW_ID',
        evidenceRefs: [evidencePath(projectRoot, join(flowDir, entry.name))],
      });
      continue;
    }
    const files = flowFiles.get(flowId) ?? {};
    files[suffix === '.events.jsonl' ? 'events' : 'handle'] = join(flowDir, entry.name);
    flowFiles.set(flowId, files);
  }

  for (const [flowId, files] of flowFiles) {
    let context = { state: 'COLLECTING' };
    let handleRecords = [];
    try {
      if (files.events) {
        const events = readBoundedJsonLines(files.events);
        if (events.length === 0) throw new EvidenceReadError('EMPTY_EVENT_LOG');
        context = foldRunFlowEvents(events, flowId);
      }
      if (files.handle) {
        handleRecords = readBoundedJsonLines(files.handle);
        if (handleRecords.length === 0
          || handleRecords.some(record => !validRunHandleRecord(record, flowId))) {
          throw new EvidenceReadError('INVALID_HANDLE_LOG');
        }
      }
    } catch (error) {
      addReason(report, {
        code: 'E_CLEAN_RUN_FLOW_STATE_INVALID',
        surface: 'run-flow',
        subject: flowId,
        detailCode: evidenceErrorKind(error),
        evidenceRefs: [
          ...(files.events ? [evidencePath(projectRoot, files.events)] : []),
          ...(files.handle ? [evidencePath(projectRoot, files.handle)] : []),
        ],
      });
      continue;
    }

    if (terminalFlows.has(flowId) || RUN_FLOW_TERMINAL_STATES.has(context.state)) {
      continue;
    }
    const handle = handleRecords.at(-1);
    if (context.state !== 'STARTING'
      && context.state !== 'DETACHED_RUNNING'
      && handle === undefined) {
      continue;
    }
    if (context.state !== 'COLLECTING'
      && context.state !== 'STARTING'
      && context.state !== 'DETACHED_RUNNING'
      && handle !== undefined) {
      addReason(report, {
        code: 'E_CLEAN_RUN_FLOW_STATE_INVALID',
        surface: 'run-flow',
        subject: flowId,
        observedStatus: context.state,
        detailCode: 'HANDLE_BEFORE_START',
        evidenceRefs: [
          ...(files.events ? [evidencePath(projectRoot, files.events)] : []),
          evidencePath(projectRoot, files.handle),
        ],
      });
      continue;
    }
    if (context.state === 'STARTING' && handle === undefined) {
      addReason(report, {
        code: 'E_CLEAN_RUN_FLOW_ACTIVE',
        surface: 'run-flow',
        subject: flowId,
        observedStatus: 'STARTING',
        evidenceRefs: [evidencePath(projectRoot, files.events)],
      });
      continue;
    }
    if (context.state === 'DETACHED_RUNNING'
      && handle !== undefined
      && context.handle?.jobId !== handle.handle.jobId) {
      addReason(report, {
        code: 'E_CLEAN_RUN_FLOW_STATE_INVALID',
        surface: 'run-flow',
        subject: flowId,
        observedStatus: 'DETACHED_RUNNING',
        detailCode: 'HANDLE_JOB_CONFLICT',
        evidenceRefs: [
          evidencePath(projectRoot, files.events),
          evidencePath(projectRoot, files.handle),
        ],
      });
      continue;
    }
    if (handle === undefined) {
      addReason(report, {
        code: 'E_CLEAN_RUN_FLOW_STATE_UNKNOWN',
        surface: 'run-flow',
        subject: flowId,
        observedStatus: context.state,
        detailCode: 'HANDLE_MISSING',
        evidenceRefs: [evidencePath(projectRoot, files.events)],
      });
      continue;
    }
    if (handle.pid === undefined) {
      addReason(report, {
        code: 'E_CLEAN_RUN_FLOW_STATE_UNKNOWN',
        surface: 'run-flow',
        subject: flowId,
        observedStatus: context.state === 'COLLECTING'
          ? 'LEGACY_DETACHED_RUNNING'
          : context.state,
        detailCode: 'PID_MISSING',
        evidenceRefs: [evidencePath(projectRoot, files.handle)],
      });
      continue;
    }
    const liveness = processProbe(handle.pid);
    if (liveness === 'alive') {
      addReason(report, {
        code: 'E_CLEAN_RUN_FLOW_ACTIVE',
        surface: 'run-flow',
        subject: flowId,
        observedStatus: 'DETACHED_RUNNING:ALIVE',
        evidenceRefs: [
          ...(files.events ? [evidencePath(projectRoot, files.events)] : []),
          evidencePath(projectRoot, files.handle),
        ],
      });
    } else if (liveness === 'dead') {
      report.projections.push({
        surface: 'run-flow',
        id: flowId,
        rawStatus: 'DETACHED_RUNNING',
        effectiveStatus: 'STALE_DEAD',
        authority: 'process-liveness',
        evidenceRefs: [evidencePath(projectRoot, files.handle)],
      });
    } else {
      addReason(report, {
        code: 'E_CLEAN_RUN_FLOW_STATE_UNKNOWN',
        surface: 'run-flow',
        subject: flowId,
        observedStatus: 'DETACHED_RUNNING:UNKNOWN',
        detailCode: 'PROCESS_PROBE_UNKNOWN',
        evidenceRefs: [evidencePath(projectRoot, files.handle)],
      });
    }
  }
}

function verifyMissionSchema(db) {
  const required = {
    missions: ['id', 'status'],
    work_items: [
      'id',
      'mission_id',
      'kind',
      'status',
      'claimed_at',
      'claimed_by',
    ],
    mission_engine_lease: [
      'singleton_id',
      'owner_id',
      'epoch',
      'lease_token_hash',
      'acquired_at',
      'renewed_at',
      'expires_at',
      'expires_at_ms',
    ],
  };
  for (const [table, columns] of Object.entries(required)) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    const actual = new Set(rows.map(row => row.name));
    if (columns.some(column => !actual.has(column))) return false;
  }
  return true;
}

function inspectMissionState(report, projectRoot, nowMs) {
  const dbPath = join(projectRoot, '.deckent', 'autonomous', 'autonomous.db');
  try {
    if (!evidenceExists(dbPath)) return;
    const stats = lstatEvidence(dbPath);
    if (stats === null || stats.isSymbolicLink() || !stats.isFile()) {
      throw new EvidenceReadError(stats?.isSymbolicLink() ? 'SYMLINK' : 'NOT_FILE');
    }
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_MISSION_DB_INVALID',
      surface: 'mission',
      subject: 'autonomous-v2',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, dbPath)],
    });
    return;
  }

  let Database;
  try {
    const module = loadModule('better-sqlite3');
    Database = module.default ?? module;
  } catch {
    addReason(report, {
      code: 'E_CLEAN_MISSION_READER_UNAVAILABLE',
      surface: 'mission',
      subject: 'autonomous-v2',
      detailCode: 'MODULE_UNAVAILABLE',
      evidenceRefs: [evidencePath(projectRoot, dbPath)],
    });
    return;
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 250 });
  } catch {
    addReason(report, {
      code: 'E_CLEAN_MISSION_DB_INVALID',
      surface: 'mission',
      subject: 'autonomous-v2',
      detailCode: 'OPEN_FAILED',
      evidenceRefs: [evidencePath(projectRoot, dbPath)],
    });
    return;
  }

  try {
    if (!verifyMissionSchema(db)) {
      throw new EvidenceReadError('SCHEMA_MISMATCH');
    }
    const missions = db.prepare(`
      SELECT id, status
      FROM missions
      ORDER BY id
      LIMIT ?
    `).all(EVIDENCE_LIMITS.missionRows + 1);
    const items = db.prepare(`
      SELECT id, mission_id, kind, status, claimed_at, claimed_by
      FROM work_items
      ORDER BY id
      LIMIT ?
    `).all(EVIDENCE_LIMITS.missionRows + 1);
    const leases = db.prepare(`
      SELECT singleton_id, owner_id, epoch, lease_token_hash, acquired_at,
             renewed_at, expires_at, expires_at_ms
      FROM mission_engine_lease
      ORDER BY singleton_id
      LIMIT 2
    `).all();
    if (missions.length > EVIDENCE_LIMITS.missionRows
      || items.length > EVIDENCE_LIMITS.missionRows
      || leases.length > 1) {
      throw new EvidenceReadError('ROW_LIMIT');
    }
    report.inspected.missionRows = missions.length + items.length + leases.length;
    const missionIds = new Set();
    for (const mission of missions) {
      if (!boundedIdentity(mission.id)
        || !MISSION_STATUSES.has(mission.status)
        || missionIds.has(mission.id)) {
        throw new EvidenceReadError('INVALID_MISSION_ROW');
      }
      missionIds.add(mission.id);
    }
    for (const item of items) {
      if (!boundedIdentity(item.id)
        || !boundedIdentity(item.mission_id)
        || !missionIds.has(item.mission_id)
        || !BACKLOG_KINDS.has(item.kind)
        || !MISSION_ITEM_STATUSES.has(item.status)
        || ((item.claimed_at === null) !== (item.claimed_by === null))
        || (item.claimed_at !== null
          && (typeof item.claimed_at !== 'string'
            || !Number.isFinite(Date.parse(item.claimed_at))
            || !boundedIdentity(item.claimed_by)))) {
        throw new EvidenceReadError('INVALID_WORK_ITEM_ROW');
      }
      if (item.status === 'running') {
        if (item.claimed_at === null) {
          addReason(report, {
            code: 'E_CLEAN_MISSION_STATE_INVALID',
            surface: 'mission',
            subject: item.id,
            observedStatus: 'running',
            detailCode: 'RUNNING_CLAIM_MISSING',
            evidenceRefs: [evidencePath(projectRoot, dbPath)],
          });
        }
        addReason(report, {
          code: 'E_CLEAN_MISSION_WORK_ACTIVE',
          surface: 'mission',
          subject: item.id,
          observedStatus: 'running',
          evidenceRefs: [evidencePath(projectRoot, dbPath)],
        });
      } else if ((item.status === 'pending' || item.status === 'parked')
        && item.claimed_at !== null) {
        addReason(report, {
          code: 'E_CLEAN_MISSION_STATE_INVALID',
          surface: 'mission',
          subject: item.id,
          observedStatus: item.status,
          detailCode: 'QUEUED_CLAIM_CONFLICT',
          evidenceRefs: [evidencePath(projectRoot, dbPath)],
        });
      }
    }
    for (const lease of leases) {
      if (lease.singleton_id !== 1
        || !boundedIdentity(lease.owner_id)
        || !Number.isSafeInteger(lease.epoch)
        || lease.epoch < 1
        || typeof lease.lease_token_hash !== 'string'
        || !/^[a-f0-9]{64}$/u.test(lease.lease_token_hash)
        || typeof lease.acquired_at !== 'string'
        || !Number.isFinite(Date.parse(lease.acquired_at))
        || typeof lease.renewed_at !== 'string'
        || !Number.isFinite(Date.parse(lease.renewed_at))
        || typeof lease.expires_at !== 'string'
        || !Number.isFinite(Date.parse(lease.expires_at))
        || !Number.isSafeInteger(lease.expires_at_ms)
        || lease.expires_at_ms < 0) {
        throw new EvidenceReadError('INVALID_ENGINE_LEASE');
      }
      if (lease.expires_at_ms > nowMs) {
        addReason(report, {
          code: 'E_CLEAN_MISSION_ENGINE_ACTIVE',
          surface: 'mission',
          subject: lease.owner_id,
          observedStatus: 'LEASE_ACTIVE',
          evidenceRefs: [evidencePath(projectRoot, dbPath)],
        });
      }
    }
  } catch (error) {
    addReason(report, {
      code: error instanceof EvidenceReadError && error.kind === 'SCHEMA_MISMATCH'
        ? 'E_CLEAN_MISSION_SCHEMA_UNSUPPORTED'
        : 'E_CLEAN_MISSION_STATE_INVALID',
      surface: 'mission',
      subject: 'autonomous-v2',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [evidencePath(projectRoot, dbPath)],
    });
  } finally {
    try {
      db.close();
    } catch {
      addReason(report, {
        code: 'E_CLEAN_MISSION_DB_INVALID',
        surface: 'mission',
        subject: 'autonomous-v2',
        detailCode: 'CLOSE_FAILED',
        evidenceRefs: [evidencePath(projectRoot, dbPath)],
      });
    }
  }
}

function inspectBotState(report, projectRoot, processProbe) {
  const botPidPath = join(projectRoot, '.deckent', 'bot.pid');
  const evidenceRef = [evidencePath(projectRoot, botPidPath)];
  let raw;
  try {
    if (!evidenceExists(botPidPath)) return;
    raw = readBoundedText(botPidPath, 4_096);
  } catch (error) {
    addReason(report, {
      code: 'E_CLEAN_BOT_STATE_INVALID',
      surface: 'bot',
      subject: 'telegram-bot',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: evidenceRef,
    });
    return;
  }

  const addInvalid = detailCode => addReason(report, {
    code: 'E_CLEAN_BOT_STATE_INVALID',
    surface: 'bot',
    subject: 'telegram-bot',
    detailCode,
    evidenceRefs: evidenceRef,
  });
  const addUnknown = (pid, detailCode) => addReason(report, {
    code: 'E_CLEAN_BOT_STATE_UNKNOWN',
    surface: 'bot',
    subject: 'telegram-bot',
    observedStatus: 'OWNERSHIP_UNKNOWN',
    detailCode,
    evidenceRefs: evidenceRef,
    ...(pid === null ? {} : { pid }),
  });
  const addActive = pid => addReason(report, {
    code: 'E_CLEAN_BOT_ACTIVE',
    surface: 'bot',
    subject: 'telegram-bot',
    observedStatus: 'OWNED',
    evidenceRefs: evidenceRef,
    pid,
  });

  const legacyPid = parsePid(raw);
  if (legacyPid !== null) {
    const state = processProbe(legacyPid);
    if (state === 'dead') return;
    if (state !== 'alive') {
      addUnknown(legacyPid, 'PROCESS_LIVENESS_UNKNOWN');
      return;
    }
    const identity = inspectLegacyBotIdentity(projectRoot, legacyPid);
    if (identity === 'bot') addActive(legacyPid);
    else if (identity === 'unknown') addUnknown(legacyPid, 'LEGACY_IDENTITY_UNAVAILABLE');
    // A live but provably foreign legacy pid is stale evidence, not a bot.
    return;
  }

  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    addInvalid('INVALID_JSON');
    return;
  }
  if (!validBotPidRecord(record)) {
    addInvalid('INVALID_SHAPE');
    return;
  }
  if (record.projectRootDigest !== sha256(projectRoot)) {
    addUnknown(record.pid, 'PROJECT_BINDING_MISMATCH');
    return;
  }
  const state = processProbe(record.pid);
  if (state === 'dead') return;
  if (state !== 'alive') {
    addUnknown(record.pid, 'PROCESS_LIVENESS_UNKNOWN');
    return;
  }
  const liveToken = cleanProcessStartToken(record.pid);
  if (record.startToken !== null && liveToken !== null) {
    if (record.startToken === liveToken) addActive(record.pid);
    // A differing token proves PID reuse; stale evidence must not block build.
    return;
  }
  addUnknown(record.pid, 'START_TOKEN_UNAVAILABLE');
}

function validBotPidRecord(value) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  if (canonicalJson(keys) !== canonicalJson([
    'pid',
    'projectRootDigest',
    'recordedAt',
    'schemaVersion',
    'startToken',
  ].sort())) return false;
  return value.schemaVersion === 1
    && Number.isSafeInteger(value.pid)
    && value.pid > 0
    && (value.startToken === null
      || (typeof value.startToken === 'string' && /^s\d+$/u.test(value.startToken)))
    && typeof value.projectRootDigest === 'string'
    && /^[a-f0-9]{64}$/u.test(value.projectRootDigest)
    && typeof value.recordedAt === 'string'
    && Number.isFinite(Date.parse(value.recordedAt))
    && new Date(value.recordedAt).toISOString() === value.recordedAt;
}

function cleanProcessStartToken(pid) {
  if (process.platform !== 'linux') return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const starttime = fields[19];
    return starttime && /^\d+$/u.test(starttime) ? `s${starttime}` : null;
  } catch {
    return null;
  }
}

function inspectLegacyBotIdentity(projectRoot, pid) {
  if (process.platform !== 'linux') return 'unknown';
  try {
    const cwd = realpathSync.native(`/proc/${pid}/cwd`);
    if (!canonicalPathEquals(cwd, projectRoot)) return 'foreign';
    const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
      .split('\0')
      .filter(Boolean);
    if (argv.length < 4 || argv[2] !== 'bot' || argv[3] !== 'listen') {
      return 'foreign';
    }
    let actualEntry;
    try {
      actualEntry = realpathSync.native(argv[1]);
    } catch {
      return 'foreign';
    }
    const expectedEntries = [
      join(projectRoot, 'dist', 'cli', 'entry.js'),
      join(projectRoot, 'src', 'cli', 'entry.ts'),
    ].flatMap(path => {
      try {
        return [realpathSync.native(path)];
      } catch {
        return [];
      }
    });
    return expectedEntries.some(expected =>
      canonicalPathEquals(actualEntry, expected))
      ? 'bot'
      : 'foreign';
  } catch {
    return 'unknown';
  }
}

/**
 * Read-only preflight used by `npm run clean` and therefore every build.
 * The caller-selected root is inspection authority only; `cleanDist` never
 * accepts caller-selected destructive authority.
 *
 * @param {string} projectRoot
 * @param {{
 *   processProbe?: (pid: number) => 'alive'|'dead'|'unknown',
 *   nowMs?: number
 * }} options
 */
function inspectActiveExecutionsInternal(
  projectRoot,
  options,
  ownMaintenance,
) {
  let physicalRoot;
  try {
    physicalRoot = realpathSync.native(resolve(projectRoot));
    if (!lstatSync(physicalRoot).isDirectory()) throw new EvidenceReadError('NOT_DIRECTORY');
  } catch (error) {
    const report = createAdmissionReport(null);
    addReason(report, {
      code: 'E_CLEAN_PROJECT_ROOT_INVALID',
      surface: 'project',
      subject: 'root',
      detailCode: evidenceErrorKind(error),
      evidenceRefs: [],
    });
    return finalizeAdmissionReport(report);
  }
  const rootDigest = sha256(physicalRoot);
  const report = createAdmissionReport(rootDigest);
  const processProbe = options.processProbe ?? defaultProcessProbe;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  inspectSprintState(report, physicalRoot, processProbe);
  inspectTasksAndWorkers(
    report,
    physicalRoot,
    rootDigest,
    processProbe,
    nowMs,
    ownMaintenance,
    options.processProbe !== undefined,
  );
  inspectProcessState(report, physicalRoot);
  inspectRunJobsAndFlows(report, physicalRoot, processProbe, nowMs);
  inspectMissionState(report, physicalRoot, nowMs);
  inspectBotState(report, physicalRoot, processProbe);
  return finalizeAdmissionReport(report);
}

export function inspectActiveExecutions(projectRoot = SOURCE_ROOT, options = {}) {
  return inspectActiveExecutionsInternal(projectRoot, options, undefined);
}

function readIdentityFile(path, maxBytes) {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > maxBytes) {
    throw new Error('unsafe-identity-file');
  }
  const value = readFileSync(path, 'utf8');
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new Error('oversized-identity-file');
  }
  return value;
}

function detectCleanExecutionLockRuntimeIdentity() {
  if (process.platform === 'linux') {
    try {
      const machineId = readIdentityFile('/etc/machine-id', 256).trim();
      const bootId =
        readIdentityFile('/proc/sys/kernel/random/boot_id', 256).trim();
      const pidNamespace = readlinkSync('/proc/self/ns/pid', 'utf8');
      if (machineId && bootId && pidNamespace.length <= 256) {
        return {
          hostInstanceId: sha256(machineId),
          bootSessionId: sha256(`${bootId}:${pidNamespace}`),
          processSessionId: CLEAN_EXECUTION_LOCK_PROCESS_SESSION_ID,
        };
      }
    } catch {
      // An unverifiable machine/boot identity is process-local and therefore
      // never authorizes recovery of a different process generation.
    }
  }
  const processLocalId =
    `process-local:${CLEAN_EXECUTION_LOCK_PROCESS_SESSION_ID}`;
  return {
    hostInstanceId: processLocalId,
    bootSessionId: processLocalId,
    processSessionId: CLEAN_EXECUTION_LOCK_PROCESS_SESSION_ID,
  };
}

function canonicalPathEquals(left, right) {
  return process.platform === 'win32'
    ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    : left === right;
}

function cleanExecutionAuthorityPlatformAdapter() {
  if (process.platform !== 'linux'
    || !existsSync('/proc/self/fd')
    || typeof fsConstants.O_DIRECTORY !== 'number'
    || typeof fsConstants.O_NOFOLLOW !== 'number'
    || fsConstants.O_NOFOLLOW === 0) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED',
      process.platform,
    );
  }
  let release = '';
  try {
    release = readFileSync('/proc/sys/kernel/osrelease', 'utf8');
  } catch {
    // WSL classification is observability only; fd identity remains authority.
  }
  return /microsoft|wsl/iu.test(release) ? 'wsl' : 'linux';
}

function cleanExecutionPinnedMountId(fd) {
  let raw;
  try {
    raw = readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8');
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED',
      'mount-identity',
    );
  }
  const match = /^mnt_id:\s*([1-9]\d*)$/mu.exec(raw);
  if (!match) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED',
      'mount-identity',
    );
  }
  return match[1];
}

function cleanExecutionDirectoryIdentity(fd) {
  const entry = fstatSync(fd, { bigint: true });
  if (!entry.isDirectory() || entry.dev <= 0n || entry.ino <= 0n) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED',
      'directory-identity',
    );
  }
  return {
    dev: entry.dev.toString(),
    ino: entry.ino.toString(),
    mountId: cleanExecutionPinnedMountId(fd),
  };
}

function cleanExecutionStatsIdentity(entry, mountId) {
  if (!entry.isDirectory()) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      'directory-identity',
    );
  }
  return {
    dev: String(entry.dev),
    ino: String(entry.ino),
    mountId,
  };
}

function cleanExecutionDirectoryIdentityEquals(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mountId === right.mountId;
}

function cleanExecutionStableDirectoryIdentityEquals(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function pinCleanExecutionAuthorityDirectories(projectRoot) {
  const adapter = cleanExecutionAuthorityPlatformAdapter();
  let rootFd;
  let locksFd;
  try {
    const inputProjectRoot = resolve(projectRoot);
    const canonicalRoot = realpathSync.native(inputProjectRoot);
    rootFd = openSync(
      canonicalRoot,
      fsConstants.O_RDONLY
        | fsConstants.O_DIRECTORY
        | fsConstants.O_NOFOLLOW,
    );
    const stableRootPath = `/proc/self/fd/${rootFd}`;
    const projectIdentity = cleanExecutionDirectoryIdentity(rootFd);
    const inputIdentity = cleanExecutionStatsIdentity(
      statSync(inputProjectRoot, { bigint: true }),
      projectIdentity.mountId,
    );
    if (!cleanExecutionDirectoryIdentityEquals(projectIdentity, inputIdentity)
      || !cleanExecutionDirectoryIdentityEquals(
        projectIdentity,
        cleanExecutionStatsIdentity(
          statSync(stableRootPath, { bigint: true }),
          projectIdentity.mountId,
        ),
      )) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        inputProjectRoot,
      );
    }

    const namedLocksPath = join(stableRootPath, '.locks');
    if (!existsSync(namedLocksPath)) {
      try {
        mkdirSync(namedLocksPath, { recursive: false, mode: 0o700 });
        fsyncCleanExecutionAuthorityDirectory(stableRootPath);
      } catch (error) {
        if (!error || typeof error !== 'object' || error.code !== 'EEXIST') {
          throw error;
        }
      }
    }
    const namedLocks = lstatSync(namedLocksPath, { bigint: true });
    if (!namedLocks.isDirectory() || namedLocks.isSymbolicLink()) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        namedLocksPath,
      );
    }
    locksFd = openSync(
      namedLocksPath,
      fsConstants.O_RDONLY
        | fsConstants.O_DIRECTORY
        | fsConstants.O_NOFOLLOW,
    );
    const stableLocksPath = `/proc/self/fd/${locksFd}`;
    const locksIdentity = cleanExecutionDirectoryIdentity(locksFd);
    if (locksIdentity.dev !== projectIdentity.dev
      || locksIdentity.mountId !== projectIdentity.mountId
      || String(namedLocks.dev) !== locksIdentity.dev
      || String(namedLocks.ino) !== locksIdentity.ino) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        namedLocksPath,
      );
    }
    return {
      adapter,
      inputProjectRoot,
      rootFd,
      locksFd,
      stableRootPath,
      stableLocksPath,
      projectIdentity,
      locksIdentity,
    };
  } catch (error) {
    if (locksFd !== undefined) {
      try {
        closeSync(locksFd);
      } catch {
        // Preserve the pin failure.
      }
    }
    if (rootFd !== undefined) {
      try {
        closeSync(rootFd);
      } catch {
        // Preserve the pin failure.
      }
    }
    if (error && typeof error === 'object'
      && typeof error.code === 'string'
      && error.code.startsWith('E_CLEAN_')) {
      throw error;
    }
    throw codedError(
      'E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED',
      projectRoot,
    );
  }
}

function validatePinnedCleanExecutionAuthorityDirectories(pinned) {
  const projectIdentity = cleanExecutionDirectoryIdentity(pinned.rootFd);
  const locksIdentity = cleanExecutionDirectoryIdentity(pinned.locksFd);
  let inputIdentity;
  let namedLocks;
  try {
    inputIdentity = cleanExecutionStatsIdentity(
      statSync(pinned.inputProjectRoot, { bigint: true }),
      projectIdentity.mountId,
    );
    namedLocks = lstatSync(join(pinned.stableRootPath, '.locks'), {
      bigint: true,
    });
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_STATE_MISSING',
      pinned.inputProjectRoot,
    );
  }
  if (!cleanExecutionDirectoryIdentityEquals(
    projectIdentity,
    pinned.projectIdentity,
  )
    || !cleanExecutionDirectoryIdentityEquals(
      inputIdentity,
      pinned.projectIdentity,
    )
    || !cleanExecutionDirectoryIdentityEquals(
      locksIdentity,
      pinned.locksIdentity,
    )
    || !namedLocks.isDirectory()
    || namedLocks.isSymbolicLink()
    || String(namedLocks.dev) !== pinned.locksIdentity.dev
    || String(namedLocks.ino) !== pinned.locksIdentity.ino) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_EPOCH_MISMATCH',
      pinned.inputProjectRoot,
    );
  }
}

function closePinnedCleanExecutionAuthorityDirectories(pinned) {
  let closed = true;
  for (const fd of [pinned.locksFd, pinned.rootFd]) {
    try {
      closeSync(fd);
    } catch {
      closed = false;
    }
  }
  return closed;
}

function ensureCleanExecutionAuthorityDirectory(projectRoot) {
  let canonicalRoot;
  const requestedRoot = resolve(projectRoot);
  try {
    canonicalRoot = realpathSync.native(requestedRoot);
    if (!lstatSync(canonicalRoot).isDirectory()) throw new Error('not-directory');
  } catch {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', projectRoot);
  }

  const locksDir = join(requestedRoot, '.locks');
  if (!existsSync(locksDir)) {
    try {
      mkdirSync(locksDir, { recursive: false, mode: 0o700 });
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'EEXIST') {
        throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', locksDir);
      }
    }
  }
  try {
    const entry = lstatSync(locksDir);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error('unsafe-entry');
    }
    const canonicalLocks = realpathSync.native(locksDir);
    if (!canonicalPathEquals(canonicalLocks, join(canonicalRoot, '.locks'))) {
      throw new Error('reparse-target');
    }
    return locksDir;
  } catch {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', locksDir);
  }
}

function cleanExecutionAuthorityDirectory(authority) {
  if (isRecord(authority)
    && authority.kind === 'pinned-clean-execution-authority'
    && typeof authority.locksDir === 'string') {
    return authority.locksDir;
  }
  return ensureCleanExecutionAuthorityDirectory(authority);
}

function readCleanAuthorityFile(path, maxBytes) {
  let before;
  try {
    before = lstatSync(path);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
  }
  if (!before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1
    || before.size > maxBytes) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
  }

  let fd;
  try {
    fd = openSync(
      path,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(fd);
    if (!opened.isFile()
      || opened.nlink !== 1
      || opened.size > maxBytes
      || opened.dev !== before.dev
      || opened.ino !== before.ino) {
      throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
    }
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let offset = 0;
    while (offset <= maxBytes) {
      const count = readSync(fd, buffer, offset, maxBytes + 1 - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(fd);
    if (offset > maxBytes
      || after.nlink !== 1
      || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs
      || after.dev !== opened.dev
      || after.ino !== opened.ino) {
      throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
    }
    return new TextDecoder('utf-8', { fatal: true })
      .decode(buffer.subarray(0, offset));
  } catch (error) {
    if (error && typeof error === 'object'
      && error.code === 'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID') {
      throw error;
    }
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // The authority read already failed closed if close is material.
      }
    }
  }
}

function cleanExecutionLockPath(projectRoot, taskId) {
  return join(
    cleanExecutionAuthorityDirectory(projectRoot),
    `${sha256(taskId)}.executionlock`,
  );
}

function readCleanExecutionLock(projectRoot, taskId) {
  const path = cleanExecutionLockPath(projectRoot, taskId);
  const raw =
    readCleanAuthorityFile(path, EXECUTION_LOCK_MAX_PROJECTION_BYTES);
  if (raw === null) return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
  }
  const lock = parseExecutionLockProjection(value, taskId);
  if (lock === null) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
  }
  return { raw, lock, path };
}

function scanCleanExecutionAuthority(
  projectRoot,
  active = [],
  options = {},
) {
  const locksDir = cleanExecutionAuthorityDirectory(projectRoot);
  let directory;
  try {
    directory = opendirSync(locksDir);
  } catch {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', locksDir);
  }
  const projections = [];
  const activeByOwner = new Map(active.map(lock => [lock.ownerId, lock]));
  try {
    let entry;
    while ((entry = directory.readSync()) !== null) {
      if (!entry.name.includes('.executionlock')) continue;
      const path = join(locksDir, entry.name);
      const staging = entry.name.match(
        /^([0-9a-f]{64})\.executionlock\.tmp-([0-9a-f-]{36})$/iu,
      );
      if (staging !== null) {
        cleanAuthorityPathIdentity(
          path,
          EXECUTION_LOCK_MAX_PROJECTION_BYTES,
        );
        const owner = activeByOwner.get(staging[2]);
        if (owner === undefined) {
          unlinkSync(path);
          fsyncCleanExecutionAuthorityDirectory(locksDir);
          continue;
        }
        if (sha256(owner.taskId) !== staging[1].toLowerCase()) {
          throw codedError(
            'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
            path,
          );
        }
        const localIdentity =
          options.runtimeIdentity ?? CLEAN_EXECUTION_LOCK_RUNTIME_IDENTITY;
        const state = options.livenessProbe
          ? options.livenessProbe(owner, localIdentity)
          : defaultCleanExecutionOwnerState(owner, localIdentity);
        if (state === 'dead') {
          unlinkSync(path);
          fsyncCleanExecutionAuthorityDirectory(locksDir);
          continue;
        }
        throw codedError(
          owner.taskId === PROJECT_MAINTENANCE_LOCK_TASK_ID
            ? 'E_CLEAN_MAINTENANCE_AUTHORITY_HELD'
            : 'E_CLEAN_PROJECT_ACTIVE',
          owner.taskId,
        );
      }
      if (!entry.isFile()
        || entry.isSymbolicLink()
        || !EXECUTION_LOCK_FILE_RE.test(entry.name)) {
        throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
      }
      const raw =
        readCleanAuthorityFile(path, EXECUTION_LOCK_MAX_PROJECTION_BYTES);
      let value;
      try {
        value = raw === null ? null : JSON.parse(raw);
      } catch {
        throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
      }
      let lock = parseExecutionLockProjection(value);
      if (lock === null) {
        const legacy = parseLegacyV2ExecutionLockProjection(value);
        lock = legacy === null
          ? null
          : active.find(candidate =>
            cleanExecutionGenerationEquals(candidate, legacy)
            && JSON.stringify(candidate) === JSON.stringify(legacy)) ?? null;
      }
      if (raw === null
        || lock === null
        || basename(cleanExecutionLockPath(projectRoot, lock.taskId))
          !== entry.name) {
        throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
      }
      projections.push({ raw, lock, path });
    }
  } finally {
    try {
      directory.closeSync();
    } catch {
      // Preserve the scan result or first authority error.
    }
  }
  return projections;
}

function cleanAuthorityPathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false;
    }
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
  }
}

function cleanAuthorityPathIdentity(path, maxBytes) {
  try {
    const entry = lstatSync(path);
    if (!entry.isFile()
      || entry.isSymbolicLink()
      || entry.nlink !== 1
      || entry.size > maxBytes
      || !Number.isSafeInteger(entry.dev)
      || !Number.isSafeInteger(entry.ino)
      || (entry.dev === 0 && entry.ino === 0)) {
      throw new Error('unsafe-authority-path');
    }
    return { dev: entry.dev, ino: entry.ino };
  } catch {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
  }
}

function cleanAuthorityIdentityEquals(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function readCleanExecutionAuthorityAnchor(anchorPath) {
  if (!cleanAuthorityPathExists(anchorPath)) return null;
  const identity =
    cleanAuthorityPathIdentity(anchorPath, EXECUTION_LOCK_MAX_ANCHOR_BYTES);
  const raw =
    readCleanAuthorityFile(anchorPath, EXECUTION_LOCK_MAX_ANCHOR_BYTES);
  let value;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', anchorPath);
  }
  const anchor = parseCleanExecutionAuthorityAnchor(value);
  if (raw === null
    || anchor === null
    || JSON.stringify(anchor) !== raw) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', anchorPath);
  }
  const after =
    cleanAuthorityPathIdentity(anchorPath, EXECUTION_LOCK_MAX_ANCHOR_BYTES);
  if (!cleanAuthorityIdentityEquals(identity, after)) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', anchorPath);
  }
  return { anchor, raw, identity };
}

function createCleanExecutionAuthorityAnchor(
  pinned,
  anchorPath,
  authorityEpoch,
  createdAt,
) {
  const anchor = {
    schemaVersion: 1,
    authorityEpoch,
    project: pinned.projectIdentity,
    locks: pinned.locksIdentity,
    createdAt,
  };
  const raw = JSON.stringify(anchor);
  let fd;
  try {
    fd = openSync(
      anchorPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fd, raw, 'utf8');
    fsyncSync(fd);
    const opened = fstatSync(fd);
    if (!opened.isFile()
      || opened.nlink !== 1
      || opened.size !== Buffer.byteLength(raw, 'utf8')) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        anchorPath,
      );
    }
    closeSync(fd);
    fd = undefined;
    fsyncCleanExecutionAuthorityDirectory(pinned.stableRootPath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      return false;
    }
    throw error;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the anchor creation failure.
      }
    }
  }
}

function assertCleanExecutionAuthorityAnchorBinding(anchor, pinned) {
  if (!cleanExecutionStableDirectoryIdentityEquals(
    anchor.project,
    pinned.projectIdentity,
  )
    || !cleanExecutionStableDirectoryIdentityEquals(
      anchor.locks,
      pinned.locksIdentity,
    )) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_EPOCH_MISMATCH',
      pinned.inputProjectRoot,
    );
  }
}

function fsyncCleanExecutionAuthorityDirectory(locksDir) {
  let fd;
  try {
    fd = openSync(
      locksDir,
      fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0),
    );
    fsyncSync(fd);
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED',
      locksDir,
    );
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the durable-sync failure.
      }
    }
  }
}

function assertCleanExecutionAuthorityFilesystem(locksDir) {
  if (typeof fsConstants.O_NOFOLLOW !== 'number'
    || fsConstants.O_NOFOLLOW === 0) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED',
      locksDir,
    );
  }
  const entry = lstatSync(locksDir);
  if (!Number.isSafeInteger(entry.dev)
    || !Number.isSafeInteger(entry.ino)
    || (entry.dev === 0 && entry.ino === 0)) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED',
      locksDir,
    );
  }
}

function createCleanExecutionAuthoritySentinel(
  locksDir,
  sentinelPath,
  authorityEpoch = randomUUID(),
  createdAt = new Date().toISOString(),
) {
  const sentinel = {
    schemaVersion: EXECUTION_LOCK_AUTHORITY_SENTINEL_SCHEMA_VERSION,
    authorityEpoch,
    createdAt,
  };
  const raw = JSON.stringify(sentinel);
  let fd;
  try {
    fd = openSync(
      sentinelPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fd, raw, 'utf8');
    fsyncSync(fd);
    const opened = fstatSync(fd);
    if (!opened.isFile()
      || opened.nlink !== 1
      || opened.size !== Buffer.byteLength(raw, 'utf8')) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        sentinelPath,
      );
    }
    closeSync(fd);
    fd = undefined;
    fsyncCleanExecutionAuthorityDirectory(locksDir);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      return false;
    }
    throw error;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the sentinel creation failure.
      }
    }
  }
}

function createCleanExecutionAuthorityDatabase(locksDir, dbPath) {
  let fd;
  try {
    fd = openSync(
      dbPath,
      fsConstants.O_RDWR
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    fsyncCleanExecutionAuthorityDirectory(locksDir);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      return false;
    }
    throw error;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the database creation failure.
      }
    }
  }
}

function waitForCleanExecutionAuthorityDatabase(dbPath) {
  const deadline = Date.now() + EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS;
  const waiter = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < deadline) {
    if (cleanAuthorityPathExists(dbPath)) return true;
    Atomics.wait(waiter, 0, 0, 10);
  }
  return cleanAuthorityPathExists(dbPath);
}

function validateCleanExecutionAuthoritySidecars(dbPath) {
  for (const suffix of ['-wal', '-shm']) {
    if (cleanAuthorityPathExists(`${dbPath}${suffix}`)) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        `${dbPath}${suffix}`,
      );
    }
  }
  const journalPath = `${dbPath}-journal`;
  if (cleanAuthorityPathExists(journalPath)) {
    cleanAuthorityPathIdentity(journalPath, EXECUTION_LOCK_MAX_DB_BYTES);
  }
}

function readCleanExecutionAuthoritySentinel(sentinelPath) {
  const identity = cleanAuthorityPathIdentity(
    sentinelPath,
    EXECUTION_LOCK_MAX_SENTINEL_BYTES,
  );
  const raw = readCleanAuthorityFile(
    sentinelPath,
    EXECUTION_LOCK_MAX_SENTINEL_BYTES,
  );
  let value;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      sentinelPath,
    );
  }
  const sentinel = parseExecutionLockAuthoritySentinel(value);
  if (raw === null
    || sentinel === null
    || JSON.stringify(sentinel) !== raw) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      sentinelPath,
    );
  }
  const after = cleanAuthorityPathIdentity(
    sentinelPath,
    EXECUTION_LOCK_MAX_SENTINEL_BYTES,
  );
  if (!cleanAuthorityIdentityEquals(identity, after)) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      sentinelPath,
    );
  }
  return { sentinel, raw, identity };
}

function prepareCleanExecutionAuthority(projectRoot) {
  const pinned = pinCleanExecutionAuthorityDirectories(projectRoot);
  try {
    validatePinnedCleanExecutionAuthorityDirectories(pinned);
    assertCleanExecutionAuthorityFilesystem(pinned.stableLocksPath);
    // Prove both durability boundaries before writing the dual anchor.
    fsyncCleanExecutionAuthorityDirectory(pinned.stableRootPath);
    fsyncCleanExecutionAuthorityDirectory(pinned.stableLocksPath);
    const locksDir = pinned.stableLocksPath;
    const authority = Object.freeze({
      kind: 'pinned-clean-execution-authority',
      rootDir: pinned.stableRootPath,
      locksDir,
    });
    const dbPath = join(locksDir, EXECUTION_LOCK_COORDINATION_DB_FILENAME);
    const sentinelPath =
      join(locksDir, EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME);
    const anchorPath = join(
      pinned.stableRootPath,
      EXECUTION_LOCK_AUTHORITY_ANCHOR_FILENAME,
    );
    let dbExists = cleanAuthorityPathExists(dbPath);
    let sentinelExists = cleanAuthorityPathExists(sentinelPath);
    let initializeDatabase = false;
    let sentinelRead = sentinelExists
      ? readCleanExecutionAuthoritySentinel(sentinelPath)
      : null;
    let anchorRead = readCleanExecutionAuthorityAnchor(anchorPath);
    let createdAnchor = false;

    if (anchorRead === null) {
      if (dbExists !== sentinelExists) {
        throw codedError(
          'E_CLEAN_MAINTENANCE_AUTHORITY_STATE_MISSING',
          locksDir,
        );
      }
      if (dbExists && sentinelRead !== null) {
        createdAnchor = createCleanExecutionAuthorityAnchor(
          pinned,
          anchorPath,
          sentinelRead.sentinel.authorityEpoch,
          sentinelRead.sentinel.createdAt,
        );
      } else {
        const authorityArtifacts = readdirSync(
          locksDir,
          { withFileTypes: true },
        ).filter(entry =>
          entry.name === EXECUTION_LOCK_COORDINATION_DB_FILENAME
          || entry.name.startsWith(
            `${EXECUTION_LOCK_COORDINATION_DB_FILENAME}-`,
          )
          || entry.name === EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME
          || entry.name.includes('.executionlock'));
        if (authorityArtifacts.length > 0) {
          throw codedError(
            'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
            locksDir,
          );
        }
        createdAnchor = createCleanExecutionAuthorityAnchor(
          pinned,
          anchorPath,
          randomUUID(),
          new Date().toISOString(),
        );
      }
      anchorRead = readCleanExecutionAuthorityAnchor(anchorPath);
    }
    if (anchorRead === null) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_STATE_MISSING',
        anchorPath,
      );
    }
    assertCleanExecutionAuthorityAnchorBinding(anchorRead.anchor, pinned);

    if (!dbExists && !sentinelExists && createdAnchor) {
      const createdSentinel = createCleanExecutionAuthoritySentinel(
        locksDir,
        sentinelPath,
        anchorRead.anchor.authorityEpoch,
        anchorRead.anchor.createdAt,
      );
      sentinelExists = true;
      if (!createdSentinel) {
        throw codedError(
          'E_CLEAN_MAINTENANCE_AUTHORITY_STATE_MISSING',
          sentinelPath,
        );
      }
      initializeDatabase =
        createCleanExecutionAuthorityDatabase(locksDir, dbPath);
      dbExists = true;
      if (!initializeDatabase) {
        throw codedError(
          'E_CLEAN_MAINTENANCE_AUTHORITY_STATE_MISSING',
          dbPath,
        );
      }
    } else if (!dbExists || !sentinelExists) {
      const deadline = Date.now() + EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS;
      const waiter = new Int32Array(new SharedArrayBuffer(4));
      while (Date.now() < deadline && (!dbExists || !sentinelExists)) {
        Atomics.wait(waiter, 0, 0, 10);
        dbExists = cleanAuthorityPathExists(dbPath);
        sentinelExists = cleanAuthorityPathExists(sentinelPath);
      }
    }
    if (!sentinelExists || !dbExists) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_STATE_MISSING',
        locksDir,
      );
    }

    sentinelRead = readCleanExecutionAuthoritySentinel(sentinelPath);
    if (sentinelRead.sentinel.authorityEpoch
      !== anchorRead.anchor.authorityEpoch) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_EPOCH_MISMATCH',
        sentinelPath,
      );
    }
    validateCleanExecutionAuthoritySidecars(dbPath);
    const dbIdentity =
      cleanAuthorityPathIdentity(dbPath, EXECUTION_LOCK_MAX_DB_BYTES);
    validatePinnedCleanExecutionAuthorityDirectories(pinned);
    return {
      pinned,
      authority,
      anchorPath,
      anchorIdentity: anchorRead.identity,
      anchorRaw: anchorRead.raw,
      anchor: anchorRead.anchor,
      dbPath,
      dbIdentity,
      initializeDatabase,
      sentinelPath,
      sentinelIdentity: sentinelRead.identity,
      sentinel: sentinelRead.sentinel,
      sentinelRaw: sentinelRead.raw,
    };
  } catch (error) {
    closePinnedCleanExecutionAuthorityDirectories(pinned);
    throw error;
  }
}

function validatePreparedCleanExecutionAuthority(files) {
  validatePinnedCleanExecutionAuthorityDirectories(files.pinned);
  validateCleanExecutionAuthoritySidecars(files.dbPath);
  const dbIdentity =
    cleanAuthorityPathIdentity(files.dbPath, EXECUTION_LOCK_MAX_DB_BYTES);
  const anchorRead =
    readCleanExecutionAuthorityAnchor(files.anchorPath);
  const sentinelRead =
    readCleanExecutionAuthoritySentinel(files.sentinelPath);
  if (anchorRead === null
    || !cleanAuthorityIdentityEquals(
      files.anchorIdentity,
      anchorRead.identity,
    )
    || anchorRead.raw !== files.anchorRaw
    || JSON.stringify(anchorRead.anchor) !== JSON.stringify(files.anchor)
    || !cleanAuthorityIdentityEquals(files.dbIdentity, dbIdentity)
    || !cleanAuthorityIdentityEquals(
      files.sentinelIdentity,
      sentinelRead.identity,
    )
    || sentinelRead.raw !== files.sentinelRaw
    || sentinelRead.sentinel.authorityEpoch
      !== files.anchor.authorityEpoch) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      files.dbPath,
    );
  }
}

function createCleanExecutionQuarantineSchema(db) {
  db.exec(`
    CREATE TABLE execution_lock_quarantine (
      task_id TEXT NOT NULL PRIMARY KEY,
      quarantine_id TEXT NOT NULL UNIQUE CHECK(length(quarantine_id) = 36),
      owner_id TEXT NOT NULL UNIQUE CHECK(length(owner_id) = 36),
      fencing_epoch TEXT NOT NULL CHECK(length(fencing_epoch) = 36),
      fencing_counter INTEGER NOT NULL CHECK(fencing_counter > 0),
      fencing_nonce TEXT NOT NULL CHECK(
        length(fencing_nonce) = 32
        AND fencing_nonce NOT GLOB '*[^0-9a-f]*'
      ),
      state TEXT NOT NULL CHECK(state IN ('in-flight', 'quarantined')),
      reason TEXT NOT NULL CHECK(reason IN (
        'irreversible-boundary',
        'partial-mutation',
        'heartbeat-fault',
        'release-fault',
        'authority-uncertain',
        'legacy-v2-active'
      )),
      entered_at TEXT NOT NULL,
      quarantined_at TEXT,
      payload_json TEXT NOT NULL,
      CHECK(
        (state = 'in-flight'
          AND reason = 'irreversible-boundary'
          AND quarantined_at IS NULL)
        OR
        (state = 'quarantined'
          AND reason <> 'irreversible-boundary'
          AND quarantined_at IS NOT NULL)
      ),
      UNIQUE(fencing_epoch, fencing_counter, fencing_nonce)
    ) STRICT, WITHOUT ROWID;
    CREATE TABLE execution_lock_quarantine_audit (
      event_id TEXT NOT NULL PRIMARY KEY CHECK(length(event_id) = 36),
      action TEXT NOT NULL CHECK(action IN (
        'boundary-entered',
        'quarantined',
        'completed',
        'recovered'
      )),
      quarantine_id TEXT NOT NULL CHECK(length(quarantine_id) = 36),
      task_id TEXT NOT NULL,
      owner_id TEXT NOT NULL CHECK(length(owner_id) = 36),
      fencing_epoch TEXT NOT NULL CHECK(length(fencing_epoch) = 36),
      fencing_counter INTEGER NOT NULL CHECK(fencing_counter > 0),
      fencing_nonce TEXT NOT NULL CHECK(
        length(fencing_nonce) = 32
        AND fencing_nonce NOT GLOB '*[^0-9a-f]*'
      ),
      occurred_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE(quarantine_id, action)
    ) STRICT, WITHOUT ROWID;
    CREATE UNIQUE INDEX execution_lock_quarantine_one_terminal
      ON execution_lock_quarantine_audit(quarantine_id)
      WHERE action IN ('completed', 'recovered');
    CREATE TRIGGER execution_lock_quarantine_monotonic_update
    BEFORE UPDATE ON execution_lock_quarantine
    WHEN NOT (
      NEW.task_id = OLD.task_id
      AND NEW.quarantine_id = OLD.quarantine_id
      AND NEW.owner_id = OLD.owner_id
      AND NEW.fencing_epoch = OLD.fencing_epoch
      AND NEW.fencing_counter = OLD.fencing_counter
      AND NEW.fencing_nonce = OLD.fencing_nonce
      AND NEW.entered_at = OLD.entered_at
      AND (
        (
          OLD.state = 'in-flight'
          AND NEW.state = 'in-flight'
          AND NEW.reason = OLD.reason
          AND OLD.quarantined_at IS NULL
          AND NEW.quarantined_at IS NULL
        )
        OR
        (
          OLD.state = 'in-flight'
          AND NEW.state = 'quarantined'
          AND OLD.quarantined_at IS NULL
          AND NEW.quarantined_at IS NOT NULL
        )
      )
    )
    BEGIN
      SELECT RAISE(ABORT, 'execution lock quarantine transition is not monotonic');
    END;
    CREATE TRIGGER execution_lock_quarantine_terminal_delete
    BEFORE DELETE ON execution_lock_quarantine
    WHEN NOT EXISTS (
      SELECT 1
        FROM execution_lock_quarantine_audit
       WHERE quarantine_id = OLD.quarantine_id
         AND task_id = OLD.task_id
         AND owner_id = OLD.owner_id
         AND fencing_epoch = OLD.fencing_epoch
         AND fencing_counter = OLD.fencing_counter
         AND fencing_nonce = OLD.fencing_nonce
         AND action IN ('completed', 'recovered')
    )
    BEGIN
      SELECT RAISE(ABORT, 'execution lock quarantine delete requires terminal audit');
    END;
    CREATE TRIGGER execution_lock_quarantine_audit_no_update
    BEFORE UPDATE ON execution_lock_quarantine_audit
    BEGIN
      SELECT RAISE(ABORT, 'execution lock quarantine audit is append-only');
    END;
    CREATE TRIGGER execution_lock_quarantine_audit_no_delete
    BEFORE DELETE ON execution_lock_quarantine_audit
    BEGIN
      SELECT RAISE(ABORT, 'execution lock quarantine audit is append-only');
    END;
  `);
}

function validateCleanExecutionDatabaseSchema(db) {
  const required = new Map([
    ['execution_lock_meta', {
      type: 'table',
      fragments: [
        'check(singleton = 1)',
        'check(meta_version = 3)',
        'check(fencing_counter >= 0)',
        ') strict',
      ],
    }],
    ['execution_lock_active', {
      type: 'table',
      fragments: [
        'task_id text not null primary key',
        'owner_id text not null unique',
        'unique(fencing_epoch, fencing_counter, fencing_nonce)',
        ') strict, without rowid',
      ],
    }],
    ['execution_lock_quarantine', {
      type: 'table',
      fragments: [
        "check(state in ('in-flight', 'quarantined'))",
        "reason text not null check(reason in ( 'irreversible-boundary'",
        "and reason = 'irreversible-boundary'",
        "and reason <> 'irreversible-boundary'",
        'unique(fencing_epoch, fencing_counter, fencing_nonce)',
        ') strict, without rowid',
      ],
    }],
    ['execution_lock_quarantine_audit', {
      type: 'table',
      fragments: [
        "action text not null check(action in ( 'boundary-entered'",
        'unique(quarantine_id, action)',
        ') strict, without rowid',
      ],
    }],
    ['execution_lock_quarantine_one_terminal', {
      type: 'index',
      fragments: [
        'on execution_lock_quarantine_audit(quarantine_id)',
        "where action in ('completed', 'recovered')",
      ],
    }],
    ['execution_lock_quarantine_monotonic_update', {
      type: 'trigger',
      fragments: [
        'before update on execution_lock_quarantine',
        "old.state = 'in-flight'",
        "new.state = 'quarantined'",
        "raise(abort, 'execution lock quarantine transition is not monotonic')",
      ],
    }],
    ['execution_lock_quarantine_terminal_delete', {
      type: 'trigger',
      fragments: [
        'before delete on execution_lock_quarantine',
        "action in ('completed', 'recovered')",
        "raise(abort, 'execution lock quarantine delete requires terminal audit')",
      ],
    }],
    ['execution_lock_quarantine_audit_no_update', {
      type: 'trigger',
      fragments: [
        'before update on execution_lock_quarantine_audit',
        "raise(abort, 'execution lock quarantine audit is append-only')",
      ],
    }],
    ['execution_lock_quarantine_audit_no_delete', {
      type: 'trigger',
      fragments: [
        'before delete on execution_lock_quarantine_audit',
        "raise(abort, 'execution lock quarantine audit is append-only')",
      ],
    }],
  ]);
  let rows;
  try {
    rows = db.prepare(`
      SELECT type, name, sql
        FROM sqlite_master
       WHERE name IN (${[...required].map(() => '?').join(', ')})
    `).all(...required.keys());
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      'schema-objects',
    );
  }
  if (rows.length !== required.size) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      'schema-objects',
    );
  }
  for (const row of rows) {
    const contract = typeof row.name === 'string'
      ? required.get(row.name)
      : undefined;
    const sql = typeof row.sql === 'string'
      ? row.sql.replace(/\s+/gu, ' ').trim().toLowerCase()
      : '';
    if (contract === undefined
      || row.type !== contract.type
      || contract.fragments.some(fragment => !sql.includes(fragment))) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        String(row.name),
      );
    }
  }
}

function readCleanExecutionMeta(db, sentinel, expectedVersion) {
  const rows = db.prepare(`
    SELECT singleton, meta_version, authority_epoch, fencing_counter
      FROM execution_lock_meta
  `).all();
  if (rows.length !== 1
    || rows[0]?.singleton !== 1
    || rows[0]?.meta_version !== expectedVersion
    || typeof rows[0]?.authority_epoch !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(rows[0].authority_epoch)
    || !Number.isSafeInteger(rows[0]?.fencing_counter)
    || rows[0].fencing_counter < 0) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', 'metadata');
  }
  if (rows[0].authority_epoch !== sentinel.authorityEpoch) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_EPOCH_MISMATCH',
      'metadata',
    );
  }
  return rows[0];
}

function deterministicCleanExecutionUuid(namespace, lock) {
  const digest = createHash('sha256')
    .update(namespace)
    .update('\0')
    .update(lock.taskId)
    .update('\0')
    .update(lock.ownerId)
    .update('\0')
    .update(lock.fencingToken.epoch)
    .update('\0')
    .update(String(lock.fencingToken.counter))
    .update('\0')
    .update(lock.fencingToken.nonce)
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function initializeCleanExecutionAuthorityDatabase(
  db,
  sentinel,
  allowInitialization,
) {
  const userVersion = db.pragma('user_version', { simple: true });
  if (userVersion === 0 && !allowInitialization) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_STATE_MISSING',
      'user_version',
    );
  }
  if (userVersion !== 0
    && userVersion !== 2
    && userVersion !== EXECUTION_LOCK_DB_META_VERSION) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', 'user_version');
  }
  if (userVersion === 0) {
    db.exec(`
      CREATE TABLE execution_lock_meta (
        singleton INTEGER NOT NULL PRIMARY KEY CHECK(singleton = 1),
        meta_version INTEGER NOT NULL CHECK(meta_version = 3),
        authority_epoch TEXT NOT NULL CHECK(length(authority_epoch) = 36),
        fencing_counter INTEGER NOT NULL CHECK(fencing_counter >= 0)
      ) STRICT;
      CREATE TABLE execution_lock_active (
        task_id TEXT NOT NULL PRIMARY KEY,
        owner_id TEXT NOT NULL UNIQUE,
        fencing_epoch TEXT NOT NULL CHECK(length(fencing_epoch) = 36),
        fencing_counter INTEGER NOT NULL CHECK(fencing_counter > 0),
        fencing_nonce TEXT NOT NULL CHECK(
          length(fencing_nonce) = 32
          AND fencing_nonce NOT GLOB '*[^0-9a-f]*'
        ),
        payload_json TEXT NOT NULL,
        UNIQUE(fencing_epoch, fencing_counter, fencing_nonce)
      ) STRICT, WITHOUT ROWID;
    `);
    createCleanExecutionQuarantineSchema(db);
    db.prepare(`
      INSERT INTO execution_lock_meta(
        singleton, meta_version, authority_epoch, fencing_counter
      ) VALUES (1, 3, ?, 0)
    `).run(sentinel.authorityEpoch);
    db.pragma(`user_version = ${EXECUTION_LOCK_DB_META_VERSION}`);
  }

  if (userVersion === 2) {
    readCleanExecutionMeta(db, sentinel, 2);
    const legacyActive = loadLegacyCleanExecutionActiveRows(db);
    db.exec(`
      ALTER TABLE execution_lock_meta
        RENAME TO execution_lock_meta_v2;
      CREATE TABLE execution_lock_meta (
        singleton INTEGER NOT NULL PRIMARY KEY CHECK(singleton = 1),
        meta_version INTEGER NOT NULL CHECK(meta_version = 3),
        authority_epoch TEXT NOT NULL CHECK(length(authority_epoch) = 36),
        fencing_counter INTEGER NOT NULL CHECK(fencing_counter >= 0)
      ) STRICT;
      INSERT INTO execution_lock_meta(
        singleton, meta_version, authority_epoch, fencing_counter
      )
      SELECT singleton, 3, authority_epoch, fencing_counter
        FROM execution_lock_meta_v2;
      DROP TABLE execution_lock_meta_v2;
    `);
    createCleanExecutionQuarantineSchema(db);
    for (const { lock, originalPayload } of legacyActive) {
      const normalized = db.prepare(`
        UPDATE execution_lock_active
           SET payload_json = ?
         WHERE task_id = ?
           AND owner_id = ?
           AND fencing_epoch = ?
           AND fencing_counter = ?
           AND fencing_nonce = ?
           AND payload_json = ?
      `).run(
        JSON.stringify(lock),
        lock.taskId,
        lock.ownerId,
        lock.fencingToken.epoch,
        lock.fencingToken.counter,
        lock.fencingToken.nonce,
        originalPayload,
      );
      if (normalized.changes !== 1) {
        throw codedError(
          'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
          lock.taskId,
        );
      }
      const quarantine = {
        schemaVersion: EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION,
        quarantineId: deterministicCleanExecutionUuid(
          'deckent:v2-quarantine',
          lock,
        ),
        lock,
        state: 'quarantined',
        reason: 'legacy-v2-active',
        evidenceRefs: [
          'effective-hold:legacy-last-renewal',
          'migration:execution-lock-db-v2',
          `payload-sha256:${sha256(originalPayload)}`,
        ],
        enteredAt: lock.renewedAt,
        quarantinedAt: lock.renewedAt,
      };
      insertCleanExecutionQuarantineRow(db, quarantine);
      appendCleanExecutionQuarantineAudit(
        db,
        createCleanExecutionQuarantineAudit(
          'quarantined',
          quarantine,
          quarantine,
          lock.renewedAt,
          deterministicCleanExecutionUuid(
            'deckent:v2-quarantine-audit',
            lock,
          ),
        ),
      );
    }
    db.pragma(`user_version = ${EXECUTION_LOCK_DB_META_VERSION}`);
  }

  readCleanExecutionMeta(db, sentinel, EXECUTION_LOCK_DB_META_VERSION);
  validateCleanExecutionDatabaseSchema(db);
  return userVersion === 2;
}

function withCleanExecutionAuthorityMutation(projectRoot, operation) {
  const files = prepareCleanExecutionAuthority(projectRoot);
  let Database;
  try {
    const module = loadModule('better-sqlite3');
    Database = module.default ?? module;
  } catch {
    closePinnedCleanExecutionAuthorityDirectories(files.pinned);
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      files.dbPath,
    );
  }

  let db;
  let transactionOpen = false;
  let finalCommitAttempted = false;
  let finalCommitSucceeded = false;
  try {
    db = new Database(files.dbPath, {
      fileMustExist: true,
      timeout: EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS,
    });
    validatePreparedCleanExecutionAuthority(files);
    const databaseList = db.pragma('database_list');
    const main = databaseList.find(row => row.name === 'main');
    if (!main
      || typeof main.file !== 'string'
      || !canonicalPathEquals(
        realpathSync.native(main.file),
        realpathSync.native(files.dbPath),
      )) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        files.dbPath,
      );
    }
    db.pragma(`busy_timeout = ${EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS}`);
    if (db.pragma('journal_mode', { simple: true }) !== 'delete') {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        files.dbPath,
      );
    }
    db.pragma('synchronous = FULL');
    db.pragma('trusted_schema = OFF');
    db.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    const migrated = initializeCleanExecutionAuthorityDatabase(
      db,
      files.sentinel,
      files.initializeDatabase,
    );
    if (migrated) {
      validatePreparedCleanExecutionAuthority(files);
      db.exec('COMMIT');
      transactionOpen = false;
      validatePreparedCleanExecutionAuthority(files);
      db.exec('BEGIN IMMEDIATE');
      transactionOpen = true;
      if (initializeCleanExecutionAuthorityDatabase(
        db,
        files.sentinel,
        false,
      )) {
        throw codedError(
          'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
          'migration-replay',
        );
      }
    }
    const result = operation(db, files.authority);
    validatePreparedCleanExecutionAuthority(files);
    finalCommitAttempted = true;
    db.exec('COMMIT');
    finalCommitSucceeded = true;
    transactionOpen = false;
    validatePreparedCleanExecutionAuthority(files);
    db.close();
    db = undefined;
    validatePreparedCleanExecutionAuthority(files);
    return result;
  } catch (error) {
    if (transactionOpen && db) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Preserve the first authority failure.
      }
    }
    if (finalCommitAttempted) {
      const source = error && typeof error === 'object' ? error : null;
      const code = source
        && typeof source.code === 'string'
        && source.code.startsWith('E_CLEAN_')
        ? source.code
        : 'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID';
      const wrapped = codedError(
        code,
        files.dbPath,
        source?.report,
      );
      wrapped.canonicalCommitState =
        finalCommitSucceeded ? 'committed' : 'uncertain';
      if (source?.recoveryLock !== undefined) {
        wrapped.recoveryLock = source.recoveryLock;
      }
      throw wrapped;
    }
    if (error && typeof error === 'object'
      && typeof error.code === 'string'
      && error.code.startsWith('E_CLEAN_')) {
      throw error;
    }
    const sqliteCode = error && typeof error === 'object'
      ? error.code
      : undefined;
    throw codedError(
      sqliteCode === 'SQLITE_BUSY' || sqliteCode === 'SQLITE_LOCKED'
        ? 'E_CLEAN_MAINTENANCE_AUTHORITY_BUSY'
        : 'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      files.dbPath,
    );
  } finally {
    try {
      db?.close();
    } catch {
      // The committed/rolled-back transaction is already authoritative.
    }
    closePinnedCleanExecutionAuthorityDirectories(files.pinned);
  }
}

function withPinnedCleanExecutionAuthority(projectRoot, operation) {
  const files = prepareCleanExecutionAuthority(projectRoot);
  try {
    validatePreparedCleanExecutionAuthority(files);
    const result = operation(files.authority);
    validatePreparedCleanExecutionAuthority(files);
    return result;
  } finally {
    closePinnedCleanExecutionAuthorityDirectories(files.pinned);
  }
}

function allocateCleanExecutionFencingToken(db) {
  const row = db.prepare(`
    UPDATE execution_lock_meta
       SET fencing_counter = fencing_counter + 1
     WHERE singleton = 1
       AND fencing_counter < 9007199254740991
    RETURNING authority_epoch, fencing_counter
  `).get();
  if (!row
    || typeof row.authority_epoch !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(row.authority_epoch)
    || !Number.isSafeInteger(row.fencing_counter)
    || row.fencing_counter <= 0) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_BUSY',
      'fencing-counter',
    );
  }
  return {
    epoch: row.authority_epoch,
    counter: row.fencing_counter,
    nonce: randomBytes(16).toString('hex'),
  };
}

function parseCleanExecutionActiveRow(row, legacy = false) {
  let value;
  try {
    value = JSON.parse(row.payload_json);
  } catch {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', row.task_id);
  }
  const lock = legacy
    ? parseLegacyV2ExecutionLockProjection(value, row.task_id)
    : parseExecutionLockProjection(value, row.task_id);
  if (lock === null
    || lock.ownerId !== row.owner_id
    || lock.fencingToken.epoch !== row.fencing_epoch
    || lock.fencingToken.counter !== row.fencing_counter
    || lock.fencingToken.nonce !== row.fencing_nonce
    || (!legacy && JSON.stringify(lock) !== row.payload_json)) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', row.task_id);
  }
  return legacy ? { lock, originalPayload: row.payload_json } : lock;
}

function loadCleanExecutionActivePage(db, afterTaskId, legacy = false) {
  let rows;
  try {
    rows = db.prepare(`
      SELECT task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
             payload_json
        FROM execution_lock_active
       WHERE task_id > ?
       ORDER BY task_id
       LIMIT ?
    `).all(afterTaskId, EXECUTION_LOCK_QUERY_PAGE_SIZE);
  } catch {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', 'active-table');
  }
  return rows.map(row => parseCleanExecutionActiveRow(row, legacy));
}

function loadCleanExecutionActiveRow(db, taskId) {
  let row;
  try {
    row = db.prepare(`
      SELECT task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
             payload_json
        FROM execution_lock_active
       WHERE task_id = ?
    `).get(taskId);
  } catch {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', taskId);
  }
  return row === undefined ? undefined : parseCleanExecutionActiveRow(row);
}

function loadLegacyCleanExecutionActiveRows(db) {
  const locks = [];
  let cursor = '';
  while (true) {
    const page = loadCleanExecutionActivePage(db, cursor, true);
    locks.push(...page);
    if (page.length < EXECUTION_LOCK_QUERY_PAGE_SIZE) break;
    cursor = page.at(-1).lock.taskId;
  }
  return locks;
}

function cleanExecutionGenerationEquals(left, right) {
  return left.taskId === right.taskId
    && left.ownerId === right.ownerId
    && executionLockFencingTokenEquals(
      left.fencingToken,
      right.fencingToken,
    );
}

function loadCleanExecutionQuarantineAudits(db) {
  let rows;
  try {
    rows = db.prepare(`
      SELECT audit.event_id, audit.action, audit.quarantine_id, audit.task_id,
             audit.owner_id, audit.fencing_epoch, audit.fencing_counter,
             audit.fencing_nonce, audit.occurred_at, audit.payload_json
        FROM execution_lock_quarantine_audit AS audit
        JOIN execution_lock_quarantine AS quarantine
          ON quarantine.quarantine_id = audit.quarantine_id
       WHERE (
         quarantine.state = 'in-flight'
         AND audit.action = 'boundary-entered'
       ) OR (
         quarantine.state = 'quarantined'
         AND audit.action = 'quarantined'
       )
       ORDER BY audit.occurred_at, audit.event_id
    `).all();
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      'quarantine-audit',
    );
  }
  return rows.map(row => {
    let value;
    try {
      value = JSON.parse(row.payload_json);
    } catch {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        row.event_id,
      );
    }
    const event = parseCleanExecutionQuarantineAudit(value);
    if (event === null
      || event.eventId !== row.event_id
      || event.action !== row.action
      || event.quarantineId !== row.quarantine_id
      || event.taskId !== row.task_id
      || event.ownerId !== row.owner_id
      || event.fencingToken.epoch !== row.fencing_epoch
      || event.fencingToken.counter !== row.fencing_counter
      || event.fencingToken.nonce !== row.fencing_nonce
      || event.occurredAt !== row.occurred_at
      || JSON.stringify(event) !== row.payload_json) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        row.event_id,
      );
    }
    return event;
  });
}

function loadCleanExecutionQuarantineRows(db, active) {
  let rows;
  try {
    rows = db.prepare(`
      SELECT task_id, quarantine_id, owner_id, fencing_epoch, fencing_counter,
             fencing_nonce, state, reason, entered_at, quarantined_at,
             payload_json
        FROM execution_lock_quarantine
       ORDER BY task_id
    `).all();
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      'quarantine-table',
    );
  }
  const activeByTask = new Map(active.map(lock => [lock.taskId, lock]));
  const quarantines = rows.map(row => {
    let value;
    try {
      value = JSON.parse(row.payload_json);
    } catch {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        row.task_id,
      );
    }
    const quarantine =
      parseCleanExecutionQuarantine(value, row.task_id);
    const activeLock = activeByTask.get(row.task_id);
    if (quarantine === null
      || quarantine.quarantineId !== row.quarantine_id
      || quarantine.lock.ownerId !== row.owner_id
      || quarantine.lock.fencingToken.epoch !== row.fencing_epoch
      || quarantine.lock.fencingToken.counter !== row.fencing_counter
      || quarantine.lock.fencingToken.nonce !== row.fencing_nonce
      || quarantine.state !== row.state
      || quarantine.reason !== row.reason
      || quarantine.enteredAt !== row.entered_at
      || quarantine.quarantinedAt !== row.quarantined_at
      || JSON.stringify(quarantine) !== row.payload_json
      || activeLock === undefined
      || !cleanExecutionGenerationEquals(quarantine.lock, activeLock)
      || JSON.stringify(quarantine.lock) !== JSON.stringify(activeLock)) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        row.task_id,
      );
    }
    return quarantine;
  });
  const audits = loadCleanExecutionQuarantineAudits(db);
  const auditsByQuarantineId = new Map(
    audits.map(audit => [audit.quarantineId, audit]),
  );
  for (const quarantine of quarantines) {
    const action =
      quarantine.state === 'in-flight' ? 'boundary-entered' : 'quarantined';
    const audit = auditsByQuarantineId.get(quarantine.quarantineId);
    if (audit === undefined
      || audit.action !== action
      || audit.taskId !== quarantine.lock.taskId
      || audit.ownerId !== quarantine.lock.ownerId
      || !executionLockFencingTokenEquals(
        audit.fencingToken,
        quarantine.lock.fencingToken,
      )) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        quarantine.lock.taskId,
      );
    }
  }
  return quarantines;
}

function loadCleanExecutionQuarantineForLock(db, lock) {
  let row;
  try {
    row = db.prepare(`
      SELECT task_id, quarantine_id, owner_id, fencing_epoch, fencing_counter,
             fencing_nonce, state, reason, entered_at, quarantined_at,
             payload_json
        FROM execution_lock_quarantine
       WHERE task_id = ?
    `).get(lock.taskId);
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      lock.taskId,
    );
  }
  if (row === undefined) return undefined;
  let value;
  try {
    value = JSON.parse(row.payload_json);
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      lock.taskId,
    );
  }
  const quarantine = parseCleanExecutionQuarantine(value, row.task_id);
  if (quarantine === null
    || quarantine.quarantineId !== row.quarantine_id
    || quarantine.lock.ownerId !== row.owner_id
    || quarantine.lock.fencingToken.epoch !== row.fencing_epoch
    || quarantine.lock.fencingToken.counter !== row.fencing_counter
    || quarantine.lock.fencingToken.nonce !== row.fencing_nonce
    || quarantine.state !== row.state
    || quarantine.reason !== row.reason
    || quarantine.enteredAt !== row.entered_at
    || quarantine.quarantinedAt !== row.quarantined_at
    || JSON.stringify(quarantine) !== row.payload_json
    || !cleanExecutionGenerationEquals(quarantine.lock, lock)
    || JSON.stringify(quarantine.lock) !== JSON.stringify(lock)) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      lock.taskId,
    );
  }
  const action =
    quarantine.state === 'in-flight' ? 'boundary-entered' : 'quarantined';
  let auditRow;
  try {
    auditRow = db.prepare(`
      SELECT event_id, action, quarantine_id, task_id, owner_id,
             fencing_epoch, fencing_counter, fencing_nonce, occurred_at,
             payload_json
        FROM execution_lock_quarantine_audit
       WHERE quarantine_id = ?
         AND action = ?
    `).get(quarantine.quarantineId, action);
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      lock.taskId,
    );
  }
  let auditValue;
  try {
    auditValue = auditRow === undefined
      ? null
      : JSON.parse(auditRow.payload_json);
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      lock.taskId,
    );
  }
  const audit = parseCleanExecutionQuarantineAudit(auditValue);
  if (auditRow === undefined
    || audit === null
    || audit.eventId !== auditRow.event_id
    || audit.action !== auditRow.action
    || audit.quarantineId !== auditRow.quarantine_id
    || audit.taskId !== auditRow.task_id
    || audit.ownerId !== auditRow.owner_id
    || audit.fencingToken.epoch !== auditRow.fencing_epoch
    || audit.fencingToken.counter !== auditRow.fencing_counter
    || audit.fencingToken.nonce !== auditRow.fencing_nonce
    || audit.occurredAt !== auditRow.occurred_at
    || JSON.stringify(audit) !== auditRow.payload_json) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      lock.taskId,
    );
  }
  return quarantine;
}

function createCleanExecutionQuarantineAudit(
  action,
  quarantine,
  payload,
  occurredAt,
  eventId = randomUUID(),
) {
  return {
    schemaVersion: EXECUTION_LOCK_QUARANTINE_AUDIT_SCHEMA_VERSION,
    eventId,
    action,
    quarantineId: quarantine.quarantineId,
    taskId: quarantine.lock.taskId,
    ownerId: quarantine.lock.ownerId,
    fencingToken: quarantine.lock.fencingToken,
    occurredAt,
    payload,
  };
}

function appendCleanExecutionQuarantineAudit(db, event) {
  const result = db.prepare(`
    INSERT INTO execution_lock_quarantine_audit(
      event_id, action, quarantine_id, task_id, owner_id, fencing_epoch,
      fencing_counter, fencing_nonce, occurred_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.action,
    event.quarantineId,
    event.taskId,
    event.ownerId,
    event.fencingToken.epoch,
    event.fencingToken.counter,
    event.fencingToken.nonce,
    event.occurredAt,
    JSON.stringify(event),
  );
  if (result.changes !== 1) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_BUSY',
      event.taskId,
    );
  }
}

function insertCleanExecutionQuarantineRow(db, quarantine) {
  const result = db.prepare(`
    INSERT INTO execution_lock_quarantine(
      task_id, quarantine_id, owner_id, fencing_epoch, fencing_counter,
      fencing_nonce, state, reason, entered_at, quarantined_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    quarantine.lock.taskId,
    quarantine.quarantineId,
    quarantine.lock.ownerId,
    quarantine.lock.fencingToken.epoch,
    quarantine.lock.fencingToken.counter,
    quarantine.lock.fencingToken.nonce,
    quarantine.state,
    quarantine.reason,
    quarantine.enteredAt,
    quarantine.quarantinedAt,
    JSON.stringify(quarantine),
  );
  if (result.changes !== 1) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_BUSY',
      quarantine.lock.taskId,
    );
  }
}

function transitionCleanExecutionQuarantineRow(db, previous, candidate) {
  const result = db.prepare(`
    UPDATE execution_lock_quarantine
       SET state = ?,
           reason = ?,
           quarantined_at = ?,
           payload_json = ?
     WHERE task_id = ?
       AND quarantine_id = ?
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
       AND state = 'in-flight'
       AND payload_json = ?
  `).run(
    candidate.state,
    candidate.reason,
    candidate.quarantinedAt,
    JSON.stringify(candidate),
    previous.lock.taskId,
    previous.quarantineId,
    previous.lock.ownerId,
    previous.lock.fencingToken.epoch,
    previous.lock.fencingToken.counter,
    previous.lock.fencingToken.nonce,
    JSON.stringify(previous),
  );
  if (result.changes !== 1) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
      previous.lock.taskId,
    );
  }
}

function deleteCleanExecutionQuarantineRow(db, quarantine) {
  const result = db.prepare(`
    DELETE FROM execution_lock_quarantine
     WHERE task_id = ?
       AND quarantine_id = ?
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
       AND state = ?
       AND payload_json = ?
  `).run(
    quarantine.lock.taskId,
    quarantine.quarantineId,
    quarantine.lock.ownerId,
    quarantine.lock.fencingToken.epoch,
    quarantine.lock.fencingToken.counter,
    quarantine.lock.fencingToken.nonce,
    quarantine.state,
    JSON.stringify(quarantine),
  );
  if (result.changes !== 1) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
      quarantine.lock.taskId,
    );
  }
}

function cleanQuarantineForGeneration(quarantines, lock) {
  return quarantines.find(quarantine =>
    cleanExecutionGenerationEquals(quarantine.lock, lock));
}

function reconcileCleanExecutionAuthorityForMaintenance(
  projectRoot,
  db,
  nowMs,
  options,
) {
  let cursor = '';
  while (true) {
    const page = loadCleanExecutionActivePage(db, cursor);
    if (page.length === 0) break;
    for (const observed of page) {
      const current = reconcileCleanExecutionAuthorityForTask(
        projectRoot,
        db,
        observed.taskId,
        options,
      );
      if (current.lock === undefined) continue;
      if (retireCleanExecutionLockIfProvablyDead(
        projectRoot,
        db,
        current.lock,
        nowMs,
        options,
        current.quarantine,
      )) {
        continue;
      }
      throw codedError(
        current.lock.taskId === PROJECT_MAINTENANCE_LOCK_TASK_ID
          ? 'E_CLEAN_MAINTENANCE_AUTHORITY_HELD'
          : 'E_CLEAN_PROJECT_ACTIVE',
        current.lock.taskId,
      );
    }
    cursor = page.at(-1).taskId;
  }

  let orphanQuarantine;
  try {
    orphanQuarantine = db.prepare(`
      SELECT task_id
        FROM execution_lock_quarantine
       ORDER BY task_id
       LIMIT 1
    `).get();
  } catch {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      'quarantine-table',
    );
  }
  if (orphanQuarantine !== undefined) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      orphanQuarantine.task_id,
    );
  }
  const orphanProjections =
    scanCleanExecutionAuthority(projectRoot, [], options);
  for (const projection of orphanProjections) {
    unlinkSync(projection.path);
  }
  if (orphanProjections.length > 0) {
    fsyncCleanExecutionAuthorityDirectory(
      cleanExecutionAuthorityDirectory(projectRoot),
    );
  }
}

function reconcileCleanExecutionAuthorityForTask(
  projectRoot,
  db,
  taskId,
  options = {},
) {
  const lock = loadCleanExecutionActiveRow(db, taskId);
  const quarantine = lock === undefined
    ? undefined
    : loadCleanExecutionQuarantineForLock(db, lock);
  const path = cleanExecutionLockPath(projectRoot, taskId);
  if (lock !== undefined) {
    const stagingPath = `${path}.tmp-${lock.ownerId}`;
    if (cleanAuthorityPathExists(stagingPath)) {
      cleanAuthorityPathIdentity(
        stagingPath,
        EXECUTION_LOCK_MAX_PROJECTION_BYTES,
      );
      const localIdentity =
        options.runtimeIdentity ?? CLEAN_EXECUTION_LOCK_RUNTIME_IDENTITY;
      const state = options.livenessProbe
        ? options.livenessProbe(lock, localIdentity)
        : defaultCleanExecutionOwnerState(lock, localIdentity);
      if (state === 'dead') {
        unlinkSync(stagingPath);
        fsyncCleanExecutionAuthorityDirectory(dirname(stagingPath));
      } else {
        throw codedError(
          lock.taskId === PROJECT_MAINTENANCE_LOCK_TASK_ID
            ? 'E_CLEAN_MAINTENANCE_AUTHORITY_HELD'
            : 'E_CLEAN_PROJECT_ACTIVE',
          lock.taskId,
        );
      }
    }
  }

  const raw =
    readCleanAuthorityFile(path, EXECUTION_LOCK_MAX_PROJECTION_BYTES);
  if (lock === undefined) {
    if (raw !== null) {
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
      }
      if (parseExecutionLockProjection(value, taskId) === null) {
        throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
      }
      unlinkSync(path);
      fsyncCleanExecutionAuthorityDirectory(dirname(path));
    }
    return { lock: undefined, quarantine: undefined };
  }

  let projection;
  if (raw !== null) {
    try {
      const value = JSON.parse(raw);
      projection = parseExecutionLockProjection(value, taskId);
      if (projection === null) {
        const legacy = parseLegacyV2ExecutionLockProjection(value, taskId);
        if (legacy !== null
          && cleanExecutionGenerationEquals(legacy, lock)
          && JSON.stringify(legacy) === JSON.stringify(lock)) {
          projection = lock;
        }
      }
    } catch {
      projection = null;
    }
  }
  if (raw !== null && projection === null) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', path);
  }
  const canonicalRaw = JSON.stringify(lock);
  if (raw === null) {
    writeCleanExecutionLock(projectRoot, lock, false);
  } else if (raw !== canonicalRaw) {
    writeCleanExecutionLock(projectRoot, lock, true);
  }
  return { lock, quarantine };
}

function insertCleanExecutionActiveRow(db, lock) {
  try {
    db.prepare(`
      INSERT INTO execution_lock_active(
        task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      lock.taskId,
      lock.ownerId,
      lock.fencingToken.epoch,
      lock.fencingToken.counter,
      lock.fencingToken.nonce,
      JSON.stringify(lock),
    );
  } catch {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_BUSY', lock.taskId);
  }
}

function updateCleanExecutionActiveRow(db, previous, candidate) {
  const result = db.prepare(`
    UPDATE execution_lock_active
       SET payload_json = ?
     WHERE task_id = ?
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
       AND payload_json = ?
  `).run(
    JSON.stringify(candidate),
    previous.taskId,
    previous.ownerId,
    previous.fencingToken.epoch,
    previous.fencingToken.counter,
    previous.fencingToken.nonce,
    JSON.stringify(previous),
  );
  if (result.changes !== 1) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
      previous.taskId,
    );
  }
}

function deleteCleanExecutionActiveRow(db, lock) {
  const result = db.prepare(`
    DELETE FROM execution_lock_active
     WHERE task_id = ?
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
  `).run(
    lock.taskId,
    lock.ownerId,
    lock.fencingToken.epoch,
    lock.fencingToken.counter,
    lock.fencingToken.nonce,
  );
  if (result.changes !== 1) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
      lock.taskId,
    );
  }
}

function defaultCleanExecutionOwnerState(owner, localIdentity) {
  if (owner.hostInstanceId !== localIdentity.hostInstanceId
    || owner.bootSessionId !== localIdentity.bootSessionId) {
    return 'foreign-host';
  }
  if (localIdentity.hostInstanceId.startsWith('process-local:')
    && owner.processSessionId !== localIdentity.processSessionId) {
    return 'foreign-host';
  }
  return defaultProcessProbe(owner.pid);
}

function assertExactLiveCleanExecutionOwner(lock, options = {}) {
  const localIdentity =
    options.runtimeIdentity ?? CLEAN_EXECUTION_LOCK_RUNTIME_IDENTITY;
  const callerPid = options.ownerPid ?? process.pid;
  const exactRuntime = lock.pid === callerPid
    && lock.hostInstanceId === localIdentity.hostInstanceId
    && lock.bootSessionId === localIdentity.bootSessionId
    && lock.processSessionId === localIdentity.processSessionId;
  const ownerState = exactRuntime
    ? options.livenessProbe
      ? options.livenessProbe(lock, localIdentity)
      : defaultCleanExecutionOwnerState(lock, localIdentity)
    : 'foreign-host';
  if (!exactRuntime || ownerState !== 'alive') {
    throw codedError(
      ownerState === 'foreign-host'
        ? 'E_CLEAN_MAINTENANCE_AUTHORITY_FOREIGN_HOST'
        : ownerState === 'unknown'
          ? 'E_CLEAN_MAINTENANCE_AUTHORITY_LIVENESS_UNKNOWN'
          : 'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
      lock.taskId,
    );
  }
}

function retireCleanExecutionLockIfProvablyDead(
  projectRoot,
  db,
  lock,
  nowMs,
  options,
  knownQuarantine,
) {
  const quarantine = knownQuarantine
    ?? loadCleanExecutionQuarantineForLock(db, lock);
  if (quarantine !== undefined) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED',
      lock.taskId,
    );
  }
  if (nowMs < Date.parse(lock.renewedAt) + lock.leaseDurationMs) {
    return false;
  }
  const localIdentity =
    options.runtimeIdentity ?? CLEAN_EXECUTION_LOCK_RUNTIME_IDENTITY;
  const ownerState = options.livenessProbe
    ? options.livenessProbe(lock, localIdentity)
    : defaultCleanExecutionOwnerState(lock, localIdentity);
  if (ownerState !== 'dead') {
    throw codedError(
      ownerState === 'foreign-host'
        ? 'E_CLEAN_MAINTENANCE_AUTHORITY_FOREIGN_HOST'
        : ownerState === 'unknown'
          ? 'E_CLEAN_MAINTENANCE_AUTHORITY_LIVENESS_UNKNOWN'
          : 'E_CLEAN_PROJECT_ACTIVE',
      lock.taskId,
    );
  }
  deleteCleanExecutionActiveRow(db, lock);
  const projection = readCleanExecutionLock(projectRoot, lock.taskId);
  if (projection !== null) {
    unlinkSync(projection.path);
    fsyncCleanExecutionAuthorityDirectory(dirname(projection.path));
  }
  return true;
}

function writeCleanExecutionLock(projectRoot, lock, replace = false) {
  const path = cleanExecutionLockPath(projectRoot, lock.taskId);
  const stagingPath = `${path}.tmp-${lock.ownerId}`;
  let fd;
  let published = false;
  try {
    fd = openSync(
      stagingPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(fd, JSON.stringify(lock), 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    if (replace) renameSync(stagingPath, path);
    else {
      linkSync(stagingPath, path);
      unlinkSync(stagingPath);
    }
    fsyncCleanExecutionAuthorityDirectory(dirname(path));
    published = true;
  } catch {
    if (!published) {
      try {
        unlinkSync(stagingPath);
        fsyncCleanExecutionAuthorityDirectory(dirname(stagingPath));
      } catch {
        // A retained exact-owner staging file is durable HOLD evidence.
      }
    }
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_BUSY', path);
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the authority publish result.
      }
    }
  }
}

function removeCompensatedCleanExecutionLockProjection(
  projectRoot,
  compensated,
) {
  return withCleanExecutionAuthorityMutation(projectRoot, (db, authority) => {
    // Canonical compensation and projection cleanup are separate commits.
    // Re-enter BEGIN IMMEDIATE so a successor either already exists and is
    // preserved, or cannot publish until exact-generation cleanup commits.
    const successor = loadCleanExecutionActiveRow(db, compensated.taskId);
    if (successor !== undefined) return true;
    const projection = readCleanExecutionLock(
      authority,
      compensated.taskId,
    );
    if (projection === null) return true;
    if (projection.lock.ownerId === compensated.ownerId
      && executionLockFencingTokenEquals(
        projection.lock.fencingToken,
        compensated.fencingToken,
    )) {
      unlinkSync(projection.path);
      fsyncCleanExecutionAuthorityDirectory(dirname(projection.path));
      return true;
    }
    return false;
  });
}

export function acquireCleanMaintenanceLock(
  projectRoot = SOURCE_ROOT,
  options = {},
) {
  const nowMs = options.now?.() ?? Date.now();
  const leaseDurationMs =
    options.leaseDurationMs ?? EXECUTION_LOCK_MAX_LEASE_MS;
  const ownerPid = options.ownerPid ?? process.pid;
  const identity =
    options.runtimeIdentity ?? CLEAN_EXECUTION_LOCK_RUNTIME_IDENTITY;
  if (!Number.isSafeInteger(nowMs)
    || !Number.isFinite(new Date(nowMs).getTime())
    || !Number.isSafeInteger(leaseDurationMs)
    || leaseDurationMs <= 0
    || leaseDurationMs > EXECUTION_LOCK_MAX_LEASE_MS
    || !Number.isSafeInteger(nowMs + leaseDurationMs)
    || !Number.isFinite(new Date(nowMs + leaseDurationMs).getTime())
    || !Number.isSafeInteger(ownerPid)
    || ownerPid <= 0
    || !validExecutionLockIdentity(identity.hostInstanceId)
    || !validExecutionLockIdentity(identity.bootSessionId)
    || !validExecutionLockIdentity(identity.processSessionId)) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', projectRoot);
  }

  let candidateLock;
  let lock;
  try {
    lock = withCleanExecutionAuthorityMutation(
      projectRoot,
      (db, authority) => {
        reconcileCleanExecutionAuthorityForMaintenance(
          authority,
          db,
          nowMs,
          options,
        );
        const timestamp = new Date(nowMs).toISOString();
        const candidate = {
          schemaVersion: EXECUTION_LOCK_SCHEMA_VERSION,
          taskId: PROJECT_MAINTENANCE_LOCK_TASK_ID,
          actor: 'maintenance',
          ownerId: randomUUID(),
          pid: ownerPid,
          ...identity,
          fencingToken: allocateCleanExecutionFencingToken(db),
          acquiredAt: timestamp,
          renewedAt: timestamp,
          leaseDurationMs,
        };
        insertCleanExecutionActiveRow(db, candidate);
        candidateLock = candidate;
        return candidate;
      },
    );
  } catch (error) {
    if (error && typeof error === 'object'
      && (error.canonicalCommitState === 'committed'
        || error.canonicalCommitState === 'uncertain')
      && candidateLock !== undefined) {
      error.recoveryLock = candidateLock;
    }
    throw error;
  }
  try {
    withPinnedCleanExecutionAuthority(projectRoot, authority => {
      const projection = readCleanExecutionLock(
        authority,
        PROJECT_MAINTENANCE_LOCK_TASK_ID,
      );
      const publisher =
        options.projectionPublisher ?? writeCleanExecutionLock;
      publisher(authority, lock, projection !== null);
    });
  } catch {
    let canonicalCompensated = false;
    let projectionCompensated = false;
    try {
      canonicalCompensated =
        withCleanExecutionAuthorityMutation(projectRoot, db => {
          const canonical = loadCleanExecutionActiveRow(db, lock.taskId);
          if (canonical !== undefined
            && (canonical.ownerId !== lock.ownerId
              || !executionLockFencingTokenEquals(
                canonical.fencingToken,
                lock.fencingToken,
              ))) {
            return false;
          }
          if (canonical === undefined) return false;
          if (loadCleanExecutionQuarantineForLock(db, canonical)
            !== undefined) {
            return false;
          }
          deleteCleanExecutionActiveRow(db, canonical);
          return true;
        });
      if (canonicalCompensated) {
        projectionCompensated =
          removeCompensatedCleanExecutionLockProjection(projectRoot, lock);
      }
    } catch {
      // The complete recovery generation is attached to the typed error.
    }
    const compensated =
      canonicalCompensated && projectionCompensated;
    const error = codedError(
      compensated
        ? 'E_CLEAN_MAINTENANCE_PUBLISH_COMPENSATED'
        : 'E_CLEAN_MAINTENANCE_PUBLISH_QUARANTINED',
      projectRoot,
    );
    if (!compensated) error.recoveryLock = lock;
    throw error;
  }
  return lock;
}

function normalizeCleanMaintenanceLockHandle(value) {
  const lock = parseExecutionLockProjection(
    value,
    PROJECT_MAINTENANCE_LOCK_TASK_ID,
  );
  if (lock === null) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      PROJECT_MAINTENANCE_LOCK_TASK_ID,
    );
  }
  return lock;
}

function cleanExecutionNow(options, target) {
  const nowMs = options.now?.() ?? Date.now();
  if (!Number.isSafeInteger(nowMs)
    || !Number.isFinite(new Date(nowMs).getTime())) {
    throw codedError('E_CLEAN_MAINTENANCE_AUTHORITY_INVALID', target);
  }
  return nowMs;
}

function exactCleanMaintenanceLockCandidate(candidate, expected) {
  return candidate !== undefined
    && cleanExecutionGenerationEquals(candidate, expected)
    && JSON.stringify(candidate) === JSON.stringify(expected)
    ? candidate
    : undefined;
}

function verifyCommittedCleanExecutionQuarantine(
  projectRoot,
  expected,
) {
  return withCleanExecutionAuthorityMutation(projectRoot, (db, authority) => {
    const current = reconcileCleanExecutionAuthorityForTask(
      authority,
      db,
      expected.lock.taskId,
    );
    const canonical =
      exactCleanMaintenanceLockCandidate(current.lock, expected.lock);
    const quarantine = canonical === undefined
      ? undefined
      : current.quarantine;
    if (quarantine === undefined
      || quarantine.quarantineId !== expected.quarantineId
      || JSON.stringify(quarantine) !== JSON.stringify(expected)) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
        expected.lock.taskId,
      );
    }
    return quarantine;
  });
}

export function beginCleanMaintenanceIrreversibleBoundary(
  projectRoot,
  exactLock,
  request = {},
  options = {},
) {
  const expected = normalizeCleanMaintenanceLockHandle(exactLock);
  const evidenceRefs = normalizeCleanExecutionEvidenceRefs(
    request.evidenceRefs,
    expected.taskId,
  );
  const nowMs = cleanExecutionNow(options, expected.taskId);
  const quarantine =
    withCleanExecutionAuthorityMutation(projectRoot, (db, authority) => {
      const current = reconcileCleanExecutionAuthorityForTask(
        authority,
        db,
        expected.taskId,
        options,
      );
      const canonical =
        exactCleanMaintenanceLockCandidate(current.lock, expected);
      if (canonical === undefined) {
        throw codedError(
          'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
          expected.taskId,
        );
      }
      assertExactLiveCleanExecutionOwner(canonical, options);
      const existing = current.quarantine;
      if (existing !== undefined) {
        if (existing.state === 'in-flight') return existing;
        throw codedError(
          'E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED',
          expected.taskId,
        );
      }
      const enteredAt = new Date(
        Math.max(nowMs, Date.parse(canonical.renewedAt)),
      ).toISOString();
      const candidate = {
        schemaVersion: EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION,
        quarantineId: randomUUID(),
        lock: canonical,
        state: 'in-flight',
        reason: 'irreversible-boundary',
        evidenceRefs,
        enteredAt,
        quarantinedAt: null,
      };
      insertCleanExecutionQuarantineRow(db, candidate);
      appendCleanExecutionQuarantineAudit(
        db,
        createCleanExecutionQuarantineAudit(
          'boundary-entered',
          candidate,
          candidate,
          enteredAt,
        ),
      );
      return candidate;
    });
  return verifyCommittedCleanExecutionQuarantine(projectRoot, quarantine);
}

export function assertCleanMaintenanceLock(
  projectRoot,
  exactLock,
  options = {},
) {
  const expected = normalizeCleanMaintenanceLockHandle(exactLock);
  withCleanExecutionAuthorityMutation(projectRoot, (db, authority) => {
    const current = reconcileCleanExecutionAuthorityForTask(
      authority,
      db,
      expected.taskId,
      options,
    );
    const canonical =
      exactCleanMaintenanceLockCandidate(current.lock, expected);
    if (canonical === undefined) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
        expected.taskId,
      );
    }
    assertExactLiveCleanExecutionOwner(canonical, options);
    const quarantine = current.quarantine;
    if (quarantine?.state === 'quarantined') {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED',
        expected.taskId,
      );
    }
  });
}

export function renewCleanMaintenanceLock(
  projectRoot,
  exactLock,
  options = {},
) {
  const expected = normalizeCleanMaintenanceLockHandle(exactLock);
  const nowMs = cleanExecutionNow(options, expected.taskId);
  let renewedCandidate;
  let renewed;
  try {
    renewed = withCleanExecutionAuthorityMutation(
      projectRoot,
      (db, authority) => {
    const current = reconcileCleanExecutionAuthorityForTask(
      authority,
      db,
      expected.taskId,
      options,
    );
    const canonical =
      exactCleanMaintenanceLockCandidate(current.lock, expected);
    if (canonical === undefined) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
        expected.taskId,
      );
    }
    assertExactLiveCleanExecutionOwner(canonical, options);
    const quarantine = current.quarantine;
    if (quarantine?.state === 'quarantined') {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED',
        expected.taskId,
      );
    }
    const candidate = {
      ...canonical,
      renewedAt: new Date(
        Math.max(nowMs, Date.parse(canonical.renewedAt)),
      ).toISOString(),
    };
    updateCleanExecutionActiveRow(db, canonical, candidate);
    if (quarantine !== undefined) {
      transitionCleanExecutionQuarantineRow(
        db,
        quarantine,
        { ...quarantine, lock: candidate },
      );
    }
    renewedCandidate = candidate;
    return candidate;
      },
    );
  } catch (error) {
    if (error && typeof error === 'object'
      && (error.canonicalCommitState === 'committed'
        || error.canonicalCommitState === 'uncertain')) {
      const uncertain = codedError(
        'E_CLEAN_MAINTENANCE_RENEWAL_UNCERTAIN',
        expected.taskId,
      );
      uncertain.canonicalCommitState = error.canonicalCommitState;
      uncertain.recoveryLock = renewedCandidate ?? expected;
      throw uncertain;
    }
    throw error;
  }
  try {
    withPinnedCleanExecutionAuthority(projectRoot, authority => {
      const publisher =
        options.projectionPublisher ?? writeCleanExecutionLock;
      publisher(authority, renewed, true);
    });
  } catch {
    try {
      const reconciled = withCleanExecutionAuthorityMutation(
        projectRoot,
        (db, authority) => reconcileCleanExecutionAuthorityForTask(
          authority,
          db,
          expected.taskId,
          options,
        ),
      );
      if (exactCleanMaintenanceLockCandidate(
        reconciled.lock,
        renewed,
      ) !== undefined) {
        return renewed;
      }
    } catch {
      // Surface the committed generation and require exact reconciliation.
    }
    const uncertain = codedError(
      'E_CLEAN_MAINTENANCE_RENEWAL_UNCERTAIN',
      expected.taskId,
    );
    uncertain.canonicalCommitState = 'committed';
    uncertain.recoveryLock = renewed;
    throw uncertain;
  }
  return renewed;
}

export function quarantineCleanMaintenanceLock(
  projectRoot,
  exactLock,
  request,
  options = {},
) {
  const expected = normalizeCleanMaintenanceLockHandle(exactLock);
  if (!request
    || !EXECUTION_LOCK_QUARANTINE_REASONS.has(request.reason)
    || request.reason === 'irreversible-boundary'
    || request.reason === 'legacy-v2-active') {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      expected.taskId,
    );
  }
  const requestedEvidence = normalizeCleanExecutionEvidenceRefs(
    request.evidenceRefs,
    expected.taskId,
  );
  const nowMs = cleanExecutionNow(options, expected.taskId);
  const quarantine =
    withCleanExecutionAuthorityMutation(projectRoot, (db, authority) => {
      const current = reconcileCleanExecutionAuthorityForTask(
        authority,
        db,
        expected.taskId,
        options,
      );
      const canonical =
        exactCleanMaintenanceLockCandidate(current.lock, expected);
      if (canonical === undefined) {
        throw codedError(
          'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
          expected.taskId,
        );
      }
      assertExactLiveCleanExecutionOwner(canonical, options);
      const existing = current.quarantine;
      if (existing?.state === 'quarantined') return existing;
      const timestamp = new Date(Math.max(
        nowMs,
        Date.parse(existing?.enteredAt ?? canonical.renewedAt),
      )).toISOString();
      const evidenceRefs = normalizeCleanExecutionEvidenceRefs(
        [...new Set([
          ...(existing?.evidenceRefs ?? []),
          ...requestedEvidence,
        ])].sort(),
        canonical.taskId,
      );
      const candidate = {
        schemaVersion: EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION,
        quarantineId: existing?.quarantineId ?? randomUUID(),
        lock: canonical,
        state: 'quarantined',
        reason: request.reason,
        evidenceRefs,
        enteredAt: existing?.enteredAt ?? timestamp,
        quarantinedAt: timestamp,
      };
      const audit = createCleanExecutionQuarantineAudit(
        'quarantined',
        candidate,
        candidate,
        timestamp,
      );
      if (existing !== undefined) {
        appendCleanExecutionQuarantineAudit(db, audit);
        transitionCleanExecutionQuarantineRow(db, existing, candidate);
      } else {
        insertCleanExecutionQuarantineRow(db, candidate);
        appendCleanExecutionQuarantineAudit(db, audit);
      }
      return candidate;
    });
  return verifyCommittedCleanExecutionQuarantine(projectRoot, quarantine);
}

function removeReleasedCleanMaintenanceProjection(projectRoot, released) {
  withCleanExecutionAuthorityMutation(projectRoot, (db, authority) => {
    const successor = loadCleanExecutionActiveRow(
      db,
      PROJECT_MAINTENANCE_LOCK_TASK_ID,
    );
    if (successor !== undefined) return;
    const projection = readCleanExecutionLock(
      authority,
      PROJECT_MAINTENANCE_LOCK_TASK_ID,
    );
    if (projection?.lock.ownerId === released.ownerId
      && executionLockFencingTokenEquals(
        projection.lock.fencingToken,
        released.fencingToken,
    )) {
      unlinkSync(projection.path);
      fsyncCleanExecutionAuthorityDirectory(dirname(projection.path));
    }
  });
}

export function completeCleanMaintenanceIrreversibleBoundary(
  projectRoot,
  exactLock,
  request,
  options = {},
) {
  const expected = normalizeCleanMaintenanceLockHandle(exactLock);
  if (!request
    || typeof request.quarantineId !== 'string'
    || !EXECUTION_LOCK_OWNER_RE.test(request.quarantineId)) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      expected.taskId,
    );
  }
  const evidenceRefs = normalizeCleanExecutionEvidenceRefs(
    request.evidenceRefs,
    expected.taskId,
  );
  if (evidenceRefs.length === 0) {
    throw codedError(
      'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID',
      expected.taskId,
    );
  }
  const nowMs = cleanExecutionNow(options, expected.taskId);
  const result = withCleanExecutionAuthorityMutation(
    projectRoot,
    (db, authority) => {
    const current = reconcileCleanExecutionAuthorityForTask(
      authority,
      db,
      expected.taskId,
      options,
    );
    const canonical =
      exactCleanMaintenanceLockCandidate(current.lock, expected);
    const quarantine = canonical === undefined
      ? undefined
      : current.quarantine;
    if (canonical === undefined
      || quarantine === undefined
      || quarantine.quarantineId !== request.quarantineId
      || quarantine.state !== 'in-flight') {
      throw codedError(
        quarantine?.state === 'quarantined'
          ? 'E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED'
          : 'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
        expected.taskId,
      );
    }
    assertExactLiveCleanExecutionOwner(canonical, options);
    const completedAt = new Date(
      Math.max(nowMs, Date.parse(quarantine.enteredAt)),
    ).toISOString();
    const completion = {
      schemaVersion: EXECUTION_LOCK_BOUNDARY_COMPLETION_SCHEMA_VERSION,
      quarantineId: quarantine.quarantineId,
      fencingToken: canonical.fencingToken,
      evidenceRefs,
      completedAt,
    };
    const audit = createCleanExecutionQuarantineAudit(
      'completed',
      quarantine,
      completion,
      completedAt,
    );
    appendCleanExecutionQuarantineAudit(db, audit);
    deleteCleanExecutionQuarantineRow(db, quarantine);
    deleteCleanExecutionActiveRow(db, canonical);
    return { completed: quarantine, audit };
    },
  );
  try {
    options.terminalCommitObserver?.({
      kind: 'completed',
      lock: result.completed.lock,
      quarantine: result.completed,
      audit: result.audit,
    });
  } catch {
    // Observability cannot change the committed terminal decision.
  }
  let projectionCleanup = 'completed';
  try {
    removeReleasedCleanMaintenanceProjection(
      projectRoot,
      result.completed.lock,
    );
  } catch {
    projectionCleanup = 'uncertain';
  }
  return { ...result, projectionCleanup };
}

export function recoverQuarantinedCleanMaintenanceLock(
  projectRoot,
  exactLock,
  attestation,
  options = {},
) {
  const expected = normalizeCleanMaintenanceLockHandle(exactLock);
  if (typeof options.recoveryAttestationVerifier !== 'function') {
    throw codedError(
      'E_CLEAN_MAINTENANCE_RECOVERY_VERIFIER_REQUIRED',
      expected.taskId,
    );
  }
  const nowMs = cleanExecutionNow(options, expected.taskId);
  const result = withCleanExecutionAuthorityMutation(
    projectRoot,
    (db, authority) => {
    const current = reconcileCleanExecutionAuthorityForTask(
      authority,
      db,
      expected.taskId,
      options,
    );
    const canonical =
      exactCleanMaintenanceLockCandidate(current.lock, expected);
    const quarantine = canonical === undefined
      ? undefined
      : current.quarantine;
    if (canonical === undefined || quarantine === undefined) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
        expected.taskId,
      );
    }
    const normalizedAttestation =
      normalizeCleanExecutionRecoveryAttestation(
        attestation,
        quarantine,
        nowMs,
      );
    const quarantineSnapshot = JSON.stringify(quarantine);
    const attestationSnapshot = JSON.stringify(normalizedAttestation);
    const quarantineDigest = createHash('sha256')
      .update(quarantineSnapshot)
      .digest('hex');
    let verified = false;
    try {
      verified = options.recoveryAttestationVerifier({
        attestation: normalizedAttestation,
        quarantine,
        quarantineDigest,
      }) === true;
    } catch {
      verified = false;
    }
    if (!verified
      || JSON.stringify(quarantine) !== quarantineSnapshot
      || JSON.stringify(normalizedAttestation) !== attestationSnapshot) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_RECOVERY_ATTESTATION_INVALID',
        expected.taskId,
      );
    }
    const audit = createCleanExecutionQuarantineAudit(
      'recovered',
      quarantine,
      normalizedAttestation,
      normalizedAttestation.attestedAt,
    );
    appendCleanExecutionQuarantineAudit(db, audit);
    deleteCleanExecutionQuarantineRow(db, quarantine);
    deleteCleanExecutionActiveRow(db, canonical);
    return { recovered: quarantine, audit };
    },
  );
  try {
    options.terminalCommitObserver?.({
      kind: 'recovered',
      lock: result.recovered.lock,
      quarantine: result.recovered,
      audit: result.audit,
    });
  } catch {
    // Observability cannot change the committed terminal decision.
  }
  let projectionCleanup = 'completed';
  try {
    removeReleasedCleanMaintenanceProjection(
      projectRoot,
      result.recovered.lock,
    );
  } catch {
    projectionCleanup = 'uncertain';
  }
  return { ...result, projectionCleanup };
}

export function releaseCleanMaintenanceLock(
  projectRoot,
  exactLock,
  options = {},
) {
  const expected = normalizeCleanMaintenanceLockHandle(exactLock);
  let released;
  try {
    released = withCleanExecutionAuthorityMutation(
      projectRoot,
      (db, authority) => {
    const current = reconcileCleanExecutionAuthorityForTask(
      authority,
      db,
      expected.taskId,
      options,
    );
    if (current.lock === undefined) return null;
    const existing =
      exactCleanMaintenanceLockCandidate(current.lock, expected);
    if (existing === undefined) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
        expected.taskId,
      );
    }
    const quarantine = current.quarantine;
    if (quarantine !== undefined) {
      throw codedError(
        'E_CLEAN_MAINTENANCE_AUTHORITY_QUARANTINED',
        expected.taskId,
      );
    }
    assertExactLiveCleanExecutionOwner(existing, options);
    deleteCleanExecutionActiveRow(db, existing);
    return existing;
      },
    );
  } catch (error) {
    if (error && typeof error === 'object'
      && (error.canonicalCommitState === 'committed'
        || error.canonicalCommitState === 'uncertain')) {
      const uncertain = codedError(
        'E_CLEAN_MAINTENANCE_RELEASE_UNCERTAIN',
        expected.taskId,
      );
      uncertain.canonicalCommitState = error.canonicalCommitState;
      uncertain.recoveryLock = expected;
      throw uncertain;
    }
    throw error;
  }
  if (released === null) return false;
  try {
    options.releaseCommitObserver?.(released);
  } catch {
    // Observability cannot change the committed canonical release.
  }
  try {
    removeReleasedCleanMaintenanceProjection(projectRoot, released);
  } catch {
    try {
      const current = withCleanExecutionAuthorityMutation(
        projectRoot,
        (db, authority) => reconcileCleanExecutionAuthorityForTask(
          authority,
          db,
          expected.taskId,
          options,
        ),
      );
      if (current.lock === undefined) return true;
    } catch {
      // Canonical absence or projection cleanup could not be proven.
    }
    const uncertain = codedError(
      'E_CLEAN_MAINTENANCE_RELEASE_UNCERTAIN',
      expected.taskId,
    );
    uncertain.canonicalCommitState = 'committed';
    uncertain.recoveryLock = released;
    throw uncertain;
  }
  return true;
}

function codedError(code, target, report) {
  const error = new Error(`${code}:${target}`);
  error.code = code;
  if (report !== undefined) error.report = report;
  return error;
}

function canonicalDirectory(directory) {
  const absolute = resolve(directory);
  return existsSync(absolute) ? realpathSync.native(absolute) : absolute;
}

function comparableEntryPath(entryPath) {
  const canonical = canonicalDirectory(entryPath);
  return process.platform === 'win32'
    ? canonical.toLocaleLowerCase('en-US')
    : canonical;
}

function isWithin(candidate, root) {
  const rel = relative(root, candidate);
  const escapesRoot = rel === '..' || rel.startsWith(`..${sep}`);
  return rel === '' || (!escapesRoot && !isAbsolute(rel));
}

function isPreservedEntry(physicalDist, entry) {
  if (PRESERVE.has(entry)) return true;
  const canonicalName = entry.toLocaleLowerCase('en-US');
  if (!PRESERVE.has(canonicalName)) return false;
  const canonicalPath = join(physicalDist, canonicalName);
  if (!existsSync(canonicalPath)) return false;
  return realpathSync.native(join(physicalDist, entry))
    === realpathSync.native(canonicalPath);
}

function identityStableDirectoryAdapterBase() {
  if (process.platform === 'linux') return '/proc/self/fd';
  // Node exposes no portable openat/unlinkat/rmdirat surface. `/dev/fd`
  // traversal and mutation semantics vary across Darwin/BSD hosts, so they
  // fail honestly until a platform adapter proves the complete operation.
  return null;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function closePinnedDirectories(pinnedDirectories, priorError) {
  const closeErrors = [];
  for (const pinned of [...pinnedDirectories].reverse()) {
    try {
      closeSync(pinned.fd);
    } catch (cause) {
      closeErrors.push(cause);
    }
  }
  if (closeErrors.length > 0) {
    const error = codedError(
      'E_CLEAN_DIRECTORY_HANDLE_CLOSE_UNCERTAIN',
      pinnedDirectories.map(pinned => pinned.stablePath).join(','),
    );
    error.cause = new AggregateError(
      priorError === undefined
        ? closeErrors
        : [priorError, ...closeErrors],
      'identity-stable directory handle close failed',
    );
    if (priorError && typeof priorError === 'object'
      && 'report' in priorError) {
      error.report = priorError.report;
    }
    throw error;
  }
  if (priorError !== undefined) throw priorError;
}

function readPinnedMountId(fd, path) {
  let raw;
  try {
    raw = readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8');
  } catch (cause) {
    const error = codedError(
      'E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED',
      path,
    );
    error.cause = cause;
    throw error;
  }
  const match = /^mnt_id:\s*([1-9]\d*)$/mu.exec(raw);
  if (match === null) {
    throw codedError(
      'E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED',
      path,
    );
  }
  return match[1];
}

function pinIdentityStableDirectory(
  path,
  expectedIdentity,
  parentDirectory,
) {
  const adapterBase = identityStableDirectoryAdapterBase();
  if (adapterBase === null
    || typeof fsConstants.O_DIRECTORY !== 'number'
    || typeof fsConstants.O_NOFOLLOW !== 'number'
    || !existsSync(adapterBase)) {
    throw codedError(
      'E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED',
      path,
    );
  }

  let fd;
  try {
    fd = openSync(
      path,
      fsConstants.O_RDONLY
        | fsConstants.O_DIRECTORY
        | fsConstants.O_NOFOLLOW,
    );
  } catch (cause) {
    const error = codedError(
      'E_CLEAN_IDENTITY_STABLE_DIRECTORY_PIN_FAILED',
      path,
    );
    error.cause = cause;
    throw error;
  }

  try {
    const identity = fstatSync(fd, { bigint: true });
    if (!identity.isDirectory()
      || (expectedIdentity !== undefined
        && !sameFileIdentity(identity, expectedIdentity))) {
      throw codedError('E_CLEAN_DIRECTORY_IDENTITY_CHANGED', path);
    }
    const mountId = readPinnedMountId(fd, path);
    if (parentDirectory !== undefined
      && (identity.dev !== parentDirectory.identity.dev
        || mountId !== parentDirectory.mountId)) {
      throw codedError('E_CLEAN_MOUNT_BOUNDARY', path);
    }
    const stablePath = join(adapterBase, String(fd));
    let adapterIdentity;
    try {
      // stat intentionally follows the trusted kernel fd adapter. No caller
      // path is followed after this identity equality has been established.
      adapterIdentity = statSync(stablePath, { bigint: true });
    } catch (cause) {
      const error = codedError(
        'E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED',
        path,
      );
      error.cause = cause;
      throw error;
    }
    if (!adapterIdentity.isDirectory()
      || !sameFileIdentity(identity, adapterIdentity)) {
      throw codedError(
        'E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED',
        path,
      );
    }
    // A successful enumeration proves that this host's fd adapter supports
    // child traversal. unlink/rmdir behavior is exercised through the same
    // adapter by the real-binary clean tests; unproved OS families never enter.
    try {
      readdirSync(stablePath);
    } catch (cause) {
      const error = codedError(
        'E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED',
        path,
      );
      error.cause = cause;
      throw error;
    }
    return { fd, identity, mountId, stablePath };
  } catch (error) {
    closePinnedDirectories([{ fd, stablePath: path }], error);
  }
}

function assertPinnedDirectoryIdentity(path, pinned, code) {
  let current;
  try {
    current = lstatSync(path, { bigint: true });
  } catch (cause) {
    const error = codedError(code, path);
    error.cause = cause;
    throw error;
  }
  if (current.isSymbolicLink()
    || !current.isDirectory()
    || !sameFileIdentity(current, pinned.identity)) {
    throw codedError(code, path);
  }
}

function removeIdentityStableEntry(path, parentDirectory) {
  let entry;
  try {
    entry = lstatSync(path, { bigint: true });
  } catch (cause) {
    const error = codedError('E_CLEAN_DELETE_ENTRY_STATE_CHANGED', path);
    error.cause = cause;
    throw error;
  }

  // unlink never follows its final component. A raced file↔symlink swap can
  // therefore fail or remove only the entry inside the already-pinned parent.
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    try {
      unlinkSync(path);
      return;
    } catch (cause) {
      const error = codedError('E_CLEAN_DELETE_ENTRY_STATE_CHANGED', path);
      error.cause = cause;
      throw error;
    }
  }

  const directory = pinIdentityStableDirectory(
    path,
    entry,
    parentDirectory,
  );
  let operationError;
  try {
    const entries = readdirSync(directory.stablePath).sort();
    for (const child of entries) {
      if (child === '.' || child === '..' || basename(child) !== child) {
        throw codedError('E_CLEAN_DELETE_ENTRY_NAME_INVALID', child);
      }
      removeIdentityStableEntry(
        join(directory.stablePath, child),
        directory,
      );
    }
    assertPinnedDirectoryIdentity(
      path,
      directory,
      'E_CLEAN_DELETE_ENTRY_IDENTITY_CHANGED',
    );
    // rmdir does not follow a raced final-component symlink. All recursive
    // deletion above was rooted at the pinned child handle.
    rmdirSync(path);
  } catch (error) {
    operationError = error;
  }
  closePinnedDirectories([directory], operationError);
}

function testHermeticityEnabled() {
  return process.env.DECKENT_TEST_HERMETICITY === '1'
    || process.env.VITEST === 'true';
}

function maintenanceFailureReport(projectRoot, error, report) {
  const admission = report ?? inspectActiveExecutions(projectRoot);
  const detailCode = error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : 'E_CLEAN_MAINTENANCE_AUTHORITY_INVALID';
  addReason(admission, {
    code: 'E_CLEAN_MAINTENANCE_AUTHORITY_HOLD',
    surface: 'maintenance',
    subject: 'project-maintenance',
    detailCode,
    evidenceRefs: [
      evidencePath(
        projectRoot,
        join(
          projectRoot,
          '.locks',
          EXECUTION_LOCK_COORDINATION_DB_FILENAME,
        ),
      ),
    ],
  });
  return finalizeAdmissionReport(admission);
}

/**
 * Clean only the physical repository that owns this script.
 * No caller-controlled path participates in destructive authority.
 *
 * @returns {{
 *   removed: number,
 *   preserved: string[],
 *   distDir: string,
 *   admission: ReturnType<typeof inspectActiveExecutions>
 * }}
 */
export function cleanDist(options = {}) {
  const namedRoot = SOURCE_ROOT;
  const allowedOptionKeys = new Set([
    'beforeMutation',
    'beforeRemoveEntry',
    'removeEntry',
  ]);
  if (!options
    || typeof options !== 'object'
    || Array.isArray(options)
    || Object.keys(options).some(key => !allowedOptionKeys.has(key))
    || (options.beforeMutation !== undefined
      && typeof options.beforeMutation !== 'function')
    || (options.beforeRemoveEntry !== undefined
      && typeof options.beforeRemoveEntry !== 'function')
    || (options.removeEntry !== undefined
      && typeof options.removeEntry !== 'function')) {
    throw codedError('E_CLEAN_OPERATION_OPTIONS_INVALID', namedRoot);
  }
  // Test hermeticity is an unconditional destructive-operation refusal. Keep
  // it ahead of runtime evidence so a dirty checkout cannot change this code.
  if (testHermeticityEnabled()) {
    throw codedError(
      'E_HERMETIC_DIST_CLEAN',
      join(namedRoot, 'dist'),
    );
  }

  const pinnedRoot = pinIdentityStableDirectory(
    namedRoot,
    SOURCE_ROOT_IDENTITY,
  );
  let outcome;
  let operationError;
  try {
    outcome = cleanDistUnderPinnedRoot(namedRoot, pinnedRoot, options);
  } catch (error) {
    operationError = error;
  }
  closePinnedDirectories([pinnedRoot], operationError);
  return outcome;
}

function cleanDistUnderPinnedRoot(namedRoot, pinnedRoot, options) {
  const rootDir = pinnedRoot.stablePath;
  const physicalRoot = realpathSync.native(rootDir);
  const distDir = join(rootDir, 'dist');
  const removeEntry = options.removeEntry
    ?? ((path, _removeOptions, parentDirectory) =>
      removeIdentityStableEntry(path, parentDirectory));

  if (!isWithin(distDir, rootDir)) {
    throw codedError('E_CLEAN_DIST_BOUNDARY', distDir);
  }
  let maintenance;
  try {
    // The DB row is the canonical project-wide generation. Execution
    // admission uses the same BEGIN IMMEDIATE authority, so exactly one side
    // wins: an earlier execution makes this acquire HOLD; an earlier clean
    // generation blocks every later execution admission.
    maintenance = acquireCleanMaintenanceLock(rootDir);
  } catch (error) {
    const report = maintenanceFailureReport(rootDir, error);
    throw codedError('E_CLEAN_ACTIVE_EXECUTION_HOLD', rootDir, report);
  }

  let outcome;
  let operationError;
  let irreversibleBoundary;
  try {
    // Re-scan after exclusive acquisition. This catches non-canonical writers
    // and all durable runtime surfaces while ignoring only our exact
    // owner+fencing generation.
    const admission = inspectActiveExecutionsInternal(
      rootDir,
      {},
      maintenance,
    );
    if (admission.decision !== 'ALLOW') {
      throw codedError('E_CLEAN_ACTIVE_EXECUTION_HOLD', rootDir, admission);
    }
    if (!existsSync(distDir)) {
      const finalAdmission = inspectActiveExecutionsInternal(
        rootDir,
        {},
        maintenance,
      );
      if (finalAdmission.decision !== 'ALLOW') {
        throw codedError(
          'E_CLEAN_ACTIVE_EXECUTION_HOLD',
          rootDir,
          finalAdmission,
        );
      }
      outcome = {
        removed: 0,
        preserved: [],
        distDir: join(physicalRoot, 'dist'),
        admission: finalAdmission,
      };
      assertPinnedDirectoryIdentity(
        namedRoot,
        pinnedRoot,
        'E_CLEAN_PROJECT_ROOT_IDENTITY_CHANGED',
      );
    } else {
      const distStats = lstatSync(distDir, { bigint: true });
      if (distStats.isSymbolicLink()) {
        throw codedError('E_CLEAN_DIST_SYMLINK', distDir);
      }
      if (!distStats.isDirectory()) {
        throw codedError('E_CLEAN_DIST_NOT_DIRECTORY', distDir);
      }

      const physicalDist = realpathSync.native(distDir);
      if (dirname(physicalDist) !== physicalRoot) {
        throw codedError('E_CLEAN_DIST_BOUNDARY', physicalDist);
      }

      const pinnedDist = pinIdentityStableDirectory(
        distDir,
        distStats,
        pinnedRoot,
      );
      const preservedPins = [];
      let pinnedOperationError;
      try {
        const stableDist = pinnedDist.stablePath;
        const entries = readdirSync(stableDist).sort();
        const preservedEntries = new Set();
        const preserved = [];
        for (const entry of entries) {
          if (isPreservedEntry(stableDist, entry)) {
            const preservedPath = join(stableDist, entry);
            const preservedStats = lstatSync(
              preservedPath,
              { bigint: true },
            );
            if (preservedStats.isSymbolicLink()) {
              throw codedError('E_CLEAN_PRESERVED_SYMLINK', preservedPath);
            }
            if (!preservedStats.isDirectory()) {
              throw codedError(
                'E_CLEAN_PRESERVED_NOT_DIRECTORY',
                preservedPath,
              );
            }
            const pinnedPreserved = pinIdentityStableDirectory(
              preservedPath,
              preservedStats,
              pinnedDist,
            );
            preservedPins.push({
              entry,
              path: preservedPath,
              pinned: pinnedPreserved,
            });
            preservedEntries.add(entry);
            preserved.push(entry);
          }
        }

        const entriesToRemove = entries.filter(
          entry => !preservedEntries.has(entry),
        );
        if (entriesToRemove.length > 0) {
          const mutationBoundaryAdmission =
            inspectActiveExecutionsInternal(rootDir, {}, maintenance);
          if (mutationBoundaryAdmission.decision !== 'ALLOW') {
            throw codedError(
              'E_CLEAN_ACTIVE_EXECUTION_HOLD',
              rootDir,
              mutationBoundaryAdmission,
            );
          }
          assertPinnedDirectoryIdentity(
            distDir,
            pinnedDist,
            'E_CLEAN_DIST_IDENTITY_CHANGED',
          );
          // This commit is the durable pre-side-effect boundary. A crash from
          // the next instruction onward leaves an in-flight HOLD that cannot
          // expire or be retired by a dead-owner probe.
          irreversibleBoundary =
            beginCleanMaintenanceIrreversibleBoundary(
              rootDir,
              maintenance,
              { evidenceRefs: ['clean:dist-delete'] },
            );
          if (options.beforeMutation !== undefined) {
            // Injected code may mutate before returning or throwing, so it is
            // invoked only after the durable boundary commit.
            options.beforeMutation();
          }
          const postCallbackAdmission =
            inspectActiveExecutionsInternal(rootDir, {}, maintenance);
          if (postCallbackAdmission.decision !== 'ALLOW') {
            throw codedError(
              'E_CLEAN_ACTIVE_EXECUTION_HOLD',
              rootDir,
              postCallbackAdmission,
            );
          }
          assertPinnedDirectoryIdentity(
            distDir,
            pinnedDist,
            'E_CLEAN_DIST_IDENTITY_CHANGED',
          );
        }

        let removed = 0;
        for (const entry of entriesToRemove) {
          options.beforeRemoveEntry?.(
            join(stableDist, entry),
            removed,
          );
          removeEntry(
            join(stableDist, entry),
            { recursive: true, force: true },
            pinnedDist,
          );
          removed += 1;
        }

        assertPinnedDirectoryIdentity(
          distDir,
          pinnedDist,
          'E_CLEAN_DIST_IDENTITY_CHANGED',
        );
        assertPinnedDirectoryIdentity(
          namedRoot,
          pinnedRoot,
          'E_CLEAN_PROJECT_ROOT_IDENTITY_CHANGED',
        );
        for (const preservedPin of preservedPins) {
          assertPinnedDirectoryIdentity(
            preservedPin.path,
            preservedPin.pinned,
            'E_CLEAN_PRESERVED_IDENTITY_CHANGED',
          );
        }
        const remaining = readdirSync(stableDist).sort();
        const expectedRemaining = [...preservedEntries].sort();
        if (remaining.length !== expectedRemaining.length
          || remaining.some(
            (entry, index) => entry !== expectedRemaining[index],
          )) {
          throw codedError('E_CLEAN_DIST_CONTENT_CHANGED', distDir);
        }

        // Canonical writers remain blocked by the maintenance DB generation.
        // This final scan catches observable legacy/non-canonical evidence
        // created after the mutation-boundary scan and retains authority.
        const finalAdmission = inspectActiveExecutionsInternal(
          rootDir,
          {},
          maintenance,
        );
        if (finalAdmission.decision !== 'ALLOW') {
          throw codedError(
            'E_CLEAN_ACTIVE_EXECUTION_HOLD',
            rootDir,
            finalAdmission,
          );
        }
        assertPinnedDirectoryIdentity(
          namedRoot,
          pinnedRoot,
          'E_CLEAN_PROJECT_ROOT_IDENTITY_CHANGED',
        );
        outcome = {
          removed,
          preserved,
          distDir: physicalDist,
          admission: finalAdmission,
        };
      } catch (error) {
        pinnedOperationError = error;
      }
      closePinnedDirectories(
        [
          pinnedDist,
          ...preservedPins.map(entry => entry.pinned),
        ],
        pinnedOperationError,
      );
    }
  } catch (error) {
    operationError = error;
  }

  if (operationError !== undefined && irreversibleBoundary !== undefined) {
    let quarantineError;
    try {
      irreversibleBoundary = quarantineCleanMaintenanceLock(
        rootDir,
        maintenance,
        {
          reason: 'partial-mutation',
          evidenceRefs: [
            'clean:dist-delete',
            `clean:error:${
              operationError && typeof operationError === 'object'
                && 'code' in operationError
                ? String(operationError.code)
                : 'unknown'
            }`,
          ].sort(),
        },
      );
    } catch (error) {
      quarantineError = error;
      // The already-committed in-flight row remains non-retirable HOLD.
    }
    const retainedError = codedError(
      quarantineError === undefined
        ? 'E_CLEAN_MUTATION_AUTHORITY_RETAINED'
        : 'E_CLEAN_MUTATION_QUARANTINE_UNCERTAIN',
      rootDir,
    );
    retainedError.cause = operationError;
    const report = maintenanceFailureReport(
      rootDir,
      retainedError,
      operationError && typeof operationError === 'object'
        && 'report' in operationError
        ? operationError.report
        : undefined,
    );
    addReason(report, {
      code: 'E_CLEAN_MUTATION_FAILED',
      surface: 'filesystem',
      subject: 'dist',
      detailCode: operationError && typeof operationError === 'object'
        && 'code' in operationError
        ? String(operationError.code)
        : 'E_CLEAN_DIST_UNKNOWN',
      evidenceRefs: [evidencePath(rootDir, distDir)],
    });
    throw codedError(
      quarantineError === undefined
        ? 'E_CLEAN_MUTATION_AUTHORITY_RETAINED'
        : 'E_CLEAN_MUTATION_QUARANTINE_UNCERTAIN',
      rootDir,
      finalizeAdmissionReport(report),
    );
  }

  let releaseError;
  try {
    if (irreversibleBoundary !== undefined) {
      const completed = completeCleanMaintenanceIrreversibleBoundary(
        rootDir,
        maintenance,
        {
          quarantineId: irreversibleBoundary.quarantineId,
          evidenceRefs: ['clean:dist-content-verified'],
        },
      );
      if (completed.projectionCleanup !== 'completed') {
        const uncertainty = codedError(
          'E_CLEAN_MAINTENANCE_RELEASE_UNCERTAIN',
          rootDir,
        );
        uncertainty.canonicalCommitState = 'committed';
        uncertainty.recoveryLock = maintenance;
        throw uncertainty;
      }
    } else {
      const released = releaseCleanMaintenanceLock(
        rootDir,
        maintenance,
      );
      if (!released) {
        throw codedError(
          'E_CLEAN_MAINTENANCE_AUTHORITY_OWNERSHIP_LOST',
          rootDir,
        );
      }
    }
  } catch (error) {
    releaseError = error;
  }
  if (releaseError !== undefined) {
    const report = maintenanceFailureReport(
      rootDir,
      releaseError,
      operationError && typeof operationError === 'object'
        && 'report' in operationError
        ? operationError.report
        : undefined,
    );
    throw codedError(
      'E_CLEAN_MAINTENANCE_RELEASE_UNCERTAIN',
      rootDir,
      report,
    );
  }
  if (operationError !== undefined) throw operationError;
  return outcome;
}

const invokedDirectly =
  process.argv[1]
  && comparableEntryPath(fileURLToPath(import.meta.url)) === comparableEntryPath(process.argv[1]);

if (invokedDirectly) {
  try {
    const { removed, preserved, admission } = cleanDist();
    writeSync(process.stdout.fd, `${JSON.stringify({
      schemaVersion: 1,
      decision: 'ALLOW',
      code: 'CLEAN_COMPLETED',
      removed,
      preserved,
      admission,
    })}\n`);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : 'E_CLEAN_DIST_UNKNOWN';
    const report = error && typeof error === 'object' && 'report' in error
      ? error.report
      : {
          schemaVersion: 1,
          authority: 'deckent.clean.active-execution.v1',
          decision: 'HOLD',
          code,
          reasons: [],
        };
    writeSync(process.stderr.fd, `${JSON.stringify(report)}\n`);
    process.exitCode = 1;
  }
}
