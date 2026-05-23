import { describe, it, expect, vi } from 'vitest';

import {
  DECKENT_MCP_TOOL_COUNT,
  attachDeckentMcp,
  detectAttachStatus,
  ensureMcpAttached,
  getAttachCommand,
  type AttachRunner,
  type AttachRunnerResult,
} from '../../src/cli/helpers/mcp-attach.js';

// ─── Test Helpers ────────────────────────────────────────────────────

interface RunnerCall {
  cmd: string;
  args: readonly string[];
}

/**
 * Build a deterministic AttachRunner driven by an ordered queue of
 * responses keyed by the host CLI's argv signature. Defaults to a
 * not-found (status 127) response so unhandled probes do not silently
 * succeed.
 */
function makeRunner(
  responses: Array<{ match: (cmd: string, args: readonly string[]) => boolean; result: AttachRunnerResult }>,
): { runner: AttachRunner; calls: RunnerCall[] } {
  const calls: RunnerCall[] = [];
  const runner: AttachRunner = (cmd, args) => {
    calls.push({ cmd, args });
    for (const r of responses) {
      if (r.match(cmd, args)) return r.result;
    }
    return { status: 127, stdout: '', stderr: 'command not found' };
  };
  return { runner, calls };
}

const ok = (stdout = ''): AttachRunnerResult => ({ status: 0, stdout, stderr: '' });
const fail = (status: number, stderr = ''): AttachRunnerResult => ({ status, stdout: '', stderr });

const isProbe = (host: string) => (cmd: string, args: readonly string[]) =>
  cmd === host && args[0] === 'mcp' && args[1] === '--help';
const isList = (host: string) => (cmd: string, args: readonly string[]) =>
  cmd === host && args[0] === 'mcp' && args[1] === 'list';
const isAdd = (host: string) => (cmd: string, args: readonly string[]) =>
  cmd === host && args[0] === 'mcp' && args[1] === 'add' && args[2] === 'deckent';

// ─── Tests ───────────────────────────────────────────────────────────

describe('getAttachCommand', () => {
  it('returns concrete command tuples for the three supported hosts', () => {
    for (const host of ['claude', 'codex', 'gemini'] as const) {
      const cmd = getAttachCommand(host);
      expect(cmd).not.toBeNull();
      expect(cmd!.list.cmd).toBe(host);
      expect(cmd!.add.args).toContain('deckent');
      expect(cmd!.add.args).toContain('npx');
      expect(cmd!.add.args).toContain('deckent-mcp');
    }
  });

  it('returns null for unknown host names', () => {
    // @ts-expect-error — runtime safety guard for invalid input
    expect(getAttachCommand('unknown')).toBeNull();
  });
});

describe('detectAttachStatus', () => {
  it('marks supported=false when the host CLI lacks an mcp subcommand', () => {
    const { runner } = makeRunner([
      { match: isProbe('codex'), result: fail(2, 'unknown command: mcp') },
    ]);

    const status = detectAttachStatus('codex', runner);
    expect(status.supported).toBe(false);
    expect(status.attached).toBe(false);
    expect(status.reason).toContain('mcp');
  });

  it('returns attached=true when deckent is already in mcp list', () => {
    const { runner } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('Connected MCP servers:\n- deckent\n- other-server\n') },
    ]);

    const status = detectAttachStatus('claude', runner);
    expect(status.supported).toBe(true);
    expect(status.attached).toBe(true);
    expect(status.toolCount).toBe(DECKENT_MCP_TOOL_COUNT);
    expect(status.reason).toBeUndefined();
  });

  it('returns attached=false when deckent is missing from mcp list', () => {
    const { runner } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('Connected MCP servers:\n- something-else\n') },
    ]);

    const status = detectAttachStatus('claude', runner);
    expect(status.supported).toBe(true);
    expect(status.attached).toBe(false);
  });

  it('does not match substring servers like deckent-dev', () => {
    const { runner } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('Connected MCP servers:\n- deckent-dev\n- deckentpro\n') },
    ]);

    const status = detectAttachStatus('claude', runner);
    expect(status.attached).toBe(false);
  });

  it('detects deckent when mcp list output is ANSI-colorized', () => {
    // Real `claude mcp list` output in a TTY contains SGR escapes around
    // server names — e.g. `\x1b[32mdeckent\x1b[0m: ✓ Connected (31 tools)`.
    // The boundary regex must survive ANSI noise without false-negatives.
    const colorized = '\x1b[1mAvailable MCP servers:\x1b[0m\n  \x1b[32mdeckent\x1b[0m: \x1b[32m✓ Connected\x1b[0m\n';
    const { runner } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok(colorized) },
    ]);

    const status = detectAttachStatus('claude', runner);
    expect(status.supported).toBe(true);
    expect(status.attached).toBe(true);
  });

  it('survives runner exceptions and reports supported=false', () => {
    const throwing: AttachRunner = () => {
      throw new Error('binary missing');
    };
    const status = detectAttachStatus('claude', throwing);
    expect(status.supported).toBe(false);
  });
});

describe('attachDeckentMcp', () => {
  it('short-circuits when deckent is already attached', () => {
    const { runner, calls } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('- deckent') },
    ]);

    const result = attachDeckentMcp('claude', runner);
    expect(result.ok).toBe(true);
    expect(result.alreadyAttached).toBe(true);
    // Probe + list only — no add invocation.
    expect(calls.some(c => c.args[1] === 'add')).toBe(false);
  });

  it('runs the host add subcommand and reports success', () => {
    const { runner, calls } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('') },
      { match: isAdd('claude'), result: ok('added') },
    ]);

    const result = attachDeckentMcp('claude', runner);
    expect(result.ok).toBe(true);
    expect(result.alreadyAttached).toBe(false);
    expect(result.message).toContain('31 tools available');
    expect(calls[calls.length - 1].args).toEqual([
      'mcp',
      'add',
      'deckent',
      '--',
      'npx',
      'deckent-mcp',
    ]);
  });

  it('returns ok=false with a clear message when add exits non-zero', () => {
    const { runner } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('') },
      { match: isAdd('claude'), result: fail(1, 'permission denied') },
    ]);

    const result = attachDeckentMcp('claude', runner);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Failed to attach');
    expect(result.message).toContain('permission denied');
  });
});

describe('ensureMcpAttached', () => {
  it('skips when already attached and prints the ready message', async () => {
    const { runner, calls } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('- deckent') },
    ]);
    const print = vi.fn();
    const promptUser = vi.fn();

    const status = await ensureMcpAttached('claude', { runner, print, promptUser });

    expect(status.attached).toBe(true);
    expect(promptUser).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith(
      `Deckent MCP ready — ${DECKENT_MCP_TOOL_COUNT} tools available.`,
    );
    // No add call when already attached.
    expect(calls.some(c => c.args[1] === 'add')).toBe(false);
  });

  it('prompts the user and attaches when they accept', async () => {
    const { runner, calls } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('') },
      { match: isAdd('claude'), result: ok('added') },
    ]);
    const print = vi.fn();
    const promptUser = vi.fn().mockResolvedValue(true);

    const status = await ensureMcpAttached('claude', { runner, print, promptUser });

    expect(promptUser).toHaveBeenCalledWith(expect.stringContaining('Attach Deckent MCP to claude?'));
    expect(status.attached).toBe(true);
    expect(calls.some(c => c.args[1] === 'add')).toBe(true);
    expect(print).toHaveBeenCalledWith(
      `Deckent MCP ready — ${DECKENT_MCP_TOOL_COUNT} tools available.`,
    );
  });

  it('does NOT attach when the user declines the prompt', async () => {
    const { runner, calls } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('') },
    ]);
    const print = vi.fn();
    const promptUser = vi.fn().mockResolvedValue(false);

    const status = await ensureMcpAttached('claude', { runner, print, promptUser });

    expect(promptUser).toHaveBeenCalledTimes(1);
    expect(status.attached).toBe(false);
    expect(calls.some(c => c.args[1] === 'add')).toBe(false);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Skipped'));
  });

  it('checkOnly mode never prompts and never mutates host config', async () => {
    const { runner, calls } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('') },
    ]);
    const print = vi.fn();
    const promptUser = vi.fn();

    const status = await ensureMcpAttached('claude', {
      runner,
      print,
      promptUser,
      checkOnly: true,
    });

    expect(promptUser).not.toHaveBeenCalled();
    expect(status.attached).toBe(false);
    expect(calls.some(c => c.args[1] === 'add')).toBe(false);
  });

  it('autoYes bypasses the prompt and attempts attach immediately', async () => {
    const { runner, calls } = makeRunner([
      { match: isProbe('claude'), result: ok() },
      { match: isList('claude'), result: ok('') },
      { match: isAdd('claude'), result: ok('added') },
    ]);
    const promptUser = vi.fn();

    const status = await ensureMcpAttached('claude', { runner, promptUser, autoYes: true, print: () => {} });

    expect(promptUser).not.toHaveBeenCalled();
    expect(status.attached).toBe(true);
    expect(calls.some(c => c.args[1] === 'add')).toBe(true);
  });

  it('emits a warning when host CLI lacks mcp support and does not call add', async () => {
    const { runner, calls } = makeRunner([
      { match: isProbe('codex'), result: fail(2, 'unknown command') },
    ]);
    const print = vi.fn();
    const printError = vi.fn();
    const promptUser = vi.fn();

    const status = await ensureMcpAttached('codex', { runner, print, printError, promptUser });

    expect(status.supported).toBe(false);
    expect(promptUser).not.toHaveBeenCalled();
    expect(calls.some(c => c.args[1] === 'add')).toBe(false);
    expect(printError).toHaveBeenCalled();
    expect(printError.mock.calls[0][0]).toContain('mcp');
  });
});
