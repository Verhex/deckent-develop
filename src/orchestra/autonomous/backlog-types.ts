// src/orchestra/autonomous/backlog-types.ts
// Backlog data model for the autonomous engine. Durable, git-trackable.
// Spec: docs/superpowers/specs/2026-06-07-autonomous-execution-engine-design.md §5

export type BacklogKind = 'task' | 'sprint';
export type BacklogPolicy = 'auto' | 'approval-required' | 'risk-tagged';
export type BacklogStatus = 'pending' | 'running' | 'parked' | 'done' | 'failed';

export type BacklogTrigger =
  | { type: 'recurring'; cron: string }
  | { type: 'one-off' }
  | { type: 'reactive'; detector: string };

/** A single unit of autonomous work. */
export interface BacklogEntry {
  id: string;
  title: string;
  kind: BacklogKind;
  /** kind=task → inline description for runTaskMode; kind=sprint → directives ref. */
  spec: { description?: string; directivesRef?: string; scopeDir?: string };
  policy: BacklogPolicy;
  provider?: string;
  model?: string;
  trigger: BacklogTrigger;
  status: BacklogStatus;
  tenant?: string;
  lastRun: string | null;
  lastResult: { ok: boolean; reason: string } | null;
}

/** On-disk backlog file shape (.deckent/autonomous/backlog.json). */
export interface BacklogFile {
  _version: string;
  entries: BacklogEntry[];
}
