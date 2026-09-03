import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processStartToken } from '../dist/core/pid-ownership.js';
import { resolveTaskArtifactArchiveDir } from '../dist/core/sprint-archive.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = join(repoRoot, 'dist', 'cli', 'entry.js');

function runBinary(args, cwd) {
  return new Promise((resolveRun, reject) => {
    const env = { ...process.env, NO_COLOR: '1', DECKENT_OFFLINE: '1' };
    for (const key of [
      'VITEST',
      'VITEST_POOL_ID',
      'VITEST_WORKER_ID',
      'NODE_ENV',
      'DECKENT_TEST_HERMETICITY',
      'NODE_CHANNEL_FD',
      'NODE_CHANNEL_SERIALIZATION_MODE',
    ]) delete env[key];
    const captureDir = mkdtempSync(join(tmpdir(), 'deckent-binary-stdio-'));
    const stdoutPath = join(captureDir, 'stdout');
    const stderrPath = join(captureDir, 'stderr');
    const stdoutFd = openSync(stdoutPath, 'w');
    const stderrFd = openSync(stderrPath, 'w');
    let descriptorsClosed = false;
    const closeDescriptors = () => {
      if (descriptorsClosed) return;
      descriptorsClosed = true;
      closeSync(stdoutFd);
      closeSync(stderrFd);
    };
    const child = spawn(process.execPath, [entryPath, ...args], {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', stdoutFd, stderrFd],
    });
    let settled = false;
    let timedOut = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      closeDescriptors();
      callback();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 30_000);
    child.once('error', (error) => {
      finish(() => {
        rmSync(captureDir, { recursive: true, force: true });
        reject(error);
      });
    });
    child.once('close', (code) => {
      finish(() => {
        try {
          resolveRun({
            code: code ?? 1,
            stdout: readFileSync(stdoutPath, 'utf8'),
            stderr: readFileSync(stderrPath, 'utf8'),
            timedOut,
          });
        } finally {
          rmSync(captureDir, { recursive: true, force: true });
        }
      });
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForFile(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!exists(path)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise(resolveWait => { setTimeout(resolveWait, 10); });
  }
}

function exists(path) {
  return existsSync(path);
}

function parseNonEmptyJson(result, label) {
  assert(result.timedOut !== true, `${label}: exceeded the 30s binary contract deadline`);
  assert(result.code === 0, `${label}: exit=${result.code} stderr=${JSON.stringify(result.stderr)}`);
  assert(result.stdout.length > 0, `${label}: exit zero with empty stdout`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label}: stdout is not JSON: ${JSON.stringify(result.stdout)}`, {
      cause: error,
    });
  }
}

async function verifyStatusBinary() {
  const root = mkdtempSync(join(tmpdir(), 'deckent-status-binary-contract-'));
  try {
    const result = await runBinary(['status', '--json'], root);
    const payload = parseNonEmptyJson(result, 'status --json');
    assert(payload.active === false, 'status --json: expected active=false');
    assert(payload.lifecycle === 'IDLE', 'status --json: expected lifecycle=IDLE');
    assert(payload.authority?.lifecycle === 'IDLE', 'status --json: missing canonical authority');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function verifyRecoveryBinary() {
  const root = mkdtempSync(join(tmpdir(), 'deckent-recovery-binary-contract-'));
  try {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const statePath = join(root, '.deckent', 'sprint-state.json');
    const taskPath = join(root, '.tasks', 'task-991-001.json');
    writeFileSync(statePath, JSON.stringify({
      sprintId: 'sprint-991',
      phase: 'EVALUATE',
      status: 'PAUSED',
    }));
    writeFileSync(join(root, '.deckent', 'pause-state.json'), JSON.stringify({
      sprintId: 'sprint-991',
      phase: 'EVALUATE',
      status: 'PAUSED',
    }));
    writeFileSync(taskPath, JSON.stringify({
      id: '991-001',
      sprintId: 'sprint-991',
      status: 'PENDING',
    }));
    const before = `${readFileSync(statePath, 'utf8')}\0${readFileSync(taskPath, 'utf8')}`;

    const result = await runBinary([
      'recover',
      'sprint-991',
      '--dry-run',
      '--json',
    ], root);
    const payload = parseNonEmptyJson(result, 'recover --dry-run --json');
    assert(payload.sprintId === 'sprint-991', 'recover: wrong sprint identity');
    assert(payload.dryRun === true, 'recover: dryRun authority missing');
    assert(payload.identity?.executionId === 'sprint-991', 'recover: execution identity missing');
    assert(payload.taskFilesPreserved === 1, 'recover: task preservation count mismatch');
    const after = `${readFileSync(statePath, 'utf8')}\0${readFileSync(taskPath, 'utf8')}`;
    assert(after === before, 'recover dry-run mutated lifecycle/task bytes');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function verifyForceFinalizeContainmentBinary() {
  if (process.platform !== 'linux') return;
  const root = mkdtempSync(join(tmpdir(), 'deckent-finalize-binary-contract-'));
  let coordinator;
  try {
    mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
    mkdirSync(join(root, '.brain'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    // The production terminal archive requires a repo-local Brain database
    // before it can atomically adopt the archive index.  This is a disposable
    // scratch product database, not a copy/projection of the repository DB;
    // MemoryStore initializes its schema during the real compiled flow.
    writeFileSync(join(root, '.brain', 'memory.db'), Buffer.alloc(0), { mode: 0o600 });
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'deckent-finalize-binary-contract',
      version: '1.0.0',
    }));
    writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({
      language: 'en',
      cleanup_delay_ms: 0,
      lifecycle_recovery: {
        coordinator_termination_grace_ms: 1_000,
        termination_poll_interval_ms: 20,
        forced_termination_verify_ms: 1_000,
      },
    }));
    const statePath = join(root, '.deckent', 'sprint-state.json');
    writeFileSync(statePath, JSON.stringify({
      sprintId: 'sprint-992',
      phase: 'EVALUATE',
      status: 'ACTIVE',
      startedAt: '2026-07-31T00:00:00.000Z',
      taskIds: ['992-001'],
    }));
    writeFileSync(join(root, '.tasks', 'task-992-001.json'), JSON.stringify({
      id: '992-001',
      title: 'Containment fixture',
      description: 'Real-binary coordinator containment proof',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'integration proof',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'done', noGoCriteria: 'failed', techDebtAcceptable: 'none' },
      status: 'DONE',
      sprintId: 'sprint-992',
      createdAt: '2026-07-31T00:00:00.000Z',
    }));
    writeFileSync(join(root, '.tasks', 'task-992-001.result'), JSON.stringify({
      taskId: '992-001',
      workerId: 'w-992-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      evaluationDecision: 'DONE',
      notes: 'fixture complete',
      workAttribution: {
        state: 'VERIFIED',
        attemptId: 'binary-contract-attempt-992-001',
        baselineRef: 'binary-contract:fixture-baseline',
        scopeDigest: '9'.repeat(64),
      },
    }));
    // This used to be mistaken for a task record by finalize auto-detection.
    writeFileSync(join(root, '.tasks', 'task-992-001.landing-proposal.json'), JSON.stringify({
      taskId: '992-001',
      attemptId: 'attempt-1',
      sequence: 1,
    }));
    const landingProposalPath = join(root, '.tasks', 'task-992-001.landing-proposal.json');
    const landingProposalBytes = readFileSync(landingProposalPath, 'utf8');
    const temporaryResiduePath = join(root, '.tasks', 'task-992-001.result.tmp');
    writeFileSync(temporaryResiduePath, '{incomplete terminal residue');
    const receiptPath = join(
      root,
      '.deckent',
      'recently-works',
      'sprint-992-terminal-receipt.json',
    );

    const signalMarker = join(root, 'coordinator-sigterm.marker');
    coordinator = spawn(process.execPath, ['-e', [
      "const fs = require('node:fs');",
      "process.on('SIGTERM', () => {",
      "  fs.writeFileSync(process.env.DECKENT_TEST_SIGNAL_MARKER, 'received');",
      '  setInterval(() => {}, 1000);',
      '});',
      'setInterval(() => {}, 1000);',
    ].join('\n')], {
      cwd: root,
      stdio: 'ignore',
      shell: false,
      env: { ...process.env, DECKENT_TEST_SIGNAL_MARKER: signalMarker },
    });
    assert(typeof coordinator.pid === 'number', 'finalize: coordinator pid missing');
    const coordinatorClosed = new Promise(resolveClose => {
      coordinator.once('close', code => resolveClose(code));
    });
    const startToken = processStartToken(coordinator.pid);
    assert(/^s\d+$/.test(startToken ?? ''), 'finalize: exact process start token missing');
    const pidPath = join(root, '.deckent', 'pids', 'sprint-992.pid');
    writeFileSync(pidPath, JSON.stringify({
      pid: coordinator.pid,
      sprintId: 'sprint-992',
      startedAt: '2026-07-31T00:00:00.000Z',
      startToken,
    }));

    const finalizePromise = runBinary([
      'finalize',
      '--sprint', 'sprint-992',
      '--force',
      '--skip-hooks',
      '--skip-decay',
    ], root);
    await waitForFile(signalMarker, 5_000);
    const duringContainment = JSON.parse(readFileSync(statePath, 'utf8'));
    assert(
      duringContainment.status === 'ACTIVE' && duringContainment.phase === 'EVALUATE',
      'finalize: terminal authority published before exact coordinator death',
    );
    assert(!exists(receiptPath), 'finalize: terminal receipt published before exact coordinator death');
    const result = await finalizePromise;
    await coordinatorClosed;
    assert(!result.timedOut, 'finalize: binary contract timed out');
    assert(result.code === 0, `finalize: exit=${result.code} stderr=${JSON.stringify(result.stderr)}`);
    assert(result.stdout.includes('sprint-992'), 'finalize: terminal completion output missing');
    assert(!exists(pidPath), 'finalize: pid authority survived terminal publication');
    assert(exists(receiptPath), 'finalize: terminal receipt was not published before archive completion');
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    assert(receipt.receipt?.sprintId === 'sprint-992', 'finalize: terminal receipt sprint identity mismatch');
    const archivedTaskRoot = resolveTaskArtifactArchiveDir(root, 'sprint-992');
    const archivedLandingProposalPath = join(
      archivedTaskRoot,
      'task-992-001.landing-proposal.json',
    );
    const archivedTemporaryResiduePath = join(
      archivedTaskRoot,
      'task-992-001.result.tmp',
    );
    assert(
      !exists(landingProposalPath)
        && !exists(temporaryResiduePath)
        && readFileSync(archivedLandingProposalPath, 'utf8') === landingProposalBytes
        && readFileSync(archivedTemporaryResiduePath, 'utf8') === '{incomplete terminal residue',
      'finalize: landing proposal or temporary residue was not retired byte-exactly',
    );
    const terminal = JSON.parse(readFileSync(statePath, 'utf8'));
    assert(
      terminal.status === 'ABORTED' && terminal.phase === 'EVALUATE',
      'finalize: exact ABORTED containment truth was not published',
    );
    writeFileSync(join(root, '.dashboard'), JSON.stringify({
      sprint: { id: 'sprint-992', phase: 'EXECUTE', status: 'EXECUTING' },
      agents: [{ id: 'stale-worker', status: 'EXECUTING' }],
      progress: { done: 0, active: 1, blocked: 0, total: 1 },
    }));
    const status = await runBinary(['status', '--json'], root);
    const statusPayload = parseNonEmptyJson(status, 'status --json after terminal publication');
    assert(statusPayload.lifecycle === 'ABORTED', 'status: stale residue regressed canonical ABORTED');
    assert(
      statusPayload.terminalPublication?.state === 'receipt-observed'
        && statusPayload.terminalPublication.receipt?.sprintId === 'sprint-992'
        && statusPayload.terminalPublication.receipt?.terminalOutcome === 'ABORTED',
      'status: terminal receipt was not projected after cleanup residue',
    );
  } finally {
    if (coordinator && coordinator.exitCode === null) {
      try { coordinator.kill('SIGKILL'); } catch { /* already stopped */ }
    }
    rmSync(root, { recursive: true, force: true });
  }
}

await verifyStatusBinary();
await verifyRecoveryBinary();
await verifyForceFinalizeContainmentBinary();
process.stdout.write('binary-contracts: PASS (status, recovery, exact containment, receipt, residue, monotonic status)\n');
