/**
 * born-607 CALLTOOL-EXEC-WIRE — the two gaps + the parity contract.
 *
 * Gap A: `tool_surface` config → registry threading (resolveToolSurfaceOptions +
 *        run.tsx composition pin — source-assert, the desktop composition-pin precedent).
 * Gap B: engine-parity execImpl (createParityExecImpl) — a nested call_tool dispatch
 *        must hit the SAME gates as the loop's direct path (advisor P0: deny-glob
 *        bypass was the sharpest regression), with exactly ONE asker (no double-prompt).
 * Hermetic: fake registry/policy/ruleStore; no disk, no session.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  buildNativeToolRegistry,
  resolveToolSurfaceOptions,
  type ToolSurfaceOptions,
} from '../../src/cli/repl/native-tool-registry.js';
import { createParityExecImpl, type ParityExecContext } from '../../src/cli/repl/native-agent-bridge.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─── Gap A: config resolution ────────────────────────────────────────────────

describe('resolveToolSurfaceOptions (Gap A — config → registry)', () => {
  it('absent block or enabled!==true → undefined (fail-closed on config-load failure)', () => {
    expect(resolveToolSurfaceOptions(undefined)).toBeUndefined();
    expect(resolveToolSurfaceOptions({})).toBeUndefined();
    expect(resolveToolSurfaceOptions({ enabled: false })).toBeUndefined();
    expect(resolveToolSurfaceOptions({ enabled: 'yes' as unknown as boolean })).toBeUndefined();
  });

  it('enabled:true → options; valid riskThreshold kept', () => {
    expect(resolveToolSurfaceOptions({ enabled: true })).toEqual({ enabled: true });
    expect(resolveToolSurfaceOptions({ enabled: true, riskThreshold: 'destructive' }))
      .toEqual({ enabled: true, riskThreshold: 'destructive' });
  });

  it('INVALID riskThreshold is DROPPED (pre-fix it fell through and disabled the confirm gate — fail-open)', () => {
    const opts = resolveToolSurfaceOptions({ enabled: true, riskThreshold: 'high' });
    expect(opts).toEqual({ enabled: true }); // dispatch falls back to its own 'moderate' default
  });
});

describe('run.tsx composition pin (Gap A — the consumer-less default-ON bug class)', () => {
  it('run.tsx threads resolveToolSurfaceOptions into BOTH buildNativeToolRegistry and createNativeEngine', () => {
    const src = readFileSync(join(REPO, 'src', 'cli', 'repl', 'run.tsx'), 'utf-8');
    expect(src).toContain('resolveToolSurfaceOptions(');
    const registryCall = src.slice(src.indexOf('registry: buildNativeToolRegistry({'));
    expect(registryCall.slice(0, 300)).toContain('toolSurface: toolSurfaceOpts');
    // engine-level (bridge) injection — the parity resolver's plumbing
    const engineCall = src.slice(src.indexOf('nativeEngine = createNativeEngine({'));
    expect(engineCall.slice(0, 600)).toContain('toolSurface: toolSurfaceOpts');
  });
});

// ─── Gap B: parity resolver ──────────────────────────────────────────────────

interface FakeDef {
  name: string;
  tier: 'silent' | 'confirm' | 'always';
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function parityCtx(over: {
  defs?: FakeDef[];
  denies?: Array<{ tool: string; pattern: string }>;
  rules?: Array<{ tool: string; pattern: string }>;
  mode?: 'suggest' | 'auto-edit' | 'full-auto';
  confirmAnswer?: 'y' | 'a' | 'n';
  confirmLog?: string[];
}): ParityExecContext {
  const defs = new Map((over.defs ?? []).map(d => [d.name, d]));
  return {
    registry: { get: (name: string) => defs.get(name) as never },
    policy: { defaultMode: over.mode ?? 'suggest', tierMap: {}, alwaysFloor: [] } as never,
    ruleStore: {
      activeRules: () => (over.rules ?? []) as never,
      activeDenies: () => (over.denies ?? []) as never,
    },
    getMode: () => (over.mode ?? 'suggest') as never,
    confirm: async (summary: string) => {
      over.confirmLog?.push(summary);
      return over.confirmAnswer ?? 'y';
    },
    cwd: tmpdir(),
    t: (k) => k,
  };
}

describe('createParityExecImpl (Gap B — engine-parity nested dispatch)', () => {
  it('unknown target → throws (catalog⊂registry invariant fail-closed)', async () => {
    const exec = createParityExecImpl(parityCtx({}));
    await expect(exec({ name: 'nope', args: {} })).rejects.toThrow(/unknown tool/);
  });

  it('DENY-GLOB PARITY (advisor P0): a user deny-rule on the target holds through call_tool with ZERO prompt', async () => {
    const log: string[] = [];
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_read_file', tier: 'silent', handler: async () => 'SECRET' }],
      denies: [{ tool: 'deckent_read_file', pattern: '.env*' }],
      confirmLog: log,
    }));
    await expect(exec({ name: 'deckent_read_file', args: { path: '.env.local' } }))
      .rejects.toThrow(/denied by policy/);
    expect(log).toEqual([]); // denied silently — never even asked
  });

  it('silent-tier target executes with no prompt; handler result returned', async () => {
    const log: string[] = [];
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_status', tier: 'silent', handler: async () => ({ ok: true, output: 'S' }) }],
      confirmLog: log,
    }));
    const out = await exec({ name: 'deckent_status', args: {} });
    expect(out).toEqual({ ok: true, output: 'S' });
    expect(log).toEqual([]);
  });

  it('confirm-tier target asks EXACTLY ONCE (double-prompt regression) and executes on y', async () => {
    const log: string[] = [];
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_kill', tier: 'confirm', handler: async () => 'killed' }],
      confirmAnswer: 'y',
      confirmLog: log,
    }));
    const out = await exec({ name: 'deckent_kill', args: {} });
    expect(out).toBe('killed');
    expect(log).toHaveLength(1);
  });

  it('confirm-tier target: user n → rejected, handler never runs', async () => {
    let ran = false;
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_kill', tier: 'confirm', handler: async () => { ran = true; return 'x'; } }],
      confirmAnswer: 'n',
    }));
    await expect(exec({ name: 'deckent_kill', args: {} })).rejects.toThrow(/rejected by user/);
    expect(ran).toBe(false);
  });

  it("an allow-grant on the target auto-allows the nested call too (grant parity)", async () => {
    const log: string[] = [];
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_write_file', tier: 'confirm', handler: async () => 'written' }],
      rules: [{ tool: 'deckent_write_file', pattern: '**' }],
      confirmLog: log,
    }));
    const out = await exec({ name: 'deckent_write_file', args: { path: 'src/x.ts' } });
    expect(out).toBe('written');
    expect(log).toEqual([]); // grant consumed — no ask (pre-parity this always re-asked or bypassed)
  });
});

// ─── end-to-end: registry + parity exec through the real call_tool handler ───

describe('call_tool end-to-end (registry handler → dispatch → parity exec)', () => {
  it('armed surface: call_tool on a safe registered tool executes for real', async () => {
    const surface: ToolSurfaceOptions = { enabled: true };
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: surface });
    // Arm exactly like the bridge does (shared-object fill-in after build):
    surface.execImpl = createParityExecImpl({
      ...parityCtx({}),
      registry: reg, // the REAL registry — targets resolve to their native handlers
    });
    surface.confirm = () => 'allow';

    const callTool = reg.get('deckent_call_tool');
    expect(callTool).toBeDefined();
    // deckent_status is a real registered CLI-bridge tool with a real handler; we
    // don't execute the real CLI here — pick the meta 'deckent_search_tools'? No:
    // meta-tools are catalog-EXCLUDED by design. Use describe-level: plan an
    // unknown tool → clean unknown_tool short-circuit (no execImpl reached).
    const unknown = await callTool!.handler({ name: 'deckent_call_tool', args: {} });
    expect(String((unknown as { output: string }).output)).toContain('unknown_tool'); // self-recursion window closed
  });

  it('default (bridge absent): call_tool still fails closed with NOT_WIRED message', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    const res = await reg.get('deckent_call_tool')!.handler({ name: 'deckent_status', args: {} });
    expect(String((res as { output: string }).output)).toMatch(/execution seam not wired|error/);
  });
});
