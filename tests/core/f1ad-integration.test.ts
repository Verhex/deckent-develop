// F1-AD integration: honest inventory capability, cache, and real process-tree
// timeout. No provider CLI or home-directory state is touched.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelRegistry } from '../../src/core/model-registry.js';
import {
  defaultSpawnFn,
  detectAndRegisterModels,
  type SpawnFn,
} from '../../src/core/model-auto-detect.js';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'f1ad-integration-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeSpawnFn(stdout: string, exitCode = 0): SpawnFn {
  return vi.fn().mockResolvedValue({ stdout, exitCode });
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid: number, timeoutMs = 2_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return !processIsAlive(pid);
}

describe('bootstrap cloud inventory capability', () => {
  it('does not execute an interactive cloud CLI as model enumeration', async () => {
    const registry = new ModelRegistry();
    const spawnFn = makeSpawnFn(JSON.stringify({
      models: [{ id: 'claude-fabricated-by-interactive-output' }],
    }));

    const results = await detectAndRegisterModels(registry, {
      providers: ['claude', 'codex', 'gemini'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(spawnFn).not.toHaveBeenCalled();
    expect(results).toHaveLength(3);
    expect(results.every(result => result.source === 'catalog')).toBe(true);
    expect(registry.has('claude-fabricated-by-interactive-output')).toBe(false);
  });

  it('bootstrapProviders resolves modelAutoDetectPromise without a cloud process birth', async () => {
    const { bootstrapProviders } = await import('../../src/core/provider.js');
    const registry = new ModelRegistry();
    const spawnFn = makeSpawnFn('interactive output must never be consumed');

    const result = await bootstrapProviders(
      {
        brain_provider: undefined as unknown as import('../../src/core/types.js').ProviderName,
        worker_provider: undefined as unknown as import('../../src/core/types.js').ProviderName,
        fallback_provider: undefined as unknown as import('../../src/core/types.js').ProviderName,
        projectRoot: workDir,
        providers: {},
        auth_mode: 'subscription',
      },
      workDir,
      undefined,
      {
        mr: registry,
        detectOpts: {
          providers: ['claude'],
          spawnFn,
          cacheDir: workDir,
        },
      },
    );

    await expect(result.modelAutoDetectPromise).resolves.toHaveLength(1);
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

describe('supported inventory cache', () => {
  it('replays Ollama inventory within TTL without a second process birth', async () => {
    const fixedNow = 1_700_000_000_000;
    const spawnFn = makeSpawnFn('NAME ID SIZE\nllama3.2:latest sha256:abc 2GB\n');

    await detectAndRegisterModels(new ModelRegistry(), {
      providers: ['ollama'],
      spawnFn,
      cacheDir: workDir,
      now: () => fixedNow,
    });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    vi.mocked(spawnFn).mockClear();

    const registry = new ModelRegistry();
    const [result] = await detectAndRegisterModels(registry, {
      providers: ['ollama'],
      spawnFn,
      cacheDir: workDir,
      now: () => fixedNow + 60_000,
    });

    expect(spawnFn).not.toHaveBeenCalled();
    expect(result?.source).toBe('cache');
    expect(result?.discovered).toContain('llama3.2:latest');
    expect(registry.has('llama3.2:latest')).toBe(true);
  });
});

describe.runIf(process.platform !== 'win32')('real process-tree timeout', () => {
  it('waits for close and leaves neither the parent nor its signal-ignoring child alive', async () => {
    const pidReceipt = join(workDir, 'probe-tree.json');
    const grandchildSource = [
      "process.on('SIGTERM', () => {});",
      'setInterval(() => {}, 1000);',
    ].join('');
    const parentSource = [
      "const { spawn } = require('node:child_process');",
      "const { writeFileSync } = require('node:fs');",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchildSource)}], { stdio: 'ignore' });`,
      'writeFileSync(process.argv[1], JSON.stringify({ parent: process.pid, child: child.pid }));',
      "process.on('SIGTERM', () => {});",
      'setInterval(() => {}, 1000);',
    ].join('');

    const startedAt = Date.now();
    const result = await defaultSpawnFn(process.execPath, ['-e', parentSource, pidReceipt], 40);
    const elapsedMs = Date.now() - startedAt;
    const receipt = JSON.parse(readFileSync(pidReceipt, 'utf8')) as {
      parent: number;
      child: number;
    };

    expect(result).toEqual({ stdout: '', exitCode: null });
    expect(elapsedMs).toBeGreaterThanOrEqual(40);
    expect(elapsedMs).toBeLessThan(4_000);
    expect(await waitForProcessExit(receipt.parent)).toBe(true);
    expect(await waitForProcessExit(receipt.child)).toBe(true);
  }, 8_000);
});
