// ─── tests/orchestra/docker-provider-cli.test.ts ────────────────────────────
//
// 364-004 DOCKER-PROVIDER-CLI — docker-backend parity + image-reality.
//
// Two concerns, mirroring 364-002's (SUBPROC-PROVIDER-CLI) test shape:
//   A) provider→cmd table in docker is the SAME shared table subprocess/tmux
//      reuse (core/provider-command-spec.ts PROVIDER_COMMAND_SPECS) — proven
//      by importing it directly and asserting the docker worker script was
//      built from it (import-proof, not a re-derived hardcode).
//   B) "image-reality" gate: `probeProviderCliPresentInImage` (pure) + the
//      opt-in `verifyProviderCliInImage` spawn-time honest-fail — the image
//      TAG existing (`docker images -q`, already covered by
//      docker-multicli-buildarg.test.ts) is NOT the same as the CLI actually
//      being on PATH inside it (a stale image built without
//      INSTALL_CODEX/INSTALL_GEMINI passes the tag check and only fails deep
//      inside the container today).
//
// The image-reality probe is default-OFF (see spawn-backend-docker.ts doc
// comment on probeProviderCliPresentInImage / verifyProviderCliInImage): an
// unconditional extra `docker run` per spawn would push a 2nd entry into
// several EXISTING docker-backend test suites' `capturedDockerRunArgs`
// (e.g. tests/orchestra/docker-provider-auth.test.ts asserts exactly 1 call
// for codex/gemini spawns) — out of this task's write scope to edit. Section D
// below proves that default-off backward-compat explicitly.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

// ─── Mocks (mirrors spawn-backend-docker.test.ts / docker-multicli-buildarg.test.ts) ──

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(() => {
    const stub = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn(), resume: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
      kill: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  openSync: vi.fn(() => 0),
  fsyncSync: vi.fn(),
  closeSync: vi.fn(),
  renameSync: vi.fn(),
  rmdirSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

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

vi.mock('../../src/core/task-result-settlement.js', () => {
  return import('../helpers/task-result-settlement-stub.js')
    .then(({ createTaskResultSettlementModuleStub }) => createTaskResultSettlementModuleStub());
});

vi.mock('../../src/orchestra/execution-landing-coordinator.js', async (importActual) => ({
  ...(await importActual<typeof import('../../src/orchestra/execution-landing-coordinator.js')>()),
  prepareDockerExecutionLanding: vi.fn(({ prompt }: { prompt: string }) => ({ prompt, context: null })),
}));

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  DockerSpawnBackend,
  probeProviderCliPresentInImage,
} from '../../src/orchestra/spawn-backend-docker.js';
import {
  buildProviderCommand,
  getProviderCommandSpec,
  PROMPT_CAT_TOKEN,
} from '../../src/core/provider-command-spec.js';
import type { ModelType } from '../../src/core/types.js';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  budgetedDockerTaskJson,
} from '../helpers/budgeted-docker-execution-fixture.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockReadFileSync = vi.mocked(readFileSync);

// ─── Spawn-seam router ───────────────────────────────────────────────────────

interface SpawnSyncOutcome {
  stdout: string;
  stderr: string;
  status: number | null;
}

const capturedRealRunArgs: string[][] = [];
const capturedProbeRunArgs: string[][] = [];

/**
 * @param cliPresent  what the `docker run --rm <image> sh -c 'command -v <bin>'`
 *                     probe reports: true → exit 0 (found); false → exit 1 (not found).
 */
function installSpawnRouter(cliPresent: boolean): void {
  capturedRealRunArgs.length = 0;
  capturedProbeRunArgs.length = 0;
  const fallback: SpawnSyncOutcome = { stdout: '', stderr: '', status: 0 };

  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];

    let outcome: SpawnSyncOutcome = fallback;
    if (cmd === 'sleep') {
      outcome = fallback;
    } else if (cmd === 'docker' && sub === 'images') {
      outcome = { stdout: 'imghash', stderr: '', status: 0 };
    } else if (cmd === 'docker' && sub === 'run' && argv.includes('--rm')) {
      capturedProbeRunArgs.push([...argv]);
      outcome = { stdout: '', stderr: '', status: cliPresent ? 0 : 1 };
    } else if (cmd === 'docker' && sub === 'run') {
      capturedRealRunArgs.push([...argv]);
      outcome = { stdout: 'container-id-x', stderr: '', status: 0 };
    } else if (cmd === 'docker' && sub === 'inspect') {
      outcome = { stdout: 'true|0', stderr: '', status: 0 };
    } else if (cmd === 'claude' && sub === 'auth') {
      outcome = { stdout: '{"loggedIn":true}', stderr: '', status: 0 };
    }

    return {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      status: outcome.status,
      signal: null,
      pid: 1,
      output: ['', outcome.stdout, outcome.stderr],
    } as unknown as ReturnType<typeof spawnSync>;
  });
}

async function workerScriptFor(taskId: string): Promise<string> {
  const fs = await import('node:fs');
  const wf = vi.mocked(fs.writeFileSync);
  const call = wf.mock.calls.find(c =>
    String(c[0]).includes(`.worker-${taskId}`) && String(c[0]).endsWith('.sh'));
  return call ? String(call[1]) : '';
}

function spawnExpectMessage(backend: DockerSpawnBackend, taskId: string, model: string): string {
  try {
    mockReadFileSync.mockImplementation(path => budgetedDockerTaskJson(path, { model }));
    backend.spawn(taskId, model as ModelType, 'prompt-body', TEST_DOCKER_EXECUTION_OPTIONS);
    return '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

// ─── A) provider→cmd table in docker — shared-source import-proof ───────────

describe('DockerSpawnBackend: provider→cmd table (shared PROVIDER_COMMAND_SPECS, 364-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter(/* cliPresent */ true);
  });

  it('claude worker script is built from PROVIDER_COMMAND_SPECS.claude (string-assert)', async () => {
    const spec = getProviderCommandSpec('claude')!;
    mockReadFileSync.mockImplementation(
      path => budgetedDockerTaskJson(path, { model: 'claude-sonnet-5' }),
    );
    new DockerSpawnBackend('/test/project').spawn(
      'cli-table-claude',
      'claude-sonnet-5' as ModelType,
      'prompt-body',
      TEST_DOCKER_EXECUTION_OPTIONS,
    );
    const script = await workerScriptFor('cli-table-claude');

    expect(script).toContain(spec.binary);
    for (const arg of spec.baseArgs) expect(script).toContain(arg);
    expect(script).toContain(spec.modelFlag);
    expect(script).toContain('claude-sonnet-5');
    for (const arg of spec.approvalArgs) expect(script).toContain(arg);
  });

  it('forwards Docker PID1 SIGTERM to the tracked provider supervisor', async () => {
    mockReadFileSync.mockImplementation(
      path => budgetedDockerTaskJson(path, { model: 'claude-sonnet-5' }),
    );
    new DockerSpawnBackend('/test/project').spawn(
      'cli-table-term-forward',
      'claude-sonnet-5' as ModelType,
      'prompt-body',
      TEST_DOCKER_EXECUTION_OPTIONS,
    );
    const script = await workerScriptFor('cli-table-term-forward');

    expect(script).toContain('PROVIDER_PID=""');
    expect(script).toContain('trap on_provider_term TERM');
    expect(script).toContain('kill -TERM "$PROVIDER_PID"');
    expect(script).toContain('wait "$PROVIDER_PID"');
    expect(script).toMatch(/timeout -k 30 \$TIMEOUT claude .+ &\nPROVIDER_PID=\$!\nwait "\$PROVIDER_PID"\nCLAUDE_EXIT=\$\?/);
    expect(script).toContain('CLAUDE_EXIT=143');
  });

  it('threads the finite verifier tool/context profile into the real Docker worker script', async () => {
    mockReadFileSync.mockImplementation(
      path => budgetedDockerTaskJson(path, { model: 'claude-fable-5' }),
    );
    new DockerSpawnBackend('/test/project').spawn(
      'finite-xverify',
      'claude-fable-5' as ModelType,
      'bounded verifier prompt',
      {
        ...TEST_DOCKER_EXECUTION_OPTIONS,
        availableTools: 'Bash',
        isolatedContext: true,
      },
    );
    const script = await workerScriptFor('finite-xverify');

    expect(script).toContain('--tools "Bash"');
    expect(script).toContain('--safe-mode');
    expect(script).toContain('--disable-slash-commands');
    expect(script).toContain('--no-session-persistence');
  });

  it('codex command is built from its shared spec with a canonical API ID', () => {
    const spec = getProviderCommandSpec('codex')!;
    const script = buildProviderCommand(spec, 'gpt-5.5', '/tmp/prompt', { autoApprove: true });

    expect(script).toContain(spec.binary);
    for (const arg of spec.baseArgs) expect(script).toContain(arg);
    expect(script).toContain(spec.modelFlag);
    expect(script).toContain('gpt-5.5');
    for (const arg of spec.approvalArgs) expect(script).toContain(arg);
    expect(script).not.toContain('--dangerously-skip-permissions'); // claude-only flag
  });

  it('gemini command is built from its shared spec with a canonical API ID', () => {
    const spec = getProviderCommandSpec('gemini')!;
    const script = buildProviderCommand(
      spec,
      'gemini-2.5-flash',
      '/tmp/prompt',
      { autoApprove: true },
    );

    expect(script).toContain(spec.binary);
    for (const arg of spec.baseArgs) {
      if (arg === PROMPT_CAT_TOKEN) continue; // replaced by "$(cat <path>)" at build time
      expect(script).toContain(arg);
    }
    expect(script).toContain('$(cat');
    expect(script).toContain(spec.modelFlag);
    expect(script).toContain('gemini-2.5-flash'); // apiId === alias for this model
    for (const arg of spec.approvalArgs) expect(script).toContain(arg);
    expect(script).not.toContain('--dangerously-skip-permissions'); // claude-only flag
  });
});

// ─── B) probeProviderCliPresentInImage — pure-function unit tests ───────────

describe('probeProviderCliPresentInImage (pure, 364-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when `command -v <bin>` exits 0 inside the image', () => {
    mockSpawnSync.mockReturnValue({
      stdout: '', stderr: '', status: 0, signal: null, pid: 1, output: ['', '', ''],
    } as unknown as ReturnType<typeof spawnSync>);

    expect(probeProviderCliPresentInImage('deckent-worker:latest', 'codex')).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['run', '--rm', 'deckent-worker:latest', 'sh', '-c', 'command -v codex'],
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it('returns false when `command -v <bin>` exits non-zero (CLI not on PATH)', () => {
    mockSpawnSync.mockReturnValue({
      stdout: '', stderr: '', status: 1, signal: null, pid: 1, output: ['', '', ''],
    } as unknown as ReturnType<typeof spawnSync>);

    expect(probeProviderCliPresentInImage('deckent-worker:latest', 'gemini')).toBe(false);
  });

  it('fails open (true) when the probe itself could not run (docker hiccup/timeout)', () => {
    mockSpawnSync.mockReturnValue({
      stdout: '', stderr: '', status: null, signal: 'SIGTERM', pid: 1, output: ['', '', ''],
      error: new Error('spawnSync docker ETIMEDOUT'),
    } as unknown as ReturnType<typeof spawnSync>);

    expect(probeProviderCliPresentInImage('deckent-worker:latest', 'codex')).toBe(true);
  });
});

// ─── C) DockerSpawnBackend honest-fail with verifyProviderCliInImage: true ──

describe('DockerSpawnBackend: image-reality honest-fail (verifyProviderCliInImage, 364-004)', () => {
  describe('CLI missing from an existing image', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      installSpawnRouter(/* cliPresent */ false);
    });

    it('codex final-only usage → HOLD before image probing or container work', () => {
      const backend = new DockerSpawnBackend('/test/project', { verifyProviderCliInImage: true });
      const msg = spawnExpectMessage(backend, 'img-real-codex', 'gpt-5.5');

      expect(msg).toMatch(/does not expose incremental measured usage/);
      expect(capturedProbeRunArgs).toHaveLength(0);
      expect(capturedRealRunArgs).toHaveLength(0);
    });

    it('gemini final-only usage → HOLD before image probing or container work', () => {
      const backend = new DockerSpawnBackend('/test/project', { verifyProviderCliInImage: true });
      const msg = spawnExpectMessage(backend, 'img-real-gemini', 'gemini-2.5-flash');

      expect(msg).toMatch(/does not expose incremental measured usage/);
      expect(capturedProbeRunArgs).toHaveLength(0);
      expect(capturedRealRunArgs).toHaveLength(0);
    });

    it('honest-fail never falls back to silently spawning the container (no real `docker run -d`)', () => {
      const backend = new DockerSpawnBackend('/test/project', { verifyProviderCliInImage: true });
      spawnExpectMessage(backend, 'img-real-nofallback', 'gpt-5.5');

      expect(capturedRealRunArgs.length).toBe(0);
    });

    it('claude is never probed even with the flag on (always baked in, no build-arg)', () => {
      const backend = new DockerSpawnBackend('/test/project', { verifyProviderCliInImage: true });
      const msg = spawnExpectMessage(backend, 'img-real-claude', 'claude-sonnet-5');

      expect(msg).toBe(''); // did not throw
      expect(capturedProbeRunArgs.length).toBe(0);
      expect(capturedRealRunArgs.length).toBe(1);
    });
  });

  describe('CLI present in the image', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      installSpawnRouter(/* cliPresent */ true);
    });

    it('codex final-only usage still HOLDs before a positive image probe', () => {
      const backend = new DockerSpawnBackend('/test/project', { verifyProviderCliInImage: true });
      const msg = spawnExpectMessage(backend, 'img-real-codex-ok', 'gpt-5.5');

      expect(msg).toMatch(/does not expose incremental measured usage/);
      expect(capturedProbeRunArgs).toHaveLength(0);
      expect(capturedRealRunArgs).toHaveLength(0);
    });
  });
});

// ─── D) default-off backward-compat proof (no opt → zero probe calls) ───────

describe('DockerSpawnBackend: verifyProviderCliInImage defaults to false (364-004 backward-compat)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Image is codex-CLI-missing per the probe fixture, but since the check is
    // OFF by default this must never be consulted — spawn proceeds regardless.
    installSpawnRouter(/* cliPresent */ false);
  });

  it('codex spawn with no probe opt still HOLDs on final-only usage', () => {
    const backend = new DockerSpawnBackend('/test/project');
    const msg = spawnExpectMessage(backend, 'img-real-default-off', 'gpt-5.5');

    expect(msg).toMatch(/does not expose incremental measured usage/);
    expect(capturedProbeRunArgs).toHaveLength(0);
    expect(capturedRealRunArgs).toHaveLength(0);
  });

  it('gemini spawn with probe explicitly off still HOLDs on final-only usage', () => {
    const backend = new DockerSpawnBackend('/test/project', { verifyProviderCliInImage: false });
    const msg = spawnExpectMessage(backend, 'img-real-explicit-off', 'gemini-2.5-flash');

    expect(msg).toMatch(/does not expose incremental measured usage/);
    expect(capturedProbeRunArgs).toHaveLength(0);
    expect(capturedRealRunArgs).toHaveLength(0);
  });
});
