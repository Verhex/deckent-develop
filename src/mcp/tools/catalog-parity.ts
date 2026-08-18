// ─── MCP Tools: catalog-parity ───────────────────────────────────────────────
// CLI/MCP capability parity (Sıra-86): 3 tools that were CLI-only until now —
// agent pool add/remove/promote, skill pool add/remove/marketplace-list, and
// memory store insert/update/decay-trigger. Each is a thin wrapper over the
// existing core public API (AgentPoolManager, SkillPoolManager, MemoryStore,
// RegistryClient) — no core logic changes. Sprint 359 Task 359-011.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { AgentPoolManager } from '../../core/agent-pool.js';
import { createAgentDefinition } from '../../core/agent-types.js';
import { SkillPoolManager } from '../../core/skill-pool.js';
import { createSkillDefinition } from '../../core/skill-types.js';
import { MemoryStore } from '../../core/memory-store.js';
import { RegistryClient, type RegistrySkillEntry } from '../../core/marketplace/registry-client.js';
import type { ModelType } from '../../core/types.js';
import { resolveCanonicalModelIdentity } from '../../core/model-registry.js';
import { BRAIN_DIR, MEMORY_DB_FILE, PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { mcpToolDescription } from './description-catalog.js';

const SKILL_CATEGORY_VALUES = ['language', 'framework', 'tool', 'domain', 'workflow'] as const;

// ─── Injectable deps (hermetic-test seam — mirrors CostToolDeps in cost.ts) ──

export interface CatalogParityDeps {
  /** Override RegistryClient construction for hermetic tests (avoids real network). */
  registryClientFactory?: () => Pick<RegistryClient, 'searchSkills'>;
}

// ─── Shared response helpers ─────────────────────────────────────────────────

function ok(data: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function fail(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
    isError: true,
  };
}

// ─── deckent_agent_manage ─────────────────────────────────────────────────────

export function registerAgentManageTool(server: McpServer): void {
  server.registerTool(
    'deckent_agent_manage',
    {
      title: 'Agent Manage',
      description: mcpToolDescription('deckent_agent_manage'),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        action: z.enum(['add', 'remove', 'promote']).describe('Action to perform'),
        id: z.string().describe('Agent id (required for all actions)'),
        name: z.string().optional().describe('Display name (action=add; defaults to id)'),
        description: z.string().optional().describe('Agent description (action=add)'),
        model: z.string().min(1).optional().describe('Registered canonical provider API model ID (action=add; registry default when omitted)'),
        triggers: z.array(z.string()).optional().describe('Trigger keywords for routing (action=add)'),
        prompt: z.string().optional().describe('System prompt content (action=add)'),
        root: z.string().optional().describe('Project root (default: cwd)'),
      }),
    },
    async ({ action, id, name, description, model, triggers, prompt, root: rootArg }) => {
      const root = rootArg ?? process.cwd();
      const manager = new AgentPoolManager(root);

      try {
        if (action === 'add') {
          if (manager.getAgent(id)) {
            return fail(`Agent "${id}" already exists.`);
          }
          const preferredModel = model === undefined
            ? undefined
            : resolveCanonicalModelIdentity(model, { registerParametric: false }).id as ModelType;
          const agent = createAgentDefinition({
            id,
            name: name ?? id,
            description: description ?? `Custom agent: ${id}`,
            systemPrompt: prompt ?? '',
            ...(preferredModel ? { preferredModel } : {}),
            triggerKeywords: triggers ?? [],
            source: 'user',
            persistent: true,
          });
          manager.saveAgent(agent);
          return ok({ action, id, name: agent.name });
        }

        if (action === 'remove') {
          const removed = manager.removeAgent(id);
          return ok({ action, id, removed });
        }

        // action === 'promote'
        const agent = manager.getAgent(id);
        if (!agent) {
          return fail(`Agent "${id}" not found in pool (persistent or temp).`);
        }
        manager.saveTempAgentToPool(agent);
        const promotedId = agent.id.startsWith('temp-') ? agent.id : `temp-${agent.id}`;
        return ok({ action, id, promotedTo: promotedId });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ─── deckent_skill_manage ─────────────────────────────────────────────────────

async function marketplaceList(
  root: string,
  query: string,
  category: string | undefined,
  limit: number | undefined,
  deps: CatalogParityDeps,
): Promise<Record<string, unknown>> {
  const client = deps.registryClientFactory ? deps.registryClientFactory() : new RegistryClient();
  try {
    const result = await client.searchSkills(query, { category, limit });
    return { source: 'registry', skills: result.skills, total: result.total, page: result.page, pages: result.pages };
  } catch {
    // Offline fallback — mirrors CLI `deckent skill search` (skill-marketplace.ts)
    const local = new SkillPoolManager(root).listSkills();
    const skills: RegistrySkillEntry[] = local.map((s) => ({
      name: s.name,
      description: s.description,
      version: s.version,
      author: '',
      category: s.category,
      downloads: 0,
      rating: 0,
      tags: s.triggers,
    }));
    return { source: 'local-fallback', skills, total: skills.length };
  }
}

export function registerSkillManageTool(server: McpServer, deps: CatalogParityDeps = {}): void {
  server.registerTool(
    'deckent_skill_manage',
    {
      title: 'Skill Manage',
      description: mcpToolDescription('deckent_skill_manage'),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        action: z.enum(['add', 'remove', 'marketplace-list']).describe('Action to perform'),
        id: z.string().optional().describe('Skill id (required for add/remove)'),
        name: z.string().optional().describe('Display name (action=add; defaults to id)'),
        description: z.string().optional().describe('Skill description (action=add)'),
        category: z.enum(SKILL_CATEGORY_VALUES).optional().describe('Skill category (action=add; default: tool)'),
        triggers: z.array(z.string()).optional().describe('Trigger keywords for routing (action=add)'),
        query: z.string().optional().describe('Marketplace search query (action=marketplace-list; default: "")'),
        limit: z.number().optional().describe('Max marketplace results (action=marketplace-list; default 20)'),
        root: z.string().optional().describe('Project root (default: cwd)'),
      }),
    },
    async ({ action, id, name, description, category, triggers, query, limit, root: rootArg }) => {
      const root = rootArg ?? process.cwd();

      try {
        if (action === 'marketplace-list') {
          const data = await marketplaceList(root, query ?? '', category, limit, deps);
          return ok({ action, ...data });
        }

        const manager = new SkillPoolManager(root);

        if (!id) {
          return fail(`id is required for action=${action}.`);
        }

        if (action === 'add') {
          if (manager.getSkill(id)) {
            return fail(`Skill "${id}" already exists.`);
          }
          const skill = createSkillDefinition({
            id,
            name: name ?? id,
            description: description ?? '',
            category: category ?? 'tool',
            triggers: triggers ?? [],
          });
          manager.saveSkill(skill);
          return ok({ action, id, name: skill.name });
        }

        // action === 'remove'
        const removed = manager.removeSkill(id);
        return ok({ action, id, removed });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ─── deckent_memory_manage ────────────────────────────────────────────────────

/** Mirrors src/mcp/tools/cleanup.ts:70-79 — read decay_after_sprints from project config. */
function resolveDecayAfterSprints(root: string, override: number | undefined): number {
  if (override !== undefined) return override;
  let decayAfterSprints = 8;
  try {
    const cfgPath = join(root, PROJECT_CONFIG_PATH);
    if (existsSync(cfgPath)) {
      const rawCfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as { decay_after_sprints?: number };
      if (typeof rawCfg.decay_after_sprints === 'number') decayAfterSprints = rawCfg.decay_after_sprints;
    }
  } catch {
    // use default
  }
  return decayAfterSprints;
}

export function registerMemoryManageTool(server: McpServer): void {
  server.registerTool(
    'deckent_memory_manage',
    {
      title: 'Memory Manage',
      description: mcpToolDescription('deckent_memory_manage'),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        action: z.enum(['insert', 'update', 'decay-trigger']).describe('Action to perform'),
        id: z.string().optional().describe('Entry id (required for insert/update)'),
        type: z.string().optional().describe('Entry type: adr|memory|sprint|debt|pattern|retro|... (required for insert)'),
        title: z.string().optional().describe('Entry title (required for insert)'),
        content: z.string().optional().describe('Entry content (required for insert; patch value for update)'),
        summary: z.string().optional().describe('Short summary'),
        tags: z.array(z.string()).optional().describe('Tags (insert only)'),
        status: z.string().optional().describe('Entry status: active|accepted|deprecated|...'),
        priority: z.string().optional().describe('Entry priority'),
        sprint_id: z.string().optional().describe('Sprint id association (insert only)'),
        sprint_num: z.number().optional().describe('Sprint number association (insert only)'),
        lang: z.string().optional().describe('Language code (insert only, default: en)'),
        decay_exempt: z.boolean().optional().describe('Exempt this entry from decay'),
        metadata: z.record(z.string(), z.unknown()).optional().describe('Arbitrary metadata object'),
        changed_by: z.string().optional().describe('Attribution for update history (default: "mcp")'),
        current_sprint_num: z.number().optional().describe('Required for action=decay-trigger'),
        decay_after_sprints: z.number().optional().describe('Retention window in sprints (action=decay-trigger; default: config decay_after_sprints or 8)'),
        root: z.string().optional().describe('Project root (default: cwd)'),
      }),
    },
    async ({
      action, id, type, title, content, summary, tags, status, priority,
      sprint_id, sprint_num, lang, decay_exempt, metadata, changed_by,
      current_sprint_num, decay_after_sprints, root: rootArg,
    }) => {
      const root = rootArg ?? process.cwd();
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        return fail('Memory V2 DB not found at .brain/memory.db. Run `deckent init` first.');
      }

      const store = new MemoryStore(dbPath);
      try {
        if (action === 'insert') {
          if (!id || !type || !title || !content) {
            return fail('id, type, title, and content are all required for action=insert.');
          }
          if (store.getById(id)) {
            return fail(`Entry "${id}" already exists — use action=update.`);
          }
          store.insert({
            id, type, title, content, summary, tags, status, priority,
            sprint_id, sprint_num, lang, decay_exempt, metadata,
          });
          return ok({ action, id });
        }

        if (action === 'update') {
          if (!id) {
            return fail('id is required for action=update.');
          }
          if (!store.getById(id)) {
            return fail(`Entry "${id}" not found.`);
          }
          store.update(
            id,
            {
              content,
              title,
              summary,
              metadata: metadata !== undefined ? JSON.stringify(metadata) : undefined,
              status,
              priority,
              decay_exempt: decay_exempt !== undefined ? (decay_exempt ? 1 : 0) : undefined,
            },
            changed_by ?? 'mcp',
          );
          return ok({ action, id });
        }

        // action === 'decay-trigger'
        if (current_sprint_num === undefined) {
          return fail('current_sprint_num is required for action=decay-trigger.');
        }
        const resolvedDecayAfterSprints = resolveDecayAfterSprints(root, decay_after_sprints);
        const result = store.decay(current_sprint_num, resolvedDecayAfterSprints);
        return ok({ action, decayAfterSprints: resolvedDecayAfterSprints, ...result });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      } finally {
        store.close();
      }
    },
  );
}

// ─── Barrel Registration ────────────────────────────────────────────────────

export function registerCatalogParityTools(server: McpServer, deps: CatalogParityDeps = {}): void {
  registerAgentManageTool(server);
  registerSkillManageTool(server, deps);
  registerMemoryManageTool(server);
}
