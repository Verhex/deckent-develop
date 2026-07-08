// tests/cli/repl-deny-toolsink.test.ts
// born-528 (REPL-DENY-TOOLSINK, task 388-002) — a confirm-tier CLI-bridge tool
// (e.g. deckent_sync) used to early-return on denial BEFORE reaching the
// toolSink honest-outcome block in run.tsx's dispatcher, so a denied tool
// vanished from the transcript with no visible indicator. buildToolDispatcher
// is the extracted, exported factory (no Ink mount required — same
// seam-extraction precedent as buildReplTeardown/buildReplLabels in this
// module) that lets this be unit-tested directly.
import { describe, it, expect, vi } from 'vitest';
import { buildToolDispatcher, type ToolDispatcherDeps } from '../../src/cli/repl/run.js';
import type { ToolInfo } from '../../src/cli/repl/app.js';

const t = (key: string): string => (key === 'tui.cmd_cancelled' ? 'cancelled' : key);

function makeDeps(overrides: Partial<ToolDispatcherDeps> = {}): ToolDispatcherDeps & {
  cliDispatcher: { dispatch: ReturnType<typeof vi.fn> };
  execDispatcher: { dispatch: ReturnType<typeof vi.fn> };
} {
  const cliDispatcher = { dispatch: vi.fn(async () => '[deckent] senkronize edildi') };
  const execDispatcher = { dispatch: vi.fn(async () => '[deckent] yazıldı') };
  return {
    execDispatcher,
    cliDispatcher,
    askConfirm: vi.fn(async () => true),
    askConfirmAlways: vi.fn(async () => true),
    t,
    getToolSink: () => null,
    ...overrides,
  } as ToolDispatcherDeps & {
    cliDispatcher: { dispatch: ReturnType<typeof vi.fn> };
    execDispatcher: { dispatch: ReturnType<typeof vi.fn> };
  };
}

describe('buildToolDispatcher — confirm-tier CLI-bridge denial renders a visible toolSink block', () => {
  it('regression: denied confirm-tier tool calls toolSink with a failed=true block, not silence', async () => {
    const sink = vi.fn<[ToolInfo], void>();
    const deps = makeDeps({ askConfirm: vi.fn(async () => false), getToolSink: () => sink });
    const dispatcher = buildToolDispatcher(deps);

    const result = await dispatcher.dispatch('deckent_sync', {});

    expect(result).toBe('[cancelled] deckent sync');
    expect(deps.cliDispatcher.dispatch).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith({ verb: 'cancelled: deckent_sync', target: '', failed: true });
  });

  it('approved path is unaffected: confirm-tier tool runs cliDispatcher and reports the real outcome', async () => {
    const sink = vi.fn<[ToolInfo], void>();
    const deps = makeDeps({ askConfirm: vi.fn(async () => true), getToolSink: () => sink });
    const dispatcher = buildToolDispatcher(deps);

    const result = await dispatcher.dispatch('deckent_sync', {});

    expect(result).toBe('[deckent] senkronize edildi');
    expect(deps.cliDispatcher.dispatch).toHaveBeenCalledWith('deckent_sync', {});
    // No confirm-denial call and no default toolInfoFor mapping for deckent_sync
    // (only write_file/edit_file/read_file/bash map to a ToolInfo) — no sink call.
    expect(sink).not.toHaveBeenCalled();
  });

  it('read-tier tool never prompts for confirmation (approved/no-gate path unaffected)', async () => {
    const askConfirm = vi.fn(async () => true);
    const deps = makeDeps({ askConfirm });
    const dispatcher = buildToolDispatcher(deps);

    await dispatcher.dispatch('deckent_status', {});

    expect(askConfirm).not.toHaveBeenCalled();
    expect(deps.cliDispatcher.dispatch).toHaveBeenCalledWith('deckent_status', {});
  });

  it('existing EXEC_TOOLS [deckent-denied] path still renders its own toolSink block (regression guard)', async () => {
    const sink = vi.fn<[ToolInfo], void>();
    const deps = makeDeps({ getToolSink: () => sink });
    deps.execDispatcher.dispatch = vi.fn(async () => '[deckent-denied] yazma reddedildi');
    const dispatcher = buildToolDispatcher(deps);

    const result = await dispatcher.dispatch('deckent_write_file', { path: 'foo.ts', content: 'x' });

    expect(result).toBe('[deckent-denied] yazma reddedildi');
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith({ verb: 'cancelled: deckent_write_file', target: '', failed: true });
  });

  it('always-tier tool uses askConfirmAlways, and denial still renders the toolSink block', async () => {
    const sink = vi.fn<[ToolInfo], void>();
    const askConfirmAlways = vi.fn(async () => false);
    const deps = makeDeps({ askConfirmAlways, getToolSink: () => sink });
    const dispatcher = buildToolDispatcher(deps);

    const result = await dispatcher.dispatch('deckent_kill', {});

    expect(askConfirmAlways).toHaveBeenCalledTimes(1);
    expect(result).toBe('[cancelled] deckent kill');
    expect(sink).toHaveBeenCalledWith({ verb: 'cancelled: deckent_kill', target: '', failed: true });
  });
});
