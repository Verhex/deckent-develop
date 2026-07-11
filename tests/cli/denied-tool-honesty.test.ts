// tests/cli/denied-tool-honesty.test.ts
// born-528 DENIED-TOOL-HONESTY (task 409-002) — the REPL CLI-bridge tool
// dispatcher's pre-gate confirm denial used to `return` BEFORE reaching the
// toolSink honest-outcome block below it: a denied CLI-bridge tool (e.g.
// `deckent_plan`, `deckent_kill`) rendered NOTHING in the transcript — it
// vanished silently, the sibling dishonesty case to born-633's nested-dispatch
// masking. NOTE (disk-verified, task 409-002): the run.tsx fix itself, AND an
// equivalent pinning test (tests/cli/repl-deny-toolsink.test.ts), already
// landed under task 388-002 / commit 4d9d72bd8 (2026-07-08) — this file does
// NOT reimplement the fix (byte-identical run.tsx, zero diff) and intentionally
// overlaps that file's core assertions as an independent pin, while adding the
// scenarios 388-002 didn't cover: an mcp-error vs. denial distinction, a
// getToolSink()===null denial (must not throw), and a read-tier no-ask check
// via a differently-shaped fake-deps harness. See this task's .result notes
// for the RED→GREEN verification (temporary local revert of the fix, run
// unchanged, confirm failure; restore, confirm pass).
//
// `buildToolDispatcher` is exported as a pure factory (no Ink mount needed —
// same seam-extraction precedent as nested-dispatch-honesty.test.ts /
// calltool-exec-wire.test.ts, which test run.tsx-adjacent exports the same
// way; this project has no ink-testing-library dependency). Each `describe`
// below pairs a "pre-fix bug" RED-documenting test (labeled per the existing
// nested-dispatch-honesty.test.ts convention — pre-fix this assertion would
// have failed because toolSink was never called / no denial marker reached
// the model) with a regression guard pinning the adjacent, unaffected path.
// Hermetic: fake exec/cli dispatchers + confirm fns, no real spawn, no disk.
import { describe, it, expect } from 'vitest';
import { buildToolDispatcher, type ToolDispatcherDeps } from '../../src/cli/repl/run.js';
import type { ToolInfo } from '../../src/cli/repl/app.js';

function deps(over: {
  askConfirmResult?: boolean;
  askConfirmAlwaysResult?: boolean;
  askConfirmLog?: Array<{ summary: string; toolName: string }>;
  execResult?: string;
  cliResult?: string;
  sink?: ToolInfo[];
  sinkRegistered?: boolean;
}): ToolDispatcherDeps {
  const sink = over.sink;
  return {
    execDispatcher: { dispatch: async () => over.execResult ?? '[deckent] written' },
    cliDispatcher: { dispatch: async () => over.cliResult ?? '{"ok":true}' },
    askConfirm: async (summary: string, toolName: string) => {
      over.askConfirmLog?.push({ summary, toolName });
      return over.askConfirmResult ?? true;
    },
    askConfirmAlways: async () => over.askConfirmAlwaysResult ?? true,
    t: (k: string) => k,
    getToolSink: () => (over.sinkRegistered === false ? null : sink ? (info: ToolInfo) => sink.push(info) : null),
  };
}

// ─── CLI-bridge confirm-tier denial (deckent_plan) ───────────────────────────

describe('CLI-bridge confirm-tier denial (e.g. deckent_plan) is recorded honestly', () => {
  it('pre-fix bug: the pre-gate early-return used to skip toolSink entirely — the denied call vanished from the transcript with no model-visible marker', async () => {
    const sink: ToolInfo[] = [];
    const d = buildToolDispatcher(deps({ askConfirmResult: false, sink }));

    const result = await d.dispatch('deckent_plan', {});

    // pre-fix: sink stayed empty for this exact path (the early `return`
    // above the toolSink call never executed it).
    expect(sink).toHaveLength(1);
    expect(sink[0]!.failed).toBe(true);
    expect(sink[0]!.verb).toContain('deckent_plan');
    expect(sink[0]!.verb).toContain('tui.cmd_cancelled'); // same localized cancel label EXEC_TOOLS denial uses

    // pre-fix: the returned tool-result carried no denial signal the model
    // could read — a bare early-return string with no honest marker.
    expect(result).toBe('[tui.cmd_cancelled] deckent plan');
  });

  it('regression guard: an APPROVED confirm-tier call runs the real dispatcher and never touches toolSink (CLI-bridge tools are not in the toolInfoFor switch — pinned no-sink-on-approve behavior)', async () => {
    const sink: ToolInfo[] = [];
    const log: Array<{ summary: string; toolName: string }> = [];
    const d = buildToolDispatcher(deps({ askConfirmResult: true, askConfirmLog: log, cliResult: '{"planned":true}', sink }));

    const result = await d.dispatch('deckent_plan', {});

    expect(log).toHaveLength(1); // asked exactly once
    expect(result).toBe('{"planned":true}'); // real cliDispatcher result, unmodified
    expect(sink).toHaveLength(0); // byte-identical pin: pre-existing behavior, untouched by this fix
  });
});

// ─── CLI-bridge always-tier denial (deckent_kill) ────────────────────────────

describe('CLI-bridge always-tier denial (e.g. deckent_kill) is recorded honestly', () => {
  it('pre-fix bug: the ALWAYS_CONFIRM branch shares the same early-return — a denied deckent_kill also used to vanish silently', async () => {
    const sink: ToolInfo[] = [];
    const d = buildToolDispatcher(deps({ askConfirmAlwaysResult: false, sink }));

    const result = await d.dispatch('deckent_kill', {});

    expect(sink).toHaveLength(1);
    expect(sink[0]!.failed).toBe(true);
    expect(sink[0]!.verb).toContain('deckent_kill');
    expect(result).toBe('[tui.cmd_cancelled] deckent kill');
  });

  it('regression guard: an APPROVED always-tier call is asked every time (no memoized skip) and runs for real', async () => {
    const sink: ToolInfo[] = [];
    const d = buildToolDispatcher(deps({ askConfirmAlwaysResult: true, cliResult: '{"killed":true}', sink }));

    const result = await d.dispatch('deckent_kill', {});

    expect(result).toBe('{"killed":true}');
    expect(sink).toHaveLength(0); // same pin as the confirm-tier approved case
  });
});

// ─── EXEC_TOOLS denial (deckent_write_file) — cross-path label consistency ──

describe('EXEC_TOOLS denial (e.g. deckent_write_file) uses the SAME honest-outcome shape as the CLI-bridge path', () => {
  it('pre-fix bug context (regression pin, not a masked path itself): the [deckent-denied] branch already reached toolSink before this task — this pins it stays that way and uses the identical cancelled-label convention as the newly-fixed CLI-bridge path above', async () => {
    const sink: ToolInfo[] = [];
    const d = buildToolDispatcher(deps({ execResult: '[deckent-denied] deckent_write_file', sink }));

    const result = await d.dispatch('deckent_write_file', { path: 'a.txt', content: 'x' });

    expect(sink).toHaveLength(1);
    expect(sink[0]!.failed).toBe(true);
    expect(sink[0]!.verb).toContain('deckent_write_file');
    expect(sink[0]!.verb).toContain('tui.cmd_cancelled'); // identical label class as the CLI-bridge denial above
    expect(result).toBe('[deckent-denied] deckent_write_file'); // execDispatcher's own honest marker passed through unmodified
  });

  it('regression guard: an approved EXEC_TOOLS write reports the real ToolInfo change block (verb/target/added), not a failed record', async () => {
    const sink: ToolInfo[] = [];
    const d = buildToolDispatcher(deps({ execResult: '[deckent] written', sink }));

    const result = await d.dispatch('deckent_write_file', { path: 'a.txt', content: 'line1\nline2\n' });

    expect(result).toBe('[deckent] written');
    expect(sink).toHaveLength(1);
    expect(sink[0]!.failed).toBeUndefined();
    expect(sink[0]!.target).toBe('a.txt');
  });

  it('regression guard: an mcp-error is reported failed:true with the raw error text as verb (distinct from a denial)', async () => {
    const sink: ToolInfo[] = [];
    const d = buildToolDispatcher(deps({ execResult: '[mcp-error] disk full', sink }));

    await d.dispatch('deckent_write_file', { path: 'a.txt', content: 'x' });

    expect(sink).toHaveLength(1);
    expect(sink[0]!.failed).toBe(true);
    expect(sink[0]!.verb).toBe('[mcp-error] disk full');
  });
});

// ─── read-tier tools never confirm-gate, sink stays untouched (silent) ──────

describe('read-tier CLI-bridge tool (e.g. deckent_status) never asks and never denies', () => {
  it('regression guard: no askConfirm call, real dispatcher result returned, no sink record', async () => {
    const sink: ToolInfo[] = [];
    const log: Array<{ summary: string; toolName: string }> = [];
    const d = buildToolDispatcher(deps({ askConfirmLog: log, cliResult: '{"status":"idle"}', sink }));

    const result = await d.dispatch('deckent_status', {});

    expect(log).toHaveLength(0);
    expect(result).toBe('{"status":"idle"}');
    expect(sink).toHaveLength(0);
  });
});

// ─── no toolSink registered yet — denial must not throw ─────────────────────

describe('getToolSink() returning null on a denial does not throw', () => {
  it('regression guard: a denial with no sink registered still returns the honest cancelled marker', async () => {
    const d = buildToolDispatcher(deps({ askConfirmResult: false, sinkRegistered: false }));

    await expect(d.dispatch('deckent_plan', {})).resolves.toBe('[tui.cmd_cancelled] deckent plan');
  });
});
