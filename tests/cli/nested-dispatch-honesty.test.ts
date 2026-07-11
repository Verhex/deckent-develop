// tests/cli/nested-dispatch-honesty.test.ts
// born-633 NESTED-HONESTY — 607's BEFORE-done P2 leftovers: a nested
// call_tool dispatch's internal failure/denial/consent must be reported
// honestly outward, not masked behind a generic "it worked" / "[mcp-error]".
//
// Each `describe` block below is a RED->GREEN pair for one of the 4 items:
// the first test proves the scenario that USED TO be masked (pre-fix it would
// have failed these exact assertions — see the inline "pre-fix" note), the
// second pins the adjacent behavior that must stay unaffected. Hermetic: fake
// registry/policy/ruleStore + tmpdir cwd, no real disk writes, no session.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import {
  buildNativeToolRegistry,
  type ToolSurfaceOptions,
} from '../../src/cli/repl/native-tool-registry.js';
import { createParityExecImpl, type ParityExecContext } from '../../src/cli/repl/native-agent-bridge.js';
import type { ToolInfo } from '../../src/cli/repl/app.js';
import type { DispatchResult } from '../../src/core/tool-dispatch.js';

interface FakeDef {
  name: string;
  tier: 'silent' | 'confirm' | 'always';
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function parityCtx(over: {
  defs?: FakeDef[];
  denies?: Array<{ tool: string; pattern: string }>;
  rules?: Array<{ tool: string; pattern: string }>;
  confirmAnswer?: 'y' | 'a' | 'n';
  confirmLog?: string[];
  toolSink?: (info: ToolInfo) => void;
  t?: (key: string) => string;
}): ParityExecContext {
  const defs = new Map((over.defs ?? []).map((d) => [d.name, d]));
  return {
    registry: { get: (name: string) => defs.get(name) as never },
    policy: { defaultMode: 'suggest', tierMap: {}, alwaysFloor: [] } as never,
    ruleStore: {
      activeRules: () => (over.rules ?? []) as never,
      activeDenies: () => (over.denies ?? []) as never,
    },
    getMode: () => 'suggest' as never,
    confirm: async (summary: string) => {
      over.confirmLog?.push(summary);
      return over.confirmAnswer ?? 'y';
    },
    cwd: tmpdir(),
    t: over.t ?? ((k) => k),
    ...(over.toolSink ? { toolSink: over.toolSink } : {}),
  };
}

// ─── item (1): a nested handled-failure must not read as an outer success ───

describe('item(1) — nested handler ok:false must not be masked as outer ok:true', () => {
  it('pre-fix bug: dispatchToolCall reports status:"executed" (execImpl never threw) — outer ok must honestly mirror the inner ok:false, and the inner error text must survive', async () => {
    const surface: ToolSurfaceOptions = {
      enabled: true,
      confirm: () => 'allow',
      execImpl: () => ({ ok: false, output: 'disk full: cannot write out.txt' }),
    };
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: surface });
    const r = await reg.get('deckent_call_tool')!.handler({ name: 'deckent_status', args: {} });

    expect(r.ok).toBe(false); // pre-fix this was `true` (status==='executed' alone drove ok)
    expect(r.output).toContain('disk full: cannot write out.txt'); // inner error text preserved
    const result = JSON.parse(r.output.replace(/^\[mcp-error\] /, '')) as DispatchResult;
    expect(result.status).toBe('executed'); // proves the masking hazard: dispatch-level status alone says "executed"
    expect((result.result as { ok: boolean }).ok).toBe(false);
  });

  it('regression guard: a nested handler that itself succeeds (ok:true) still reports outer ok:true with a clean, unprefixed JSON body', async () => {
    const surface: ToolSurfaceOptions = {
      enabled: true,
      confirm: () => 'allow',
      execImpl: () => ({ ok: true, output: 'done' }),
    };
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: surface });
    const r = await reg.get('deckent_call_tool')!.handler({ name: 'deckent_status', args: {} });

    expect(r.ok).toBe(true);
    const result = JSON.parse(r.output) as DispatchResult; // no tag prefix on a genuine success
    expect(result.status).toBe('executed');
    expect((result.result as { output: string }).output).toBe('done');
  });
});

// ─── item (2): a parity policy-deny is its own honest class, not [mcp-error] ─

describe('item(2) — a nested parity policy-deny is reported as an honest, separate class', () => {
  it('pre-fix bug: createParityExecImpl\'s policy-deny throw landed in status:"error"/[mcp-error] — must now surface as [approval-denied] with status:"denied"', async () => {
    const surface: ToolSurfaceOptions = { enabled: true };
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: surface });
    const log: string[] = [];
    surface.execImpl = createParityExecImpl({
      ...parityCtx({
        defs: [{ name: 'deckent_read_file', tier: 'silent', handler: async () => ({ ok: true, output: 'SECRET' }) }],
        denies: [{ tool: 'deckent_read_file', pattern: '.env*' }],
        confirmLog: log,
      }),
      registry: reg,
    });
    surface.confirm = () => 'allow';

    const r = await reg.get('deckent_call_tool')!.handler({ name: 'deckent_read_file', args: { path: '.env.local' } });

    expect(r.ok).toBe(false);
    expect(r.output.startsWith('[approval-denied]')).toBe(true); // pre-fix: startsWith('[mcp-error]')
    expect(r.output.startsWith('[mcp-error]')).toBe(false);
    const result = JSON.parse(r.output.replace(/^\[approval-denied\] /, '')) as DispatchResult;
    expect(result.status).toBe('denied'); // honest, normalized status — raw core status was 'error'
    expect(log).toEqual([]); // denied silently by the deny-glob — never even asked
  });

  it('regression guard: the PRE-EXISTING dispatch-level denial (no confirm seam supplied, risk over threshold) keeps its own [deckent-denied] tag unchanged', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } }); // no confirm, no execImpl
    const r = await reg.get('deckent_call_tool')!.handler({ name: 'deckent_write_file', args: { path: 'x', content: 'y' } });

    expect(r.ok).toBe(false);
    expect(r.output.startsWith('[deckent-denied]')).toBe(true);
    expect(r.output.startsWith('[approval-denied]')).toBe(false);
    const result = JSON.parse(r.output.replace(/^\[deckent-denied\] /, '')) as DispatchResult;
    expect(result.status).toBe('denied');
  });
});

// ─── item (3): nested ask's 'a' option must not overpromise "always" ─────────

describe('item(3) — the nested confirm label is honest about "a" applying once only', () => {
  it('pre-fix bug: the nested ask reused the top-level "Run tool: X" summary verbatim, with no hint that "a" here is one-time only', async () => {
    const log: string[] = [];
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_kill', tier: 'confirm', handler: async () => 'killed' }],
      confirmAnswer: 'a',
      confirmLog: log,
    }));
    await exec({ name: 'deckent_kill', args: {} });

    expect(log).toHaveLength(1);
    // pre-fix: log[0] === 'native.run_tool: deckent_kill' exactly — no once-hint at all.
    expect(log[0]).not.toBe('native.run_tool: deckent_kill');
    expect(log[0]).toContain('deckent_kill');
    expect(log[0].toLowerCase()).toContain('this call only');
    expect(log[0].toLowerCase()).toContain('not saved');
  });

  it('regression guard: "a" still degrades to a one-time allow — the SAME nested call asks again right after (never persisted), matching the honest label', async () => {
    const log: string[] = [];
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_kill', tier: 'confirm', handler: async () => 'killed' }],
      confirmAnswer: 'a',
      confirmLog: log,
    }));
    await exec({ name: 'deckent_kill', args: {} });
    await exec({ name: 'deckent_kill', args: {} });

    expect(log).toHaveLength(2); // if 'a' had persisted (matching the OLD misleading label) the 2nd call would ask 0 times
  });
});

// ─── item (4): a nested exec must be visible in the toolSink log ────────────

describe('item(4) — a nested exec (target tool run via call_tool) is recorded to toolSink, nested-marked', () => {
  it('pre-fix bug: toolSink was never called for the nested target — only the OUTER call_tool invocation reached it (via the loop\'s own tool-result event, out of this resolver\'s reach)', async () => {
    const sink: ToolInfo[] = [];
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_write_file', tier: 'silent', handler: async () => ({ ok: true, output: 'written' }) }],
      toolSink: (info) => sink.push(info),
    }));
    const out = await exec({ name: 'deckent_write_file', args: { path: 'a.txt' } });

    expect(out).toEqual({ ok: true, output: 'written' }); // the resolver's own return value is untouched
    expect(sink).toHaveLength(1); // pre-fix: sink stayed empty for a nested dispatch
    expect(sink[0]!.verb).toContain('deckent_write_file');
    expect(sink[0]!.note).toBe('[nested]'); // nested-marked, distinguishable from a top-level entry
    expect(sink[0]!.failed).toBeUndefined(); // handler succeeded

    // a failing nested target is recorded as failed:true (honest, no fake success)
    const sink2: ToolInfo[] = [];
    const execFail = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_bash', tier: 'silent', handler: async () => ({ ok: false, output: 'exit 1' }) }],
      toolSink: (info) => sink2.push(info),
    }));
    await execFail({ name: 'deckent_bash', args: { cmd: 'false' } });
    expect(sink2).toHaveLength(1);
    expect(sink2[0]!.failed).toBe(true);
  });

  it('regression guard: omitting toolSink entirely is a fully inert no-op — the nested dispatch still runs and returns normally', async () => {
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_status', tier: 'silent', handler: async () => ({ ok: true, output: 'S' }) }],
    }));
    await expect(exec({ name: 'deckent_status', args: {} })).resolves.toEqual({ ok: true, output: 'S' });
  });
});
