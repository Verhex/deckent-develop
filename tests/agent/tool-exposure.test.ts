import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createToolExposure } from '../../src/agent/tools/exposure.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import type { ToolDefinition } from '../../src/agent/tools/types.js';
import {
  buildNativeToolRegistry,
  resolveToolSurfaceOptions,
  type ToolSurfaceOptions,
} from '../../src/cli/repl/native-tool-registry.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'deckent-tool-exposure-'));
  tempDirs.push(dir);
  return dir;
}

function definition(name: string, exposure?: 'core' | 'discoverable'): ToolDefinition {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: 'object', properties: {} },
    category: 'coding',
    tier: 'silent',
    source: 'builtin',
    ...(exposure ? { exposure } : {}),
    handler: async () => ({ ok: true, output: name }),
  };
}

describe('ToolExposure', () => {
  it('keeps legacy schemas byte-identical when progressive mode is off', () => {
    const registry = new ToolRegistry();
    registry.register(definition('core_tool', 'core'));
    registry.register(definition('other_tool'));
    const before = JSON.stringify(registry.toNativeSchemas());
    const exposure = createToolExposure({ progressive: false }, registry);

    const after = JSON.stringify(registry.toNativeSchemas((def) => exposure.isExposed(def.name)));

    expect(after).toBe(before);
  });

  it('exposes core definitions and monotonically reveals only registered names', () => {
    const registry = new ToolRegistry();
    registry.register(definition('core_tool', 'core'));
    registry.register(definition('hidden_tool'));
    const exposure = createToolExposure({ progressive: true }, registry);

    expect(registry.toNativeSchemas((def) => exposure.isExposed(def.name)).map(({ name }) => name))
      .toEqual(['core_tool']);
    expect(exposure.reveal('hidden_tool')).toBe('revealed');
    expect(exposure.reveal('hidden_tool')).toBe('already-revealed');
    expect(exposure.reveal('missing_tool')).toBe('unknown');
    expect(exposure.revealedNames()).toEqual(['hidden_tool']);
    expect(registry.toNativeSchemas((def) => exposure.isExposed(def.name)).map(({ name }) => name))
      .toEqual(['core_tool', 'hidden_tool']);
  });

  it('resolves progressive mode fail-closed', () => {
    expect(resolveToolSurfaceOptions({ enabled: true })?.progressive).toBe(false);
    expect(resolveToolSurfaceOptions({ enabled: true, progressive: false })?.progressive).toBe(false);
    expect(resolveToolSurfaceOptions({ enabled: true, progressive: true })?.progressive).toBe(true);
    expect(resolveToolSurfaceOptions(undefined)).toBeUndefined();
  });
});

describe('native progressive tool surface', () => {
  async function setup(): Promise<{ registry: ToolRegistry; exposure: ReturnType<typeof createToolExposure> }> {
    const root = await tempRoot();
    const options: ToolSurfaceOptions = {
      enabled: true,
      progressive: true,
      execImpl: async () => ({ ok: true, output: 'called' }),
    };
    const registry = buildNativeToolRegistry({ cwd: () => root, toolSurface: options });
    const exposure = createToolExposure({ progressive: true }, registry);
    options.exposure = exposure;
    return { registry, exposure };
  }

  it('starts with direct exec plus meta tools and reveals on describe and call', async () => {
    const { registry, exposure } = await setup();
    const visible = (): string[] => registry
      .toNativeSchemas((def) => exposure.isExposed(def.name))
      .map(({ name }) => name);

    expect(visible()).toEqual(expect.arrayContaining([
      'deckent_read_file',
      'deckent_bash',
      'deckent_search_tools',
      'deckent_describe_tool',
      'deckent_call_tool',
    ]));
    expect(visible()).not.toContain('deckent_status');

    const described = await registry.get('deckent_describe_tool')!.handler({ name: 'deckent_status' });
    expect(described.ok).toBe(true);
    expect(visible()).toContain('deckent_status');

    expect(visible()).not.toContain('deckent_history');
    await registry.get('deckent_call_tool')!.handler({ name: 'deckent_history', args: {} });
    expect(visible()).toContain('deckent_history');
  });

  it('returns deterministic bounded search cursors', async () => {
    const { registry } = await setup();
    const search = registry.get('deckent_search_tools')!;
    const first = await search.handler({ query: 'deckent', limit: 2 });
    const repeated = await search.handler({ query: 'deckent', limit: 2 });
    const page = JSON.parse(first.output) as { results: unknown[]; cursor: string | null };

    expect(first.output).toBe(repeated.output);
    expect(page.results).toHaveLength(2);
    expect(page.cursor).toBe('2');
    const next = await search.handler({ query: 'deckent', limit: 2, cursor: page.cursor });
    expect(next.output).toBe((await search.handler({ query: 'deckent', limit: 2, cursor: '2' })).output);
  });
});
