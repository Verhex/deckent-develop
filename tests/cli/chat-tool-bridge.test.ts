import { describe, it, expect, vi } from 'vitest';
import {
  createCliToolDispatcher,
  type CliToolSpawnFn,
} from '../../src/cli/commands/chat-tool-bridge.js';

// All tests inject a fake spawnFn — no real subprocess is ever launched, so
// the suite is hermetic (no dist/, no deckent state, no network).

describe('createCliToolDispatcher — chat-tool-bridge.ts', () => {
  it('deckent_status → spawns the `status` subcommand and returns its stdout', async () => {
    const spawnFn = vi.fn().mockResolvedValue('Sprint sprint-223 — 13/13 DONE') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_status', { root: '.' });
    expect(out).toBe('Sprint sprint-223 — 13/13 DONE');
    expect(spawnFn).toHaveBeenCalledWith(['status']);
  });

  it('deckent_history → spawns the `history` subcommand', async () => {
    const spawnFn = vi.fn().mockResolvedValue('sprint-222\nsprint-223') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_history', { root: '.' });
    expect(out).toBe('sprint-222\nsprint-223');
    expect(spawnFn).toHaveBeenCalledWith(['history']);
  });

  it('deckent_memory_query → appends query as `recall <query>` positional', async () => {
    const spawnFn = vi.fn().mockResolvedValue('adr-027 Hybrid Spawn Backend') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_memory_query', { query: 'docker' });
    expect(out).toBe('adr-027 Hybrid Spawn Backend');
    expect(spawnFn).toHaveBeenCalledWith(['recall', 'docker']);
  });

  it('deckent_memory_query without query → mcp-error, no spawn', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_memory_query', {});
    expect(out).toBe('[mcp-error] recall: query required');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('deckent_plan → tool not allowed (gated), no spawn', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_plan', { mode: 'auto' });
    expect(out).toBe('[mcp-error] tool not allowed: deckent_plan');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('unknown tool → tool not allowed, no spawn', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_kill', { target: 'all' });
    expect(out).toBe('[mcp-error] tool not allowed: deckent_kill');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('spawn rejection → tagged mcp-error, never throws', async () => {
    const spawnFn = vi.fn().mockRejectedValue(new Error('ENOENT')) as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_status', {});
    expect(out).toBe('[mcp-error] deckent_status: ENOENT');
  });
});
