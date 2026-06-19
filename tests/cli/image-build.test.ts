// tests/cli/image-build.test.ts
//
// F1-IMG-2: hermetic tests for `deckent image build`.
// Injects a fake SpawnImpl so no real docker is needed.
// Verifies that buildSuggestedImageCmd is called with the correct build-args
// and that --with-codex → INSTALL_CODEX=true etc.

import { describe, it, expect, vi } from 'vitest';
import { handleImageBuild } from '../../src/cli/commands/image.js';
import type { ImageBuildOptions } from '../../src/cli/commands/image.js';
import type { SpawnImpl, SpawnedProcessLike } from '../../src/core/worker-image-check.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface SpawnRecord {
  command: string;
  args: string[];
  calls: number;
}

function makeSpawn(exitCode: number, record: SpawnRecord): SpawnImpl {
  return (command: string, args: string[]): SpawnedProcessLike => {
    record.command = command;
    record.args = args;
    record.calls += 1;

    const listeners: Record<string, (...a: unknown[]) => void> = {};
    const child: SpawnedProcessLike = {
      stdout: null,
      stderr: null,
      on(event: string, listener: (...a: unknown[]) => void) {
        listeners[event] = listener;
        return child;
      },
    };
    queueMicrotask(() => listeners['close']?.(exitCode, null));
    return child;
  };
}

function emptyRecord(): SpawnRecord {
  return { command: '', args: [], calls: 0 };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleImageBuild — build-arg flags', () => {
  it('no flags → docker build with no extra --build-arg', async () => {
    const rec = emptyRecord();
    await handleImageBuild({} as ImageBuildOptions, makeSpawn(0, rec));
    expect(rec.calls).toBe(1);
    expect(rec.command).toBe('docker');
    const cmdStr = rec.args.join(' ');
    expect(cmdStr).not.toContain('INSTALL_CODEX');
    expect(cmdStr).not.toContain('INSTALL_GEMINI');
    expect(cmdStr).not.toContain('INSTALL_OLLAMA');
    expect(cmdStr).toContain('-f');
    expect(cmdStr).toContain('-t');
  });

  it('--with-codex → INSTALL_CODEX=true in build args', async () => {
    const rec = emptyRecord();
    await handleImageBuild({ withCodex: true }, makeSpawn(0, rec));
    expect(rec.calls).toBe(1);
    const cmdStr = rec.args.join(' ');
    expect(cmdStr).toContain('INSTALL_CODEX=true');
    expect(cmdStr).not.toContain('INSTALL_GEMINI');
    expect(cmdStr).not.toContain('INSTALL_OLLAMA');
  });

  it('--with-gemini → INSTALL_GEMINI=true in build args', async () => {
    const rec = emptyRecord();
    await handleImageBuild({ withGemini: true }, makeSpawn(0, rec));
    expect(rec.calls).toBe(1);
    const cmdStr = rec.args.join(' ');
    expect(cmdStr).toContain('INSTALL_GEMINI=true');
    expect(cmdStr).not.toContain('INSTALL_CODEX');
    expect(cmdStr).not.toContain('INSTALL_OLLAMA');
  });

  it('--with-ollama → INSTALL_OLLAMA=true in build args', async () => {
    const rec = emptyRecord();
    await handleImageBuild({ withOllama: true }, makeSpawn(0, rec));
    expect(rec.calls).toBe(1);
    const cmdStr = rec.args.join(' ');
    expect(cmdStr).toContain('INSTALL_OLLAMA=true');
    expect(cmdStr).not.toContain('INSTALL_CODEX');
    expect(cmdStr).not.toContain('INSTALL_GEMINI');
  });

  it('all flags → all three INSTALL_* args present', async () => {
    const rec = emptyRecord();
    await handleImageBuild({ withCodex: true, withGemini: true, withOllama: true }, makeSpawn(0, rec));
    expect(rec.calls).toBe(1);
    const cmdStr = rec.args.join(' ');
    expect(cmdStr).toContain('INSTALL_CODEX=true');
    expect(cmdStr).toContain('INSTALL_GEMINI=true');
    expect(cmdStr).toContain('INSTALL_OLLAMA=true');
  });
});

describe('handleImageBuild — exit code handling', () => {
  it('build success (exit 0) → returns 0', async () => {
    const rec = emptyRecord();
    const code = await handleImageBuild({}, makeSpawn(0, rec));
    expect(code).toBe(0);
  });

  it('build failure (exit 1) → returns 1', async () => {
    const rec = emptyRecord();
    const code = await handleImageBuild({}, makeSpawn(1, rec));
    expect(code).toBe(1);
  });

  it('spawn error (exit -1) → returns -1', async () => {
    const record = emptyRecord();
    const errorSpawn: SpawnImpl = (command: string, args: string[]): SpawnedProcessLike => {
      record.command = command;
      record.args = args;
      record.calls += 1;
      const listeners: Record<string, (...a: unknown[]) => void> = {};
      const child: SpawnedProcessLike = {
        stdout: null,
        stderr: null,
        on(event: string, listener: (...a: unknown[]) => void) {
          listeners[event] = listener;
          return child;
        },
      };
      queueMicrotask(() => listeners['error']?.(new Error('docker not found')));
      return child;
    };
    const code = await handleImageBuild({}, errorSpawn);
    expect(code).toBe(-1);
  });
});

describe('handleImageBuild — custom image tag', () => {
  it('custom --image tag is passed to docker -t', async () => {
    const rec = emptyRecord();
    await handleImageBuild({ image: 'my-worker:v2' }, makeSpawn(0, rec));
    expect(rec.calls).toBe(1);
    const cmdStr = rec.args.join(' ');
    expect(cmdStr).toContain('my-worker:v2');
  });
});

describe('handleImageBuild — buildSuggestedImageCmd integration', () => {
  it('buildSuggestedImageCmd is called with codex in providers when --with-codex', async () => {
    const rec = emptyRecord();
    await handleImageBuild({ withCodex: true }, makeSpawn(0, rec));
    // Verify the spawn was called with args that include INSTALL_CODEX=true
    // (this confirms buildSuggestedImageCmd received 'codex' in providers)
    const buildArgIdx = rec.args.indexOf('--build-arg');
    expect(buildArgIdx).toBeGreaterThan(-1);
    expect(rec.args[buildArgIdx + 1]).toBe('INSTALL_CODEX=true');
  });

  it('docker command targets Dockerfile.worker', async () => {
    const rec = emptyRecord();
    await handleImageBuild({}, makeSpawn(0, rec));
    // buildSuggestedImageCmd always uses -f Dockerfile.worker
    const fIdx = rec.args.indexOf('-f');
    expect(fIdx).toBeGreaterThan(-1);
    expect(rec.args[fIdx + 1]).toContain('Dockerfile.worker');
  });
});
