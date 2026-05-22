import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, MEMORY_DB_FILE, SPRINTS_DIR } from '../../core/constants.js';
import { MemoryStore } from '../../core/memory-store.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatExplainResponse, wrapResponse, type ExplainData } from '../helpers/format.js';
import {
  findLatestSprintLog,
  parseSprintLog,
  parseSprintNumber,
  parseRetroLearnings,
  extractGoalFromDirectives,
  extractGoalFromSprintLog,
  buildExplainOutput,
  formatDuration,
} from '../../cli/commands/explain.js';

/**
 * Load a sprint's retrospective content from the Memory V2 DB `retro` entry.
 * B8: retros live in memory.db (no `.brain/RETRO.md` file). Falls back to the
 * most recent retro when the requested sprint has no entry.
 */
function loadRetroContent(root: string, sprintNumber: number): string | null {
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return null;
  try {
    const store = new MemoryStore(dbPath);
    try {
      if (sprintNumber > 0) {
        const entry = store.getById(`retro-sprint-${sprintNumber}`);
        if (entry) return entry.content;
      }
      const retros = store.getByType('retro')
        .sort((a, b) => (b.sprint_num ?? 0) - (a.sprint_num ?? 0));
      return retros[0]?.content ?? null;
    } finally {
      store.close();
    }
  } catch {
    return null;
  }
}

export function registerExplainTool(server: McpServer): void {
  server.registerTool(
    'deckent_explain',
    {
      title: 'Sprint Explanation',
      description: 'Explain what a sprint did in human-friendly language. Reads the sprint log from .brain/sprints/ and the retrospective from the Memory V2 DB to generate a summary including goal, task outcomes (completed/failed/tech debt), duration, and key learnings. Use after a sprint completes to get a quick overview. Supports specific sprint lookup, verbose mode for full details, and JSON output.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        sprintId: z.string().optional().describe('Show a specific sprint by ID (e.g. "042", "sprint-042"). If omitted, returns the latest sprint.'),
        verbose: z.boolean().optional().default(false).describe('Show all learnings and full task details. Default shows max 3 learnings.'),
        json: z.boolean().optional().default(false).describe('Return raw JSON data instead of human-readable summary.'),
      }),
    },
    async ({ sprintId, verbose, json }) => {
      const root = process.cwd();

      try {
        // Resolve sprint file
        let sprintFile: string | null;
        if (sprintId) {
          const cleanId = sprintId.replace(/^sprint-/, '');
          const paddedId = cleanId.padStart(3, '0');
          const filename = `sprint-${paddedId}.md`;
          const filePath = join(root, BRAIN_DIR, SPRINTS_DIR, filename);
          if (!existsSync(filePath)) {
            const notFoundData: ExplainData = { found: false, sprintId: sprintId };
            const summary = formatExplainResponse(notFoundData);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enrichResponse('explain', notFoundData as unknown as Record<string, unknown>), summary)) }],
            };
          }
          sprintFile = filename;
        } else {
          sprintFile = findLatestSprintLog(root);
        }

        if (!sprintFile) {
          const noSprintsData: ExplainData = { found: false };
          const summary = formatExplainResponse(noSprintsData);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enrichResponse('explain', noSprintsData as unknown as Record<string, unknown>), summary)) }],
          };
        }

        // Parse sprint log
        const sprintPath = join(root, BRAIN_DIR, SPRINTS_DIR, sprintFile);
        const sprintContent = readFileSync(sprintPath, 'utf-8');
        const sprintSummary = parseSprintLog(sprintContent);

        // Use filename-based sprint number if heading parse failed
        if (sprintSummary.sprintNumber === 0) {
          sprintSummary.sprintNumber = parseSprintNumber(sprintFile);
        }

        // Goal extraction: DIRECTIVES.md → sprint log → fallback
        if (sprintSummary.goal === 'No goal recorded') {
          const directivesGoal = extractGoalFromDirectives(root);
          if (directivesGoal) {
            sprintSummary.goal = directivesGoal;
          } else {
            const logGoal = extractGoalFromSprintLog(sprintContent);
            if (logGoal) {
              sprintSummary.goal = logGoal;
            }
          }
        }

        // Load sprint learnings from the Memory V2 DB `retro` entry — B8.
        let learnings = { items: [] as string[] };
        const retroContent = loadRetroContent(root, sprintSummary.sprintNumber);
        if (retroContent) {
          try {
            learnings = parseRetroLearnings(retroContent, verbose ? Infinity : 3);
          } catch {
            // skip learnings if unparseable
          }
        }

        // JSON output mode
        if (json) {
          const output: Record<string, unknown> = {
            sprintId: sprintSummary.sprintNumber,
            goal: sprintSummary.goal,
            metrics: {
              totalTasks: sprintSummary.totalTasks,
              completed: sprintSummary.completed,
              techDebt: sprintSummary.techDebt,
              noGo: sprintSummary.noGo,
              durationMs: sprintSummary.durationMs,
              duration: formatDuration(sprintSummary.durationMs),
            },
            learnings: learnings.items,
            ...(verbose ? { tasks: sprintSummary.tasks } : {}),
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          };
        }

        // Human-readable output
        const explainData: ExplainData = {
          found: true,
          sprintNumber: sprintSummary.sprintNumber,
          goal: sprintSummary.goal,
          totalTasks: sprintSummary.totalTasks,
          completed: sprintSummary.completed,
          techDebt: sprintSummary.techDebt,
          noGo: sprintSummary.noGo,
          durationMs: sprintSummary.durationMs,
          learnings: learnings.items,
          tasks: verbose ? sprintSummary.tasks : undefined,
          output: buildExplainOutput(sprintSummary, learnings, 'en', verbose),
        };

        const enriched = enrichResponse('explain', explainData as unknown as Record<string, unknown>);
        const summary = formatExplainResponse(explainData);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enriched, summary)) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Failed to explain sprint: ${message}` }) }],
          isError: true,
        };
      }
    },
  );
}
