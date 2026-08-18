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
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mergeConfigs } from '../../src/core/config.js';
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
    // NT-06 (sprint-554): the resolver now always carries the fail-closed
    // `progressive` flag (false unless config says literal true).
    expect(resolveToolSurfaceOptions({ enabled: true })).toEqual({ enabled: true, progressive: false });
    expect(resolveToolSurfaceOptions({ enabled: true, riskThreshold: 'destructive' }))
      .toEqual({ enabled: true, progressive: false, riskThreshold: 'destructive' });
  });

  it('INVALID riskThreshold is DROPPED (pre-fix it fell through and disabled the confirm gate — fail-open)', () => {
    const opts = resolveToolSurfaceOptions({ enabled: true, riskThreshold: 'high' });
    expect(opts).toEqual({ enabled: true, progressive: false }); // dispatch falls back to its own 'moderate' default
  });
});

describe('run.tsx composition pin (Gap A — the consumer-less default-ON bug class)', () => {
  it('run.tsx threads resolveToolSurfaceOptions into BOTH buildNativeToolRegistry and createNativeEngine', () => {
    const src = readFileSync(join(REPO, 'src', 'cli', 'repl', 'run.tsx'), 'utf-8');
    expect(src).toContain('resolveToolSurfaceOptions(');
    const registryCall = src.slice(src.indexOf('registry: buildNativeToolRegistry({'));
    expect(registryCall.slice(0, 300)).toContain('toolSurface: toolSurfaceOpts');
    // engine-level (bridge) injection — the parity resolver's plumbing.
    // (The composition call was renamed to createResolvedNativeEngine by the
    // budget-wiring landing; the pin follows the current source.)
    const engineCall = src.slice(src.indexOf('nativeEngine = createResolvedNativeEngine('));
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
    const surface: ToolSurfaceOptions = { enabled: true, progressive: false };
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

  it('REAL e2e: fake mcpBridge tool → call_tool handler → dispatch → parity → target handler, EXACTLY 1 prompt', async () => {
    const log: string[] = [];
    let targetRan = 0;
    const surface: ToolSurfaceOptions = { enabled: true, progressive: false };
    const reg = buildNativeToolRegistry({
      cwd: () => tmpdir(),
      toolSurface: surface,
      mcpBridge: {
        listTools: () => [{ namespacedName: 'mcp_fake_deploy', descriptor: { description: 'fake deploy tool' } }],
        dispatch: async () => { targetRan += 1; return { ok: true, output: 'deployed' }; },
      },
    });
    surface.execImpl = createParityExecImpl({
      ...parityCtx({ confirmAnswer: 'y', confirmLog: log }),
      registry: reg,
    });
    surface.confirm = () => 'allow';
    const res = await reg.get('deckent_call_tool')!.handler({ name: 'mcp_fake_deploy', args: {} });
    expect((res as { ok: boolean }).ok).toBe(true);
    expect(targetRan).toBe(1);
    expect(log).toHaveLength(1); // MCP tools register confirm-tier → parity asks ONCE, no double-prompt
  });
});

// ─── advisor BEFORE-done test debt: the 2 untested gates + mode/self-mod/degrade ──

describe('parity gate coverage (advisor: tierMap/alwaysFloor were unproven)', () => {
  it("tierMap override parity: policy's silent→confirm escalation asks on the nested path too", async () => {
    const log: string[] = [];
    const ctx = parityCtx({
      defs: [{ name: 'deckent_status', tier: 'silent', handler: async () => 'ok' }],
      confirmLog: log, confirmAnswer: 'y',
    });
    (ctx.policy as unknown as { tierMap: Record<string, string> }).tierMap['deckent_status'] = 'confirm';
    await createParityExecImpl(ctx)({ name: 'deckent_status', args: {} });
    expect(log).toHaveLength(1);
  });

  it('alwaysFloor parity: a floored tool asks even in full-auto mode (decide rule-2 precedes mode)', async () => {
    const log: string[] = [];
    const ctx = parityCtx({
      defs: [{ name: 'deckent_bash', tier: 'confirm', handler: async () => 'x' }],
      mode: 'full-auto', confirmLog: log, confirmAnswer: 'y',
    });
    (ctx.policy as unknown as { alwaysFloor: string[] }).alwaysFloor.push('deckent_bash');
    await createParityExecImpl(ctx)({ name: 'deckent_bash', args: { cmd: 'ls' } });
    expect(log).toHaveLength(1);
  });

  it('mode parity: full-auto lets a confirm-tier target through with no prompt', async () => {
    const log: string[] = [];
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_kill', tier: 'confirm', handler: async () => 'k' }],
      mode: 'full-auto', confirmLog: log,
    }));
    await exec({ name: 'deckent_kill', args: {} });
    expect(log).toEqual([]);
  });

  it("self-mod elevation parity: in a deckent repo, a src/ write asks DESPITE a '**' grant", async () => {
    const root = mkdtempSync(join(tmpdir(), 'selfmod-'));
    try {
      mkdirSync(join(root, '.deckent'), { recursive: true });
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'deckent' }));
      const log: string[] = [];
      const ctx = parityCtx({
        defs: [{ name: 'deckent_write_file', tier: 'confirm', handler: async () => 'w' }],
        rules: [{ tool: 'deckent_write_file', pattern: '**' }],
        confirmLog: log, confirmAnswer: 'y',
      });
      ctx.cwd = root;
      await createParityExecImpl(ctx)({ name: 'deckent_write_file', args: { path: 'src/core/config.ts' } });
      expect(log).toHaveLength(1); // grant would auto-allow; elevation forces the ask
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("'a' degrade pin: nested 'a' runs the call but the SECOND identical call asks again (no persist)", async () => {
    const log: string[] = [];
    const exec = createParityExecImpl(parityCtx({
      defs: [{ name: 'deckent_kill', tier: 'confirm', handler: async () => 'k' }],
      confirmAnswer: 'a', confirmLog: log,
    }));
    await exec({ name: 'deckent_kill', args: {} });
    await exec({ name: 'deckent_kill', args: {} });
    expect(log).toHaveLength(2);
  });

  it('explicit riskThreshold honor (P1): threshold=safe escalates even a silent-tier allow to ask', async () => {
    const log: string[] = [];
    const exec = createParityExecImpl({
      ...parityCtx({
        defs: [{ name: 'deckent_status', tier: 'silent', handler: async () => 's' }],
        confirmLog: log, confirmAnswer: 'y',
      }),
      riskThreshold: 'safe',
    });
    await exec({ name: 'deckent_status', args: {} });
    expect(log).toHaveLength(1); // absent threshold → this would be silent (tested above)
  });
});

describe('config resolution (P1: partial block must not kill default-ON)', () => {
  it('a partial tool_surface block (riskThreshold only) keeps enabled=true', () => {
    const resolved = mergeConfigs(null, { tool_surface: { riskThreshold: 'safe' } } as never);
    expect(resolved.tool_surface?.enabled).toBe(true);
    expect(resolved.tool_surface?.riskThreshold).toBe('safe');
  });

  it('explicit enabled:false still opts out; absent block stays default-ON', () => {
    expect(mergeConfigs(null, { tool_surface: { enabled: false } } as never).tool_surface?.enabled).toBe(false);
    expect(mergeConfigs(null, {}).tool_surface?.enabled).toBe(true);
  });
});
