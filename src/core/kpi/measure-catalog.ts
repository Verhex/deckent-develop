// ─── Faz-1 Base Measure Catalog ──────────────────────────────────────────────
// All measures are derivable from sprint-finalize scope data.
// Faz-2 measures (tool_calls, pr, adr, bug) are out of scope here.

import type { BaseMeasure } from './types.js';

// ─── Catalog ─────────────────────────────────────────────────────────────────

export const BASE_MEASURES: Record<string, BaseMeasure> = {
  sprint_count: {
    id: 'sprint_count',
    kind: 'counter',
    aggMethod: 'sum',
    unit: 'count',
    description: 'Number of sprints executed.',
  },
  tasks_total: {
    id: 'tasks_total',
    kind: 'counter',
    aggMethod: 'sum',
    unit: 'count',
    description: 'Total tasks planned across sprints.',
  },
  tasks_done: {
    id: 'tasks_done',
    kind: 'counter',
    aggMethod: 'sum',
    unit: 'count',
    description: 'Tasks completed with DONE or GO_WITH_TECH_DEBT assessment.',
  },
  no_go: {
    id: 'no_go',
    kind: 'counter',
    aggMethod: 'sum',
    unit: 'count',
    description: 'Tasks that resulted in a NO_GO assessment.',
  },
  boundary_violations: {
    id: 'boundary_violations',
    kind: 'counter',
    aggMethod: 'sum',
    unit: 'count',
    description: 'Scope boundary violations detected by the auditor.',
  },
  retries: {
    id: 'retries',
    kind: 'counter',
    aggMethod: 'sum',
    unit: 'count',
    description: 'Worker retry attempts across all tasks in a sprint.',
  },
  lines_added: {
    id: 'lines_added',
    kind: 'counter',
    aggMethod: 'sum',
    unit: 'lines',
    description: 'Net lines added (git diff insertions) across the sprint.',
  },
  cost_usd: {
    id: 'cost_usd',
    kind: 'gauge',
    aggMethod: 'sum',
    unit: 'USD',
    description: 'Total provider API cost incurred during the sprint.',
  },
  tokens_input: {
    id: 'tokens_input',
    kind: 'counter',
    aggMethod: 'sum',
    unit: 'tokens',
    description: 'Total input tokens consumed across all tasks.',
  },
  tokens_output: {
    id: 'tokens_output',
    kind: 'counter',
    aggMethod: 'sum',
    unit: 'tokens',
    description: 'Total output tokens generated across all tasks.',
  },
  cache_read: {
    id: 'cache_read',
    kind: 'counter',
    aggMethod: 'sum',
    unit: 'tokens',
    description: 'Total tokens served from prompt cache (cache read hits).',
  },
};

// ─── Accessor ────────────────────────────────────────────────────────────────

/** Returns the BaseMeasure for the given id, or undefined if not found. */
export function getMeasure(id: string): BaseMeasure | undefined {
  return BASE_MEASURES[id];
}
