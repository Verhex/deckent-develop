import { snapshotSkillCatalog } from '../../core/skill-pool.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readCatalogStats } from '../../core/catalog-stats-read-model.js';
import type {
  CatalogEntityStats,
  CatalogStatsReadModel,
  CatalogSkillExposureStats,
} from '../../core/catalog-stats-read-model.js';
import { mcpToolDescription } from './description-catalog.js';

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
  stats: CatalogEntityStats | null;
  exposure: CatalogSkillExposureStats | null;
}

// S5 (sprint-523 task 7): the raw directory scan is deleted — this surface
// consumes the canonical catalog snapshot, identical to CLI and the S8 gate.
function readSkills(root: string, catalogStats: CatalogStatsReadModel): SkillEntry[] {
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
      stats: catalogStats.skills[entry.id] ?? null,
      exposure: catalogStats.skillExposure[entry.id] ?? null,
    };
  });
}

export function registerSkillListTool(server: McpServer): void {
  server.registerTool(
    'deckent_skill_list',
    {
      title: 'Skill List',
      description: mcpToolDescription('deckent_skill_list'),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const root = process.cwd();

      try {
        const catalogStats = readCatalogStats(root);
        const skills = readSkills(root, catalogStats);

        const byCategory: Record<string, number> = {};
        for (const skill of skills) {
          byCategory[skill.category] = (byCategory[skill.category] ?? 0) + 1;
        }

        const response = {
          skills,
          total: skills.length,
          byCategory,
          skillAttribution: catalogStats.skillAttribution,
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
