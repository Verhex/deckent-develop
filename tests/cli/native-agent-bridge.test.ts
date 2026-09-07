// tests/cli/native-agent-bridge.test.ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createNativeEngine, resolveCostCeilingUsd } from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';

function scripted(scripts: ProviderEvent[][]): ProviderAdapter {
  let turn = 0;
  return { name: 'mock', async *send() { for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } };
}

describe('createNativeEngine', () => {
  it('persists a compact checkpoint through the real engine-session-store chain at the canonical project path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nb-checkpoint-wire-'));
    try {
      const payload = JSON.stringify({
        schemaVersion: 1, objective: 'wire', findings: [], evidenceRefs: [], decisions: [], unresolved: [],
        nextActions: [], inspectedAreas: [], toolResultDigests: [], cumulativeCounters: {}, createdAt: '2026-09-07T00:00:00.000Z',
      });
      const engine = createNativeEngine({
        adapter: scripted([[{ type: 'text-delta', text: `\`\`\`json\n${payload}\n\`\`\`` }, { type: 'done' }]]),
        registry: buildNativeToolRegistry({ cwd: () => dir }), cwd: dir, model: 'm', lang: 'en',
        confirm: async () => 'y', toolSink: () => {},
        scratch: { tenantId: 't', projectId: 'p', sessionId: 'session-real', checkpointProjectRoot: dir },
      });
      expect(await engine.compactContext!()).toMatchObject({ outcome: 'compacted', epoch: 2 });
      const checkpointDir = join(dir, '.deckent', 'runtime', 'sessions', 'session-real', 'checkpoints');
      expect(existsSync(checkpointDir)).toBe(true);
      expect(readFileSync(join(checkpointDir, readdirSync(checkpointDir)[0]!), 'utf8')).toContain('"objective":"wire"');
      engine.close?.({ policy: 'delete' });
      expect(existsSync(checkpointDir)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('streams text via output and ends the turn', async () => {
    const adapter = scripted([[{ type: 'text-delta', text: 'hi' }, { type: 'usage', inputTokens: 3, outputTokens: 1 }, { type: 'done' }]]);
    const out: string[] = [];
    let stats: { inputTokens: number; outputTokens: number } | null = null;
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
    });
    await engine('hello', { output: (t) => out.push(t), onTurnEnd: (s) => { stats = s; } });
    expect(out.join('')).toBe('hi');
    expect(stats).toEqual({ inputTokens: 3, outputTokens: 1 });
  });

  it('relays the exact request-admission event without claiming transport success', async () => {
    const decision = {
      admitted: true as const,
      availableTokens: 800,
      measurement: {
        inputTokens: 200, quality: 'exact' as const, provenance: 'provider-counter', requestDigest: 'digest',
        identity: { provider: 'mock', model: 'm', contextWindowTokens: 1000, contextProvenance: 'model-registry' as const },
      },
    };
    const engine = createNativeEngine({
      adapter: scripted([[{ type: 'request-measurement', decision }, { type: 'done' }]]),
      registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
    });
    const measurements: unknown[] = [];
    await engine('measure', {
      output: () => {}, onTurnEnd: () => {}, onRequestMeasurement: (event) => measurements.push(event),
    });
    expect(measurements).toEqual([{ type: 'request-measurement', purpose: 'turn', decision }]);
  });

  it('clears only the cached last-request display attribution after successful hydration', async () => {
    const decision = {
      admitted: true as const,
      availableTokens: 800,
      measurement: {
        inputTokens: 200, quality: 'exact' as const, provenance: 'provider-counter', requestDigest: 'digest',
        identity: { provider: 'mock', model: 'm', contextWindowTokens: 1000, contextProvenance: 'model-registry' as const },
      },
    };
    const engine = createNativeEngine({
      adapter: scripted([[{ type: 'request-measurement', decision }, { type: 'usage', inputTokens: 0, outputTokens: 0 }, { type: 'done' }]]),
      registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
    });
    await engine('measure', { output: () => {}, onTurnEnd: () => {} });
    expect((await engine.contextSnapshot!()).lastRequestMeasurement).toBeDefined();
    engine.hydrateTranscript?.([{ role: 'user', content: 'resumed' }], { nextTurnIndex: 4 });
    const after = await engine.contextSnapshot!();
    expect(after.lastRequestMeasurement).toBeUndefined();
    expect(after.providerReportedUsage).toEqual({ inputTokens: 0, outputTokens: 0, reports: 1 });
  });

  it('asks the confirm-queue on a side-effecting tool, then executes it on "y" (real write)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nb-'));
    try {
      const adapter = scripted([
        [{ type: 'tool-call', id: 'w', name: 'deckent_write_file', args: { path: 'out.txt', content: 'NATIVE' } }, { type: 'done' }],
        [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
      ]);
      const asks: string[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => dir }), cwd: dir, model: 'm', lang: 'en',
        confirm: async (summary, tool) => { asks.push(tool); return 'y'; }, toolSink: () => {},
      });
      await engine('write it', { output: () => {}, onTurnEnd: () => {} });
      expect(asks).toContain('deckent_write_file');           // permission-request → confirm-queue
      expect(existsSync(join(dir, 'out.txt'))).toBe(true);     // executed for real
      expect(readFileSync(join(dir, 'out.txt'), 'utf-8')).toBe('NATIVE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports only canonical tool execution, then clears the matching activity after its result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nb-tool-activity-'));
    try {
      const adapter = scripted([
        [{ type: 'tool-call', id: 'write-1', name: 'deckent_write_file', args: { path: 'out.txt', content: 'NATIVE' } }, { type: 'done' }],
        [{ type: 'done' }],
      ]);
      const activity: Array<Record<string, string>> = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => dir }), cwd: dir, model: 'm', lang: 'en',
        confirm: async () => 'y', toolSink: () => {},
        t: (key) => ({
          'tui.native_tool_executing': 'executing {tool} · {elapsed}',
          'tui.native_tool_executing_compact': 'executing · {elapsed} · {tool}',
          'tui.native_tool_cancel_requested': 'cancel requested for {tool} · waiting for the tool to end ({elapsed})',
          'tui.native_tool_cancel_requested_compact': 'cancel requested · {elapsed} · {tool}',
          'tui.native_tool_status': 'local active tool: {tool}',
        })[key] ?? key,
      });
      await engine('write it', {
        output: () => {}, onTurnEnd: () => {},
        onToolActivity: (event) => activity.push(event as Record<string, string>),
      });
      expect(activity).toEqual([
        expect.objectContaining({
          kind: 'executing', id: 'write-1', tool: 'deckent_write_file',
          label: 'executing {tool} · {elapsed}',
          compactLabel: 'executing · {elapsed} · {tool}',
          cancelRequestedLabel: 'cancel requested for {tool} · waiting for the tool to end ({elapsed})',
          cancelRequestedCompactLabel: 'cancel requested · {elapsed} · {tool}',
          statusLabel: 'local active tool: {tool}',
        }),
        { kind: 'clear', id: 'write-1' },
      ]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a "n" answer denies the tool (no write) and feeds a rejection back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nb-deny-'));
    try {
      const adapter = scripted([
        [{ type: 'tool-call', id: 'w', name: 'deckent_write_file', args: { path: 'no.txt', content: 'X' } }, { type: 'done' }],
        [{ type: 'done' }],
      ]);
      const sink: { failed?: boolean }[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => dir }), cwd: dir, model: 'm', lang: 'en',
        confirm: async () => 'n', toolSink: (i) => sink.push(i),
      });
      await engine('write it', { output: () => {}, onTurnEnd: () => {} });
      expect(existsSync(join(dir, 'no.txt'))).toBe(false);
      expect(sink.some((s) => s.failed)).toBe(true);           // honest ✗ change block
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accrues usage and emits a cost advisory once a configured ceiling trips', async () => {
    const adapter = scripted([[
      { type: 'text-delta', text: 'x' },
      { type: 'usage', inputTokens: 600_000, outputTokens: 0 }, // $6 at $10/M
      { type: 'done' },
    ]]);
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      costCeilingUsd: 5, usdPerMillionTokens: 10,
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    expect(out.join('')).toMatch(/COST_GATE_EXCEEDED|maliyet|cost/i);
  });

  it('does not emit a cost advisory when no ceiling is set', async () => {
    const adapter = scripted([[{ type: 'usage', inputTokens: 10_000_000, outputTokens: 0 }, { type: 'done' }]]);
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    expect(out.join('')).not.toMatch(/COST_GATE_EXCEEDED/);
  });

  it('uses the injected localizer for the permission summary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nb-i18n-'));
    try {
      const adapter = scripted([
        [{ type: 'tool-call', id: 'w', name: 'deckent_write_file', args: { path: 'a.txt', content: 'X' } }, { type: 'done' }],
        [{ type: 'done' }],
      ]);
      const summaries: string[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => dir }), cwd: dir, model: 'm', lang: 'en',
        confirm: async (summary) => { summaries.push(summary); return 'y'; },
        toolSink: () => {},
        t: (key) => (key === 'native.run_tool' ? 'RUN' : `LBL:${key}`),
      });
      await engine('go', { output: () => {}, onTurnEnd: () => {} });
      expect(summaries[0]).toContain('RUN');      // localized prefix, not a raw English literal
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolveCostCeilingUsd: env override wins, config is the fallback, invalid → undefined', () => {
    // env override (valid positive number) wins over config
    expect(resolveCostCeilingUsd({ DECKENT_NATIVE_COST_CEILING: '2.5' }, { native_cost_ceiling_usd: 9 })).toBe(2.5);
    // config fallback when env unset
    expect(resolveCostCeilingUsd({}, { native_cost_ceiling_usd: 9 })).toBe(9);
    // neither set → undefined (advisory-only, no hard ceiling)
    expect(resolveCostCeilingUsd({}, {})).toBeUndefined();
    // invalid / non-positive values are rejected (not applied as a ceiling)
    expect(resolveCostCeilingUsd({ DECKENT_NATIVE_COST_CEILING: 'abc' }, {})).toBeUndefined();
    expect(resolveCostCeilingUsd({ DECKENT_NATIVE_COST_CEILING: '0' }, {})).toBeUndefined();
    expect(resolveCostCeilingUsd({}, { native_cost_ceiling_usd: -1 })).toBeUndefined();
  });

  it('records the transcript after a completed turn when a recorder is provided', async () => {
    const adapter = scripted([[{ type: 'text-delta', text: 'hi' }, { type: 'done' }]]);
    const recorded: Array<{ role: string; content: string }[]> = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      recordTurn: (messages) => recorded.push(messages.map((m) => ({ role: m.role, content: m.content }))),
    });
    await engine('hello', { output: () => {}, onTurnEnd: () => {} });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('hydrateTranscript nextTurnIndex continues recordTurn numbering across a resume (564-004)', async () => {
    const adapter = scripted([
      [{ type: 'text-delta', text: 'a' }, { type: 'done' }],
      [{ type: 'text-delta', text: 'b' }, { type: 'done' }],
      [{ type: 'text-delta', text: 'c' }, { type: 'done' }],
      [{ type: 'text-delta', text: 'd' }, { type: 'done' }],
    ]);
    const indices: number[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      recordTurn: (_messages, meta) => indices.push(meta.turnIndex),
    });
    // Fresh session: numbering starts at 0.
    await engine('one', { output: () => {}, onTurnEnd: () => {} });
    // Ledger resume with 5 rows on disk: the FIRST post-resume turn records at
    // 5, the next at 6 — never restarting at 0 over the hydrated rows.
    engine.hydrateTranscript!([{ role: 'user', content: 'prior' }], { nextTurnIndex: 5 });
    await engine('two', { output: () => {}, onTurnEnd: () => {} });
    await engine('three', { output: () => {}, onTurnEnd: () => {} });
    // Absent/invalid options never touch the counter (legacy-resume fail-safe).
    engine.hydrateTranscript!([{ role: 'user', content: 'again' }]);
    engine.hydrateTranscript!([{ role: 'user', content: 'bad' }], { nextTurnIndex: -1 });
    engine.hydrateTranscript!([{ role: 'user', content: 'bad' }], { nextTurnIndex: 2.5 });
    await engine('four', { output: () => {}, onTurnEnd: () => {} });
    expect(indices).toEqual([0, 5, 6, 7]);
  });
});
