// src/orchestra/autonomous/work-generator.ts
// Proactive work-generator: maps debt records + TODO/FIXME markers to BacklogEntry candidates.
// Pure function — no I/O, no side effects. Caller enqueues candidates as needed.
import type { BacklogEntry } from './backlog-types.js';

export interface DebtRecord {
  /** Stable external id for the debt item. */
  id: string;
  title: string;
  description?: string;
  /** Optional severity — 'high' | 'critical' → policy 'risk-tagged'; else 'auto'. */
  severity?: string;
}

export interface TodoMarker {
  file: string;
  line: number;
  /** Raw text of the TODO/FIXME comment line. */
  text: string;
}

export interface WorkGeneratorInput {
  debtRecords?: DebtRecord[];
  todoMarkers?: TodoMarker[];
}

/** Sanitize a file path to a safe id segment (replace non-alphanumeric with _). */
function sanitizePath(file: string): string {
  return file.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isFixme(text: string): boolean {
  return /FIXME/i.test(text);
}

function debtToEntry(record: DebtRecord): BacklogEntry {
  const high = record.severity === 'high' || record.severity === 'critical';
  const source = `[source:debt]`;
  const desc = record.description
    ? `${source} ${record.description}`
    : `${source} ${record.title}`;
  return {
    id: `wg-debt-${record.id}`,
    title: record.title,
    kind: 'task',
    spec: { description: desc },
    policy: high ? 'risk-tagged' : 'auto',
    trigger: { type: 'one-off' },
    status: 'pending',
    lastRun: null,
    lastResult: null,
  };
}

function todoToEntry(marker: TodoMarker): BacklogEntry {
  const fixme = isFixme(marker.text);
  const source = fixme ? '[source:fixme]' : '[source:todo]';
  const shortFile = sanitizePath(marker.file);
  return {
    id: `wg-${fixme ? 'fixme' : 'todo'}-${shortFile}:${marker.line}`,
    title: marker.text.trim(),
    kind: 'task',
    spec: { description: `${source} ${marker.text.trim()}`, scopeDir: marker.file },
    policy: fixme ? 'risk-tagged' : 'auto',
    trigger: { type: 'one-off' },
    status: 'pending',
    lastRun: null,
    lastResult: null,
  };
}

/**
 * Generate BacklogEntry candidates from debt records and TODO/FIXME markers.
 *
 * Pure function: takes structured input, returns candidate entries.
 * Does NOT auto-enqueue or write to disk — caller decides what to do with candidates.
 */
export function generateWorkCandidates(input: WorkGeneratorInput): BacklogEntry[] {
  const candidates: BacklogEntry[] = [];
  for (const debt of input.debtRecords ?? []) {
    candidates.push(debtToEntry(debt));
  }
  for (const marker of input.todoMarkers ?? []) {
    candidates.push(todoToEntry(marker));
  }
  return candidates;
}
