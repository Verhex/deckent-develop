// ─── RoutingEngineV3 — JOURNAL v3 (append-only) + REPLAY ────────────────────
// Slice-1 (hand-coded, Brain 2026-07-14). Detail-doc §3 stage-5 + spec §5
// determinism proof: every decision is journaled with enough state to
// re-derive it WITHOUT any AI call; `replayDecision` re-runs the deterministic
// pipeline over the recorded vectors and asserts equality. Corrupted lines are
// skipped with position visibility (fail-soft), never abort the read.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { DeckentError } from '../errors.js';
import { journalEntryV3Schema } from './decision-types.js';
import type { JournalEntryV3 } from './decision-types.js';
import type { RoutingV3Config } from '../config-types.js';

export const JOURNAL_V3_DIR = path.join('.deckent', 'routing', 'decisions-v3');

/** sha1 over the resolved config — replay refuses silently drifted config. */
export function hashConfig(config: RoutingV3Config): string {
  return createHash('sha1').update(JSON.stringify(config)).digest('hex');
}

export class JournalReplayMismatchError extends DeckentError {
  constructor(taskId: string, detail: string) {
    super(
      'ROUTING3_REPLAY_MISMATCH',
      `Journal replay mismatch for task ${taskId}: ${detail}`,
      'The deterministic pipeline no longer reproduces this recorded decision — the engine, config, or catalog snapshot semantics changed. Investigate before trusting new decisions; the journal is the determinism contract.',
    );
    this.name = 'JournalReplayMismatchError';
  }
}

/** Append one entry (validated) to the sprint journal. Creates the dir. */
export function appendDecision(projectRoot: string, entry: JournalEntryV3): void {
  const validated = journalEntryV3Schema.parse(entry);
  const dir = path.join(projectRoot, JOURNAL_V3_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sanitizeSprintId(validated.sprintId)}.jsonl`);
  fs.appendFileSync(file, `${JSON.stringify(validated)}\n`, 'utf8');
}

function sanitizeSprintId(sprintId: string | null): string {
  const raw = sprintId ?? 'adhoc';
  return raw.replace(/[^A-Za-z0-9._-]/g, '_');
}

export interface JournalReadResult {
  entries: JournalEntryV3[];
  /** 1-based line numbers that failed parse/validation — visible fail-soft. */
  corruptedLines: Array<{ line: number; error: string }>;
}

/** Read a sprint's journal. Missing file = empty result (not an error). */
export function readSprintJournal(projectRoot: string, sprintId: string | null): JournalReadResult {
  const file = path.join(projectRoot, JOURNAL_V3_DIR, `${sanitizeSprintId(sprintId)}.jsonl`);
  const result: JournalReadResult = { entries: [], corruptedLines: [] };
  if (!fs.existsSync(file)) return result;

  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    try {
      result.entries.push(journalEntryV3Schema.parse(JSON.parse(line)));
    } catch (err) {
      result.corruptedLines.push({
        line: i + 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

/**
 * Replay: re-derive the recorded decision deterministically and assert
 * equality on the decision-relevant fields. `derive` is injected by the
 * orchestrator module (route-task-v3) to avoid a circular import — it MUST be
 * the production deterministic path.
 *
 * @throws {JournalReplayMismatchError} when re-derivation disagrees.
 */
export function replayDecision(
  entry: JournalEntryV3,
  currentConfigHash: string,
  derive: (entry: JournalEntryV3) => { agentId: string; finalScore: number; ranked: ReadonlyArray<{ agentId: string; finalScore: number }> },
): void {
  if (entry.configHash !== currentConfigHash) {
    throw new JournalReplayMismatchError(
      entry.taskId,
      `config drift (recorded ${entry.configHash.slice(0, 8)}, current ${currentConfigHash.slice(0, 8)})`,
    );
  }
  const replayed = derive(entry);
  if (replayed.agentId !== entry.decision.agentId) {
    throw new JournalReplayMismatchError(
      entry.taskId,
      `winner drift: recorded ${entry.decision.agentId}, replayed ${replayed.agentId}`,
    );
  }
  if (Math.abs(replayed.finalScore - entry.decision.finalScore) > 1e-9) {
    throw new JournalReplayMismatchError(
      entry.taskId,
      `score drift: recorded ${entry.decision.finalScore}, replayed ${replayed.finalScore}`,
    );
  }
  const recordedOrder = entry.decision.ranked.map((r) => r.agentId).join(',');
  const replayedOrder = replayed.ranked.map((r) => r.agentId).join(',');
  if (recordedOrder !== replayedOrder) {
    throw new JournalReplayMismatchError(
      entry.taskId,
      `ranking drift: recorded [${recordedOrder}], replayed [${replayedOrder}]`,
    );
  }
}
