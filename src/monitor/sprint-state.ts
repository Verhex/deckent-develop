import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Sprint state as persisted in `.deckent/sprint-state.json`. */
interface SprintStateFile {
  sprintId?: string;
  phase?: string;
  status?: string;
  startedAt?: string;
  updatedAt?: string;
  taskIds?: string[];
}

/** Sprint active file format (`.deckent/sprint-active.json`). */
interface SprintActiveFile {
  sprintId?: string;
}

const SPRINT_STATE_FILE = join('.deckent', 'sprint-state.json');
const SPRINT_ACTIVE_FILE = join('.deckent', 'sprint-active.json');

/**
 * Returns the current active sprint ID as a single source of truth.
 *
 * Resolution order:
 *   1. `.deckent/sprint-active.json` (if present and parseable)
 *   2. `.deckent/sprint-state.json` (persisted by writeSprintState)
 *   3. null — no active sprint detected
 *
 * `.dashboard` is intentionally NOT consulted here — it is display-only.
 * Both CLI and MCP status commands use this function so they always agree.
 */
export function getCurrentSprintId(projectRoot: string): string | null {
  // Source 1: sprint-active.json (explicit override/new format)
  const activePath = join(projectRoot, SPRINT_ACTIVE_FILE);
  if (existsSync(activePath)) {
    try {
      const raw = readFileSync(activePath, 'utf-8');
      const data = JSON.parse(raw) as SprintActiveFile;
      if (typeof data.sprintId === 'string' && data.sprintId.length > 0) {
        return data.sprintId;
      }
    } catch {
      // parse fail → fall through to next source
    }
  }

  // Source 2: sprint-state.json (written by writeSprintState during sprint execution)
  const statePath = join(projectRoot, SPRINT_STATE_FILE);
  if (existsSync(statePath)) {
    try {
      const raw = readFileSync(statePath, 'utf-8');
      const data = JSON.parse(raw) as SprintStateFile;
      if (typeof data.sprintId === 'string' && data.sprintId.length > 0) {
        return data.sprintId;
      }
    } catch {
      // parse fail → return null
    }
  }

  return null;
}
