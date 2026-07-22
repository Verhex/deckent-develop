import { describe, it, expect, vi } from 'vitest';
import { buildWorkerCommand, WORKER_TIMEOUT_SECONDS } from '../../src/orchestra/tmux.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import type { ModelType } from '../../src/core/types.js';

function createMockAdapter(): ProviderAdapter {
  return {
    name: 'claude',
    supportedModels: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'] as readonly ModelType[],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
    buildCommand: vi.fn(
      (model: ModelType, promptPath: string) => `mock-cli --model ${model} < ${promptPath}`,
    ),
  };
}

// born-466 parity (spawn-backend-docker.ts ~line 858-871): the tmux wrapper's
// timeout-wrap must match the docker backend's exit-code-captured, 124/137-
// conditional `.timeout` marker — no more blind `|| echo` masking of a
// non-timeout failure (e.g. a CLI arg error) as a timeout.
const isWindows = process.platform === 'win32';

describe.skipIf(isWindows)('buildWorkerCommand — tmux timeout parity (born-466)', () => {
  it('wraps the worker command with a -k 30 hard-kill grace period', () => {
    const cmd = buildWorkerCommand('claude-opus-4-8', '/proj/.tasks/.prompt-abc.txt', undefined, undefined, '359-003');
    expect(cmd).toContain(`timeout -k 30 ${WORKER_TIMEOUT_SECONDS}`);
  });

  it('captures the exit code instead of masking it with `|| echo "WORKER_TIMEOUT"`', () => {
    const cmd = buildWorkerCommand('claude-opus-4-8', '/proj/.tasks/.prompt-abc.txt', undefined, undefined, '359-003');
    expect(cmd).toContain('CLAUDE_EXIT=$?');
    // Old pattern: the sh -c invocation was directly followed by `|| echo "WORKER_TIMEOUT"`,
    // which fired on ANY non-zero exit (crash, CLI arg error), not just a real timeout.
    // The pre-existing EXIT-trap fallback (`[ -f $RFILE ] || echo '...' > $RFILE`) legitimately
    // keeps its own `|| echo` — only the WORKER_TIMEOUT-masking variant must be gone.
    expect(cmd).not.toContain('|| echo "WORKER_TIMEOUT"');
  });

  it('gates the .timeout marker on exit code 124 or 137 only', () => {
    const cmd = buildWorkerCommand('claude-opus-4-8', '/proj/.tasks/.prompt-abc.txt', undefined, undefined, '359-003');
    expect(cmd).toContain('[ "$CLAUDE_EXIT" -eq 124 ] || [ "$CLAUDE_EXIT" -eq 137 ]');
    expect(cmd).toContain('task-359-003.timeout');
  });

  it('only writes the .timeout marker when no .result file already exists', () => {
    const cmd = buildWorkerCommand('claude-opus-4-8', '/proj/.tasks/.prompt-abc.txt', undefined, undefined, '359-003');
    expect(cmd).toContain('[ ! -f "');
    expect(cmd).toContain('task-359-003.result');
    // marker write must be conditioned inside the same `if` guard as the result check
    const ifMatch = cmd.match(/if \[ "\$CLAUDE_EXIT" -eq 124 \] \|\| \[ "\$CLAUDE_EXIT" -eq 137 \]; then (.+); fi$/);
    expect(ifMatch).not.toBeNull();
    expect(ifMatch?.[1]).toContain('[ ! -f "');
    expect(ifMatch?.[1]).toContain('.result"');
    expect(ifMatch?.[1]).toContain('&& echo "WORKER_TIMEOUT"');
  });

  it('respects a custom timeoutSeconds value in the -k 30 wrap', () => {
    const cmd = buildWorkerCommand('claude-haiku-4-5-20251001', '/proj/.tasks/.prompt-x.txt', undefined, undefined, '359-004', 600);
    expect(cmd).toContain('timeout -k 30 600');
    expect(cmd).toContain('task-359-004.timeout');
  });

  it('preserves the existing EXIT trap / RFILE fallback contract', () => {
    const cmd = buildWorkerCommand('claude-opus-4-8', '/proj/.tasks/.prompt-abc.txt', undefined, undefined, '359-003');
    expect(cmd).toMatch(/^RFILE=.*task-359-003\.result; trap /);
    expect(cmd).toContain("trap '[ -f $RFILE ] || echo ");
    expect(cmd).toContain("' EXIT;");
  });

  it('does not wrap timeout when taskId is not provided (backward compat)', () => {
    const cmd = buildWorkerCommand('claude-sonnet-5', '/tmp/prompt.txt');
    expect(cmd).not.toContain('timeout');
    expect(cmd).not.toContain('CLAUDE_EXIT');
  });

  it('does not wrap timeout when an adapter is provided', () => {
    const adapter = createMockAdapter();
    const cmd = buildWorkerCommand('claude-opus-4-8', '/tmp/p.txt', undefined, adapter, '359-003');
    expect(cmd).not.toContain('timeout -k 30');
    expect(cmd).not.toContain('CLAUDE_EXIT');
  });
});
