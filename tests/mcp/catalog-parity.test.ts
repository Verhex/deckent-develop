import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAgentManageTool,
  registerSkillManageTool,
  registerMemoryManageTool,
  registerCatalogParityTools,
} from '../../src/mcp/tools/catalog-parity.js';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import { SkillPoolManager } from '../../src/core/skill-pool.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { CreateEntryInput } from '../../src/core/memory-types.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../src/core/constants.js';

// ─── Mock server (mirrors tests/mcp/tools/misc-tools.test.ts) ───────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

interface MockServer {
  tools: Map<string, { config: unknown; handler: ToolHandler }>;
  registerTool: (name: string, config: unknown, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

// ─── Hermetic tmpdir fixture (mirrors tests/core/memory-store.test.ts) ──────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'catalog-parity-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function dbPathFor(root: string): string {
  return join(root, BRAIN_DIR, MEMORY_DB_FILE);
}

/** Creates .brain/memory.db (schema initialized) in root, matching the pre-existing-DB
 *  convention required by deckent_memory_manage (mirrors remember.ts / memory-query.ts). */
function setupBrainDb(root: string): void {
  mkdirSync(join(root, BRAIN_DIR), { recursive: true });
  const store = new MemoryStore(dbPathFor(root));
  store.close();
}

function makeEntry(overrides: Partial<CreateEntryInput> & { id: string }): CreateEntryInput {
  return {
    type: 'memory',
    title: overrides.id,
    content: `content for ${overrides.id}`,
    source: 'brain',
    ...overrides,
  };
}

// ─── registry-unit smoke ─────────────────────────────────────────────────────

describe('registerCatalogParityTools', () => {
  it('registers all 3 tools', () => {
    const server = createMockServer();
    registerCatalogParityTools(server as unknown as McpServer);
    expect(server.tools.has('deckent_agent_manage')).toBe(true);
    expect(server.tools.has('deckent_skill_manage')).toBe(true);
    expect(server.tools.has('deckent_memory_manage')).toBe(true);
    expect(server.tools.size).toBe(3);
  });

  it('registers each tool with a title and non-read-only annotations', () => {
    const server = createMockServer();
    registerCatalogParityTools(server as unknown as McpServer);
    for (const name of ['deckent_agent_manage', 'deckent_skill_manage', 'deckent_memory_manage']) {
      const tool = server.tools.get(name)!;
      const config = tool.config as Record<string, unknown>;
      expect(typeof config.title).toBe('string');
      expect((config.annotations as Record<string, unknown>).readOnlyHint).toBe(false);
    }
  });

  it('forwards deps.registryClientFactory to the skill-manage tool', async () => {
    const server = createMockServer();
    let called = false;
    registerCatalogParityTools(server as unknown as McpServer, {
      registryClientFactory: () => ({
        searchSkills: async () => {
          called = true;
          return { skills: [], total: 0, page: 1, pages: 1 };
        },
      }),
    });
    const tool = server.tools.get('deckent_skill_manage')!;
    await tool.handler({ action: 'marketplace-list', query: 'react', root: tmpDir });
    expect(called).toBe(true);
  });
});

// ─── deckent_agent_manage ─────────────────────────────────────────────────────

describe('deckent_agent_manage', () => {
  function getTool() {
    const server = createMockServer();
    registerAgentManageTool(server as unknown as McpServer);
    return server.tools.get('deckent_agent_manage')!;
  }

  it('add creates a new custom agent on disk', async () => {
    const tool = getTool();
    const result = await tool.handler({ action: 'add', id: 'my-agent', name: 'My Agent', description: 'desc', model: 'claude-sonnet-5', triggers: ['foo'], root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);

    const manager = new AgentPoolManager(tmpDir);
    const agent = manager.getAgent('my-agent');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('My Agent');
    expect(agent!.source).toBe('user');
    expect(agent!.preferredModel).toBe('claude-sonnet-5');
    expect(agent!.triggerKeywords).toEqual(['foo']);
  });

  it('add defaults name to id and preferredModel to sonnet when omitted', async () => {
    const tool = getTool();
    await tool.handler({ action: 'add', id: 'bare-agent', root: tmpDir });
    const agent = new AgentPoolManager(tmpDir).getAgent('bare-agent');
    expect(agent!.name).toBe('bare-agent');
    expect(agent!.preferredModel).toBe('claude-sonnet-5');
  });

  it('add rejects a duplicate id', async () => {
    const tool = getTool();
    await tool.handler({ action: 'add', id: 'dup-agent', root: tmpDir });
    const result = await tool.handler({ action: 'add', id: 'dup-agent', root: tmpDir });
    expect(result.isError).toBe(true);
    expect(parseResult(result).message).toContain('already exists');
  });

  it('remove deletes an existing agent', async () => {
    const tool = getTool();
    await tool.handler({ action: 'add', id: 'to-remove', root: tmpDir });
    const result = await tool.handler({ action: 'remove', id: 'to-remove', root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.removed).toBe(true);
    expect(new AgentPoolManager(tmpDir).getAgent('to-remove')).toBeUndefined();
  });

  it('remove reports removed=false for a missing agent (not an error)', async () => {
    const tool = getTool();
    const result = await tool.handler({ action: 'remove', id: 'never-existed', root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.removed).toBe(false);
    expect(result.isError).toBeUndefined();
  });

  it('promote persists a temp-pool agent into the persistent pool', async () => {
    const manager = new AgentPoolManager(tmpDir);
    manager.createTempAgent('sprint-001', createAgentDefinition({ id: 'widget', name: 'Widget' }));
    // Sanity: only discoverable via the temp pool before promotion.
    expect(manager.getAgent('widget')).toBeDefined();

    const tool = getTool();
    const result = await tool.handler({ action: 'promote', id: 'widget', root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.promotedTo).toBe('temp-widget');

    const promoted = new AgentPoolManager(tmpDir).getAgent('temp-widget');
    expect(promoted).toBeDefined();
    expect(promoted!.name).toBe('Widget');
  });

  it('promote is a no-op-safe re-save when the agent is already in the persistent pool', async () => {
    const tool = getTool();
    await tool.handler({ action: 'add', id: 'already-persistent', root: tmpDir });
    const result = await tool.handler({ action: 'promote', id: 'already-persistent', root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.promotedTo).toBe('temp-already-persistent');
  });

  it('promote fails for an unknown id', async () => {
    const tool = getTool();
    const result = await tool.handler({ action: 'promote', id: 'ghost', root: tmpDir });
    expect(result.isError).toBe(true);
    expect(parseResult(result).message).toContain('not found');
  });
});

// ─── deckent_skill_manage ─────────────────────────────────────────────────────

describe('deckent_skill_manage', () => {
  function getTool() {
    const server = createMockServer();
    registerSkillManageTool(server as unknown as McpServer);
    return server.tools.get('deckent_skill_manage')!;
  }

  function getToolWithDeps(registryClientFactory: () => { searchSkills: (q: string, o?: unknown) => Promise<unknown> }) {
    const server = createMockServer();
    registerSkillManageTool(server as unknown as McpServer, { registryClientFactory });
    return server.tools.get('deckent_skill_manage')!;
  }

  it('add creates a new skill on disk with defaults', async () => {
    const tool = getTool();
    const result = await tool.handler({ action: 'add', id: 'my-skill', root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);

    const skill = new SkillPoolManager(tmpDir).getSkill('my-skill');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('my-skill');
    expect(skill!.category).toBe('tool');
  });

  it('add honors explicit name/category/triggers', async () => {
    const tool = getTool();
    await tool.handler({ action: 'add', id: 'react-skill', name: 'React Skill', category: 'framework', triggers: ['react', 'jsx'], root: tmpDir });
    const skill = new SkillPoolManager(tmpDir).getSkill('react-skill');
    expect(skill!.name).toBe('React Skill');
    expect(skill!.category).toBe('framework');
    expect(skill!.triggers).toEqual(['react', 'jsx']);
  });

  it('add rejects a duplicate id', async () => {
    const tool = getTool();
    await tool.handler({ action: 'add', id: 'dup-skill', root: tmpDir });
    const result = await tool.handler({ action: 'add', id: 'dup-skill', root: tmpDir });
    expect(result.isError).toBe(true);
  });

  it('add fails without an id', async () => {
    const tool = getTool();
    const result = await tool.handler({ action: 'add', root: tmpDir });
    expect(result.isError).toBe(true);
  });

  it('remove deletes an existing skill', async () => {
    const tool = getTool();
    await tool.handler({ action: 'add', id: 'to-remove', root: tmpDir });
    const result = await tool.handler({ action: 'remove', id: 'to-remove', root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.removed).toBe(true);
    expect(new SkillPoolManager(tmpDir).getSkill('to-remove')).toBeUndefined();
  });

  it('marketplace-list returns registry results when the registry succeeds', async () => {
    const fakeSkills = [{ name: 'awesome-skill', description: 'd', version: '1.0.0', author: 'a', category: 'tool', downloads: 5, rating: 4.5, tags: [] }];
    const tool = getToolWithDeps(() => ({
      searchSkills: async () => ({ skills: fakeSkills, total: 1, page: 1, pages: 1 }),
    }));
    const result = await tool.handler({ action: 'marketplace-list', query: 'awesome', root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.source).toBe('registry');
    expect(parsed.skills).toEqual(fakeSkills);
    expect(parsed.total).toBe(1);
  });

  it('marketplace-list falls back to local skills when the registry is unreachable', async () => {
    new SkillPoolManager(tmpDir).saveSkill(createSkillDefinition({ id: 'local-only', name: 'Local Only', description: 'offline skill' }));
    const tool = getToolWithDeps(() => ({
      searchSkills: async () => { throw new Error('ENOTFOUND registry.deckent.dev'); },
    }));
    const result = await tool.handler({ action: 'marketplace-list', query: 'anything', root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.source).toBe('local-fallback');
    expect(parsed.skills.some((s: { name: string }) => s.name === 'Local Only')).toBe(true);
  });

  it('marketplace-list defaults query to empty string when omitted', async () => {
    let receivedQuery: string | undefined;
    const tool = getToolWithDeps(() => ({
      searchSkills: async (q: string) => {
        receivedQuery = q;
        return { skills: [], total: 0, page: 1, pages: 1 };
      },
    }));
    await tool.handler({ action: 'marketplace-list', root: tmpDir });
    expect(receivedQuery).toBe('');
  });
});

// ─── deckent_memory_manage ────────────────────────────────────────────────────

describe('deckent_memory_manage', () => {
  function getTool() {
    const server = createMockServer();
    registerMemoryManageTool(server as unknown as McpServer);
    return server.tools.get('deckent_memory_manage')!;
  }

  it('insert fails when .brain/memory.db does not exist', async () => {
    const tool = getTool();
    const result = await tool.handler({ action: 'insert', id: 'x', type: 'memory', title: 'T', content: 'C', root: tmpDir });
    expect(result.isError).toBe(true);
    expect(parseResult(result).message).toContain('memory.db');
  });

  it('insert creates a new entry', async () => {
    setupBrainDb(tmpDir);
    const tool = getTool();
    const result = await tool.handler({ action: 'insert', id: 'mem-1', type: 'memory', title: 'Test Entry', content: 'Some content', tags: ['a', 'b'], root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);

    const store = new MemoryStore(dbPathFor(tmpDir));
    const entry = store.getById('mem-1');
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe('Test Entry');
    expect(entry!.tag_text).toBe('a b');
    store.close();
  });

  it('insert fails when required fields are missing', async () => {
    setupBrainDb(tmpDir);
    const tool = getTool();
    const result = await tool.handler({ action: 'insert', id: 'incomplete', root: tmpDir });
    expect(result.isError).toBe(true);
  });

  it('insert rejects a duplicate id', async () => {
    setupBrainDb(tmpDir);
    const tool = getTool();
    await tool.handler({ action: 'insert', id: 'dup', type: 'memory', title: 'T', content: 'C', root: tmpDir });
    const result = await tool.handler({ action: 'insert', id: 'dup', type: 'memory', title: 'T2', content: 'C2', root: tmpDir });
    expect(result.isError).toBe(true);
    expect(parseResult(result).message).toContain('already exists');
  });

  it('update patches an existing entry', async () => {
    setupBrainDb(tmpDir);
    const tool = getTool();
    await tool.handler({ action: 'insert', id: 'u1', type: 'memory', title: 'Orig', content: 'Orig content', root: tmpDir });
    const result = await tool.handler({ action: 'update', id: 'u1', content: 'Updated content', status: 'resolved', root: tmpDir });
    expect(parseResult(result).success).toBe(true);

    const store = new MemoryStore(dbPathFor(tmpDir));
    const entry = store.getById('u1');
    expect(entry!.content).toBe('Updated content');
    expect(entry!.status).toBe('resolved');
    store.close();
  });

  it('update fails for an unknown id', async () => {
    setupBrainDb(tmpDir);
    const tool = getTool();
    const result = await tool.handler({ action: 'update', id: 'ghost', content: 'x', root: tmpDir });
    expect(result.isError).toBe(true);
  });

  it('update fails without an id', async () => {
    setupBrainDb(tmpDir);
    const tool = getTool();
    const result = await tool.handler({ action: 'update', content: 'x', root: tmpDir });
    expect(result.isError).toBe(true);
  });

  it('decay-trigger soft-deletes entries past the retention window', async () => {
    setupBrainDb(tmpDir);
    const dbPath = dbPathFor(tmpDir);
    const store = new MemoryStore(dbPath);
    store.insert(makeEntry({ id: 'old-1', sprint_num: 50 }));
    store.insert(makeEntry({ id: 'old-2', sprint_num: 50 }));
    store.insert(makeEntry({ id: 'fresh-1', sprint_num: 108 }));
    store.insert(makeEntry({ id: 'fresh-2', sprint_num: 108 }));
    store.close();

    const tool = getTool();
    const result = await tool.handler({ action: 'decay-trigger', current_sprint_num: 110, decay_after_sprints: 5, root: tmpDir });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.deletedCount).toBe(2);

    const store2 = new MemoryStore(dbPath);
    expect(store2.getById('old-1')).toBeNull();
    expect(store2.getById('old-2')).toBeNull();
    expect(store2.getById('fresh-1')).not.toBeNull();
    expect(store2.getById('fresh-2')).not.toBeNull();
    store2.close();
  });

  it('decay-trigger fails without current_sprint_num', async () => {
    setupBrainDb(tmpDir);
    const tool = getTool();
    const result = await tool.handler({ action: 'decay-trigger', root: tmpDir });
    expect(result.isError).toBe(true);
  });

  it('decay-trigger defaults decay_after_sprints to 8 when unspecified and no config exists', async () => {
    setupBrainDb(tmpDir);
    const tool = getTool();
    const result = await tool.handler({ action: 'decay-trigger', current_sprint_num: 5, root: tmpDir });
    expect(parseResult(result).decayAfterSprints).toBe(8);
  });

  it('decay-trigger reads decay_after_sprints from .deckent/config.json when not overridden', async () => {
    mkdirSync(join(tmpDir, '.deckent'), { recursive: true });
    writeFileSync(join(tmpDir, '.deckent', 'config.json'), JSON.stringify({ decay_after_sprints: 3 }));
    setupBrainDb(tmpDir);
    const tool = getTool();
    const result = await tool.handler({ action: 'decay-trigger', current_sprint_num: 5, root: tmpDir });
    expect(parseResult(result).decayAfterSprints).toBe(3);
  });
});
