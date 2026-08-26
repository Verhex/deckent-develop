// ─── Sprint 359 Task 002 (FAZ4A-S7 realigned): WRAPPER-HB retirement + ALLOWLIST-SSOT ──
//
// Two same-file contracts on spawn-backend-docker.ts:
//   (a) heartbeat authority (post born-468 evolution) — the wrapper's shell
//       heartbeat writer was RETIRED entirely: host observations are published
//       only through WorkerHeartbeatAuthorityStore (monotonic hostSequence
//       proof that can never regress). buildHeartbeatGateFn() /
//       buildHeartbeatWrapperLoop() remain exported as INERT compatibility
//       seams (`write_hb_if_stale() { return 0; }`) that must never supply a
//       shell timestamp or write a competing raw heartbeat, and the generated
//       worker script must not embed any wrapper heartbeat loop.
//   (b) born-471 ALLOWLIST-SSOT — buildDockerAllowedTools() derives the
//       docker backend's --allowedTools Write()/Edit() grant SOLELY from
//       scope.filesWrite when it is non-empty; scope.directories (read
//       context) is excluded, ending the redundant dir+file merge that
//       silently widened Write/Edit access beyond what the worker prompt
//       (PCOMP-W1) tells the worker.
//
// Hermetic: real fs + real tmpdir throughout (no node:fs mock — needed so
// the sh-fragment tests can execute real scripts against real files); only
// node:child_process (docker/claude spawnSync) plus file-lock/active-workers
// side-effect modules are mocked for the end-to-end spawn() integration test,
// matching the established pattern in wm5-auth-guard.test.ts /
// memory-limit-by-kind.test.ts. Async spawn only — no spawnSync in test code.

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { spawn as nodeSpawn } from 'node:child_process';
import {
  mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  budgetedDockerTaskJson,
} from '../helpers/budgeted-docker-execution-fixture.js';

import {
  buildDockerAllowedTools,
  buildHeartbeatGateFn,
  buildHeartbeatWrapperLoop,
  WRAPPER_HB_STALE_THRESHOLD_SECONDS,
} from '../../src/orchestra/spawn-backend-docker.js';

// ─── shared tmpdir helper ─────────────────────────────────────────────────

const tmpDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
});

function freshTmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

// ═══════════════════════════════════════════════════════════════════════════
// (b) born-471 ALLOWLIST-SSOT — buildDockerAllowedTools
// ═══════════════════════════════════════════════════════════════════════════

describe('buildDockerAllowedTools (born-471 ALLOWLIST-SSOT)', () => {
  it('filesWrite present → SOLE write authority; a read-only directory (docs/adr/) is excluded', () => {
    const result = buildDockerAllowedTools({
      directories: ['src/orchestra/', 'tests/orchestra/', 'docs/adr/'],
      filesWrite: ['src/orchestra/spawn-backend-docker.ts', 'tests/orchestra/wrapper-hb-allowlist.test.ts'],
    });
    expect(result).toBe(
      'Read,Write(.tasks/,src/orchestra/spawn-backend-docker.ts,tests/orchestra/wrapper-hb-allowlist.test.ts),'
      + 'Edit(.tasks/,src/orchestra/spawn-backend-docker.ts,tests/orchestra/wrapper-hb-allowlist.test.ts),'
      + 'Bash,Glob,Grep',
    );
    // docs/adr — a read-context directory with no matching filesWrite entry —
    // must not appear inside Write()/Edit() (the redundant-mix bug this fixes).
    expect(result).not.toContain('docs/adr');
    expect(result).not.toContain('src/orchestra/,'); // the bare read-dir, not the file
  });

  it('filesWrite empty, directories present → directories become the write-fallback target', () => {
    const result = buildDockerAllowedTools({ directories: ['src/core/'], filesWrite: [] });
    expect(result).toBe('Read,Write(.tasks/,src/core/),Edit(.tasks/,src/core/),Bash,Glob,Grep');
  });

  it('exact filesRead with no filesWrite → inspection-only; directories grant no Write/Edit', () => {
    const result = buildDockerAllowedTools({
      directories: ['src/core/', 'src/orchestra/'],
      filesRead: ['src/core/live-execution-budget.ts'],
      filesWrite: [],
    });
    expect(result).toBe('Read,Write(.tasks/),Edit(.tasks/),Bash,Glob,Grep');
    expect(result).not.toContain('Write(.tasks/,src/core/');
    expect(result).not.toContain('Edit(.tasks/,src/orchestra/');
  });

  it('neither directories nor filesWrite → narrows to .tasks/ only, never falls open unrestricted', () => {
    expect(buildDockerAllowedTools({ directories: [], filesWrite: [] }))
      .toBe('Read,Write(.tasks/),Edit(.tasks/),Bash,Glob,Grep');
    expect(buildDockerAllowedTools({}))
      .toBe('Read,Write(.tasks/),Edit(.tasks/),Bash,Glob,Grep');
  });

  it('always includes .tasks/ (heartbeat/result write authority) even with a narrow filesWrite', () => {
    const result = buildDockerAllowedTools({ directories: [], filesWrite: ['src/core/config.ts'] });
    expect(result).toContain('.tasks/');
  });

  it('dedupes and trims whitespace-padded / blank entries', () => {
    const result = buildDockerAllowedTools({
      directories: [],
      filesWrite: [' src/core/config.ts ', 'src/core/config.ts', '', '   '],
    });
    expect(result).toBe('Read,Write(.tasks/,src/core/config.ts),Edit(.tasks/,src/core/config.ts),Bash,Glob,Grep');
  });

  it('fixture-task: task-XXX.json round-trip through disk produces the exact expected string', () => {
    const dir = freshTmp('deckent-allowlist-fixture-');
    const tasksDir = join(dir, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    const fixtureTask = {
      id: '359-999',
      title: 'fixture task',
      scope: {
        directories: ['src/orchestra/', 'docs/adr/'],
        filesRead: [],
        filesWrite: ['src/orchestra/spawn-backend-docker.ts'],
      },
    };
    const taskJsonPath = join(tasksDir, 'task-359-999.json');
    writeFileSync(taskJsonPath, JSON.stringify(fixtureTask, null, 2), 'utf-8');

    // Mirror exactly what DockerSpawnBackend.resolveAllowedTools does with the
    // parsed JSON, proving the fixture's on-disk shape feeds buildDockerAllowedTools
    // correctly (the private method is a thin disk-read wrapper around this).
    const parsed = JSON.parse(readFileSync(taskJsonPath, 'utf-8')) as {
      scope: { directories: string[]; filesWrite: string[] };
    };
    const result = buildDockerAllowedTools(parsed.scope);
    expect(result).toBe(
      'Read,Write(.tasks/,src/orchestra/spawn-backend-docker.ts),'
      + 'Edit(.tasks/,src/orchestra/spawn-backend-docker.ts),Bash,Glob,Grep',
    );
    expect(result).not.toContain('docs/adr');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (a) heartbeat authority — buildHeartbeatGateFn / buildHeartbeatWrapperLoop are
// INERT compatibility seams. Host heartbeat observations flow exclusively
// through WorkerHeartbeatAuthorityStore (monotonic hostSequence — never
// regresses); the wrapper must never fabricate a shell heartbeat.
// ═══════════════════════════════════════════════════════════════════════════

describe('buildHeartbeatGateFn / buildHeartbeatWrapperLoop — inert compatibility seams (heartbeat authority moved to WorkerHeartbeatAuthorityStore)', () => {
  const gateFn = buildHeartbeatGateFn('hbgate-001');

  it('is the exact inert no-op — never probes $HBFILE mtime or computes an age', () => {
    expect(gateFn).toBe('write_hb_if_stale() { return 0; }');
    expect(gateFn).not.toContain('stat -c %Y');
    expect(gateFn).not.toContain('hb_age');
  });

  it('retains the documented threshold constant but no longer gates any write on it', () => {
    expect(WRAPPER_HB_STALE_THRESHOLD_SECONDS).toBe(40);
    expect(gateFn).not.toContain(String(WRAPPER_HB_STALE_THRESHOLD_SECONDS));
    expect(gateFn).toContain('return 0');
  });

  it('performs no write at all — no tmp file, no mv, no redirection into $HBFILE', () => {
    expect(gateFn).not.toContain('hb_tmp');
    expect(gateFn).not.toContain('mv ');
    expect(gateFn).not.toContain('>');
  });

  it('embeds no shell-fabricated heartbeat payload (no taskId/workerId JSON)', () => {
    expect(gateFn).not.toContain('taskId');
    expect(gateFn).not.toContain('workerId');
    expect(gateFn).not.toContain('hbgate-001');
  });

  it('buildHeartbeatWrapperLoop is the same inert seam — no 15s background driver, no subshell fork', () => {
    const loop = buildHeartbeatWrapperLoop('hbgate-002');
    expect(loop).toBe(buildHeartbeatGateFn('hbgate-002'));
    expect(loop).not.toContain('while true');
    expect(loop).not.toContain('sleep 15');
    expect(loop.trim().endsWith(') &')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (a) sh-fragment unit tests: real `sh` execution against real files — proves
// the inert seam NEVER writes: a worker's heartbeat (its monotonic proof) can
// never be regressed or clobbered by the wrapper, fresh OR stale OR missing.
// ═══════════════════════════════════════════════════════════════════════════

/** Run `write_hb_if_stale <seq>` for real via `sh`, against a real $HBFILE path. */
async function runHeartbeatGate(hbFilePath: string, seq: number): Promise<void> {
  const dir = freshTmp('deckent-hbgate-run-');
  const scriptPath = join(dir, 'run.sh');
  const script = [
    '#!/bin/sh',
    `HBFILE="${hbFilePath}"`,
    buildHeartbeatGateFn('hbgate-run'),
    `write_hb_if_stale ${seq}`,
  ].join('\n');
  writeFileSync(scriptPath, script, { mode: 0o755 });

  await new Promise<void>((resolveRun, rejectRun) => {
    const child = nodeSpawn('sh', [scriptPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`sh exited ${code}: ${stderr}`));
    });
  });
}

describe('write_hb_if_stale — real sh execution (proof-of-function: seam never writes)', () => {
  it('fresh $HBFILE (mtime just now) is NOT overwritten', async () => {
    const dir = freshTmp('deckent-hbgate-fresh-');
    const hbFile = join(dir, 'task-x.hb');
    const richContent = JSON.stringify({
      workerId: 'w-x', taskId: 'x', status: 'EXECUTING', sequence: 7, currentAction: 'editing src/x.ts',
    });
    writeFileSync(hbFile, richContent, 'utf-8');

    await runHeartbeatGate(hbFile, 99);

    const after = readFileSync(hbFile, 'utf-8');
    expect(after).toBe(richContent);
    expect(after).toContain('currentAction');
    expect(after).not.toContain('"sequence":99');
  });

  it('stale $HBFILE (mtime backdated past the retired threshold) is ALSO left untouched — the worker\'s monotonic proof never regresses', async () => {
    const dir = freshTmp('deckent-hbgate-stale-');
    const hbFile = join(dir, 'task-y.hb');
    const oldContent = JSON.stringify({ workerId: 'w-y', taskId: 'y', status: 'EXECUTING', sequence: 3 });
    writeFileSync(hbFile, oldContent, 'utf-8');
    const past = new Date(Date.now() - (WRAPPER_HB_STALE_THRESHOLD_SECONDS + 30) * 1000);
    utimesSync(hbFile, past, past);
    const staleMtimeMs = past.getTime();

    await runHeartbeatGate(hbFile, 12);

    // Byte-identical AND mtime-identical: the seam neither rewrote nor touched
    // the file. Staleness is now the host's problem (WorkerHeartbeatAuthorityStore
    // + container-state liveness), never a shell-fabricated overwrite.
    const after = readFileSync(hbFile, 'utf-8');
    expect(after).toBe(oldContent);
    const { statSync } = await import('node:fs');
    expect(Math.floor(statSync(hbFile).mtimeMs / 1000)).toBe(Math.floor(staleMtimeMs / 1000));
  });

  it('missing $HBFILE is NOT created — the wrapper never fabricates a heartbeat', async () => {
    const dir = freshTmp('deckent-hbgate-missing-');
    const hbFile = join(dir, 'task-z.hb');
    expect(existsSync(hbFile)).toBe(false);

    await runHeartbeatGate(hbFile, 2);

    expect(existsSync(hbFile)).toBe(false);
  });

  it('never leaves a dangling .hbwrap.$$ tmp file behind after a write', async () => {
    const dir = freshTmp('deckent-hbgate-tmpcleanup-');
    const hbFile = join(dir, 'task-w.hb');

    await runHeartbeatGate(hbFile, 4);

    const { readdirSync } = await import('node:fs');
    const leftovers = readdirSync(dir).filter((f) => f.includes('.hbwrap.'));
    expect(leftovers).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (b) born-471 — DockerSpawnBackend.spawn() integration: allowedTools reaches
// the generated worker script, sourced from the SSOT not opts.allowedTools.
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

vi.mock('../../src/core/file-lock.js', () => ({
  acquireSpawnLocks: vi.fn(),
  releaseAllSpawnLocks: vi.fn(() => 0),
  releaseStaleSpawnLocksForTask: vi.fn(() => 0),
  SpawnLockError: class extends Error {},
}));

vi.mock('../../src/core/active-workers.js', () => ({
  markPending: vi.fn(),
  markActive: vi.fn(),
  clearPending: vi.fn(),
}));

describe('DockerSpawnBackend.spawn() — allowedTools SSOT integration', () => {
  let capturedDockerRunArgs: string[][] = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
    capturedDockerRunArgs = [];
    const { spawnSync } = await import('node:child_process');
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      const argv = (args as string[] | undefined) ?? [];
      const sub = argv[0];
      let stdout = '';
      const status = 0;
      if (cmd === 'docker' && sub === 'images') stdout = 'imghash';
      else if (cmd === 'docker' && sub === 'run') {
        capturedDockerRunArgs.push([...argv]);
        stdout = 'a'.repeat(64);
      }
      else if (cmd === 'docker' && sub === 'inspect') stdout = 'true|0';
      else if (cmd === 'claude' && sub === '--version') stdout = 'claude 1.0.0 (host auth ok)';
      else if (cmd === 'claude' && sub === 'auth') stdout = JSON.stringify({ loggedIn: true });
      return {
        stdout, stderr: '', status, signal: null, pid: 1, output: ['', stdout, ''],
      } as unknown as ReturnType<typeof spawnSync>;
    });
  });

  it('derives --allowedTools from the task JSON scope, excluding a read-only directory, regardless of opts.allowedTools', async () => {
    const dir = freshTmp('deckent-ssot-spawn-');
    const tasksDir = join(dir, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    mkdirSync(join(dir, '.locks'), { recursive: true });
    const taskId = 'ssot-001';
    const taskPath = join(tasksDir, `task-${taskId}.json`);
    const budgetedTask = JSON.parse(
      budgetedDockerTaskJson(taskPath, { authMode: 'api' }),
    ) as Record<string, unknown>;
    writeFileSync(
      taskPath,
      JSON.stringify({
        ...budgetedTask,
        scope: {
          directories: ['src/orchestra/', 'docs/adr/'],
          filesRead: [],
          filesWrite: ['src/orchestra/spawn-backend-docker.ts'],
        },
      }),
      'utf-8',
    );

    const { DockerSpawnBackend } = await import('../../src/orchestra/spawn-backend-docker.js');
    const backend = new DockerSpawnBackend(dir);
    // Deliberately pass a WIDE (buggy-shape) opts.allowedTools that includes
    // the read-only directory — the docker backend must NOT use it verbatim.
    backend.spawn(taskId, 'claude-sonnet-5', 'prompt', {
      ...TEST_DOCKER_EXECUTION_OPTIONS,
      allowedTools: 'Read,Write(.tasks/,docs/adr/,src/orchestra/spawn-backend-docker.ts),Edit(.tasks/,docs/adr/,src/orchestra/spawn-backend-docker.ts),Bash,Glob,Grep',
    });
    await backend.lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    const scriptPath = join(tasksDir, `.worker-${taskId}.sh`);
    expect(existsSync(scriptPath)).toBe(true);
    const scriptContent = readFileSync(scriptPath, 'utf-8');

    expect(scriptContent).toContain(
      '--allowedTools "Read,Write(.tasks/,src/orchestra/spawn-backend-docker.ts),'
      + 'Edit(.tasks/,src/orchestra/spawn-backend-docker.ts),Bash,Glob,Grep"',
    );
    expect(scriptContent).not.toContain('docs/adr');
    // Heartbeat-authority contract: the generated script must NOT embed any
    // wrapper heartbeat writer/loop — host observations flow exclusively
    // through WorkerHeartbeatAuthorityStore. $HBFILE stays plumbed for the
    // worker CLI's own writes + on_exit fsync/read-back only.
    expect(scriptContent).not.toContain('write_hb_if_stale');
    expect(scriptContent).not.toContain('stat -c %Y "$HBFILE"');
    expect(scriptContent).toContain('HBFILE=');
    expect(scriptContent).toContain('fsync_file "$HBFILE"');
  });

  it('fails closed before Docker dispatch when no persisted task envelope exists', async () => {
    const dir = freshTmp('deckent-ssot-nofallback-');
    const tasksDir = join(dir, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    mkdirSync(join(dir, '.locks'), { recursive: true });
    const taskId = 'ssot-002';
    // No task-<id>.json is written. Remote landing authority requires the
    // durable task envelope before allowedTools resolution or Docker dispatch.

    const { DockerSpawnBackend } = await import('../../src/orchestra/spawn-backend-docker.js');
    const backend = new DockerSpawnBackend(dir);
    expect(() => backend.spawn(taskId, 'claude-sonnet-5', 'prompt', {
      ...TEST_DOCKER_EXECUTION_OPTIONS,
      allowedTools: 'Read,Bash',
    })).toThrow('could not read the persisted task');

    expect(capturedDockerRunArgs).toHaveLength(0);
    const scriptPath = join(tasksDir, `.worker-${taskId}.sh`);
    expect(existsSync(scriptPath)).toBe(false);
  });
});
