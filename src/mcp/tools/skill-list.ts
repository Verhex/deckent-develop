import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DECKENT_DIR } from '../../core/constants.js';

interface SkillManifest {
  id?: string;
  name?: string;
  category?: string;
  triggers?: string[];
}

interface SkillEntry {
  id: string;
  name: string;
  category: string;
  triggers: string[];
}

function readSkills(root: string): SkillEntry[] {
  const skillsDir = join(root, DECKENT_DIR, 'skills');
  if (!existsSync(skillsDir)) return [];

  const entries: SkillEntry[] = [];

  try {
    const dirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const dir of dirs) {
      const manifestPath = join(skillsDir, dir, 'manifest.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillManifest;
        entries.push({
          id: manifest.id ?? dir,
          name: manifest.name ?? dir,
          category: manifest.category ?? 'general',
          triggers: manifest.triggers ?? [],
        });
      } catch {
        // skip malformed manifest.json
      }
    }
  } catch {
    // directory read error
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id));
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
