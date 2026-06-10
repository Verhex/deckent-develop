import { describe, it, expect, vi } from 'vitest';
import {
  buildSlashRegistry,
  resolveSlash,
} from '../../src/cli/commands/chat-slash-registry.js';
import {
  cliArgsFor,
  createCliToolDispatcher,
  type CliToolSpawnFn,
} from '../../src/cli/commands/chat-tool-bridge.js';
import { classifyTool } from '../../src/cli/repl/tool-permissions.js';

// ─── Layer 1: chat-slash-registry ────────────────────────────────────────────

describe('/usage slash — registry catalog', () => {
  it('/usage is present in the registry and maps to deckent_usage', () => {
    const registry = buildSlashRegistry();
    const entry = registry.find((c) => c.name === '/usage');
    expect(entry).toBeDefined();
    expect(entry?.agenticTool).toBe('deckent_usage');
  });

  it('bare /usage → agentic deckent_usage with empty args', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/usage', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.tool).toBe('deckent_usage');
      expect(result.args).toEqual({});
    }
  });

  it('/usage --sprint 275 → agentic deckent_usage with sprint arg', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/usage --sprint 275', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.tool).toBe('deckent_usage');
      expect(result.args['sprint']).toBe('275');
    }
  });

  it('/usage since 2026-06-01 → agentic deckent_usage with since arg', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/usage since 2026-06-01', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.tool).toBe('deckent_usage');
      expect(result.args['since']).toBe('2026-06-01');
    }
  });

  it('/usage --since 2026-06-01 → agentic deckent_usage with since arg (flag form)', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/usage --since 2026-06-01', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.args['since']).toBe('2026-06-01');
    }
  });

  it('/usage --sprint (no value) → message action i18n key', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/usage --sprint', registry);
    expect(result.action).toBe('message');
    if (result.action === 'message') {
      expect(result.messageKey).toBe('chat.usage_sprint_required');
    }
  });

  it('/usage since (no value) → message action i18n key', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/usage since', registry);
    expect(result.action).toBe('message');
    if (result.action === 'message') {
      expect(result.messageKey).toBe('chat.usage_since_required');
    }
  });

  it('/usage unknown → message action with slash_unknown_subaction key', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/usage unknown', registry);
    expect(result.action).toBe('message');
    if (result.action === 'message') {
      expect(result.messageKey).toBe('chat.slash_unknown_subaction');
      expect(result.params?.['command']).toBe('/usage');
      expect(result.params?.['sub']).toBe('unknown');
    }
  });
});

// ─── Layer 2: chat-tool-bridge cliArgsFor ─────────────────────────────────────

describe('cliArgsFor — deckent_usage argv mapping', () => {
  it('bare args → [usage]', () => {
    expect(cliArgsFor('deckent_usage', {})).toEqual(['usage']);
  });

  it('sprint arg → [usage, --sprint, N]', () => {
    expect(cliArgsFor('deckent_usage', { sprint: '275' })).toEqual(['usage', '--sprint', '275']);
  });

  it('since arg → [usage, --since, ISO]', () => {
    expect(cliArgsFor('deckent_usage', { since: '2026-06-01' })).toEqual(['usage', '--since', '2026-06-01']);
  });

  it('until arg → [usage, --until, ISO]', () => {
    expect(cliArgsFor('deckent_usage', { until: '2026-06-10' })).toEqual(['usage', '--until', '2026-06-10']);
  });

  it('sprint + since combined → both flags in argv', () => {
    const argv = cliArgsFor('deckent_usage', { sprint: '273', since: '2026-05-01' });
    expect(argv).toContain('--sprint');
    expect(argv).toContain('273');
    expect(argv).toContain('--since');
    expect(argv).toContain('2026-05-01');
  });
});

// ─── Layer 2: dispatch integration (via createCliToolDispatcher) ───────────────

describe('createCliToolDispatcher — deckent_usage dispatch', () => {
  it('bare deckent_usage → spawns [usage]', async () => {
    const spawnFn = vi.fn().mockResolvedValue('Usage summary') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_usage', {});
    expect(out).toBe('Usage summary');
    expect(spawnFn).toHaveBeenCalledWith(['usage']);
  });

  it('deckent_usage with sprint → spawns [usage, --sprint, N]', async () => {
    const spawnFn = vi.fn().mockResolvedValue('Sprint 275 usage') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    await d.dispatch('deckent_usage', { sprint: '275' });
    expect(spawnFn).toHaveBeenCalledWith(['usage', '--sprint', '275']);
  });
});

// ─── Layer 3: tool-permissions classifyTool ──────────────────────────────────

describe('classifyTool — deckent_usage is read-only', () => {
  it('deckent_usage → read (no confirmation required)', () => {
    expect(classifyTool('deckent_usage', {})).toBe('read');
    expect(classifyTool('deckent_usage', { sprint: '275' })).toBe('read');
    expect(classifyTool('deckent_usage', { since: '2026-06-01' })).toBe('read');
  });
});
