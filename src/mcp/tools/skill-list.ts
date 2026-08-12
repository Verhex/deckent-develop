import { snapshotSkillCatalog } from '../../core/skill-pool.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface SkillManifest {
  id?: string;
  name?: string;
  category?: string;
  triggers?: string[];
}

interface SkillEntry {
  layer?: string;
  disposition?: unknown;
  masked?: boolean;
  profileState?: string | null;
  id: string;
  name: string;
  category: string;
  triggers: string[];
}

// S5 (sprint-523 task 7): the raw directory scan is deleted — this surface
// consumes the canonical catalog snapshot, identical to CLI and the S8 gate.
function readSkills(root: string): SkillEntry[] {
  return snapshotSkillCatalog(root).entries.map((entry) => {
    const manifest = entry.definition as SkillManifest & {
      routing?: { profileState?: string };
    };
    return {
      id: entry.id,
      name: manifest.name ?? entry.id,
      category: manifest.category ?? 'general',
      triggers: manifest.triggers ?? [],
      layer: entry.layer,
      disposition: entry.disposition,
      masked: entry.masked,
      profileState: manifest.routing?.profileState ?? null,
    };
  });
}

export function registerSkillListTool(server: McpServer): void {
  server.registerTool(
    'deckent_skill_list',
    {
      title: 'Skill List',
      description:
        'List all registered skills in the Deckent project. ' +
        'Returns id, name, category, and trigger keywords for each skill. ' +
        'Reads from .deckent/skills/ directory. ' +
        'Use to understand which skills are available for task routing, check skill coverage, ' +
        'or audit skill assignments before planning a sprint.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const root = process.cwd();

      try {
        const skills = readSkills(root);

        const byCategory: Record<string, number> = {};
        for (const skill of skills) {
          byCategory[skill.category] = (byCategory[skill.category] ?? 0) + 1;
        }

        const response = {
          skills,
          total: skills.length,
          byCategory,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
