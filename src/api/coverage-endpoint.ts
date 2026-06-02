// ─── Coverage API Endpoint ────────────────────────────────────────────────────
// GET /api/coverage — sprint coverage history + brain budget from config.
// Consumed by the dashboard HistoryPage to display coverage over time.
import type { ServerResponse } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSprintLog } from '../cli/commands/history.js';
import { BRAIN_DIR, SPRINTS_DIR, PROJECT_CONFIG_PATH } from '../core/constants.js';
import { readJsonSafe } from '../core/utils.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

interface CoverageEntry {
  sprintId: string;
  coverage: string;
  tasks: string;
  completed: string;
}

interface BudgetInfo {
  perSprint: number | null;
}

interface CoverageResponse {
  history: CoverageEntry[];
  budget: BudgetInfo;
}

/** Read brain budget from .deckent/config.json (api mode budget_per_sprint). */
function readBrainBudget(projectRoot: string): BudgetInfo {
  const configPath = join(projectRoot, PROJECT_CONFIG_PATH);
  const config = readJsonSafe<Record<string, unknown>>(configPath);
  if (!config) return { perSprint: null };

  // budget_per_sprint lives inside modes.api or activeModeConfig
  const modes = config['modes'] as Record<string, unknown> | undefined;
  const apiMode = modes?.['api'] as Record<string, unknown> | undefined;
  const perSprint = apiMode?.['budget_per_sprint'];
  if (typeof perSprint === 'number') return { perSprint };

  // Fallback: top-level budget_per_sprint (older config format)
  const topLevel = config['budget_per_sprint'];
  if (typeof topLevel === 'number') return { perSprint: topLevel };

  return { perSprint: null };
}

/**
 * Handle GET /api/coverage — returns sprint coverage history and brain budget.
 * Returns true if the route was handled, false otherwise.
 */
export function registerCoverageRoutes(
  url: string,
  res: ServerResponse,
  projectRoot: string,
): boolean {
  if (url !== '/api/coverage') return false;

  const sprintsDir = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  const history: CoverageEntry[] = [];

  if (existsSync(sprintsDir)) {
    const files = readdirSync(sprintsDir)
      .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
      .sort();

    for (const file of files) {
      const content = readFileSync(join(sprintsDir, file), 'utf-8');
      const record = parseSprintLog(content);
      history.push({
        sprintId: record.sprint,
        coverage: record.coverage,
        tasks: record.tasks,
        completed: record.completed,
      });
    }
  }

  const budget = readBrainBudget(projectRoot);
  const response: CoverageResponse = { history, budget };
  sendJson(res, response);
  return true;
}
