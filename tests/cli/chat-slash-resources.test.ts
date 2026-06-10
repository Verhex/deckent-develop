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

describe('/resources slash — registry catalog', () => {
  it('/resources is present in the registry and maps to deckent_resources', () => {
    const registry = buildSlashRegistry();
    const entry = registry.find((c) => c.name === '/resources');
    expect(entry).toBeDefined();
    expect(entry?.agenticTool).toBe('deckent_resources');
  });

  it('bare /resources → agentic deckent_resources with empty args', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/resources', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.tool).toBe('deckent_resources');
      expect(result.args).toEqual({});
    }
  });

  it('/resources --log → agentic deckent_resources with log:true (default path)', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/resources --log', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.tool).toBe('deckent_resources');
      expect(result.args['log']).toBe(true);
    }
  });

  it('/resources --log /path/to/log → agentic deckent_resources with log path', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/resources --log /path/to/log', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.tool).toBe('deckent_resources');
      expect(result.args['log']).toBe('/path/to/log');
    }
  });

  it('/resources unknown → message action with slash_unknown_subaction key', () => {
    const registry = buildSlashRegistry();
    const result = resolveSlash('/resources unknown', registry);
    expect(result.action).toBe('message');
    if (result.action === 'message') {
      expect(result.messageKey).toBe('chat.slash_unknown_subaction');
      expect(result.params?.['command']).toBe('/resources');
      expect(result.params?.['sub']).toBe('unknown');
    }
  });
});

// ─── Layer 2: chat-tool-bridge cliArgsFor ─────────────────────────────────────

describe('cliArgsFor — deckent_resources argv mapping', () => {
  it('bare args → [resources]', () => {
    expect(cliArgsFor('deckent_resources', {})).toEqual(['resources']);
  });

  it('log:true → [resources, --log]', () => {
    expect(cliArgsFor('deckent_resources', { log: true })).toEqual(['resources', '--log']);
  });

  it('log path → [resources, --log, path]', () => {
    expect(cliArgsFor('deckent_resources', { log: '/var/log/deckent.log' })).toEqual([
      'resources',
      '--log',
      '/var/log/deckent.log',
    ]);
  });
});

// ─── Layer 2: dispatch integration (via createCliToolDispatcher) ───────────────

describe('createCliToolDispatcher — deckent_resources dispatch', () => {
  it('bare deckent_resources → spawns [resources]', async () => {
    const spawnFn = vi.fn().mockResolvedValue('Resources snapshot') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    const out = await d.dispatch('deckent_resources', {});
    expect(out).toBe('Resources snapshot');
    expect(spawnFn).toHaveBeenCalledWith(['resources']);
  });

  it('deckent_resources with log:true → spawns [resources, --log]', async () => {
    const spawnFn = vi.fn().mockResolvedValue('Resources log') as unknown as CliToolSpawnFn;
    const d = createCliToolDispatcher({ spawnFn });
    await d.dispatch('deckent_resources', { log: true });
    expect(spawnFn).toHaveBeenCalledWith(['resources', '--log']);
  });
});

// ─── Layer 3: tool-permissions classifyTool ──────────────────────────────────

describe('classifyTool — deckent_resources is read-only', () => {
  it('deckent_resources → read (no confirmation required)', () => {
    expect(classifyTool('deckent_resources', {})).toBe('read');
    expect(classifyTool('deckent_resources', { log: true })).toBe('read');
    expect(classifyTool('deckent_resources', { log: '/path/to/log' })).toBe('read');
  });
});
