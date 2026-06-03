import { describe, it, expect, vi } from 'vitest';
import {
  createCliToolDispatcher,
  cliArgsFor,
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

  // ─── Faz A: expanded read-only command coverage ──────────────────────────

  it.each([
    ['deckent_retro', ['retro']],
    ['deckent_doctor', ['doctor']],
    ['deckent_models', ['models']],
    ['deckent_analyze_project', ['analyze']],
    ['deckent_review', ['review']],
    ['deckent_explain', ['explain']],
    ['deckent_agent_list', ['agent', 'list']],
    ['deckent_skill_list', ['skill', 'list']],
    ['deckent_feature_query', ['features']],
  ])('%s → spawns %j', async (tool, expectedArgs) => {
    const spawnFn = vi.fn().mockResolvedValue('ok') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch(tool, { root: '.' });
    expect(out).toBe('ok');
    expect(spawnFn).toHaveBeenCalledWith(expectedArgs);
  });

  it('appends _rest positional args to the subcommand (e.g. /explain sprint-224)', async () => {
    const spawnFn = vi.fn().mockResolvedValue('explain ok') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_explain', { _rest: ['sprint-224'] });
    expect(out).toBe('explain ok');
    expect(spawnFn).toHaveBeenCalledWith(['explain', 'sprint-224']);
  });

  it('deckent_config (show) → spawns `config`', async () => {
    const spawnFn = vi.fn().mockResolvedValue('{...}') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    await d.dispatch('deckent_config', {});
    expect(spawnFn).toHaveBeenCalledWith(['config']);
  });

  it('deckent_config set → spawns `config set <k> <v>` via _rest', async () => {
    const spawnFn = vi.fn().mockResolvedValue('✓') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    await d.dispatch('deckent_config', { _rest: ['set', 'max_workers', '4'] });
    expect(spawnFn).toHaveBeenCalledWith(['config', 'set', 'max_workers', '4']);
  });

  it('deckent_audit → tool not allowed (slow/auth-blocked, gated)', async () => {
    const spawnFn = vi.fn() as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_audit', { _rest: ['sprint-224'] });
    expect(out).toBe('[mcp-error] tool not allowed: deckent_audit');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('ignores a non-array _rest (defensive)', async () => {
    const spawnFn = vi.fn().mockResolvedValue('ok') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    await d.dispatch('deckent_review', { _rest: 'not-an-array' });
    expect(spawnFn).toHaveBeenCalledWith(['review']);
  });
});

describe('cliArgsFor — resolved argv (shared by dispatch + confirm modal)', () => {
  it('maps an allow-listed tool to its subcommand', () => {
    expect(cliArgsFor('deckent_status', {})).toEqual(['status']);
    expect(cliArgsFor('deckent_agent_list', {})).toEqual(['agent', 'list']);
  });

  it('appends _rest positional args', () => {
    expect(cliArgsFor('deckent_config', { _rest: ['set', 'k', 'v'] })).toEqual(['config', 'set', 'k', 'v']);
  });

  it('returns null for a tool not in the allow-list', () => {
    expect(cliArgsFor('deckent_kill', {})).toBeNull();
    expect(cliArgsFor('deckent_memory_query', { query: 'x' })).toBeNull();
  });
});
