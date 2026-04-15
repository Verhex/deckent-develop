// ─── Docker Spawn Backend ─────────────────────────────────────────────────
// Spawns workers in isolated Docker containers.
// Each worker gets its own filesystem namespace — no cross-worker interference.
// Results collected via shared .tasks/ volume mount.

import { spawnSync, spawn as nodeSpawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, openSync, fsyncSync, closeSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { homedir, totalmem } from 'node:os';
import type { ModelType } from '../core/types.js';
import { TASKS_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import type { SpawnBackend, SpawnBackendOptions } from './spawn-backend.js';
import { SpawnBackendError } from './spawn-backend.js';

// ─── Constants ────────────────────────────────────────────────────────────

const DEFAULT_IMAGE = 'deckent-worker:latest';
const DEFAULT_TIMEOUT_SECONDS = 1200; // 20 minutes
const CONTAINER_WORKSPACE = '/workspace';
const CONTAINER_PREFIX = 'deckent-w-';

// ─── Docker Spawn Backend ─────────────────────────────────────────────────

export class DockerSpawnBackend implements SpawnBackend {
  readonly name = 'docker';

  private readonly projectDir: string;
  private readonly image: string;
  private readonly timeoutSeconds: number;
  private readonly containers = new Map<string, string>(); // taskId → containerId

  constructor(projectDir: string, opts?: { image?: string; timeoutSeconds?: number }) {
    this.projectDir = resolve(projectDir);
    this.image = opts?.image ?? DEFAULT_IMAGE;
    this.timeoutSeconds = opts?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  }

  /**
   * Spawn a worker in an isolated Docker container.
   *
   * Container setup:
   * - Project directory mounted read-only at /workspace
   * - .tasks/ mounted read-write (shared volume for results)
   * - Claude auth cache mounted read-only
   * - API keys passed as env vars if available
   * - timeout wrapper kills container after limit
   */
  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    mkdirSync(tasksDir, { recursive: true });

    // Guard: verify Docker image exists before attempting spawn
    const imageCheck = spawnSync('docker', ['images', '-q', this.image], {
      encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!imageCheck.stdout?.trim()) {
      throw new SpawnBackendError(
        `Docker image '${this.image}' not found. Run: docker build -f Dockerfile.worker -t ${this.image} .`,
        'docker',
      );
    }

    // WSL2 memory warning — Docker containers share WSL2 memory pool
    if (process.platform === 'linux') {
      try {
        const procVersion = readFileSync('/proc/version', 'utf-8');
        if (procVersion.includes('microsoft') || procVersion.includes('WSL')) {
          const totalGB = Math.round(totalmem() / (1024 * 1024 * 1024));
          if (totalGB < 6) {
            debugLog('docker-backend:wsl2-memory',
              `WSL2 total memory ${totalGB}GB — Docker workers need ~4GB each. Consider increasing .wslconfig memory.`);
          }
        }
      } catch { /* /proc/version not readable — skip WSL2 check */ }
    }

    // Write prompt to shared .tasks/ volume
    // Hash-based naming: .prompt-{taskId}-{hash} for initial workers,
    // .prompt-{taskId}-{hash}-fix for fix/retry workers (isPriorityFix flag)
    const promptId = randomBytes(8).toString('hex');
    const fixSuffix = opts?.isPriorityFix ? '-fix' : '';
    const promptFileName = `.prompt-${taskId}-${promptId}${fixSuffix}.txt`;
    const promptHostPath = join(tasksDir, promptFileName);
    writeFileSync(promptHostPath, prompt, 'utf-8');

    // Build Claude CLI command inside container
    const claudeArgs: string[] = ['-p', '-', '--model', model];
    if (opts?.allowedTools) {
      // Double-quote the value — allowedTools contains parentheses like Write(.tasks/)
      // which sh (dash) interprets as subshell syntax without quoting
      claudeArgs.push('--allowedTools', `"${opts.allowedTools}"`);
    }
    // IMMUTABLE — Deckent standard: workers MUST have full write permissions
    claudeArgs.push('--dangerously-skip-permissions');

    const claudeCmd = `claude ${claudeArgs.join(' ')}`;
    const resultPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.result`;
    const timeoutPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.timeout`;
    const fallbackJson = JSON.stringify({
      taskId, workerId: `docker-${taskId}`, filesChanged: [], linesAdded: 0,
      linesRemoved: 0, testsPassed: false, coverage: 0,
      selfAssessment: 'NO_GO', notes: 'Docker worker exited without writing result file',
    });
    // Build docker run args
    // Run as host user to avoid root — Claude CLI blocks --dangerously-skip-permissions as root
    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const home = homedir();

    // Container HOME: use /tmp/deckent-home to avoid missing host HOME directory
    // Host HOME (e.g. /home/alperen) doesn't exist in container filesystem.
    // Claude CLI needs a writable HOME for config + cache.
    const containerHome = '/tmp/deckent-home';

    // Write worker script to .tasks/ — avoids shell quoting issues with allowedTools parentheses
    const scriptFileName = `.worker-${taskId}.sh`;
    const scriptHostPath = join(tasksDir, scriptFileName);
    const hbContainerPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.hb`;
    // Sprint 139: fsync_file helper ensures data hits disk before SIGKILL arrives.
    // Uses dd + sync as POSIX-portable fsync (no Python/perl dependency in Alpine).
    const scriptContent = [
      '#!/bin/sh',
      `RFILE="${resultPath}"`,
      `HBFILE="${hbContainerPath}"`,
      // POSIX-portable fsync: copy file to itself via dd conv=fsync
      // This forces OS buffer cache → disk. Survives SIGKILL after return.
      'fsync_file() { [ -f "$1" ] && dd if="$1" of="$1.fsync" bs=4096 conv=fsync 2>/dev/null && mv "$1.fsync" "$1" 2>/dev/null; }',
      // Ensure session-env exists (Claude CLI requires it)
      `mkdir -p "${containerHome}/.claude" 2>/dev/null || true`,
      `touch "${containerHome}/.claude/session-env" 2>/dev/null || true`,
      // EXIT trap: guarantees .result file is ALWAYS written + fsync'd, even if Claude crashes
      // Sprint 139: added fsync_file call to force disk write before container dies
      `trap '[ -f "$RFILE" ] || echo '"'"'${fallbackJson}'"'"' > "$RFILE"; fsync_file "$RFILE"; fsync_file "$HBFILE"; kill $HB_PID 2>/dev/null' EXIT`,
      // SIGTERM trap: on graceful stop, fsync .result immediately (before grace period expires)
      `trap 'fsync_file "$RFILE"; fsync_file "$HBFILE"; exit 0' TERM`,
      // Heartbeat update loop (every 15s) — prevents false stale alerts
      `( SEQ=2; while true; do sleep 15; SEQ=$((SEQ+1)); echo "{\\"workerId\\":\\"docker-${taskId}\\",\\"taskId\\":\\"${taskId}\\",\\"status\\":\\"EXECUTING\\",\\"sequence\\":$SEQ,\\"timestamp\\":\\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\\",\\"backend\\":\\"docker\\"}" > "$HBFILE"; done ) &`,
      'HB_PID=$!',
      `timeout ${this.timeoutSeconds} ${claudeCmd} < "${CONTAINER_WORKSPACE}/${TASKS_DIR}/${promptFileName}" || echo "WORKER_TIMEOUT" > "${timeoutPath}"`,
    ].join('\n');
    writeFileSync(scriptHostPath, scriptContent, { mode: 0o755 });

    const containerCmd = `sh ${CONTAINER_WORKSPACE}/${TASKS_DIR}/${scriptFileName}`;

    const containerName = `${CONTAINER_PREFIX}${taskId}`;
    const dockerArgs: string[] = [
      'run', '-d',
      '--name', containerName,
      // Run as host user (non-root) — required for --dangerously-skip-permissions
      '--user', `${uid}:${gid}`,
      // HOME must point to a directory that EXISTS in the container
      '-e', `HOME=${containerHome}`,
      // Memory limits — Claude CLI needs ~1-2GB base, leave headroom
      '--memory', '4g',
      '--memory-swap', '6g',
      // Writable HOME via tmpfs — Claude CLI needs to write config/cache here
      '--tmpfs', `${containerHome}:size=100m,uid=${uid},gid=${gid}`,
      // Project mounted read-write — workers need to create/edit files in scope
      '-v', `${dir}:${CONTAINER_WORKSPACE}`,
      // .tasks/ mounted read-write (results, heartbeats, prompts)
      '-v', `${tasksDir}:${CONTAINER_WORKSPACE}/${TASKS_DIR}`,
      // .locks/ mounted read-write (file locking)
      '-v', `${join(dir, '.locks')}:${CONTAINER_WORKSPACE}/.locks`,
      // Claude auth — mount host credentials into container HOME (rw: session-env must be writable)
      '-v', `${join(home, '.claude')}:${containerHome}/.claude`,
      // Claude config — ~/.claude.json (settings, permissions)
      ...(existsSync(join(home, '.claude.json'))
        ? ['-v', `${join(home, '.claude.json')}:${containerHome}/.claude.json:ro`]
        : []),
      // Working directory
      '-w', CONTAINER_WORKSPACE,
    ];

    // Pass Deckent worker context env vars (for SIGTERM handler in worker.ts)
    dockerArgs.push('-e', `DECKENT_TASK_ID=${taskId}`);
    dockerArgs.push('-e', `DECKENT_PROJECT_ROOT=${CONTAINER_WORKSPACE}`);

    // Pass API keys if available (for Codex/Gemini providers)
    const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DECKENT_DEBUG'];
    for (const key of envKeys) {
      if (process.env[key]) {
        dockerArgs.push('-e', `${key}=${process.env[key]}`);
      }
    }

    // Container image and command
    dockerArgs.push(this.image, 'sh', '-c', containerCmd);

    debugLog('docker-backend:spawn', `taskId=${taskId} container=${containerName} model=${model}`);

    // Run docker command
    const result = spawnSync('docker', dockerArgs, {
      encoding: 'utf-8',
      timeout: 30_000, // 30s to start container
    });

    if (result.status !== 0) {
      debugLog('docker-backend:spawn-error', `${result.stderr?.trim()}`);
      // Write .timeout marker so result-collector doesn't wait forever
      writeFileSync(join(tasksDir, `task-${taskId}.timeout`), 'container_start_failed', 'utf-8');
      return;
    }

    const containerId = result.stdout?.trim() ?? '';
    this.containers.set(taskId, containerId);
    debugLog('docker-backend:spawn-ok', `taskId=${taskId} containerId=${containerId.slice(0, 12)}`);

    // Write initial heartbeat
    const hbPath = join(tasksDir, `task-${taskId}.hb`);
    writeFileSync(hbPath, JSON.stringify({
      workerId: `docker-${taskId}`,
      taskId,
      status: 'EXECUTING',
      sequence: 1,
      timestamp: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      backend: 'docker',
      containerId: containerId.slice(0, 12),
    }, null, 2), 'utf-8');

    // Set up container monitoring (async, fire-and-forget)
    this.monitorContainer(taskId, containerName, tasksDir);
  }

  /**
   * Gracefully stop a running worker container.
   *
   * Sprint 139 fix: increased grace period from 10s to 15s and added post-stop
   * result file verification. The sequence:
   * 1. `docker stop --time=15` sends SIGTERM → worker's trap runs fsync_file
   * 2. If .result exists after stop, verify it's readable (fsync confirmation)
   * 3. If .result missing + non-zero exit, write fallback NO_GO result
   * 4. Remove container
   *
   * This closes the 5-sprint exit-137 bug: even if SIGKILL fires after 15s,
   * the SIGTERM trap has already fsync'd .result to disk.
   */
  kill(taskId: string): void {
    const containerName = `${CONTAINER_PREFIX}${taskId}`;
    debugLog('docker-backend:kill', `taskId=${taskId} (graceful stop --time=15)`);

    try {
      // Graceful: SIGTERM + 15s grace period (Sprint 139: was 10s, now 15s)
      const stopResult = spawnSync('docker', ['stop', '--time=15', containerName], {
        encoding: 'utf-8', timeout: 20_000, // 20s > 15s grace to avoid race
      });
      if (stopResult.status !== 0) {
        // Fallback: force kill if stop failed (container may already be gone)
        debugLog('docker-backend:stop-failed', `Falling back to docker kill: ${stopResult.stderr?.trim()}`);
        spawnSync('docker', ['kill', containerName], { encoding: 'utf-8', timeout: 10_000 });
      }
    } catch (e) { debugLog('docker-backend:kill-error', e); }

    // Post-stop verification: ensure .result was persisted to disk
    this.verifyResultAfterStop(taskId);

    try {
      spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf-8', timeout: 10_000 });
    } catch (e) { debugLog('docker-backend:rm-error', e); }

    this.containers.delete(taskId);
  }

  /**
   * Verify .result file exists and is readable after container stop.
   * If the file exists, fsync it from host side as belt-and-suspenders.
   * If missing, log a warning (monitorContainer EXIT trap should have written fallback).
   */
  private verifyResultAfterStop(taskId: string): void {
    const resultPath = join(this.projectDir, TASKS_DIR, `task-${taskId}.result`);
    try {
      if (existsSync(resultPath)) {
        // Belt-and-suspenders: fsync from host side to ensure container writes are flushed
        const fd = openSync(resultPath, 'r');
        try { fsyncSync(fd); } finally { closeSync(fd); }
        debugLog('docker-backend:post-stop-verify', `taskId=${taskId} .result verified + fsynced`);
      } else {
        debugLog('docker-backend:post-stop-verify', `taskId=${taskId} .result MISSING after stop — EXIT trap should write fallback`);
      }
    } catch (e) {
      debugLog('docker-backend:post-stop-verify-error', `taskId=${taskId} ${e}`);
    }
  }

  /**
   * List currently active worker task IDs.
   */
  list(): string[] {
    return [...this.containers.keys()];
  }

  /**
   * Check if Docker is available.
   */
  async isAvailable(): Promise<boolean> {
    const result = spawnSync('docker', ['info'], {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0;
  }

  /**
   * Monitor container until it exits, then update heartbeat and cleanup.
   */
  private monitorContainer(taskId: string, containerName: string, tasksDir: string): void {
    const child = nodeSpawn('docker', ['wait', containerName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data: Buffer) => {
      const exitCode = parseInt(data.toString().trim(), 10);
      debugLog('docker-backend:exit', `taskId=${taskId} exitCode=${exitCode}`);

      // Sprint 139: fsync .result from host side before reading
      // Container's fsync_file trap may have run, but belt-and-suspenders from host
      const resultPath = join(tasksDir, `task-${taskId}.result`);
      try {
        if (existsSync(resultPath)) {
          const fd = openSync(resultPath, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
        }
      } catch { /* fsync best-effort — continue with reconciliation */ }

      // Determine heartbeat status: check .result file for reconciliation
      // If .result exists with DONE/GO_WITH_TECH_DEBT, treat as DONE regardless of exitCode
      // This prevents false "FAILED exitCode 137" alerts when container was SIGKILL'd
      // after worker already wrote a successful result
      let hbStatus: string = exitCode === 0 ? 'DONE' : 'FAILED';
      let hbExitCode = exitCode;

      if (exitCode !== 0) {
        try {
          if (existsSync(resultPath)) {
            const raw = readFileSync(resultPath, 'utf-8');
            // safe: result files written by writeResult with TaskResult shape
            const result = JSON.parse(raw) as { selfAssessment?: string };
            if (result.selfAssessment === 'DONE' || result.selfAssessment === 'GO_WITH_TECH_DEBT') {
              hbStatus = 'DONE';
              hbExitCode = 0;
              debugLog('docker-backend:reconcile', `taskId=${taskId} exitCode=${exitCode} but .result=${result.selfAssessment} → HB DONE`);
            }
          }
        } catch {
          // JSON parse fail or fs error → keep honest FAILED status
        }
      }

      // Update heartbeat
      const hbPath = join(tasksDir, `task-${taskId}.hb`);
      try {
        writeFileSync(hbPath, JSON.stringify({
          workerId: `docker-${taskId}`,
          taskId,
          status: hbStatus,
          sequence: 99,
          timestamp: new Date().toISOString(),
          exitCode: hbExitCode,
          backend: 'docker',
        }, null, 2), 'utf-8');
      } catch (e) { debugLog('docker-backend:hb-update', e); }

      // If no .result file and exit != 0, write timeout marker
      const timeoutPath = join(tasksDir, `task-${taskId}.timeout`);
      if (!existsSync(resultPath) && exitCode !== 0 && !existsSync(timeoutPath)) {
        writeFileSync(timeoutPath, `container_exit_${exitCode}`, 'utf-8');
      }

      // Extract container logs BEFORE removal (docker logs requires container to exist)
      try {
        const logResult = spawnSync('docker', ['logs', containerName], {
          encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'],
        });
        const logContent = (logResult.stdout ?? '') + (logResult.stderr ?? '');
        if (logContent.trim()) {
          const logPath = join(tasksDir, `task-${taskId}.log`);
          writeFileSync(logPath, logContent, 'utf-8');
        }
      } catch (e) { debugLog('docker-backend:log-extract', e); }

      // Cleanup container
      try {
        spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf-8', timeout: 10_000 });
      } catch (e) { debugLog('docker-backend:cleanup', e); }

      this.containers.delete(taskId);

      // NOTE: .prompt-* files are intentionally NOT deleted here.
      // Sprint 137 Alperen request: persist prompt files for analysis until sprint end.
      // Prompt files are archived by archivePromptFiles() during sprint cleanup/finalize.
      // Worker script (.worker-*.sh) files ARE cleaned up — they contain no useful debug info.
      try {
        const tmpFiles = readdirSync(tasksDir) as string[];
        for (const f of tmpFiles) {
          if (f.startsWith('.worker-') && f.endsWith('.sh')) {
            // Only cleanup worker scripts if no other container is running
            if (this.containers.size === 0) {
              try { unlinkSync(join(tasksDir, f)); } catch { /* ok */ }
            }
          }
        }
      } catch { /* ok */ }
    });

    child.on('error', (err) => {
      debugLog('docker-backend:monitor-error', `taskId=${taskId} ${err.message}`);
      this.containers.delete(taskId);
    });
  }
}

// ─── Docker Availability Check (sync) ─────────────────────────────────────

export function isDockerAvailable(): boolean {
  const result = spawnSync('docker', ['info'], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

// ─── Prompt File Archive ───────────────────────────────────────────────────

/**
 * Archive .prompt-* files from .tasks/ into .tasks/archive/sprint-{sprintId}/.
 *
 * Called during sprint finalize/cleanup — prompt files persist during the sprint
 * for analysis, then are moved to the archive directory on completion.
 *
 * @param tasksDir  Absolute path to .tasks/ directory
 * @param sprintId  Sprint identifier (e.g. "sprint-139")
 * @param retentionSprints  How many past sprint archives to keep (default 5)
 */
export function archivePromptFiles(
  tasksDir: string,
  sprintId: string,
  retentionSprints = 5,
): { archived: number; cleaned: number } {
  let archived = 0;
  let cleaned = 0;

  if (!existsSync(tasksDir)) return { archived, cleaned };

  // Create archive directory for this sprint
  const archiveDir = join(tasksDir, 'archive', sprintId);
  mkdirSync(archiveDir, { recursive: true });

  // Move all .prompt-* files to archive
  try {
    const files = readdirSync(tasksDir) as string[];
    for (const f of files) {
      if (f.startsWith('.prompt-') && f.endsWith('.txt')) {
        const src = join(tasksDir, f);
        const dst = join(archiveDir, f);
        try {
          renameSync(src, dst);
          archived++;
        } catch { /* skip files that can't be moved */ }
      }
    }
  } catch { /* ok — tasksDir may be empty */ }

  // Apply retention policy: remove old sprint archives beyond retentionSprints
  if (retentionSprints > 0) {
    const archiveRoot = join(tasksDir, 'archive');
    try {
      const sprintDirs = (readdirSync(archiveRoot) as string[])
        .filter(d => d.startsWith('sprint-'))
        .sort(); // alphabetical sort = chronological for sprint-NNN format
      const toRemove = sprintDirs.slice(0, Math.max(0, sprintDirs.length - retentionSprints));
      for (const dir of toRemove) {
        const dirPath = join(archiveRoot, dir);
        try {
          // Remove all files in the old archive sprint dir
          const oldFiles = readdirSync(dirPath) as string[];
          for (const f of oldFiles) {
            try { unlinkSync(join(dirPath, f)); cleaned++; } catch { /* ok */ }
          }
          // Remove the now-empty directory
          rmdirSync(dirPath);
        } catch { /* ok */ }
      }
    } catch { /* archive root may not exist yet */ }
  }

  return { archived, cleaned };
}
