// ─── Docker Spawn Backend ─────────────────────────────────────────────────
// Spawns workers in isolated Docker containers.
// Each worker gets its own filesystem namespace — no cross-worker interference.
// Results collected via shared .tasks/ volume mount.

import { spawnSync, spawn as nodeSpawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import type { ModelType } from '../core/types.js';
import { TASKS_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import type { SpawnBackend, SpawnBackendOptions } from './spawn-backend.js';

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

    // Write prompt to shared .tasks/ volume
    const promptId = randomBytes(8).toString('hex');
    const promptFileName = `.prompt-${promptId}.txt`;
    const promptHostPath = join(tasksDir, promptFileName);
    writeFileSync(promptHostPath, prompt, 'utf-8');

    // Build Claude CLI command inside container
    const claudeArgs: string[] = ['-p', '-', '--model', model];
    if (opts?.allowedTools) {
      claudeArgs.push('--allowedTools', `'${opts.allowedTools}'`);
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
    // EXIT trap: guarantees .result file is ALWAYS written, even if Claude crashes
    const containerCmd = `RFILE=${resultPath}; trap '[ -f $RFILE ] || echo '"'"'${fallbackJson}'"'"' > $RFILE' EXIT; timeout ${this.timeoutSeconds} sh -c '${claudeCmd} < ${CONTAINER_WORKSPACE}/${TASKS_DIR}/${promptFileName}' || echo "WORKER_TIMEOUT" > ${timeoutPath}`;

    // Build docker run args
    // Run as host user to avoid root — Claude CLI blocks --dangerously-skip-permissions as root
    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const home = homedir();

    const containerName = `${CONTAINER_PREFIX}${taskId}`;
    const dockerArgs: string[] = [
      'run', '-d',
      '--name', containerName,
      // Run as host user (non-root) — required for --dangerously-skip-permissions
      '--user', `${uid}:${gid}`,
      '-e', `HOME=${home}`,
      // Project mounted read-only (workers can't corrupt main branch)
      '-v', `${dir}:${CONTAINER_WORKSPACE}:ro`,
      // .tasks/ mounted read-write (results, heartbeats, prompts)
      '-v', `${tasksDir}:${CONTAINER_WORKSPACE}/${TASKS_DIR}`,
      // .locks/ mounted read-write (file locking)
      '-v', `${join(dir, '.locks')}:${CONTAINER_WORKSPACE}/.locks`,
      // Claude auth — ~/.claude/ contains .credentials.json (session-based auth)
      '-v', `${join(home, '.claude')}:${home}/.claude:ro`,
      // Claude config — ~/.claude.json (settings, permissions)
      ...(existsSync(join(home, '.claude.json'))
        ? ['-v', `${join(home, '.claude.json')}:${home}/.claude.json:ro`]
        : []),
      // Working directory
      '-w', CONTAINER_WORKSPACE,
    ];

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
   * Kill a running worker container.
   */
  kill(taskId: string): void {
    const containerName = `${CONTAINER_PREFIX}${taskId}`;
    debugLog('docker-backend:kill', `taskId=${taskId}`);

    try {
      spawnSync('docker', ['kill', containerName], { encoding: 'utf-8', timeout: 10_000 });
    } catch (e) { debugLog('docker-backend:kill-error', e); }

    try {
      spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf-8', timeout: 10_000 });
    } catch (e) { debugLog('docker-backend:rm-error', e); }

    this.containers.delete(taskId);
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

      // Update heartbeat to DONE/FAILED
      const hbPath = join(tasksDir, `task-${taskId}.hb`);
      try {
        writeFileSync(hbPath, JSON.stringify({
          workerId: `docker-${taskId}`,
          taskId,
          status: exitCode === 0 ? 'DONE' : 'FAILED',
          sequence: 99,
          timestamp: new Date().toISOString(),
          exitCode,
          backend: 'docker',
        }, null, 2), 'utf-8');
      } catch (e) { debugLog('docker-backend:hb-update', e); }

      // If no .result file and exit != 0, write timeout marker
      const resultPath = join(tasksDir, `task-${taskId}.result`);
      const timeoutPath = join(tasksDir, `task-${taskId}.timeout`);
      if (!existsSync(resultPath) && exitCode !== 0 && !existsSync(timeoutPath)) {
        writeFileSync(timeoutPath, `container_exit_${exitCode}`, 'utf-8');
      }

      // Cleanup container
      try {
        spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf-8', timeout: 10_000 });
      } catch (e) { debugLog('docker-backend:cleanup', e); }

      this.containers.delete(taskId);

      // Cleanup prompt file
      try {
        const promptFiles = require('node:fs').readdirSync(tasksDir) as string[];
        for (const f of promptFiles) {
          if (f.startsWith('.prompt-') && f.endsWith('.txt')) {
            // Only cleanup if no other container is running
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
