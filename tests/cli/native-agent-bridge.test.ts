// tests/cli/native-agent-bridge.test.ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createNativeEngine } from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';

function scripted(scripts: ProviderEvent[][]): ProviderAdapter {
  let turn = 0;
  return { name: 'mock', async *send() { for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } };
}

describe('createNativeEngine', () => {
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
});
